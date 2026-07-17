//! Window/app lifecycle helpers.
//!
//! Spine-IQ is a menu-bar app (LSUIElement) but Phase 1 still shows a normal
//! window so the detection sandbox is visible. `show_main_window` re-reveals and
//! focuses it (used by the tray "Open dashboard" item and notification clicks).

use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::{App, Manager, Runtime, WebviewWindow};

/// Spoken lines for the slouch alert, rotated so it doesn't get stale.
const SLOUCH_LINES: &[&str] = &[
    "Alek, you're slouching.",
    "Alek, sit up. You want to be able to pick up Jack when you're older.",
];
static SLOUCH_LINE_IDX: AtomicUsize = AtomicUsize::new(0);

/// Speak the next slouch line via the macOS `say` command. Fire-and-forget:
/// spawn so the UI thread never waits on speech.
fn speak_slouch_line() {
    #[cfg(target_os = "macos")]
    {
        let idx = SLOUCH_LINE_IDX.fetch_add(1, Ordering::Relaxed) % SLOUCH_LINES.len();
        let _ = std::process::Command::new("say")
            .arg(SLOUCH_LINES[idx])
            .spawn();
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
            // Called once per slouch episode (the front end only signals
            // transitions), so this speaks once per alert, not continuously.
            speak_slouch_line();
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
