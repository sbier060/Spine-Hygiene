//! System tray for Spine-IQ.
//!
//! Phase 1 wires up the tray with a status line and the essential actions
//! (open the window, quit). The richer menu — pause durations, sitting/standing
//! marks, position/posture state — arrives in Phases 2–3. The tray icon can be
//! swapped between visual states (normal/warning/alert/paused) via `set_tray_state`.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::app_lifecycle;

/// Visual tray states. Distinguished by icon AND label, never color alone.
/// (Phase 2 drives these from the monitoring controller.)
#[allow(dead_code)]
pub enum TrayState {
    Normal,
    Warning,
    Alert,
    Paused,
    CameraUnavailable,
}

const ICON_NORMAL: &[u8] = include_bytes!("../icons/tray-normal.png");
const ICON_WARNING: &[u8] = include_bytes!("../icons/tray-warning.png");
const ICON_ALERT: &[u8] = include_bytes!("../icons/tray-alert.png");
const ICON_PAUSED: &[u8] = include_bytes!("../icons/tray-paused.png");

fn icon_bytes(state: &TrayState) -> &'static [u8] {
    match state {
        TrayState::Normal => ICON_NORMAL,
        TrayState::Warning => ICON_WARNING,
        TrayState::Alert => ICON_ALERT,
        TrayState::Paused | TrayState::CameraUnavailable => ICON_PAUSED,
    }
}

/// Build the tray icon and menu. Called once during setup.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Posture: starting…", false, None::<&str>)?;
    let position = MenuItem::with_id(app, "position", "Position: unknown", false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open dashboard", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Spine-IQ", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &status,
            &position,
            &PredefinedMenuItem::separator(app)?,
            &open,
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
            "open" => app_lifecycle::show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

/// Swap the tray icon to reflect the current monitoring state.
#[allow(dead_code)]
pub fn set_tray_state<R: Runtime>(app: &AppHandle<R>, state: TrayState) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let icon = Image::from_bytes(icon_bytes(&state))?;
        tray.set_icon(Some(icon))?;
    }
    Ok(())
}
