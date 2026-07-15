/**
 * Position-baseline calibration. Captures the median of each absolute position
 * feature for a sitting or standing posture, so the classifier can later measure
 * which baseline the live frame resembles. Pure builder + a stateful collector,
 * mirroring the posture calibration but for position features.
 */
import { median } from "../pose/smoothing";
import {
  type PositionFeatures,
  type PositionFeatureKey,
  POSITION_FEATURE_KEYS,
} from "./positionFeatures";
import type { DetectionQuality } from "../pose/poseQuality";

export const MIN_POSITION_SAMPLES = 8;

export interface PositionBaseline {
  readonly positionType: "sitting" | "standing";
  readonly features: Partial<Record<PositionFeatureKey, number>>;
  readonly sampleCount: number;
  readonly confidence: number;
}

export function buildPositionBaseline(
  samples: readonly PositionFeatures[],
  positionType: "sitting" | "standing",
): PositionBaseline {
  const features: Partial<Record<PositionFeatureKey, number>> = {};
  for (const key of POSITION_FEATURE_KEYS) {
    const values: number[] = [];
    for (const s of samples) {
      const v = s[key];
      if (v !== null) values.push(v);
    }
    const m = median(values);
    if (m !== null && values.length >= MIN_POSITION_SAMPLES) features[key] = m;
  }
  const coverage =
    Object.keys(features).length / POSITION_FEATURE_KEYS.length;
  return {
    positionType,
    features,
    sampleCount: samples.length,
    confidence: coverage,
  };
}

export class PositionCalibrationCollector {
  private readonly samples: PositionFeatures[] = [];

  add(features: PositionFeatures, quality: DetectionQuality): boolean {
    if (!quality.usable) return false;
    this.samples.push(features);
    return true;
  }

  get validSampleCount(): number {
    return this.samples.length;
  }

  build(positionType: "sitting" | "standing"): PositionBaseline {
    return buildPositionBaseline(this.samples, positionType);
  }

  reset(): void {
    this.samples.length = 0;
  }
}
