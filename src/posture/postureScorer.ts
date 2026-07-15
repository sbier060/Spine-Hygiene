/**
 * Personalized posture scorer — the core of the detection sandbox.
 *
 * Rather than universal thresholds, each feature is compared to the USER'S OWN
 * calibrated baseline:
 *
 *   normalizedDeviation = |current − baselineMedian| / max(baselineDeviation, minDev)
 *
 * Deviations are squashed to [0,1], combined with configurable weights, and the
 * weights are REBALANCED across whatever features are actually available this
 * frame (e.g. torso-angle is dropped when hips aren't visible). Pure and
 * deterministic — fully unit-tested.
 */
import {
  type PostureFeatures,
  type ScoredFeatureKey,
  SCORED_FEATURE_KEYS,
} from "../pose/featureExtractor";
import type {
  CalibrationBaseline,
  FeatureContribution,
  PostureBand,
  PostureScoreResult,
} from "./postureTypes";
import {
  BAND_THRESHOLDS,
  DEFAULT_FEATURE_WEIGHTS,
  DEVIATION_SATURATION,
  MIN_ALLOWED_DEVIATION,
} from "./postureThresholds";

export interface ScoreOptions {
  /** Per-feature weights; defaults to DEFAULT_FEATURE_WEIGHTS. */
  readonly weights?: Record<ScoredFeatureKey, number>;
  /** Deviations at/above this many sigmas contribute full weight. */
  readonly deviationSaturation?: number;
  /** Floor on baseline deviation to avoid explosive ratios. */
  readonly minDeviation?: number;
}

function bandForScore(score: number): PostureBand {
  if (score >= BAND_THRESHOLDS.poor) return "poor_candidate";
  if (score >= BAND_THRESHOLDS.drift) return "drifting";
  return "good";
}

/**
 * Score `features` against a calibrated `baseline`.
 *
 * A feature contributes only when it is present in BOTH the current frame and
 * the baseline. If nothing is comparable, the result has score 0 and
 * `usedFeatureCount` 0 — callers should treat that as "not classifiable" and
 * lean on detection quality instead.
 */
export function scorePosture(
  features: PostureFeatures,
  baseline: CalibrationBaseline,
  options: ScoreOptions = {},
): PostureScoreResult {
  const weights = options.weights ?? DEFAULT_FEATURE_WEIGHTS;
  const saturation = options.deviationSaturation ?? DEVIATION_SATURATION;
  const minDev = options.minDeviation ?? MIN_ALLOWED_DEVIATION;

  const contributions: Partial<Record<ScoredFeatureKey, FeatureContribution>> =
    {};

  // Pass 1: compute each comparable feature's squashed deviation + base weight.
  const raw: {
    key: ScoredFeatureKey;
    featureScore: number;
    normalizedDeviation: number;
    weight: number;
  }[] = [];

  let weightSum = 0;
  for (const key of SCORED_FEATURE_KEYS) {
    const current = features[key];
    const featureBaseline = baseline.features[key];
    if (current === null || featureBaseline === undefined) continue;

    const denom = Math.max(featureBaseline.deviation, minDev);
    const normalizedDeviation = Math.abs(current - featureBaseline.median) / denom;
    const featureScore = Math.min(1, normalizedDeviation / saturation);
    const weight = weights[key];

    raw.push({ key, featureScore, normalizedDeviation, weight });
    weightSum += weight;
  }

  if (raw.length === 0 || weightSum === 0) {
    return {
      score: 0,
      band: "good",
      contributions,
      usedFeatureCount: 0,
    };
  }

  // Pass 2: renormalize weights across available features so they sum to 1.
  let score = 0;
  for (const item of raw) {
    const appliedWeight = item.weight / weightSum;
    score += appliedWeight * item.featureScore;
    contributions[item.key] = {
      normalizedDeviation: item.normalizedDeviation,
      appliedWeight,
    };
  }

  const clamped = Math.min(1, Math.max(0, score));
  return {
    score: clamped,
    band: bandForScore(clamped),
    contributions,
    usedFeatureCount: raw.length,
  };
}
