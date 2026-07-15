/**
 * Performance instrumentation. Tracks rolling averages (not every frame) of the
 * signals that matter for the all-day resource budget: inference duration,
 * inferences per minute, frames rejected for low confidence, average posture
 * score, the current scheduler mode, and the camera resolution. Pure and
 * deterministic (time is passed in); surfaced only in developer mode.
 */
import type { InferenceMode } from "./monitoringTypes";

/** Windowed mean over the most recent `size` samples. */
export class RollingMean {
  private readonly buffer: number[] = [];

  constructor(private readonly size = 60) {
    if (size < 1) throw new RangeError(`window size must be >= 1, got ${size}`);
  }

  push(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.size) this.buffer.shift();
    return this.mean;
  }

  get mean(): number {
    if (this.buffer.length === 0) return 0;
    return this.buffer.reduce((s, v) => s + v, 0) / this.buffer.length;
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

export interface PerfSample {
  readonly nowMs: number;
  readonly inferenceMs: number;
  /** Whether the frame was usable (else it counts as a rejected frame). */
  readonly usable: boolean;
  /** Posture score for usable frames (ignored when not usable). */
  readonly score: number;
}

export interface PerfSnapshot {
  readonly avgInferenceMs: number;
  readonly inferencesPerMinute: number;
  readonly totalInferences: number;
  readonly rejectedFrames: number;
  readonly rejectedRatio: number;
  readonly avgPostureScore: number;
  readonly schedulerMode: InferenceMode;
  readonly cameraResolution: string | null;
}

export class PerformanceMonitor {
  private readonly inferenceMean = new RollingMean(60);
  private readonly scoreMean = new RollingMean(60);
  private total = 0;
  private rejected = 0;
  private startMs: number | null = null;
  private mode: InferenceMode = "stable";
  private resolution: string | null = null;

  /** Record one processed inference. */
  record(sample: PerfSample): void {
    if (this.startMs === null) this.startMs = sample.nowMs;
    this.total += 1;
    this.inferenceMean.push(sample.inferenceMs);
    if (sample.usable) this.scoreMean.push(sample.score);
    else this.rejected += 1;
  }

  setMode(mode: InferenceMode): void {
    this.mode = mode;
  }

  setResolution(width: number, height: number): void {
    this.resolution = `${String(width)}×${String(height)}`;
  }

  snapshot(nowMs: number): PerfSnapshot {
    const elapsedMin =
      this.startMs === null ? 0 : (nowMs - this.startMs) / 60_000;
    const inferencesPerMinute = elapsedMin > 0 ? this.total / elapsedMin : 0;
    return {
      avgInferenceMs: this.inferenceMean.mean,
      inferencesPerMinute,
      totalInferences: this.total,
      rejectedFrames: this.rejected,
      rejectedRatio: this.total > 0 ? this.rejected / this.total : 0,
      avgPostureScore: this.scoreMean.mean,
      schedulerMode: this.mode,
      cameraResolution: this.resolution,
    };
  }

  reset(): void {
    this.inferenceMean.reset();
    this.scoreMean.reset();
    this.total = 0;
    this.rejected = 0;
    this.startMs = null;
    this.mode = "stable";
    // Keep the resolution; the camera hasn't changed on reset.
  }
}
