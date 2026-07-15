/**
 * Pure mapping from posture/position state to the menu-bar presentation. Tray
 * appearance is distinguished by BOTH an icon tone and a text label — never
 * color alone (accessibility requirement).
 */
import type { PostureState } from "../posture/postureTypes";

/** Icon tones the Rust tray can render. */
export type TrayTone = "normal" | "warning" | "alert" | "paused" | "camera";

/** Position states (automatic classification arrives in Phase 3). */
export type PositionState = "sitting" | "standing" | "away" | "unknown";

/** Human-readable posture label for the menu (spec posture states). */
export function postureLabel(state: PostureState): string {
  switch (state) {
    case "good":
      return "Good";
    case "drifting":
      return "Drifting";
    case "poor_candidate":
    case "poor_confirmed":
    case "cooldown":
      return "Hunching";
    case "low_confidence":
      return "Low confidence";
    case "away":
      return "Away";
    case "paused":
      return "Paused";
  }
}

/** Icon tone for a posture state. */
export function trayTone(state: PostureState): TrayTone {
  switch (state) {
    case "good":
      return "normal";
    case "drifting":
      return "warning";
    case "poor_candidate":
    case "poor_confirmed":
    case "cooldown":
      return "alert";
    case "paused":
      return "paused";
    case "away":
    case "low_confidence":
      return "normal";
  }
}

export function positionLabel(position: PositionState): string {
  switch (position) {
    case "sitting":
      return "Sitting";
    case "standing":
      return "Standing";
    case "away":
      return "Away";
    case "unknown":
      return "Unknown";
  }
}

/** Format a duration (ms) as a compact "1h 04m" / "12m" / "45s" string. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${String(h)}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${String(m)}m`;
  return `${String(s)}s`;
}
