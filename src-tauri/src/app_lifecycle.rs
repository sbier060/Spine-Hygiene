//! Window/app lifecycle helpers.
//!
//! Spine-IQ is a menu-bar app (LSUIElement) but Phase 1 still shows a normal
//! window so the detection sandbox is visible. `show_main_window` re-reveals and
//! focuses it (used by the tray "Open dashboard" item and notification clicks).

use tauri::{App, Manager, Runtime, WebviewWindow};

/// Configure lifecycle during setup: make sure the main window is shown/focused.
pub fn configure(app: &mut App) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        // Open the web inspector automatically in dev builds so console logs are
        // visible without hunting through menus.
        #[cfg(debug_assertions)]
        window.open_devtools();
    }
    Ok(())
}

/// Reveal and focus the main window from anywhere (tray, notifications).
pub fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        reveal(&window);
    }
}

fn reveal<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}
