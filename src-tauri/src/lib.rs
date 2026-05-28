use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

struct FileWatcher(Mutex<Option<Box<dyn notify::Watcher + Send>>>);

#[derive(serde::Serialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Vec<FileNode>,
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("파일을 읽지 못했습니다: {e}"))
}

#[tauri::command]
fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("파일을 저장하지 못했습니다: {e}"))
}

#[tauri::command]
fn take_startup_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[tauri::command]
fn watch_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<FileWatcher>,
) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};

    let app2 = app.clone();
    let watched_path = path.clone();

    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            use notify::EventKind::*;
            match event.kind {
                Modify(_) | Create(_) | Remove(_) => {
                    let _ = app2.emit("file-changed", watched_path.clone());
                }
                _ => {}
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let mut w = watcher;
    w.watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(Box::new(w));
    Ok(())
}

#[tauri::command]
fn unwatch_file(state: tauri::State<FileWatcher>) {
    *state.0.lock().unwrap() = None;
}

#[tauri::command]
fn read_dir_tree(path: String) -> Result<FileNode, String> {
    fn build(p: &std::path::Path, depth: usize) -> Option<FileNode> {
        if depth > 8 {
            return None;
        }
        let name = p.file_name()?.to_string_lossy().to_string();
        if name.starts_with('.') {
            return None;
        }

        if p.is_dir() {
            let mut children: Vec<FileNode> = std::fs::read_dir(p)
                .ok()?
                .filter_map(|e| e.ok())
                .filter_map(|e| build(&e.path(), depth + 1))
                .collect();
            if depth > 0 && children.is_empty() {
                return None;
            }
            children.sort_by(|a, b| {
                b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            });
            Some(FileNode {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: true,
                children,
            })
        } else {
            let lower = name.to_lowercase();
            let ext = lower.rsplit('.').next().unwrap_or("");
            let is_viewable = matches!(
                ext,
                // Markdown
                "md" | "markdown" | "mdown" | "mkd" | "txt"
                // C family
                | "c" | "h" | "cpp" | "cc" | "cxx" | "hpp" | "hxx"
                // JVM
                | "java" | "kt" | "scala"
                // Scripting
                | "py" | "rb" | "sh" | "bash" | "zsh" | "fish"
                // Web
                | "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx"
                | "html" | "htm" | "css" | "scss" | "less"
                | "json" | "jsonc"
                // Systems
                | "rs" | "go" | "swift"
                // Data / config
                | "sql" | "yaml" | "yml" | "toml" | "xml"
                // Other
                | "ps1" | "lua" | "php" | "cs" | "ex" | "exs" | "dart"
            );
            is_viewable.then(|| FileNode {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir: false,
                children: vec![],
            })
        }
    }

    build(std::path::Path::new(&path), 0)
        .ok_or_else(|| "마크다운 파일이 없거나 디렉터리를 읽을 수 없습니다".to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(serde::Serialize)]
struct PlatformInfo {
    os:   String,
    arch: String,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os:   std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
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
    let startup_arg = std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-') && looks_like_markdown(a));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFile(Mutex::new(startup_arg)))
        .manage(FileWatcher(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            take_startup_file,
            read_dir_tree,
            watch_file,
            unwatch_file,
            get_version,
            get_platform_info,
            quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            tauri::RunEvent::Opened { urls } => {
                if let Some(path) = urls
                    .iter()
                    .filter_map(|u| u.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .next()
                {
                    if let Some(state) = app.try_state::<PendingFile>() {
                        *state.0.lock().unwrap() = Some(path.clone());
                    }
                    let _ = app.emit("open-file", path);
                }
            }
            _ => {}
        });
}
