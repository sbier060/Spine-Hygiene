/**
 * Notification categories and payloads. All user-facing copy is centralized in
 * interventionRules.ts — never hard-coded at call sites (spec coding standard).
 */

export type NotificationCategory =
  | "poor_posture"
  | "sitting_duration"
  | "standing_duration"
  | "camera_unavailable"
  | "calibration_needed";

export interface NotificationContent {
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
}

/** Context the guard uses to decide whether a notification may be shown. */
export interface NotificationGate {
  readonly paused: boolean;
  readonly away: boolean;
  readonly onboarding: boolean;
  /** OS screen-locked state, if known. */
  readonly screenLocked: boolean;
  /** True while a category-specific cooldown is active. */
  readonly inCooldown: boolean;
}
