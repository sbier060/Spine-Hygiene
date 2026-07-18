//! Window/app lifecycle helpers.
//!
//! Spine-IQ is a menu-bar app (LSUIElement) but Phase 1 still shows a normal
//! window so the detection sandbox is visible. `show_main_window` re-reveals and
//! focuses it (used by the tray "Open dashboard" item and notification clicks).

use tauri::{App, Manager, Runtime, WebviewWindow};

/// Speak text via the free macOS system voice (`say`). Fire-and-forget: spawn
/// so the UI thread never waits on speech. The front end builds the lines
/// (personalized from the user's profile) and calls the `speak` command.
/// `voice` selects a macOS voice by name (e.g. "Ava (Premium)"); empty/None
/// uses the system default.
pub fn speak_text(text: &str, voice: Option<&str>) {
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("say");
        if let Some(v) = voice {
            if !v.is_empty() {
                cmd.arg("-v").arg(v);
            }
        }
        let _ = cmd.arg(text).spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (text, voice);
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

/// Names of the voices actually installed on this Mac (`say -v ?`). The
/// picker is built from this list so every option is guaranteed to speak.
pub fn list_voices() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("say").args(["-v", "?"]).output() {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut voices: Vec<String> = text
                .lines()
                .filter_map(|line| {
                    // Format: "Evan (Enhanced)     en_US    # blurb" — the name
                    // ends at the first run of 2+ spaces (names may contain
                    // single spaces and parentheses).
                    let idx = line.find("  ")?;
                    let name = line[..idx].trim();
                    if name.is_empty() {
                        None
                    } else {
                        Some(name.to_string())
                    }
                })
                .collect();
            voices.sort();
            voices.dedup();
            return voices;
        }
        Vec::new()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

/// Seconds since the last keyboard/mouse input, read from IOKit's HIDIdleTime
/// (no special permissions required). Used to wake the camera from away-standby
/// the moment the user touches anything. Returns a negative value when the
/// reading is unavailable so callers can apply their own fallback.
pub fn system_idle_seconds() -> f64 {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("ioreg")
            .args(["-c", "IOHIDSystem", "-d", "4"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains("HIDIdleTime") {
                    if let Some(value) = line.rsplit('=').next() {
                        if let Ok(ns) = value.trim().parse::<u64>() {
                            return ns as f64 / 1_000_000_000.0;
                        }
                    }
                }
            }
        }
        -1.0
    }
    #[cfg(not(target_os = "macos"))]
    {
        -1.0
    }
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
