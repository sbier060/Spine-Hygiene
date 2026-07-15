/**
 * Intervention rules — the single source of user-facing notification copy and
 * the guard that decides whether a notification may be shown. Pure and testable.
 *
 * Copy is calm and behavioral (spec): describe what happened and a gentle
 * suggestion. Never medical, alarmist, or repetitive.
 */
import type {
  NotificationCategory,
  NotificationContent,
  NotificationGate,
} from "./notificationTypes";

/** Rotating calm posture messages (spec examples). */
const POSTURE_MESSAGES: readonly string[] = [
  "You’ve been leaning toward the screen for about a minute. Sit back when you can.",
  "Your posture has drifted forward. Reset your shoulders and bring the screen toward you.",
  "You appear to be hunching. Sit back and relax your shoulders.",
  "Your head has been moving closer to the screen. Try bringing the screen closer instead.",
];

/**
 * Whether a notification is allowed right now. Blocks while paused, away, in
 * onboarding, screen-locked, or during a cooldown.
 */
export function canNotify(gate: NotificationGate): boolean {
  return (
    !gate.paused &&
    !gate.away &&
    !gate.onboarding &&
    !gate.screenLocked &&
    !gate.inCooldown
  );
}

/** Build a poor-posture notification, rotating the message by `rotation`. */
export function postureNotification(rotation: number): NotificationContent {
  const idx =
    ((Math.trunc(rotation) % POSTURE_MESSAGES.length) + POSTURE_MESSAGES.length) %
    POSTURE_MESSAGES.length;
  return {
    category: "poor_posture",
    title: "Posture check",
    // Non-null: idx is always a valid index into the fixed array.
    body: POSTURE_MESSAGES[idx] as string,
  };
}

/** Sitting-duration reminder (Phase 3 uses this). */
export function sittingNotification(minutes: number): NotificationContent {
  return {
    category: "sitting_duration",
    title: "Time to move",
    body: `You’ve been sitting for ${String(minutes)} minutes. Stand or walk for a few minutes.`,
  };
}

/** Standing-duration reminder (Phase 3 uses this). */
export function standingNotification(minutes: number): NotificationContent {
  return {
    category: "standing_duration",
    title: "Give it a rest",
    body: `You’ve been standing for ${String(minutes)} minutes. Consider sitting or moving for a few minutes.`,
  };
}

/** Camera-unavailable notice. */
export function cameraUnavailableNotification(): NotificationContent {
  return {
    category: "camera_unavailable",
    title: "Camera unavailable",
    body: "Spine-IQ can’t see the camera right now. Monitoring is paused until it’s back.",
  };
}

/** Calibration-needed notice. */
export function calibrationNeededNotification(): NotificationContent {
  return {
    category: "calibration_needed",
    title: "Recalibration recommended",
    body: "Your camera setup changed. Recalibrate your sitting posture for accurate tracking.",
  };
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "poor_posture",
  "sitting_duration",
  "standing_duration",
  "camera_unavailable",
  "calibration_needed",
];
