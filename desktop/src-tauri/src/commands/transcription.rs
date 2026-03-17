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
    // Tauri runs from src-tauri/, so we need to go up 2 levels to transcribe-cli/
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

    Err(format!(
        "No se encontró bin/trans.ts buscando desde: {}",
        cwd.display()
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
        let preview = std::fs::read_to_string(path)
            .ok()
            .map(|content| {
                // Skip markdown frontmatter/header, take first ~300 chars of content
                let text: String = content
                    .lines()
                    .skip_while(|l| l.starts_with('#') || l.starts_with("---") || l.trim().is_empty())
                    .take(10)
                    .collect::<Vec<&str>>()
                    .join("\n");
                if text.len() > 300 {
                    format!("{}...", &text[..300])
                } else {
                    text
                }
            })
            .unwrap_or_default();

        let _ = app.emit(
            "transcription:done",
            serde_json::json!({
                "outputPath": path,
                "preview": preview
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
