use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

#[derive(Serialize)]
pub struct Song {
    pub title: String,
    pub artist: String,
    pub imge_path: String,
    pub duration: u32,
    pub mp3_path: String,
}

fn mime_from_ext(path: &str) -> &str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn get_music_list(path: &str) -> Result<Vec<Song>, String> {
    let extensions = ["mp3", "flac", "wav", "ogg", "m4a", "aac", "wma"];
    let mut songs = Vec::new();

    let entries = std::fs::read_dir(path).map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
        let entry_path = entry.path();

        if !entry_path.is_file() {
            continue;
        }

        let ext = entry_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !extensions.contains(&ext.as_str()) {
            continue;
        }

        let (mut title, artist, mut duration) =
            match audiotags::Tag::new().read_from_path(&entry_path) {
                Ok(tag) => {
                    let t = tag.title().map(|s| s.to_string());
                    let a = tag.artist().map(|s| s.to_string()).unwrap_or_default();
                    let d = tag.duration().map(|d| d as u32);
                    (t, a, d)
                }
                Err(_) => (None, String::new(), None),
            };

        if duration.is_none() && ext == "mp3" {
            duration = std::fs::File::open(&entry_path)
                .ok()
                .and_then(|file| mp3_duration::from_file(&file).ok())
                .map(|d| d.as_secs() as u32);
        }
        let duration = duration.unwrap_or(0);

        if title.is_none() || title.as_ref().is_some_and(|t| t.is_empty()) {
            title = entry_path
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string());
        }

        songs.push(Song {
            title: title.unwrap_or_default(),
            artist,
            duration,
            mp3_path: entry_path.to_string_lossy().to_string(),
            imge_path: String::new(),
        });
    }
    Ok(songs)
}

#[tauri::command]
fn read_audio_file(path: &str) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let mime = mime_from_ext(path);
    Ok(format!(
        "data:{};base64,{}",
        mime,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data)
    ))
}

#[tauri::command]
fn read_text_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("读取文本文件失败: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "显示").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).item(&show).item(&quit).build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_music_list,
            read_audio_file,
            read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
