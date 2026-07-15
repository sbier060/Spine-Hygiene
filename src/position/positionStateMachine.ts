/**
 * Position state machine. Turns noisy per-frame classifications into a stable
 * sitting/standing/away/unknown state: it requires a classification to hold for a
 * sustained period before switching, prefers the previous state when confidence
 * is low, and supports immediate manual correction. Emits a PositionEvent on
 * every change (source: automatic or manual). Deterministic and clock-free.
 */
import type {
  PositionClassification,
  PositionEvent,
  PositionState,
} from "./positionTypes";

export interface PositionMachineConfig {
  /** A new classification must persist this long before the state switches. */
  readonly switchSustainMs: number;
  /** Classifications below this confidence are ignored (prefer previous). */
  readonly minConfidence: number;
  /** No person for this long → away. */
  readonly awayGraceMs: number;
}

export const DEFAULT_POSITION_MACHINE_CONFIG: PositionMachineConfig = {
  switchSustainMs: 4000,
  minConfidence: 0.5,
  awayGraceMs: 20_000,
};

export interface PositionInput {
  readonly nowMs: number;
  readonly classification: PositionClassification;
  readonly present: boolean;
  readonly paused: boolean;
}

export interface PositionStep {
  readonly position: PositionState;
  readonly changed: boolean;
  readonly event?: PositionEvent;
}

export class PositionStateMachine {
  private state: PositionState = "unknown";
  private candidate: PositionState | null = null;
  private candidateAccumMs = 0;
  private absentAccumMs = 0;
  private lastMs: number | null = null;

  constructor(
    private readonly config: PositionMachineConfig = DEFAULT_POSITION_MACHINE_CONFIG,
  ) {}

  get current(): PositionState {
    return this.state;
  }

  update(input: PositionInput): PositionStep {
    const { nowMs, classification, present, paused } = input;
    const dt = this.lastMs === null ? 0 : Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;

    if (paused) {
      this.candidate = null;
      this.candidateAccumMs = 0;
      return { position: this.state, changed: false };
    }

    // Determine the target this frame.
    let target: PositionState;
    if (!present) {
      this.absentAccumMs += dt;
      if (this.absentAccumMs >= this.config.awayGraceMs) {
        return this.switchImmediate("away", classification.confidence, nowMs);
      }
      // Within grace: hold current state.
      this.candidate = null;
      this.candidateAccumMs = 0;
      return { position: this.state, changed: false };
    }
    this.absentAccumMs = 0;

    if (
      classification.position !== "unknown" &&
      classification.confidence >= this.config.minConfidence
    ) {
      target = classification.position;
    } else {
      target = this.state; // prefer previous when uncertain
    }

    if (target === this.state) {
      this.candidate = null;
      this.candidateAccumMs = 0;
      return { position: this.state, changed: false };
    }

    if (this.candidate !== target) {
      this.candidate = target;
      this.candidateAccumMs = 0;
    }
    this.candidateAccumMs += dt;

    if (this.candidateAccumMs >= this.config.switchSustainMs) {
      return this.commit(target, classification.confidence, "automatic", nowMs);
    }
    return { position: this.state, changed: false };
  }

  /** Apply a manual correction immediately. */
  markManual(position: PositionState, nowMs: number): PositionStep {
    this.lastMs = nowMs;
    return this.commit(position, 1, "manual", nowMs);
  }

  private switchImmediate(
    target: PositionState,
    confidence: number,
    nowMs: number,
  ): PositionStep {
    this.candidate = null;
    this.candidateAccumMs = 0;
    if (target === this.state) return { position: this.state, changed: false };
    return this.commit(target, confidence, "system", nowMs);
  }

  private commit(
    target: PositionState,
    confidence: number,
    source: PositionEvent["source"],
    nowMs: number,
  ): PositionStep {
    const previous = this.state;
    this.state = target;
    this.candidate = null;
    this.candidateAccumMs = 0;
    if (previous === target) return { position: target, changed: false };
    return {
      position: target,
      changed: true,
      event: { previous, next: target, confidence, source, atMs: nowMs },
    };
  }

  reset(): void {
    this.state = "unknown";
    this.candidate = null;
    this.candidateAccumMs = 0;
    this.absentAccumMs = 0;
    this.lastMs = null;
  }
}
