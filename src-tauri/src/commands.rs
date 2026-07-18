//! Tauri IPC commands exposed to the frontend.
//!
//! Phase 1 keeps this tiny: reveal the window and report the version. Phase 2
//! adds commands to push posture/position state into the tray and to drive
//! pause/resume from the menu.

use crate::app_lifecycle;

#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) {
    app_lifecycle::show_main_window(&app);
}

#[tauri::command]
pub fn set_posture_alert(app: tauri::AppHandle, active: bool) {
    app_lifecycle::set_posture_alert(&app, active);
}

#[tauri::command]
pub fn speak(text: String, voice: Option<String>) {
    app_lifecycle::speak_text(&text, voice.as_deref());
}

#[tauri::command]
pub fn update_tray_status(
    app: tauri::AppHandle,
    posture: String,
    position: String,
    duration: String,
    tone: String,
) -> Result<(), String> {
    crate::tray::update_tray_status(&app, &posture, &position, &duration, &tone)
        .map_err(|e| e.to_string())
}
