//! Spine-IQ Tauri shell entry point.
//!
//! Builds the app, registers plugins (single-instance, notification, autostart,
//! window-state, opener), sets up the tray, and (on macOS) runs as a menu-bar
//! accessory app. Posture/position monitoring lives in the WebView front end;
//! this shell provides the native surfaces (tray, notifications, autostart, and
//! — in later phases — SQLite).

mod app_lifecycle;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered first.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            app_lifecycle::show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::open_dashboard,
            commands::update_tray_status
        ])
        .setup(|app| {
            // Menu-bar (accessory) app on macOS: no dock icon, lives in the tray.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::create_tray(app.handle())?;
            app_lifecycle::configure(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Spine-IQ");
}
