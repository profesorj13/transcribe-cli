use std::io::BufRead;
use std::process::Command;
use tauri::{AppHandle, Emitter};

use super::recording::get_path_with_homebrew;

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
    // Walk up from cwd until we find bin/trans.ts
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

    // Fallback: use compile-time project root (CARGO_MANIFEST_DIR = .../desktop/src-tauri)
    let build_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(project_root) = build_dir.parent().and_then(|p| p.parent()) {
        if project_root.join("bin/trans.ts").exists() {
            return Ok(project_root.to_path_buf());
        }
    }

    Err(format!(
        "No se encontró bin/trans.ts buscando desde: {} ni desde build dir: {}",
        cwd.display(),
        build_dir.display()
    ))
}

#[tauri::command]
pub async fn transcribe(
    app: AppHandle,
    input: String,
    provider: String,
    language: String,
    timestamps: bool,
    translate: bool,
    speakers: bool,
    num_speakers: u32,
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

    let mut child = Command::new(&bun_path)
        .args(&args)
        .current_dir(&project_root)
        .env("PATH", &path_env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Error al iniciar transcripción: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let reader = std::io::BufReader::new(stdout);

    let mut output_path: Option<String> = None;

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
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
            format!("{}...", &text[..800])
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
    let mut content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

    for (old_id, new_name) in &mapping {
        content = content.replace(
            &format!("**Hablante {}:**", old_id),
            &format!("**Hablante {}:**", new_name),
        );
        content = content.replace(
            &format!("| {} |", old_id),
            &format!("| {} |", new_name),
        );
    }

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
        format!("{}...", &text[..800])
    } else {
        text
    };

    Ok(preview)
}
