/**
 * Sitting-vs-standing classifier (secondary feature — deliberately conservative).
 *
 * Measures how much the live position features resemble the sitting vs the
 * standing baseline, and only commits when one is clearly closer. When there's no
 * standing baseline, or the two are too similar, or nothing is close enough, it
 * returns "unknown" rather than guessing. Pure and testable.
 */
import {
  type PositionFeatures,
  type PositionFeatureKey,
  POSITION_FEATURE_KEYS,
} from "./positionFeatures";
import type { PositionBaseline } from "./positionCalibration";
import type { PositionClassification } from "./positionTypes";

/** Per-feature scale used to normalize absolute differences into "how many typical spreads apart". */
const FEATURE_SCALE: Record<PositionFeatureKey, number> = {
  shoulderY: 0.2,
  headY: 0.2,
  faceSize: 0.06,
  shoulderWidth: 0.12,
};

export interface ClassifyOptions {
  /** Below this similarity to the best baseline, we can't trust the frame. */
  readonly minSimilarity: number;
  /** Similarity gap that counts as a full, confident distinction. */
  readonly confidentMargin: number;
  /** Distinctness below this stays "unknown". */
  readonly decisionThreshold: number;
  /** Similarity needed to affirm sitting when there's no standing baseline. */
  readonly affirmThreshold: number;
}

export const DEFAULT_CLASSIFY_OPTIONS: ClassifyOptions = {
  minSimilarity: 0.4,
  confidentMargin: 0.12,
  decisionThreshold: 0.5,
  // Without a standing baseline we only affirm sitting when quite similar;
  // otherwise we stay "unknown" rather than guess.
  affirmThreshold: 0.7,
};

/** Similarity in [0,1] of `current` to `baseline`, or null if nothing comparable. */
export function baselineSimilarity(
  current: PositionFeatures,
  baseline: PositionBaseline | null,
): number | null {
  if (!baseline) return null;
  let sum = 0;
  let count = 0;
  for (const key of POSITION_FEATURE_KEYS) {
    const cur = current[key];
    const base = baseline.features[key];
    if (cur === null || base === undefined) continue;
    sum += Math.abs(cur - base) / FEATURE_SCALE[key];
    count += 1;
  }
  if (count === 0) return null;
  return 1 / (1 + sum / count);
}

export function classifyPosition(
  current: PositionFeatures,
  sitting: PositionBaseline | null,
  standing: PositionBaseline | null,
  options: ClassifyOptions = DEFAULT_CLASSIFY_OPTIONS,
): PositionClassification {
  const simSit = baselineSimilarity(current, sitting);
  const simStand = baselineSimilarity(current, standing);

  const base = {
    sittingSimilarity: simSit,
    standingSimilarity: simStand,
  };
  const unknown = (confidence: number): PositionClassification => ({
    position: "unknown",
    confidence,
    ...base,
  });

  if (simSit === null && simStand === null) return unknown(0);

  // Only one baseline available (typically standing calibration was skipped).
  if (simStand === null) {
    if (simSit === null) return unknown(0);
    return simSit >= options.affirmThreshold
      ? { position: "sitting", confidence: simSit, ...base }
      : unknown(simSit);
  }
  if (simSit === null) {
    return simStand >= options.affirmThreshold
      ? { position: "standing", confidence: simStand, ...base }
      : unknown(simStand);
  }

  const hi = Math.max(simSit, simStand);
  if (hi < options.minSimilarity) return unknown(hi);

  const diff = simSit - simStand;
  const distinct = Math.min(1, Math.abs(diff) / options.confidentMargin);
  if (distinct < options.decisionThreshold) return unknown(hi * distinct);

  return {
    position: diff > 0 ? "sitting" : "standing",
    confidence: distinct,
    ...base,
  };
}
