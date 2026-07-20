use std::process::Command as StdCommand;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

pub struct RecordingState {
    pub process: Mutex<Option<std::process::Child>>,
    pub start_time: Mutex<Option<Instant>>,
    pub output_path: Mutex<Option<String>>,
    pub timer_running: Arc<Mutex<bool>>,
}

impl RecordingState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            start_time: Mutex::new(None),
            output_path: Mutex::new(None),
            timer_running: Arc::new(Mutex::new(false)),
        }
    }
}

/// Kill a process by PID: try SIGINT first, wait up to `timeout`, then SIGKILL.
pub(crate) fn kill_process_gracefully(pid: u32, timeout: Duration) {
    unsafe {
        libc::kill(pid as i32, libc::SIGINT);
    }
    let start = Instant::now();
    loop {
        std::thread::sleep(Duration::from_millis(100));
        // Check if process is still alive (kill with signal 0)
        let alive = unsafe { libc::kill(pid as i32, 0) } == 0;
        if !alive {
            return;
        }
        if start.elapsed() >= timeout {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
            return;
        }
    }
}

/// Kill any orphan sox/ffmpeg recording processes left from previous sessions.
pub fn cleanup_orphan_recorders() {
    let path_env = get_path_with_homebrew();
    let output = StdCommand::new("pgrep")
        .args(["-f", "ffmpeg.*avfoundation|sox.*-d.*-t.*wav"])
        .env("PATH", &path_env)
        .output();

    if let Ok(out) = output {
        let pids = String::from_utf8_lossy(&out.stdout);
        for line in pids.lines() {
            if let Ok(pid) = line.trim().parse::<u32>() {
                kill_process_gracefully(pid, Duration::from_secs(3));
            }
        }
    }
}

pub fn get_path_with_homebrew() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let extra_paths = ["/opt/homebrew/bin", "/usr/local/bin"];
    let mut paths: Vec<&str> = extra_paths.to_vec();
    for p in current.split(':') {
        if !paths.contains(&p) {
            paths.push(p);
        }
    }
    paths.join(":")
}

fn detect_recorder() -> Option<&'static str> {
    let path = get_path_with_homebrew();
    if StdCommand::new("which")
        .arg("sox")
        .env("PATH", &path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some("sox");
    }
    if StdCommand::new("which")
        .arg("ffmpeg")
        .env("PATH", &path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some("ffmpeg");
    }
    None
}

/// Expand a leading `~` / `~/` against `home`, matching how the CLI resolves
/// `--output-dir` (see src/output/markdown.ts). Without this the raw "~/x" from
/// config never `exists()`, so audio and the .md ended up in different folders.
fn expand_tilde(dir: &str, home: &std::path::Path) -> std::path::PathBuf {
    if dir == "~" {
        home.to_path_buf()
    } else if let Some(rest) = dir.strip_prefix("~/") {
        home.join(rest)
    } else {
        std::path::PathBuf::from(dir)
    }
}

fn get_output_dir() -> std::path::PathBuf {
    // Try reading config for outputDirectory
    let home = dirs::home_dir().unwrap_or_default();
    let config_path = home.join(".config").join("transcribe-cli").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = json.get("outputDirectory").and_then(|v| v.as_str()) {
                let path = expand_tilde(dir, &home);
                if path.exists() {
                    return path;
                }
            }
        }
    }
    // Default to Desktop (kept in sync with the front-end default so the recorded
    // audio and the generated .md always land in the same folder).
    home.join("Desktop")
}

fn generate_filename(name: Option<&str>) -> String {
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let base = match name {
        Some(n) if !n.is_empty() => {
            let sanitized: String = n
                .chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '-'
                    }
                })
                .collect();
            format!("{}-{}", sanitized, date)
        }
        _ => format!("recording-{}", date),
    };

    let dir = get_output_dir();
    let mut path = dir.join(format!("{}.wav", base));
    let mut counter = 2;
    while path.exists() {
        path = dir.join(format!("{}-{}.wav", base, counter));
        counter += 1;
    }
    path.to_string_lossy().to_string()
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    state: State<'_, RecordingState>,
    name: Option<String>,
) -> Result<(), String> {
    let recorder = detect_recorder().ok_or("No se encontró sox ni ffmpeg. Instalá con: brew install sox")?;
    let output_path = generate_filename(name.as_deref());
    let path_env = get_path_with_homebrew();

    let child = match recorder {
        "sox" => StdCommand::new("sox")
            .args(["-d", "-t", "wav", &output_path])
            .env("PATH", &path_env)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Error al iniciar sox: {}", e))?,
        "ffmpeg" => StdCommand::new("ffmpeg")
            .args(["-f", "avfoundation", "-i", ":1", "-y", &output_path])
            .env("PATH", &path_env)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Error al iniciar ffmpeg: {}", e))?,
        _ => return Err("Recorder no soportado".to_string()),
    };

    *state.process.lock().unwrap() = Some(child);
    *state.start_time.lock().unwrap() = Some(Instant::now());
    *state.output_path.lock().unwrap() = Some(output_path);
    *state.timer_running.lock().unwrap() = true;

    // Spawn timer thread with Arc clone
    let app_handle = app.clone();
    let timer_flag = Arc::clone(&state.timer_running);
    std::thread::spawn(move || {
        let start = Instant::now();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let running = *timer_flag.lock().unwrap();
            if !running {
                break;
            }
            let elapsed = start.elapsed().as_secs();
            let _ = app_handle.emit("recording:tick", elapsed);
        }
    });

    Ok(())
}

// Async so the graceful-kill polling (up to ~5s) + flush sleep run off the main
// thread; a synchronous command would freeze the UI while stopping.
#[tauri::command]
pub async fn stop_recording(state: State<'_, RecordingState>) -> Result<serde_json::Value, String> {
    *state.timer_running.lock().unwrap() = false;

    let duration = state
        .start_time
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    // Take the child out (dropping the lock) before the blocking kill/flush.
    let child = state.process.lock().unwrap().take();
    if let Some(mut child) = child {
        let pid = child.id();
        kill_process_gracefully(pid, Duration::from_secs(5));
        // Reap the child process to avoid zombies
        let _ = child.wait();
        // Give filesystem a moment to flush
        std::thread::sleep(Duration::from_millis(300));
    }

    let output_path = state
        .output_path
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_default();

    *state.start_time.lock().unwrap() = None;

    // Validate the recording file
    let path = std::path::Path::new(&output_path);
    if !path.exists() {
        return Err(format!("El archivo de grabación no se creó ({}). Verificá que el micrófono esté conectado.", output_path));
    }
    let metadata = std::fs::metadata(path).map_err(|e| format!("Error al verificar grabación: {}", e))?;
    if metadata.len() < 1000 {
        // WAV header is ~44 bytes, anything under 1KB is effectively empty
        let _ = std::fs::remove_file(path);
        return Err(format!("La grabación está vacía ({} bytes en {}). Verificá que el micrófono esté funcionando.", metadata.len(), output_path));
    }

    Ok(serde_json::json!({
        "filePath": output_path,
        "duration": duration
    }))
}

#[tauri::command]
pub fn rename_recording(old_path: String, new_name: String) -> Result<String, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("El nombre no puede estar vacío".to_string());
    }

    let sanitized: String = trimmed
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();

    // Collapse consecutive dashes for cleanliness
    let mut cleaned = String::with_capacity(sanitized.len());
    let mut prev_dash = false;
    for c in sanitized.chars() {
        if c == '-' {
            if !prev_dash {
                cleaned.push(c);
            }
            prev_dash = true;
        } else {
            cleaned.push(c);
            prev_dash = false;
        }
    }
    let cleaned = cleaned.trim_matches('-').to_string();
    if cleaned.is_empty() {
        return Err("El nombre no es válido".to_string());
    }

    let old = std::path::Path::new(&old_path);
    if !old.exists() {
        return Err(format!("El archivo original no existe: {}", old_path));
    }

    let dir = old
        .parent()
        .ok_or_else(|| "No se pudo obtener el directorio del archivo".to_string())?;
    let extension = old
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "wav".to_string());

    let new_path = dir.join(format!("{}.{}", cleaned, extension));

    // No-op if the path is the same
    if new_path == old {
        return Ok(old_path);
    }

    if new_path.exists() {
        return Err(format!(
            "Ya existe un archivo con ese nombre: {}",
            new_path.to_string_lossy()
        ));
    }

    std::fs::rename(old, &new_path)
        .map_err(|e| format!("No se pudo renombrar el archivo: {}", e))?;

    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cancel_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    *state.timer_running.lock().unwrap() = false;

    if let Some(child) = state.process.lock().unwrap().take() {
        kill_process_gracefully(child.id(), Duration::from_secs(3));
    }

    if let Some(path) = state.output_path.lock().unwrap().take() {
        let _ = std::fs::remove_file(&path);
    }

    *state.start_time.lock().unwrap() = None;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{expand_tilde, rename_recording};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    // Carpeta temporal única por test (sin depender de crates externas).
    fn tmp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "transcribe-rename-test-{}-{}",
            std::process::id(),
            n
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: &Path) {
        std::fs::write(path, b"fake audio").unwrap();
    }

    #[test]
    fn rename_sanitizes_and_preserves_folder_and_extension() {
        let dir = tmp_dir();
        let old = dir.join("recording-2026-07-20.wav");
        write(&old);

        let new_path =
            rename_recording(old.to_string_lossy().to_string(), "Reunión equipo // 2026 !!".into())
                .unwrap();

        // Espacios/símbolos -> '-', guiones colapsados, sin guiones al borde.
        assert_eq!(new_path, dir.join("Reunión-equipo-2026.wav").to_string_lossy());
        assert!(Path::new(&new_path).exists());
        assert!(!old.exists(), "el archivo viejo no debería seguir existiendo");
    }

    #[test]
    fn rename_preserves_non_wav_extension() {
        let dir = tmp_dir();
        let old = dir.join("clip.m4a");
        write(&old);

        let new_path = rename_recording(old.to_string_lossy().to_string(), "charla".into()).unwrap();
        assert_eq!(new_path, dir.join("charla.m4a").to_string_lossy());
    }

    #[test]
    fn rename_rejects_name_without_valid_chars() {
        let dir = tmp_dir();
        let old = dir.join("recording.wav");
        write(&old);

        assert!(rename_recording(old.to_string_lossy().to_string(), "///".into()).is_err());
        assert!(rename_recording(old.to_string_lossy().to_string(), "   ".into()).is_err());
        // El archivo original sigue intacto tras un nombre inválido.
        assert!(old.exists());
    }

    #[test]
    fn rename_does_not_overwrite_existing_file() {
        let dir = tmp_dir();
        let old = dir.join("recording.wav");
        write(&old);
        let taken = dir.join("ocupado.wav");
        write(&taken);

        let err = rename_recording(old.to_string_lossy().to_string(), "ocupado".into()).unwrap_err();
        assert!(err.contains("Ya existe"), "esperaba error de colisión, fue: {err}");
        assert!(old.exists(), "no debe borrar el original si el destino existe");
    }

    #[test]
    fn expand_tilde_matches_cli_behavior() {
        let home = Path::new("/Users/tester");
        assert_eq!(expand_tilde("~", home), home.to_path_buf());
        assert_eq!(expand_tilde("~/Grabaciones", home), home.join("Grabaciones"));
        assert_eq!(
            expand_tilde("/tmp/abs", home),
            PathBuf::from("/tmp/abs"),
            "una ruta absoluta no se toca"
        );
    }
}
