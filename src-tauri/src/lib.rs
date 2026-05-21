use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Holds a file path that the app was asked to open before the frontend was
/// ready to receive it (e.g. via "Open With" / file association / CLI arg).
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("파일을 읽지 못했습니다: {e}"))
}

#[tauri::command]
fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("파일을 저장하지 못했습니다: {e}"))
}

/// Frontend calls this once on startup to retrieve (and clear) any file the app
/// was launched to open.
#[tauri::command]
fn take_startup_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

fn looks_like_markdown(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".md")
        || lower.ends_with(".markdown")
        || lower.ends_with(".mdown")
        || lower.ends_with(".mkd")
        || lower.ends_with(".txt")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Windows/Linux a file association passes the path as a CLI argument.
    let startup_arg = std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && looks_like_markdown(a));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFile(Mutex::new(startup_arg)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            take_startup_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(path) = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .next()
                {
                    // Stash it and notify the frontend if it's already running.
                    if let Some(state) = app.try_state::<PendingFile>() {
                        *state.0.lock().unwrap() = Some(path.clone());
                    }
                    let _ = app.emit("open-file", path);
                }
            }
        });
}
