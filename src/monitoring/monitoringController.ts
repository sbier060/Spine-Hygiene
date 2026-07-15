/**
 * Monitoring controller — the brain that runs during normal monitoring. It owns
 * the smoothing, presence debouncing, and posture state machine, and turns each
 * completed inference into: a smoothed score, a posture state, whether to notify,
 * and how long to wait before the next inference (adaptive scheduling).
 *
 * It performs NO I/O — no camera, no notifications, no timers. The hook drives it
 * and acts on its outputs. That keeps the whole decision path pure and testable.
 */
import type { Landmark } from "../pose/landmarkTypes";
import { extractFeatures } from "../pose/featureExtractor";
import { assessDetectionQuality } from "../pose/poseQuality";
import { ExponentialMovingAverage, DEFAULT_EMA_ALPHA } from "../pose/smoothing";
import { scorePosture, type ScoreOptions } from "../posture/postureScorer";
import type { CalibrationBaseline, PostureState } from "../posture/postureTypes";
import {
  PostureStateMachine,
  DEFAULT_POSTURE_MACHINE_CONFIG,
  type PostureMachineConfig,
} from "../posture/postureStateMachine";
import { PresenceDetector, personDetectedFrom } from "./presenceDetector";
import {
  computeInterval,
  DEFAULT_INTERVALS,
  type AdaptiveIntervals,
} from "./adaptiveInference";
import { modeForState, type InferenceMode } from "./monitoringTypes";
import { extractPositionFeatures } from "../position/positionFeatures";
import type { PositionBaseline } from "../position/positionCalibration";
import {
  classifyPosition,
  DEFAULT_CLASSIFY_OPTIONS,
  type ClassifyOptions,
} from "../position/positionClassifier";
import {
  PositionStateMachine,
  DEFAULT_POSITION_MACHINE_CONFIG,
  type PositionMachineConfig,
} from "../position/positionStateMachine";
import {
  DurationTracker,
  DEFAULT_DURATION_CONFIG,
  type DurationConfig,
  type DurationSnapshot,
  type ReminderKind,
} from "../position/durationTracker";
import type { PositionEvent, PositionState } from "../position/positionTypes";

export interface MonitoringInput {
  readonly nowMs: number;
  readonly landmarks: readonly Landmark[];
  readonly baseline: CalibrationBaseline | null;
  /** Position baselines for sitting/standing classification (may be null). */
  readonly sittingPositionBaseline?: PositionBaseline | null;
  readonly standingPositionBaseline?: PositionBaseline | null;
  readonly paused: boolean;
  readonly inferenceMs: number;
}

export interface MonitoringResult {
  readonly state: PostureState;
  readonly mode: InferenceMode;
  readonly rawScore: number;
  readonly smoothedScore: number;
  readonly present: boolean;
  readonly usable: boolean;
  readonly confidence: number;
  /** True on the single frame a poor-posture notification should fire. */
  readonly notify: boolean;
  /** Delay before the next inference; null means stop inference. */
  readonly nextIntervalMs: number | null;
  readonly inferenceMs: number;
  // Position tracking (Phase 3):
  readonly position: PositionState;
  readonly positionConfidence: number;
  readonly durations: DurationSnapshot;
  /** Set on the frame a sitting/standing reminder should fire. */
  readonly positionReminder: ReminderKind | null;
  /** Set when the position changed this frame (for persistence). */
  readonly positionEvent: PositionEvent | null;
}

export interface MonitoringDeps {
  readonly machineConfig?: PostureMachineConfig;
  readonly intervals?: AdaptiveIntervals;
  readonly emaAlpha?: number;
  readonly presenceConsecutive?: number;
  readonly scoreOptions?: ScoreOptions;
  readonly positionMachineConfig?: PositionMachineConfig;
  readonly durationConfig?: DurationConfig;
  readonly classifyOptions?: ClassifyOptions;
}

export class MonitoringController {
  private readonly machine: PostureStateMachine;
  private readonly presence: PresenceDetector;
  private readonly ema: ExponentialMovingAverage;
  private readonly intervals: AdaptiveIntervals;
  private readonly scoreOptions: ScoreOptions;
  private readonly positionMachine: PositionStateMachine;
  private readonly duration: DurationTracker;
  private readonly classifyOptions: ClassifyOptions;

  constructor(deps: MonitoringDeps = {}) {
    this.machine = new PostureStateMachine(
      deps.machineConfig ?? DEFAULT_POSTURE_MACHINE_CONFIG,
    );
    this.presence = new PresenceDetector(deps.presenceConsecutive ?? 3);
    this.ema = new ExponentialMovingAverage(deps.emaAlpha ?? DEFAULT_EMA_ALPHA);
    this.intervals = deps.intervals ?? DEFAULT_INTERVALS;
    this.scoreOptions = deps.scoreOptions ?? {};
    this.positionMachine = new PositionStateMachine(
      deps.positionMachineConfig ?? DEFAULT_POSITION_MACHINE_CONFIG,
    );
    this.duration = new DurationTracker(
      deps.durationConfig ?? DEFAULT_DURATION_CONFIG,
    );
    this.classifyOptions = deps.classifyOptions ?? DEFAULT_CLASSIFY_OPTIONS;
  }

  ingest(input: MonitoringInput): MonitoringResult {
    const { nowMs, landmarks, baseline, paused, inferenceMs } = input;

    const present = this.presence.update(personDetectedFrom(landmarks.length));
    const features = extractFeatures(landmarks);
    const quality = assessDetectionQuality(landmarks, features);

    // We can only classify posture with a baseline, a present user, and quality.
    const canClassify = baseline !== null && present && quality.usable;

    let rawScore = 0;
    let smoothedScore = this.ema.current ?? 0;
    if (canClassify) {
      rawScore = scorePosture(features, baseline, this.scoreOptions).score;
      smoothedScore = this.ema.push(rawScore);
    }

    const step = this.machine.update({
      nowMs,
      smoothedScore,
      usable: canClassify,
      present,
      paused,
    });

    // Position tracking runs in parallel with posture.
    const positionFeatures = extractPositionFeatures(landmarks);
    const classification = classifyPosition(
      positionFeatures,
      input.sittingPositionBaseline ?? null,
      input.standingPositionBaseline ?? null,
      this.classifyOptions,
    );
    const positionStep = this.positionMachine.update({
      nowMs,
      classification,
      present,
      paused,
    });
    const durationUpdate = this.duration.update(
      nowMs,
      positionStep.position,
      paused,
    );

    const mode = modeForState(step.state, paused);
    return {
      state: step.state,
      mode,
      rawScore,
      smoothedScore,
      present,
      usable: quality.usable,
      confidence: quality.score,
      notify: step.notify,
      nextIntervalMs: computeInterval(mode, this.intervals),
      inferenceMs,
      position: positionStep.position,
      positionConfidence: classification.confidence,
      durations: durationUpdate.snapshot,
      positionReminder: durationUpdate.reminder,
      positionEvent: positionStep.event ?? null,
    };
  }

  /** Apply a manual sitting/standing correction. */
  markPosition(position: PositionState, nowMs: number): PositionEvent | null {
    return this.positionMachine.markManual(position, nowMs).event ?? null;
  }

  /** Whether posture notifications are currently gated by cooldown. */
  inCooldown(nowMs: number): boolean {
    return this.machine.inCooldown(nowMs);
  }

  reset(): void {
    this.machine.reset();
    this.presence.reset();
    this.ema.reset();
    this.positionMachine.reset();
    this.duration.reset();
  }
}
