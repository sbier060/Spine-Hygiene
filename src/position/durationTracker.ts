/**
 * Duration tracking + sitting/standing reminders. Accumulates time in each
 * position, tracks the longest continuous sitting/standing sessions and the
 * number of position changes, and fires a reminder when a continuous session
 * exceeds its threshold (with a cooldown so it never nags). Away/unknown time is
 * tracked separately and never counts as sitting or standing.
 *
 * Deterministic and clock-free — every update takes the current time.
 */
import type { PositionState } from "./positionTypes";

export interface DurationConfig {
  readonly sittingReminderMs: number;
  readonly standingReminderMs: number;
  readonly reminderCooldownMs: number;
  readonly sittingEnabled: boolean;
  readonly standingEnabled: boolean;
}

export const DEFAULT_DURATION_CONFIG: DurationConfig = {
  sittingReminderMs: 50 * 60_000,
  standingReminderMs: 45 * 60_000,
  reminderCooldownMs: 15 * 60_000,
  sittingEnabled: true,
  standingEnabled: true,
};

export interface DurationSnapshot {
  readonly position: PositionState;
  /** Continuous time in the current position (resets on change). */
  readonly currentMs: number;
  readonly totalSittingMs: number;
  readonly totalStandingMs: number;
  readonly totalAwayMs: number;
  readonly totalUnknownMs: number;
  readonly longestSittingMs: number;
  readonly longestStandingMs: number;
  readonly positionChanges: number;
}

export type ReminderKind = "sitting" | "standing";

export interface DurationUpdate {
  readonly snapshot: DurationSnapshot;
  readonly reminder: ReminderKind | null;
}

export class DurationTracker {
  private current: PositionState = "unknown";
  private currentMs = 0;
  private lastMs: number | null = null;
  private totals: Record<PositionState, number> = {
    sitting: 0,
    standing: 0,
    away: 0,
    unknown: 0,
  };
  private longestSittingMs = 0;
  private longestStandingMs = 0;
  private positionChanges = 0;
  private lastSittingReminderMs = Number.NEGATIVE_INFINITY;
  private lastStandingReminderMs = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly config: DurationConfig = DEFAULT_DURATION_CONFIG,
  ) {}

  update(nowMs: number, position: PositionState, paused = false): DurationUpdate {
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;

    if (paused) {
      // Freeze: time while paused counts toward nothing.
      return { snapshot: this.snapshot(), reminder: null };
    }

    // Accumulate the elapsed time into the position that was active.
    this.totals[this.current] += dt;
    this.currentMs += dt;
    if (this.current === "sitting") {
      this.longestSittingMs = Math.max(this.longestSittingMs, this.currentMs);
    } else if (this.current === "standing") {
      this.longestStandingMs = Math.max(this.longestStandingMs, this.currentMs);
    }

    // Handle a position change (resets the continuous timer).
    if (position !== this.current) {
      this.current = position;
      this.currentMs = 0;
      this.positionChanges += 1;
    }

    const reminder = this.checkReminder(nowMs);
    return { snapshot: this.snapshot(), reminder };
  }

  private checkReminder(nowMs: number): ReminderKind | null {
    if (
      this.current === "sitting" &&
      this.config.sittingEnabled &&
      this.currentMs >= this.config.sittingReminderMs &&
      nowMs - this.lastSittingReminderMs >= this.config.reminderCooldownMs
    ) {
      this.lastSittingReminderMs = nowMs;
      return "sitting";
    }
    if (
      this.current === "standing" &&
      this.config.standingEnabled &&
      this.currentMs >= this.config.standingReminderMs &&
      nowMs - this.lastStandingReminderMs >= this.config.reminderCooldownMs
    ) {
      this.lastStandingReminderMs = nowMs;
      return "standing";
    }
    return null;
  }

  snapshot(): DurationSnapshot {
    return {
      position: this.current,
      currentMs: this.currentMs,
      totalSittingMs: this.totals.sitting,
      totalStandingMs: this.totals.standing,
      totalAwayMs: this.totals.away,
      totalUnknownMs: this.totals.unknown,
      longestSittingMs: this.longestSittingMs,
      longestStandingMs: this.longestStandingMs,
      positionChanges: this.positionChanges,
    };
  }

  reset(): void {
    this.current = "unknown";
    this.currentMs = 0;
    this.lastMs = null;
    this.totals = { sitting: 0, standing: 0, away: 0, unknown: 0 };
    this.longestSittingMs = 0;
    this.longestStandingMs = 0;
    this.positionChanges = 0;
    this.lastSittingReminderMs = Number.NEGATIVE_INFINITY;
    this.lastStandingReminderMs = Number.NEGATIVE_INFINITY;
  }
}
