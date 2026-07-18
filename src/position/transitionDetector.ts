/**
 * Desk transition detector (sit/stand spec §9). Watches background-motion
 * features for a sustained, coherent vertical shift — the signature of an
 * adjustable desk rising or lowering with the camera on it — and emits one
 * completed transition when the background settles again.
 *
 * Deterministic and clock-free: every update takes the current time.
 * "background_down" = content moved down in frame = camera up = desk rising.
 */
import type { BackgroundMotionFeatures } from "./backgroundMotion";

export type TransitionPhase = "none" | "possible" | "active";

export type TransitionDirection = "background_down" | "background_up";

export interface CompletedTransition {
  readonly direction: TransitionDirection;
  readonly cumulativeDeltaY: number;
  readonly durationMs: number;
}

export interface TransitionStep {
  readonly phase: TransitionPhase;
  /** Set on the single update where a transition completes. */
  readonly completed: CompletedTransition | null;
  /** Total vertical displacement accumulated so far (debug). */
  readonly cumulativeDeltaY: number;
}

export interface TransitionConfig {
  /** Coherent motion must persist this long before a transition is trusted. */
  readonly confirmMs: number;
  /** Stability required after motion stops to complete the transition. */
  readonly settleMs: number;
  /** Transitions longer than this are abandoned (someone carried the laptop). */
  readonly maxDurationMs: number;
  /** Total |deltaY| (px at tracking scale) needed for a real desk move. */
  readonly minCumulativeDeltaY: number;
}

export const DEFAULT_TRANSITION_CONFIG: TransitionConfig = {
  confirmMs: 1000,
  settleMs: 1500,
  maxDurationMs: 35_000,
  minCumulativeDeltaY: 10,
};

export interface TransitionInput {
  readonly nowMs: number;
  readonly motion: BackgroundMotionFeatures | null;
  readonly present: boolean;
}

export class TransitionDetector {
  private phase: TransitionPhase = "none";
  private startedMs = 0;
  private cumulativeDy = 0;
  private motionAccumMs = 0;
  private settleAccumMs = 0;
  private lastMs: number | null = null;
  /** After abandoning an over-long transition, wait for stability to re-arm. */
  private suppressedUntilStable = false;

  constructor(
    private readonly config: TransitionConfig = DEFAULT_TRANSITION_CONFIG,
  ) {}

  update(input: TransitionInput): TransitionStep {
    const { nowMs, motion } = input;
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;

    if (motion === null) {
      // No measurement this frame (first frame, resize, etc.) — hold.
      return this.step(null);
    }

    const moving = motion.likelyCameraMotion;

    if (this.suppressedUntilStable) {
      // An abandoned over-long "transition" (e.g. the laptop being carried) —
      // don't start a new one until the world stops moving.
      if (motion.backgroundStable) this.suppressedUntilStable = false;
      return this.step(null);
    }

    if (this.phase === "none") {
      if (moving) {
        this.phase = "possible";
        this.startedMs = nowMs;
        this.cumulativeDy = motion.medianDeltaY;
        this.motionAccumMs = 0;
        this.settleAccumMs = 0;
      }
      return this.step(null);
    }

    // possible / active
    if (nowMs - this.startedMs > this.config.maxDurationMs) {
      this.reset();
      this.suppressedUntilStable = true;
      return this.step(null);
    }

    if (moving) {
      this.cumulativeDy += motion.medianDeltaY;
      this.motionAccumMs += dt;
      this.settleAccumMs = 0;
      if (this.phase === "possible" && this.motionAccumMs >= this.config.confirmMs) {
        this.phase = "active";
      }
      return this.step(null);
    }

    // Not moving this frame.
    if (motion.backgroundStable) {
      this.settleAccumMs += dt;
    }

    if (this.phase === "possible") {
      // Motion fizzled before confirmation — likely a body movement or noise.
      if (this.settleAccumMs >= this.config.settleMs) this.reset();
      return this.step(null);
    }

    // Active transition: complete once the background has settled.
    if (this.settleAccumMs >= this.config.settleMs) {
      const cumulative = this.cumulativeDy;
      const duration = nowMs - this.startedMs;
      this.reset();
      if (Math.abs(cumulative) >= this.config.minCumulativeDeltaY) {
        return this.step({
          direction: cumulative > 0 ? "background_down" : "background_up",
          cumulativeDeltaY: cumulative,
          durationMs: duration,
        });
      }
    }
    return this.step(null);
  }

  private step(completed: CompletedTransition | null): TransitionStep {
    return { phase: this.phase, completed, cumulativeDeltaY: this.cumulativeDy };
  }

  reset(): void {
    this.phase = "none";
    this.startedMs = 0;
    this.cumulativeDy = 0;
    this.motionAccumMs = 0;
    this.settleAccumMs = 0;
  }
}
