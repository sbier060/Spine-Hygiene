/**
 * Monitoring-layer shared types.
 */
import type { PostureState } from "../posture/postureTypes";

/** Whether monitoring is actively running, paused (with an end time), or stopped. */
export type MonitoringStatus =
  | { readonly kind: "running" }
  | { readonly kind: "paused"; readonly untilMs: number | null }
  | { readonly kind: "stopped" };

/** Scheduler cadence "modes" derived from posture state. */
export type InferenceMode =
  | "away"
  | "stable"
  | "drifting"
  | "poor"
  | "low_confidence"
  | "stopped";

export function modeForState(
  state: PostureState,
  paused: boolean,
): InferenceMode {
  if (paused) return "stopped";
  switch (state) {
    case "away":
      return "away";
    case "paused":
      return "stopped";
    case "good":
      return "stable";
    case "drifting":
      return "drifting";
    case "poor_candidate":
    case "poor_confirmed":
    case "cooldown":
      return "poor";
    case "low_confidence":
      return "low_confidence";
  }
}
