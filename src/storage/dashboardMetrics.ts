/**
 * Pure dashboard math: fold a day's work_session rows into totals and derive the
 * headline metrics (posture consistency, longest sessions). No I/O.
 */
import type { WorkSessionRow } from "./schema";

export interface DayStats {
  readonly sittingSeconds: number;
  readonly standingSeconds: number;
  readonly awaySeconds: number;
  readonly unknownSeconds: number;
  readonly goodPostureSeconds: number;
  readonly poorPostureSeconds: number;
  readonly postureNotificationCount: number;
  readonly positionNotificationCount: number;
  readonly longestSittingSeconds: number;
  readonly longestStandingSeconds: number;
  /** Posture consistency in [0,1], or null when there's no good/poor time yet. */
  readonly postureConsistency: number | null;
}

const EMPTY: DayStats = {
  sittingSeconds: 0,
  standingSeconds: 0,
  awaySeconds: 0,
  unknownSeconds: 0,
  goodPostureSeconds: 0,
  poorPostureSeconds: 0,
  postureNotificationCount: 0,
  positionNotificationCount: 0,
  longestSittingSeconds: 0,
  longestStandingSeconds: 0,
  postureConsistency: null,
};

/**
 * Posture consistency = good / (good + poor). Away, unknown, paused, drifting,
 * and low-confidence time are already excluded upstream (not in good or poor).
 */
export function postureConsistency(
  goodSeconds: number,
  poorSeconds: number,
): number | null {
  const denom = goodSeconds + poorSeconds;
  if (denom <= 0) return null;
  return goodSeconds / denom;
}

export function aggregateDay(rows: readonly WorkSessionRow[]): DayStats {
  if (rows.length === 0) return EMPTY;
  let good = 0;
  let poor = 0;
  const acc = { ...EMPTY } as {
    -readonly [K in keyof DayStats]: DayStats[K];
  };
  for (const r of rows) {
    acc.sittingSeconds += r.sitting_seconds;
    acc.standingSeconds += r.standing_seconds;
    acc.awaySeconds += r.away_seconds;
    acc.unknownSeconds += r.unknown_seconds;
    acc.goodPostureSeconds += r.good_posture_seconds;
    acc.poorPostureSeconds += r.poor_posture_seconds;
    acc.postureNotificationCount += r.posture_notification_count;
    acc.positionNotificationCount += r.position_notification_count;
    // Per-session sitting/standing seconds approximate the longest continuous run.
    acc.longestSittingSeconds = Math.max(
      acc.longestSittingSeconds,
      r.sitting_seconds,
    );
    acc.longestStandingSeconds = Math.max(
      acc.longestStandingSeconds,
      r.standing_seconds,
    );
    good += r.good_posture_seconds;
    poor += r.poor_posture_seconds;
  }
  acc.postureConsistency = postureConsistency(good, poor);
  return acc;
}

/** Start-of-day epoch ms for the day containing `nowMs`, in local time. */
export function startOfDay(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
