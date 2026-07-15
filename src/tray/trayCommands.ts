/**
 * Bridge between the WebView and the native tray. Sends status updates to Rust
 * and subscribes to tray menu commands (pause/resume, mark sitting/standing,
 * open dashboard). Everything is guarded so it safely no-ops outside Tauri
 * (e.g. `npm run dev` in a plain browser or jsdom tests).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TrayTone } from "./trayState";

/** Commands the native tray menu can send to the app. */
export type TrayCommand =
  | { readonly kind: "pause"; readonly minutes: number }
  | { readonly kind: "resume" }
  | { readonly kind: "mark_sitting" }
  | { readonly kind: "mark_standing" }
  | { readonly kind: "open_dashboard" };

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface TrayStatus {
  readonly postureLabel: string;
  readonly positionLabel: string;
  readonly durationLabel: string;
  readonly tone: TrayTone;
}

/** Push the current status to the native tray (no-op outside Tauri). */
export async function updateTrayStatus(status: TrayStatus): Promise<void> {
  if (!inTauri()) return;
  await invoke("update_tray_status", {
    posture: status.postureLabel,
    position: status.positionLabel,
    duration: status.durationLabel,
    tone: status.tone,
  });
}

/** Subscribe to tray menu commands; returns an unsubscribe function. */
export async function listenTrayCommands(
  handler: (command: TrayCommand) => void,
): Promise<() => void> {
  if (!inTauri()) return () => undefined;
  const unlisten = await listen<TrayCommand>("tray-command", (event) => {
    handler(event.payload);
  });
  return unlisten;
}
