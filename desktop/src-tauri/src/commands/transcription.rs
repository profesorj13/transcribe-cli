use std::io::BufRead;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use super::recording::get_path_with_homebrew;

/// Shared state so an in-flight transcription can be cancelled from the UI.
pub struct TranscriptionState {
    pub pid: AtomicU32,
    pub cancelled: AtomicBool,
}

impl TranscriptionState {
    pub fn new() -> Self {
        Self {
            pid: AtomicU32::new(0),
            cancelled: AtomicBool::new(false),
        }
    }
}

/// Truncate `s` to at most `max_bytes`, never splitting a UTF-8 character.
/// `text.len()` counts bytes, so slicing at a fixed byte index panics when it
/// lands inside a multibyte char (á, ñ, ¿ ...). This walks back to a boundary.
fn truncate_on_char_boundary(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Apply speaker-name replacements without cascading (chained) substitutions and
/// without breaking the markdown table when a name contains a '|'.
fn apply_speaker_renames(content: &str, entries: &[(String, String)]) -> String {
    let mut content = content.to_string();

    // Pass 1: swap each original id for a unique private-use sentinel so a chained
    // mapping (e.g. 0->1, 1->Ana) can't cascade into itself.
    for (i, (old_id, _)) in entries.iter().enumerate() {
        content = content.replace(
            &format!("**Hablante {}:**", old_id),
            &format!("**Hablante \u{E000}L{}\u{E001}:**", i),
        );
        content = content.replace(
            &format!("| {} |", old_id),
            &format!("| \u{E000}C{}\u{E001} |", i),
        );
    }

    // Pass 2: replace the sentinels with the final names. Escape '|' inside table
    // cells so a name with a pipe cannot inject extra columns.
    for (i, (_, new_name)) in entries.iter().enumerate() {
        content = content.replace(&format!("\u{E000}L{}\u{E001}", i), new_name);
        content = content.replace(
            &format!("\u{E000}C{}\u{E001}", i),
            &new_name.replace('|', "\\|"),
        );
    }

    content
}

fn find_bun() -> Result<String, String> {
    let path_env = get_path_with_homebrew();

    // Also check ~/.bun/bin
    let home = dirs::home_dir().unwrap_or_default();
    let bun_home = home.join(".bun/bin");
    let full_path = if bun_home.exists() {
        format!("{}:{}", bun_home.display(), path_env)
    } else {
        path_env.clone()
    };

    // Verify bun is available
    let check = Command::new("which")
        .arg("bun")
        .env("PATH", &full_path)
        .output();

    match check {
        Ok(o) if o.status.success() => {
            let bun_path = String::from_utf8_lossy(&o.stdout).trim().to_string();
            Ok(bun_path)
        }
        _ => Err(
            "No se encontró bun. Instalalo con: curl -fsSL https://bun.sh/install | bash"
                .to_string(),
        ),
    }
}

fn get_project_root() -> Result<std::path::PathBuf, String> {
    // 0. Explicit override: lets a packaged build point at the CLI repo on disk.
    if let Ok(root) = std::env::var("TRANSCRIBE_CLI_ROOT") {
        let p = std::path::PathBuf::from(&root);
        if p.join("bin/trans.ts").exists() {
            return Ok(p);
        }
    }

    // 1. Walk up from cwd until we find bin/trans.ts
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let mut dir = cwd.as_path();

    for _ in 0..5 {
        if dir.join("bin/trans.ts").exists() {
            return Ok(dir.to_path_buf());
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }

    // 2. Walk up from the executable location (helps when cwd is unrelated).
    if let Ok(exe) = std::env::current_exe() {
        let mut edir = exe.parent();
        for _ in 0..6 {
            match edir {
                Some(d) => {
                    if d.join("bin/trans.ts").exists() {
                        return Ok(d.to_path_buf());
                    }
                    edir = d.parent();
                }
                None => break,
            }
        }
    }

    // 3. Fallback: compile-time project root (CARGO_MANIFEST_DIR = .../desktop/src-tauri)
    let build_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(project_root) = build_dir.parent().and_then(|p| p.parent()) {
        if project_root.join("bin/trans.ts").exists() {
            return Ok(project_root.to_path_buf());
        }
    }

    Err(format!(
        "No se encontró bin/trans.ts. Buscá desde: {} o definí TRANSCRIBE_CLI_ROOT apuntando al repo del CLI.",
        cwd.display()
    ))
}

#[tauri::command]
pub async fn transcribe(
    app: AppHandle,
    state: State<'_, TranscriptionState>,
    input: String,
    provider: String,
    language: String,
    timestamps: bool,
    translate: bool,
    speakers: bool,
    num_speakers: u32,
    output_dir: Option<String>,
) -> Result<(), String> {
    let bun_path = find_bun()?;
    let project_root = get_project_root()?;
    let path_env = get_path_with_homebrew();

    let mut args = vec![
        "run".to_string(),
        "bin/trans.ts".to_string(),
        input,
        "--provider".to_string(),
        provider,
    ];

    if language != "auto" {
        args.push("--language".to_string());
        args.push(language);
    }

    if timestamps {
        args.push("--timestamps".to_string());
    }

    if translate {
        args.push("--translate".to_string());
    }

    if speakers {
        args.push("--speakers".to_string());
    }

    if num_speakers > 0 {
        args.push("--num-speakers".to_string());
        args.push(num_speakers.to_string());
    }

    if let Some(ref dir) = output_dir {
        args.push("--output-dir".to_string());
        args.push(dir.clone());
    }

    state.cancelled.store(false, Ordering::SeqCst);

    let mut child = Command::new(&bun_path)
        .args(&args)
        .current_dir(&project_root)
        .env("PATH", &path_env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Error al iniciar transcripción: {}", e))?;

    let pid = child.id();
    state.pid.store(pid, Ordering::SeqCst);

    // Watchdog: if the child produces no output for too long it is treated as
    // hung and killed, so the UI never stays stuck on "Transcribiendo...".
    let last_activity = Arc::new(Mutex::new(Instant::now()));
    let running = Arc::new(AtomicBool::new(true));
    let timed_out = Arc::new(AtomicBool::new(false));
    {
        let last_activity = Arc::clone(&last_activity);
        let running = Arc::clone(&running);
        let timed_out = Arc::clone(&timed_out);
        std::thread::spawn(move || {
            const INACTIVITY_TIMEOUT: Duration = Duration::from_secs(600);
            loop {
                std::thread::sleep(Duration::from_millis(500));
                if !running.load(Ordering::SeqCst) {
                    break;
                }
                let alive = unsafe { libc::kill(pid as i32, 0) } == 0;
                if !alive {
                    break;
                }
                let idle = last_activity.lock().unwrap().elapsed();
                if idle >= INACTIVITY_TIMEOUT {
                    timed_out.store(true, Ordering::SeqCst);
                    unsafe {
                        libc::kill(pid as i32, libc::SIGKILL);
                    }
                    break;
                }
            }
        });
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = std::io::BufReader::new(stdout);

    let mut output_path: Option<String> = None;

    for line in reader.lines() {
        // A read error means the pipe closed (child killed/cancelled) — stop reading.
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        *last_activity.lock().unwrap() = Instant::now();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Emit progress for chunk processing lines like "Transcribed chunk 2/5"
        if let Some(rest) = trimmed
            .strip_prefix("Transcribed chunk ")
            .or_else(|| trimmed.strip_prefix("Translated chunk "))
        {
            if let Some((completed, total)) = rest.split_once('/') {
                if let (Ok(c), Ok(t)) = (completed.trim().parse::<u32>(), total.trim().parse::<u32>()) {
                    let _ = app.emit(
                        "transcription:progress",
                        serde_json::json!({ "completed": c, "total": t }),
                    );
                }
            }
        }

        // Detect output path from "saved to: /path/to/file.md" or "Translation saved to: ..."
        if trimmed.contains("saved to:") || trimmed.contains("Saved to:") {
            if let Some(path) = trimmed.split("saved to:").nth(1).or_else(|| trimmed.split("Saved to:").nth(1)) {
                output_path = Some(path.trim().to_string());
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;

    // Stop the watchdog and clear the stored pid.
    running.store(false, Ordering::SeqCst);
    state.pid.store(0, Ordering::SeqCst);

    // If the user cancelled, the front already tore down its listeners: stay silent.
    if state.cancelled.load(Ordering::SeqCst) {
        return Ok(());
    }

    if timed_out.load(Ordering::SeqCst) {
        let _ = app.emit(
            "transcription:error",
            serde_json::json!({
                "message": "La transcripción se detuvo por inactividad (posible cuelgue). Intentá de nuevo."
            }),
        );
        return Ok(());
    }

    if !status.success() {
        // Capture stderr for error details
        let stderr_msg = child
            .stderr
            .take()
            .and_then(|stderr| {
                let reader = std::io::BufReader::new(stderr);
                let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
                if lines.is_empty() {
                    None
                } else {
                    Some(lines.join("\n"))
                }
            })
            .unwrap_or_default();

        let msg = if stderr_msg.is_empty() {
            "La transcripción falló. Verificá la clave API en Configuración.".to_string()
        } else {
            stderr_msg
        };

        let _ = app.emit(
            "transcription:error",
            serde_json::json!({ "message": msg }),
        );
        return Ok(());
    }

    // Process succeeded — track in history and emit done
    if let Some(ref path) = output_path {
        let _ = super::files::track_file(path);
        let file_content = std::fs::read_to_string(path).unwrap_or_default();

        // Extract preview
        let lines: Vec<&str> = file_content.lines().collect();
        let body_start = lines.iter()
            .position(|l| l.trim() == "---")
            .map(|i| i + 1)
            .unwrap_or(0);
        let text: String = lines[body_start..]
            .iter()
            .filter(|l| !l.trim().is_empty())
            .take(20)
            .copied()
            .collect::<Vec<&str>>()
            .join("\n");
        let preview = if text.len() > 800 {
            format!("{}...", truncate_on_char_boundary(&text, 800))
        } else {
            text
        };

        // Extract unique speaker IDs from markdown
        let mut speakers: Vec<String> = Vec::new();
        let prefix = "**Hablante ";
        for line in file_content.lines() {
            if let Some(rest) = line.strip_prefix(prefix) {
                if let Some(id) = rest.split(":**").next() {
                    let id = id.to_string();
                    if !speakers.contains(&id) {
                        speakers.push(id);
                    }
                }
            }
        }

        let _ = app.emit(
            "transcription:done",
            serde_json::json!({
                "outputPath": path,
                "preview": preview,
                "speakers": speakers
            }),
        );
    } else {
        let _ = app.emit(
            "transcription:error",
            serde_json::json!({ "message": "La transcripción terminó pero no se encontró el archivo de salida." }),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn rename_speakers(
    file_path: String,
    mapping: std::collections::HashMap<String, String>,
) -> Result<String, String> {
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    // Snapshot into a stable, ordered list so both placeholder passes agree.
    let entries: Vec<(String, String)> = mapping.into_iter().collect();
    let content = apply_speaker_renames(&content, &entries);

    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    // Return updated preview
    let lines: Vec<&str> = content.lines().collect();
    let body_start = lines
        .iter()
        .position(|l| l.trim() == "---")
        .map(|i| i + 1)
        .unwrap_or(0);
    let text: String = lines[body_start..]
        .iter()
        .filter(|l| !l.trim().is_empty())
        .take(20)
        .copied()
        .collect::<Vec<&str>>()
        .join("\n");
    let preview = if text.len() > 800 {
        format!("{}...", truncate_on_char_boundary(&text, 800))
    } else {
        text
    };

    Ok(preview)
}

/// Cancel an in-flight transcription: mark it cancelled and kill the child.
/// The kill runs on a detached thread so the UI thread is never blocked.
#[tauri::command]
pub fn cancel_transcription(state: State<'_, TranscriptionState>) -> Result<(), String> {
    state.cancelled.store(true, Ordering::SeqCst);
    let pid = state.pid.swap(0, Ordering::SeqCst);
    if pid != 0 {
        std::thread::spawn(move || {
            super::recording::kill_process_gracefully(pid, Duration::from_secs(2));
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_never_splits_multibyte_char() {
        // 799 ASCII bytes + 'ñ' (bytes 799..801): a naive &s[..800] would panic.
        let mut s = "a".repeat(799);
        s.push('ñ');
        s.push_str("resto");
        let t = truncate_on_char_boundary(&s, 800);
        assert!(t.len() <= 800);
        assert!(s.is_char_boundary(t.len()));
        assert_eq!(t.len(), 799); // the split 'ñ' is dropped, no panic
    }

    #[test]
    fn truncate_handles_accents_and_punctuation() {
        let s = "áéíóúñ¿¡Ñ".repeat(200); // all multibyte, well over 800 bytes
        let t = truncate_on_char_boundary(&s, 800);
        assert!(t.len() <= 800);
        assert!(s.is_char_boundary(t.len()));
        assert!(s.starts_with(t));
    }

    #[test]
    fn truncate_short_string_is_unchanged() {
        let s = "hola ñoño, ¿qué tal? áéíóú";
        assert_eq!(truncate_on_char_boundary(s, 800), s);
    }

    fn unescaped_pipes(line: &str) -> usize {
        let bytes = line.as_bytes();
        bytes
            .iter()
            .enumerate()
            .filter(|(i, &b)| b == b'|' && (*i == 0 || bytes[*i - 1] != b'\\'))
            .count()
    }

    #[test]
    fn rename_speakers_escapes_pipes_in_table() {
        let content = "**Hablante 0:** hola\n\n| 00:00 | 00:05 | 0 | texto |\n";
        let entries = vec![("0".to_string(), "Juan | jefe".to_string())];
        let out = apply_speaker_renames(content, &entries);
        // Label line keeps the raw name.
        assert!(out.contains("**Hablante Juan | jefe:**"));
        // The table cell escapes the pipe, so the row still has exactly 5 separators
        // (4 columns) instead of injecting an extra column.
        let row = out.lines().find(|l| l.starts_with("| 00:00")).unwrap();
        assert!(row.contains("Juan \\| jefe"));
        assert_eq!(unescaped_pipes(row), 5);
    }

    #[test]
    fn rename_speakers_does_not_chain() {
        let content = "**Hablante 0:** a\n\n**Hablante 1:** b\n\n\
                       | 00:00 | 00:01 | 0 | a |\n| 00:01 | 00:02 | 1 | b |\n";
        let entries = vec![
            ("0".to_string(), "1".to_string()),
            ("1".to_string(), "Ana".to_string()),
        ];
        let out = apply_speaker_renames(content, &entries);
        // 0 -> 1 and 1 -> Ana must not cascade (0 must NOT end up as Ana).
        assert!(out.contains("**Hablante 1:** a"));
        assert!(out.contains("**Hablante Ana:** b"));
        assert!(!out.contains("**Hablante Ana:** a"));
    }
}
