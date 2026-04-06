mod commands;

use commands::recording::RecordingState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(RecordingState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Kill any orphan recording processes from previous sessions
            commands::recording::cleanup_orphan_recorders();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::save_config,
            commands::config::check_dependencies,
            commands::config::choose_directory,
            commands::recording::start_recording,
            commands::recording::stop_recording,
            commands::recording::cancel_recording,
            commands::recording::rename_recording,
            commands::transcription::transcribe,
            commands::transcription::rename_speakers,
            commands::files::open_file_dialog,
            commands::files::get_recent_files,
            commands::files::open_file,
            commands::files::copy_to_clipboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
