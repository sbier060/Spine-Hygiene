/**
 * In-memory session aggregation. Rather than writing a row per frame, we
 * accumulate seconds-per-state and notification counts here, and the caller
 * flushes a summary to SQLite periodically (once/min) and at session end.
 * Pure and deterministic (time is passed in).
 *
 * Posture-consistency accounting (spec): only "good" and "poor" time count.
 * Drifting, away, unknown, low-confidence, and paused time are all excluded.
 */
import type { PostureState } from "../posture/postureTypes";
import type { PositionState } from "../position/positionTypes";
import type { SessionSummary } from "./sessionRepository";

export interface AggregatorSample {
  readonly position: PositionState;
  readonly postureState: PostureState;
  /** A posture notification fired this frame. */
  readonly postureNotified: boolean;
  /** A position (sitting/standing) reminder fired this frame. */
  readonly positionNotified: boolean;
  readonly paused: boolean;
}

const POOR_STATES: ReadonlySet<PostureState> = new Set<PostureState>([
  "poor_candidate",
  "poor_confirmed",
  "cooldown",
]);

export class SessionAggregator {
  private lastMs: number | null = null;
  private sittingMs = 0;
  private standingMs = 0;
  private awayMs = 0;
  private unknownMs = 0;
  private goodMs = 0;
  private poorMs = 0;
  private postureNotifications = 0;
  private positionNotifications = 0;

  record(nowMs: number, sample: AggregatorSample): void {
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;

    if (sample.postureNotified) this.postureNotifications += 1;
    if (sample.positionNotified) this.positionNotifications += 1;

    if (sample.paused || dt === 0) return;

    switch (sample.position) {
      case "sitting":
        this.sittingMs += dt;
        break;
      case "standing":
        this.standingMs += dt;
        break;
      case "away":
        this.awayMs += dt;
        break;
      case "unknown":
        this.unknownMs += dt;
        break;
    }

    if (sample.postureState === "good") this.goodMs += dt;
    else if (POOR_STATES.has(sample.postureState)) this.poorMs += dt;
  }

  summary(): SessionSummary {
    return {
      sittingSeconds: this.sittingMs / 1000,
      standingSeconds: this.standingMs / 1000,
      awaySeconds: this.awayMs / 1000,
      unknownSeconds: this.unknownMs / 1000,
      goodPostureSeconds: this.goodMs / 1000,
      poorPostureSeconds: this.poorMs / 1000,
      postureNotificationCount: this.postureNotifications,
      positionNotificationCount: this.positionNotifications,
    };
  }

  reset(): void {
    this.lastMs = null;
    this.sittingMs = 0;
    this.standingMs = 0;
    this.awayMs = 0;
    this.unknownMs = 0;
    this.goodMs = 0;
    this.poorMs = 0;
    this.postureNotifications = 0;
    this.positionNotifications = 0;
  }
}
