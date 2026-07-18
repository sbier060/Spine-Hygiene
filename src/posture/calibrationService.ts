/**
 * Sitting-posture calibration.
 *
 * Collects ~10 s of VALID frames (low-confidence frames are rejected), then
 * builds a personalized baseline per feature using the MEDIAN (robust to
 * outliers) plus a spread estimate. The baseline is what postureScorer compares
 * live frames against. In Phase 1 the baseline lives in memory; Phase 4 persists
 * it to SQLite.
 */
import {
  type PostureFeatures,
  type ScoredFeatureKey,
  SCORED_FEATURE_KEYS,
} from "../pose/featureExtractor";
import type { DetectionQuality } from "../pose/poseQuality";
import { median, standardDeviation } from "../pose/smoothing";
import type {
  CalibrationBaseline,
  FeatureBaseline,
} from "./postureTypes";

/** Minimum valid frames before a baseline is trustworthy (~5s at 3fps). */
export const MIN_CALIBRATION_SAMPLES = 15;
/** A feature needs at least this many samples to enter the baseline. */
export const MIN_FEATURE_SAMPLES = 10;

export interface CalibrationMeta {
  readonly positionType: "sitting" | "standing";
  readonly cameraWidth: number;
  readonly cameraHeight: number;
  readonly cameraDeviceId: string | null;
  readonly createdAt: number;
}

/**
 * Build a baseline from already-validated feature samples. Pure: same inputs →
 * same baseline. Features without enough samples are simply omitted (the scorer
 * reweights around them).
 */
export function buildBaseline(
  samples: readonly PostureFeatures[],
  meta: CalibrationMeta,
): CalibrationBaseline {
  const features: Partial<Record<ScoredFeatureKey, FeatureBaseline>> = {};

  for (const key of SCORED_FEATURE_KEYS) {
    const values: number[] = [];
    for (const sample of samples) {
      const v = sample[key];
      if (v !== null) values.push(v);
    }
    if (values.length < MIN_FEATURE_SAMPLES) continue;
    const m = median(values);
    if (m === null) continue;
    features[key] = { median: m, deviation: standardDeviation(values) };
  }

  const availableCount = Object.keys(features).length;
  const coverage = availableCount / SCORED_FEATURE_KEYS.length;
  const sampleAdequacy = Math.min(1, samples.length / (MIN_CALIBRATION_SAMPLES * 2));
  // Confidence blends how many features we captured with how many frames we saw.
  const confidence =
    availableCount === 0 ? 0 : coverage * 0.6 + sampleAdequacy * 0.4;

  return {
    positionType: meta.positionType,
    features,
    confidence,
    sampleCount: samples.length,
    cameraWidth: meta.cameraWidth,
    cameraHeight: meta.cameraHeight,
    cameraDeviceId: meta.cameraDeviceId,
    createdAt: meta.createdAt,
  };
}

/**
 * Feedback learning: the user said "I'm not slouching" while this pose was
 * flagged. Pull the baseline median toward the pose and widen the tolerated
 * deviation so the same pose stops triggering — a couple of corrections make
 * a recurring false positive read as good.
 */
export function absorbGoodSample(
  baseline: CalibrationBaseline,
  sample: PostureFeatures,
): CalibrationBaseline {
  const features: Partial<Record<ScoredFeatureKey, FeatureBaseline>> = {
    ...baseline.features,
  };
  for (const key of SCORED_FEATURE_KEYS) {
    const value = sample[key];
    const fb = baseline.features[key];
    if (value === null || !fb) continue;
    // Move the target a solid step toward the corrected pose, and widen the
    // tolerated spread so THIS pose lands comfortably inside the good band
    // (normalized deviation ≈ 0.7). Decisive enough that one or two "I'm not
    // slouching" corrections stop the same motion from re-triggering.
    const median = fb.median + 0.4 * (value - fb.median);
    const gap = Math.abs(value - median);
    const deviation = Math.max(fb.deviation, gap / 0.7);
    features[key] = { median, deviation };
  }
  return { ...baseline, features };
}

/**
 * Stateful collector used by the calibration screen. Accepts frames one at a
 * time, keeping only the ones whose detection quality is usable.
 */
export class CalibrationCollector {
  private readonly samples: PostureFeatures[] = [];
  private qualitySum = 0;

  /** Add a frame; returns true if it was accepted (usable quality). */
  add(features: PostureFeatures, quality: DetectionQuality): boolean {
    if (!quality.usable) return false;
    this.samples.push(features);
    this.qualitySum += quality.score;
    return true;
  }

  get validSampleCount(): number {
    return this.samples.length;
  }

  get averageQuality(): number {
    return this.samples.length === 0
      ? 0
      : this.qualitySum / this.samples.length;
  }

  /** True once enough valid frames have been collected to build a baseline. */
  get hasEnough(): boolean {
    return this.samples.length >= MIN_CALIBRATION_SAMPLES;
  }

  build(meta: CalibrationMeta): CalibrationBaseline {
    return buildBaseline(this.samples, meta);
  }

  reset(): void {
    this.samples.length = 0;
    this.qualitySum = 0;
  }
}
