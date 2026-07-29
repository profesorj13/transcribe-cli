use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub date: String,
    pub size: u64,
}

fn history_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".config")
        .join("transcribe-cli")
        .join("history.json")
}

fn read_history() -> Vec<RecentFile> {
    let path = history_path();
    if !path.exists() {
        return Vec::new();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_history(entries: &[RecentFile]) -> Result<(), String> {
    let path = history_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Track a new transcription in history
pub fn track_file(file_path: &str) -> Result<(), String> {
    let path = std::path::Path::new(file_path);
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let date = chrono::Local::now().to_rfc3339();

    let mut history = read_history();

    // Remove duplicate if same path exists
    history.retain(|f| f.path != file_path);

    // Add new entry at the top
    history.insert(
        0,
        RecentFile {
            path: file_path.to_string(),
            name,
            date,
            size,
        },
    );

    // Keep max 20 entries
    history.truncate(20);

    write_history(&history)
}

#[tauri::command]
pub fn open_file_dialog() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            r#"set theFile to choose file of type {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "opus", "flac"} with prompt "Seleccionar archivo de audio"
POSIX path of theFile"#,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            Ok(Some(path))
        }
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_recent_files() -> Result<Vec<RecentFile>, String> {
    let history = read_history();

    // Filter out files that no longer exist, return top 10
    let files: Vec<RecentFile> = history
        .into_iter()
        .filter(|f| std::path::Path::new(&f.path).exists())
        .take(10)
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(_app: AppHandle, text: String) -> Result<(), String> {
    copy_text_to_clipboard(&text)
}

/// Copy the FULL contents of a file to the clipboard (not the truncated preview).
#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    copy_text_to_clipboard(&content)
}

fn copy_text_to_clipboard(text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut child = Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    child.wait().map_err(|e| e.to_string())?;
    Ok(())
}
