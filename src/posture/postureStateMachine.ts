/**
 * Posture state machine (Phase 2).
 *
 * Layers time, confidence, presence, and pause handling on top of the raw
 * per-frame score. It decides WHEN a single calm notification should fire, and
 * enforces persistence + cooldown so we never nag.
 *
 * Deterministic and clock-free: every `update` takes the current time, so tests
 * drive it with synthetic timestamps. Durations are ACCUMULATED from the gaps
 * between usable frames, so away / low-confidence / paused time never counts
 * toward "poor posture sustained".
 */
import type { PostureState } from "./postureTypes";
import { BAND_THRESHOLDS, HYSTERESIS } from "./postureThresholds";

export interface PostureMachineConfig {
  readonly driftThreshold: number;
  readonly enterPoor: number;
  readonly exitPoor: number;
  /** Sustained drift before showing "drifting" (no notification). */
  readonly driftSustainMs: number;
  /** Poor posture must persist this long before one notification fires. */
  readonly poorPersistenceMs: number;
  /** No further posture notification for this long after one fires. */
  readonly cooldownMs: number;
  /** Good posture must hold this long to reset (re-arm) the episode. */
  readonly resetSustainMs: number;
  /** No person for this long → away. */
  readonly awayGraceMs: number;
}

export const DEFAULT_POSTURE_MACHINE_CONFIG: PostureMachineConfig = {
  driftThreshold: BAND_THRESHOLDS.drift,
  enterPoor: HYSTERESIS.enterPoor,
  exitPoor: HYSTERESIS.exitPoor,
  driftSustainMs: 10_000,
  poorPersistenceMs: 60_000,
  cooldownMs: 15 * 60_000,
  resetSustainMs: 18_000,
  awayGraceMs: 20_000,
};

export interface PostureInput {
  readonly nowMs: number;
  readonly smoothedScore: number;
  /** Whether detection quality is high enough to classify this frame. */
  readonly usable: boolean;
  /** Whether a person is currently detected. */
  readonly present: boolean;
  /** Whether monitoring is paused. */
  readonly paused: boolean;
}

export interface PostureStep {
  readonly state: PostureState;
  /** True on the single frame a poor-posture notification should be sent. */
  readonly notify: boolean;
}

export class PostureStateMachine {
  private lastMs: number | null = null;
  private poorAccumMs = 0;
  private driftAccumMs = 0;
  private goodAccumMs = 0;
  private absentAccumMs = 0;
  private wasPoor = false;
  private notifiedEpisode = false;
  private cooldownUntil = 0;
  private state: PostureState = "good";

  constructor(
    private readonly config: PostureMachineConfig = DEFAULT_POSTURE_MACHINE_CONFIG,
  ) {}

  get current(): PostureState {
    return this.state;
  }

  /** Whether a posture notification is currently gated by cooldown. */
  inCooldown(nowMs: number): boolean {
    return nowMs < this.cooldownUntil;
  }

  update(input: PostureInput): PostureStep {
    const { nowMs, smoothedScore, usable, present, paused } = input;
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;

    if (paused) {
      this.resetTimers();
      return this.settle("paused");
    }

    if (!present) {
      this.absentAccumMs += dt;
      if (this.absentAccumMs >= this.config.awayGraceMs) {
        this.resetTimers();
        this.notifiedEpisode = false;
        return this.settle("away");
      }
      // Within the away grace period: hold, don't advance/reset posture timers.
      return this.settle("low_confidence");
    }
    this.absentAccumMs = 0;

    if (!usable) {
      // Freeze evaluation — low-confidence time counts toward nothing.
      return this.settle("low_confidence");
    }

    // Hysteresis: once in the poor region, stay until the score drops below exit.
    const poorActive = this.wasPoor
      ? smoothedScore >= this.config.exitPoor
      : smoothedScore >= this.config.enterPoor;
    this.wasPoor = poorActive;

    if (poorActive) {
      this.poorAccumMs += dt;
      this.driftAccumMs = 0;
      this.goodAccumMs = 0;

      if (this.poorAccumMs >= this.config.poorPersistenceMs) {
        if (!this.notifiedEpisode && !this.inCooldown(nowMs)) {
          this.notifiedEpisode = true;
          this.cooldownUntil = nowMs + this.config.cooldownMs;
          return this.settle("poor_confirmed", true);
        }
        return this.settle(
          this.inCooldown(nowMs) ? "cooldown" : "poor_confirmed",
        );
      }
      return this.settle("poor_candidate");
    }

    // Not poor: good or drifting. (Drifting stays "drifting" even inside the
    // notification cooldown — "cooldown" is reserved for genuinely poor posture
    // so the red alert never fires for a light lean.)
    this.poorAccumMs = 0;
    if (smoothedScore >= this.config.driftThreshold) {
      this.driftAccumMs += dt;
      this.goodAccumMs = 0;
      if (this.driftAccumMs >= this.config.driftSustainMs) {
        return this.settle("drifting");
      }
      return this.settle("good");
    }

    this.driftAccumMs = 0;
    this.goodAccumMs += dt;
    if (this.goodAccumMs >= this.config.resetSustainMs) {
      this.notifiedEpisode = false; // re-arm for the next episode
    }
    return this.settle("good");
  }

  private settle(state: PostureState, notify = false): PostureStep {
    this.state = state;
    return { state, notify };
  }

  private resetTimers(): void {
    this.poorAccumMs = 0;
    this.driftAccumMs = 0;
    this.goodAccumMs = 0;
    this.wasPoor = false;
  }

  reset(): void {
    this.lastMs = null;
    this.resetTimers();
    this.absentAccumMs = 0;
    this.notifiedEpisode = false;
    this.cooldownUntil = 0;
    this.state = "good";
  }
}
