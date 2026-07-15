//! Spine-IQ Tauri shell entry point.
//!
//! Builds the app, registers the opener plugin, sets up the tray, and (on macOS)
//! runs as a menu-bar accessory app. Posture/position monitoring lives in the
//! WebView front end; this shell provides the native surfaces (tray, window,
//! and — in later phases — notifications, autostart, and SQLite).

mod app_lifecycle;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::open_dashboard
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
