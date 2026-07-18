//! Window/app lifecycle helpers.
//!
//! Spine-IQ is a menu-bar app (LSUIElement) but Phase 1 still shows a normal
//! window so the detection sandbox is visible. `show_main_window` re-reveals and
//! focuses it (used by the tray "Open dashboard" item and notification clicks).

use tauri::{App, Manager, Runtime, WebviewWindow};

/// Speak text via the free macOS system voice (`say`). Fire-and-forget: spawn
/// so the UI thread never waits on speech. The front end builds the lines
/// (personalized from the user's profile) and calls the `speak` command.
pub fn speak_text(text: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("say").arg(text).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
    }
}

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

/// Posture alert: when active, pop the window to the front and keep it on top so
/// the big red warning is unmissable; when cleared, drop the always-on-top.
pub fn set_posture_alert<R: Runtime>(app: &tauri::AppHandle<R>, active: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if active {
            reveal(&window);
            let _ = window.set_always_on_top(true);
        } else {
            let _ = window.set_always_on_top(false);
        }
    }
}

fn reveal<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}
