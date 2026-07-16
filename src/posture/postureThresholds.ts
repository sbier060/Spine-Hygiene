/**
 * Tunable posture-scoring constants. These are intentionally in one place and
 * easy to change — Phase 5 tuning and the Settings "sensitivity" control both
 * adjust values here rather than editing scoring logic.
 */
import type { ScoredFeatureKey } from "../pose/featureExtractor";

/** Default per-feature weights (spec §"weights"). Must sum to 1.0. */
export const DEFAULT_FEATURE_WEIGHTS: Record<ScoredFeatureKey, number> = {
  headForward: 0.4,
  screenLean: 0.3,
  shoulderCollapse: 0.2,
  torsoAngle: 0.1,
};

/**
 * Score band boundaries (spec):
 *   0.00–0.35 good · 0.35–0.60 drifting · >0.60 poor-posture candidate.
 */
export const BAND_THRESHOLDS = {
  drift: 0.35,
  poor: 0.6,
} as const;

/**
 * Hysteresis thresholds for the (Phase 2) state machine: enter poor above
 * `enterPoor`, only return to good below `exitPoor`. Kept here so scoring and
 * the state machine share one source of truth.
 */
export const HYSTERESIS = {
  enterPoor: 0.6,
  exitPoor: 0.4,
} as const;

/**
 * Floor on a feature's baseline deviation — the "natural wobble" tolerance around
 * a calibrated pose. Calibration is captured while holding still, so the measured
 * deviation is near zero; without a generous floor, ordinary comfortable movement
 * (a few hundredths of a normalized unit) reads as drift. This is the main knob
 * that keeps "good" from feeling twitchy.
 */
export const MIN_ALLOWED_DEVIATION = 0.08;

/**
 * Deviation (in baseline-sigmas) that maps to the top of the score range for a
 * single feature. A feature this far from baseline contributes its full weight.
 */
export const DEVIATION_SATURATION = 4;

/** Sensitivity presets scale the saturation point (higher sensitivity = trips sooner). */
export const SENSITIVITY_PRESETS = {
  low: { deviationSaturation: 6 },
  balanced: { deviationSaturation: 4 },
  high: { deviationSaturation: 2.5 },
} as const;

export type SensitivityLevel = keyof typeof SENSITIVITY_PRESETS;
