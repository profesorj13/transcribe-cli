// Disparar el procesamiento de una transcripción en el dashboard de estrategia (odd).
//
// No hablamos con odd directamente: reusamos ~/.local/bin/transcript-process.sh, el
// mismo script que corre el watcher de ~/Downloads cuando clickeás su notificación.
// Ahí vive la autodetección del puerto del dashboard, el login y el POST a
// /api/local-task, así que no duplicamos nada: si el script cambia, la app lo hereda.
use std::path::PathBuf;
use std::process::Command;

/// Puertos y hosts donde puede vivir el dashboard — misma lista que sondea el script.
const PORTS: [&str; 6] = ["5173", "5174", "5175", "5176", "5177", "3000"];
const HOSTS: [&str; 2] = ["127.0.0.1", "localhost"];

fn processor_path() -> Option<PathBuf> {
    let script = dirs::home_dir()?.join(".local/bin/transcript-process.sh");
    if script.is_file() {
        Some(script)
    } else {
        None
    }
}

/// ¿Se puede disparar el procesamiento ahora mismo? Solo si está el script Y el
/// dashboard responde. El botón de la UI se muestra únicamente cuando esto es true,
/// así no queda un botón que falla cuando el server está apagado.
#[tauri::command]
pub fn odd_available() -> bool {
    if processor_path().is_none() {
        return false;
    }
    for port in PORTS {
        for host in HOSTS {
            let url = format!("http://{host}:{port}/api/health");
            // Un puerto cerrado da "connection refused" al instante; -m 1 acota el
            // peor caso (puerto abierto por otra cosa que no responde). -f hace que
            // solo cuente una respuesta 2xx: otro dev server en el puerto contestaría
            // 404 a /api/health y no queremos tomarlo por el dashboard.
            let ok = Command::new("curl")
                .args(["-sf", "-m", "1", "-o", "/dev/null", &url])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if ok {
                return true;
            }
        }
    }
    false
}

/// Crea la tarea local en odd para procesar esta transcripción. `instruction` es el
/// contexto extra opcional que el usuario escribe antes de disparar.
#[tauri::command]
pub fn odd_process_transcript(path: String, instruction: Option<String>) -> Result<(), String> {
    let script = processor_path().ok_or_else(|| {
        "No encontré ~/.local/bin/transcript-process.sh".to_string()
    })?;

    let output = Command::new(&script)
        .arg(&path)
        .env("TRANSCRIPT_EXTRA", instruction.unwrap_or_default())
        // Fire-and-forget: que no traiga Chrome al frente (eso lo hace el watcher).
        .env("TRANSCRIPT_FOCUS", "0")
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("el script falló (código {:?})", output.status.code())
        } else {
            stderr
        })
    }
}
