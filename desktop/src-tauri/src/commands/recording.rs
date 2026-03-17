use std::process::Command as StdCommand;
use std::sync::{Arc, Mutex};
use std::time::Instant;
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

fn get_output_dir() -> std::path::PathBuf {
    // Try reading config for outputDirectory
    let home = dirs::home_dir().unwrap_or_default();
    let config_path = home.join(".config").join("transcribe-cli").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(dir) = json.get("outputDirectory").and_then(|v| v.as_str()) {
                let path = std::path::PathBuf::from(dir);
                if path.exists() {
                    return path;
                }
            }
        }
    }
    // Default to Desktop
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
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Error al iniciar sox: {}", e))?,
        "ffmpeg" => StdCommand::new("ffmpeg")
            .args(["-f", "avfoundation", "-i", ":1", "-y", &output_path])
            .env("PATH", &path_env)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
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

#[tauri::command]
pub fn stop_recording(state: State<'_, RecordingState>) -> Result<serde_json::Value, String> {
    *state.timer_running.lock().unwrap() = false;

    let duration = state
        .start_time
        .lock()
        .unwrap()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    if let Some(mut child) = state.process.lock().unwrap().take() {
        // Send SIGINT for clean shutdown
        unsafe {
            libc::kill(child.id() as i32, libc::SIGINT);
        }
        // Wait with timeout — don't block forever
        let pid = child.id();
        let wait_handle = std::thread::spawn(move || child.wait());
        match wait_handle.join() {
            Ok(_) => {}
            Err(_) => {
                // Force kill if wait thread panicked
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
        }
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
        return Err("El archivo de grabación no se creó. Verificá que el micrófono esté conectado.".to_string());
    }
    let metadata = std::fs::metadata(path).map_err(|e| format!("Error al verificar grabación: {}", e))?;
    if metadata.len() < 1000 {
        // WAV header is ~44 bytes, anything under 1KB is effectively empty
        let _ = std::fs::remove_file(path);
        return Err("La grabación está vacía. Verificá que el micrófono esté funcionando.".to_string());
    }

    Ok(serde_json::json!({
        "filePath": output_path,
        "duration": duration
    }))
}

#[tauri::command]
pub fn cancel_recording(state: State<'_, RecordingState>) -> Result<(), String> {
    *state.timer_running.lock().unwrap() = false;

    if let Some(mut child) = state.process.lock().unwrap().take() {
        unsafe {
            libc::kill(child.id() as i32, libc::SIGINT);
        }
        let _ = child.wait();
    }

    if let Some(path) = state.output_path.lock().unwrap().take() {
        let _ = std::fs::remove_file(&path);
    }

    *state.start_time.lock().unwrap() = None;

    Ok(())
}
