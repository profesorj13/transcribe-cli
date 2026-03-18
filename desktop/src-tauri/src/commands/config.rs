use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub api_key: Option<String>,
    pub elevenlabs_api_key: Option<String>,
    pub default_provider: Option<String>,
    pub default_language: Option<String>,
    pub include_timestamps: Option<bool>,
    pub output_directory: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DependencyStatus {
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
}

fn config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".config")
        .join("transcribe-cli")
        .join("config.json")
}

#[tauri::command]
pub fn get_config() -> Result<AppConfig, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: AppConfig = serde_json::from_str(&content).unwrap_or_default();
    Ok(config)
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn check_dep(name: &str) -> DependencyStatus {
    let path_env = super::recording::get_path_with_homebrew();
    let result = Command::new("which").arg(name).env("PATH", &path_env).output();
    match result {
        Ok(output) if output.status.success() => {
            // Try to get version
            let version = Command::new(name)
                .arg("--version")
                .env("PATH", &path_env)
                .output()
                .ok()
                .and_then(|v| {
                    let out = String::from_utf8_lossy(&v.stdout).to_string();
                    let err = String::from_utf8_lossy(&v.stderr).to_string();
                    let combined = if out.trim().is_empty() { err } else { out };
                    // Extract version-like pattern
                    combined
                        .lines()
                        .next()
                        .and_then(|line| {
                            line.split_whitespace()
                                .find(|w| w.chars().next().map_or(false, |c| c.is_ascii_digit()))
                                .map(|s| s.to_string())
                        })
                });
            DependencyStatus {
                name: name.to_string(),
                installed: true,
                version,
            }
        }
        _ => DependencyStatus {
            name: name.to_string(),
            installed: false,
            version: None,
        },
    }
}

#[tauri::command]
pub fn check_dependencies() -> Vec<DependencyStatus> {
    vec![
        check_dep("ffmpeg"),
        check_dep("sox"),
        check_dep("yt-dlp"),
    ]
}

#[tauri::command]
pub fn choose_directory() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            r#"set theFolder to choose folder with prompt "Seleccionar carpeta de salida"
POSIX path of theFolder"#,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Ok(None)
        } else {
            // Remove trailing slash if present
            Ok(Some(path.trim_end_matches('/').to_string()))
        }
    } else {
        Ok(None)
    }
}
