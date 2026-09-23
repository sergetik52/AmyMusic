mod discord;
mod updater;
mod network;
mod smtc;

use tauri::{Manager, AppHandle, command, Emitter};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri_plugin_autostart::MacosLauncher;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Clone, Default)]
struct OverlayRules {
    enabled: bool,
    mode: String,
    apps: Vec<String>,
}

#[derive(Clone, Default)]
struct OverlayRulesState {
    rules: Arc<Mutex<OverlayRules>>,
}

fn normalized_process_name(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or(value)
        .to_lowercase()
}

#[cfg(target_os = "windows")]
fn foreground_process() -> Option<(String, String)> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW,
        PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    use windows::core::PWSTR;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == 0 || process_id == GetCurrentProcessId() {
            return None;
        }

        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(process, PROCESS_NAME_FORMAT(0), PWSTR(buffer.as_mut_ptr()), &mut length);
        let _ = CloseHandle(process);
        result.ok()?;

        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        let name = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
        Some((name, path))
    }
}

#[cfg(not(target_os = "windows"))]
fn foreground_process() -> Option<(String, String)> {
    None
}

fn overlay_allowed(state: &OverlayRulesState) -> bool {
    let Some((name, path)) = foreground_process() else {
        return true;
    };
    let process_name = normalized_process_name(&name);
    let process_path = normalized_process_name(&path);
    let rules = state.rules.lock().map(|value| value.clone()).unwrap_or_default();
    let matches = rules.apps.iter().any(|rule| {
        let normalized = normalized_process_name(rule);
        normalized == process_name || normalized == process_path
    });

    if rules.mode == "include" { matches } else { !matches }
}

fn apply_overlay_visibility(app: &AppHandle, state: &OverlayRulesState) {
    if let Some(win) = app.get_webview_window("overlay") {
        let enabled = state.rules.lock().map(|rules| rules.enabled).unwrap_or(false);
        if enabled && overlay_allowed(state) {
            let _ = win.show();
            let _ = win.set_always_on_top(true);
        } else {
            let _ = win.hide();
        }
    }
}

#[command]
fn get_foreground_app() -> serde_json::Value {
    match foreground_process() {
        Some((name, path)) => serde_json::json!({ "name": name, "path": path }),
        None => serde_json::json!({ "name": "", "path": "" }),
    }
}

#[command]
fn set_overlay_rules(app: AppHandle, state: tauri::State<'_, OverlayRulesState>, mode: String, apps: Vec<String>) {
    if let Ok(mut rules) = state.rules.lock() {
        rules.mode = if mode == "include" { "include".to_string() } else { "exclude".to_string() };
        rules.apps = apps.into_iter().map(|value| normalized_process_name(&value)).filter(|value| !value.is_empty()).collect();
    }
    apply_overlay_visibility(&app, &state);
}

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
fn set_overlay_window(app: &AppHandle, state: &OverlayRulesState, enabled: bool) {
    if let Ok(mut rules) = state.rules.lock() {
        rules.enabled = enabled;
    }
    apply_overlay_visibility(app, state);
}

#[command]
fn toggle_overlay_window(app: AppHandle, state: tauri::State<'_, OverlayRulesState>, enabled: bool) {
    set_overlay_window(&app, &state, enabled);
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
        .manage(OverlayRulesState::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let overlay_rules = app.state::<OverlayRulesState>().inner().clone();
            std::thread::spawn(move || {
                loop {
                    apply_overlay_visibility(&app_handle, &overlay_rules);
                    std::thread::sleep(Duration::from_millis(500));
                }
            });

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
                                let overlay_state = app_handle.state::<OverlayRulesState>();
                                set_overlay_window(&app_handle, &overlay_state, !is_vis);
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
            set_overlay_rules,
            get_foreground_app,
            is_overlay_visible,
            resize_overlay_window,
            broadcast_overlay_state,
            broadcast_overlay_cmd,
            request_overlay_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
