mod discord;
mod updater;
mod network;
mod smtc;

use tauri::{Manager, AppHandle, command, Emitter};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri_plugin_autostart::MacosLauncher;

#[command]
fn broadcast_overlay_state(app: AppHandle, payload: serde_json::Value) {
    let _ = app.emit("overlay-player-state", payload);
}

#[command]
fn broadcast_overlay_cmd(app: AppHandle, payload: serde_json::Value) {
    let _ = app.emit("overlay-player-cmd", payload);
}

#[command]
fn request_overlay_state(app: AppHandle) {
    let _ = app.emit("overlay-request-state", ());
}

#[command]
fn minimize_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[command]
fn maximize_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_maximized().unwrap_or(false) {
            let _ = win.unmaximize();
        } else {
            let _ = win.maximize();
        }
    }
}

#[command]
fn close_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

#[command]
fn toggle_fullscreen(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let is_fullscreen = win.is_fullscreen().unwrap_or(false);
        let _ = win.set_fullscreen(!is_fullscreen);
    }
}

fn apply_overlay_bounds(win: &tauri::WebviewWindow, expanded: bool, scale: f64, position: &str) {
    let (base_w, base_h) = if expanded { (480.0, 184.0) } else { (280.0, 50.0) };
    
    // Scale only applies to compact mode, but expanded mode doesn't scale
    let final_scale = if expanded { 1.0 } else { scale };
    let w = (base_w * final_scale).round() as u32;
    let h = (base_h * final_scale).round() as u32;

    let _ = win.set_size(tauri::LogicalSize::new(w, h));

    if let Ok(Some(monitor)) = win.primary_monitor() {
        let monitor_size = monitor.size();
        let scale_factor = monitor.scale_factor();
        let phys_w = (w as f64 * scale_factor) as u32;
        let phys_h = (h as f64 * scale_factor) as u32;
        
        let margin = (20.0 * scale_factor) as i32;
        
        let x = match position {
            "top-left" | "bottom-left" => margin,
            "top-right" | "bottom-right" => (monitor_size.width as i32 - phys_w as i32 - margin).max(0),
            _ => (monitor_size.width as i32 - phys_w as i32) / 2, // "top", "bottom"
        };
        
        let y = match position {
            "bottom" | "bottom-left" | "bottom-right" => (monitor_size.height as i32 - phys_h as i32 - margin).max(0),
            _ => margin, // "top", "top-left", "top-right"
        };

        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

#[command]
fn toggle_overlay_window(app: AppHandle, enabled: bool) {
    if let Some(win) = app.get_webview_window("overlay") {
        if enabled {
            let _ = win.show();
            let _ = win.set_always_on_top(true);
        } else {
            let _ = win.hide();
        }
    }
}

#[command]
fn is_overlay_visible(app: AppHandle) -> bool {
    if let Some(win) = app.get_webview_window("overlay") {
        win.is_visible().unwrap_or(false)
    } else {
        false
    }
}

#[command]
fn resize_overlay_window(app: AppHandle, expanded: bool, scale: f64, position: String) {
    if let Some(win) = app.get_webview_window("overlay") {
        apply_overlay_bounds(&win, expanded, scale, &position);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // System Tray setup
            use tauri::menu::{Menu, MenuItem};
            let toggle_overlay_item = MenuItem::with_id(app, "toggle_overlay", "Игровой оверлей", true, None::<&str>)?;
            let show_main_item = MenuItem::with_id(app, "show_main", "Показать AmyMusic", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_main_item, &toggle_overlay_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(|app_handle, event| {
                    match event.id.as_ref() {
                        "show_main" => {
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "toggle_overlay" => {
                            if let Some(win) = app_handle.get_webview_window("overlay") {
                                let is_vis = win.is_visible().unwrap_or(false);
                                toggle_overlay_window(app_handle.clone(), !is_vis);
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            discord::set_discord_bot_token,
            discord::get_discord_bot_token,
            discord::set_discord_activity,
            updater::start_update,
            network::parse_playlist_url,
            network::get_bandlink_chart,
            network::proxy_fetch,
            minimize_window,
            maximize_window,
            toggle_fullscreen,
            close_window,
            smtc::update_smtc,
            smtc::clear_smtc,
            toggle_overlay_window,
            is_overlay_visible,
            resize_overlay_window,
            broadcast_overlay_state,
            broadcast_overlay_cmd,
            request_overlay_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
