/**
 * System input-idle bridge. macOS exposes seconds-since-last-input via IOKit
 * (no permissions needed); the monitor uses it to keep the camera OFF while
 * the user is away and wake it the instant they touch the keyboard or mouse.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Seconds since last keyboard/mouse input, or null when unavailable. */
export async function systemIdleSeconds(): Promise<number | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const idle = await invoke<number>("system_idle_seconds");
    return idle >= 0 ? idle : null;
  } catch {
    return null;
  }
}
