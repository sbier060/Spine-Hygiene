//! System tray for Spine-IQ.
//!
//! The tray is the primary surface for a menu-bar app. It shows the current
//! posture as the menu-bar title, offers pause/resume + mark-sitting/standing +
//! open-dashboard + quit, and swaps its icon tone (normal/warning/alert/paused)
//! from the front end via `update_tray_status`. Menu clicks are forwarded to the
//! WebView as `tray-command` events so all monitoring logic stays in one place.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Runtime};

use crate::app_lifecycle;

const ICON_NORMAL: &[u8] = include_bytes!("../icons/tray-normal.png");
const ICON_WARNING: &[u8] = include_bytes!("../icons/tray-warning.png");
const ICON_ALERT: &[u8] = include_bytes!("../icons/tray-alert.png");
const ICON_PAUSED: &[u8] = include_bytes!("../icons/tray-paused.png");

fn icon_for_tone(tone: &str) -> &'static [u8] {
    match tone {
        "warning" => ICON_WARNING,
        "alert" => ICON_ALERT,
        "paused" | "camera" => ICON_PAUSED,
        _ => ICON_NORMAL,
    }
}

/// Emit a `tray-command` event to the front end.
fn emit_command<R: Runtime>(app: &AppHandle<R>, payload: serde_json::Value) {
    let _ = app.emit("tray-command", payload);
}

/// Build the tray icon and menu. Called once during setup.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open dashboard", true, None::<&str>)?;
    let pause_15 = MenuItem::with_id(app, "pause_15", "Pause 15 minutes", true, None::<&str>)?;
    let pause_30 = MenuItem::with_id(app, "pause_30", "Pause 30 minutes", true, None::<&str>)?;
    let pause_60 = MenuItem::with_id(app, "pause_60", "Pause 1 hour", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "Resume monitoring", true, None::<&str>)?;
    let mark_sitting = MenuItem::with_id(app, "mark_sitting", "Mark as sitting", true, None::<&str>)?;
    let mark_standing =
        MenuItem::with_id(app, "mark_standing", "Mark as standing", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Spine-IQ", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open,
            &PredefinedMenuItem::separator(app)?,
            &pause_15,
            &pause_30,
            &pause_60,
            &resume,
            &PredefinedMenuItem::separator(app)?,
            &mark_sitting,
            &mark_standing,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let icon = Image::from_bytes(ICON_NORMAL)?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Spine-IQ")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                app_lifecycle::show_main_window(app);
                emit_command(app, serde_json::json!({ "kind": "open_dashboard" }));
            }
            "pause_15" => emit_command(app, serde_json::json!({ "kind": "pause", "minutes": 15 })),
            "pause_30" => emit_command(app, serde_json::json!({ "kind": "pause", "minutes": 30 })),
            "pause_60" => emit_command(app, serde_json::json!({ "kind": "pause", "minutes": 60 })),
            "resume" => emit_command(app, serde_json::json!({ "kind": "resume" })),
            "mark_sitting" => emit_command(app, serde_json::json!({ "kind": "mark_sitting" })),
            "mark_standing" => emit_command(app, serde_json::json!({ "kind": "mark_standing" })),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Update the menu-bar title, tooltip, and icon tone. Driven by the front end.
pub fn update_tray_status<R: Runtime>(
    app: &AppHandle<R>,
    posture: &str,
    position: &str,
    duration: &str,
    tone: &str,
) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_title(Some(posture))?;
        tray.set_tooltip(Some(&format!(
            "Spine-IQ — {posture} · {position} · {duration}"
        )))?;
        tray.set_icon(Some(Image::from_bytes(icon_for_tone(tone))?))?;
    }
    Ok(())
}
