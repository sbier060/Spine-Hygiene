/**
 * Pure posture-feature extraction.
 *
 * Turns a raw landmark list into a small set of NORMALIZED, body-relative
 * features. Normalization (dividing by shoulder width / head size) makes the
 * features invariant to how far the user sits from the camera, so simply moving
 * the whole body toward the screen does not, by itself, look like poor posture.
 *
 * Every feature may be `null` when its required landmarks are missing (e.g. hips
 * are usually not visible on a laptop webcam). Downstream scoring tolerates and
 * reweights around nulls — see posture/postureScorer.ts. This module is pure and
 * has no side effects, so it is fully unit-testable headless.
 */
import {
  type Landmark,
  type PoseLandmarkName,
  getLandmark,
} from "./landmarkTypes";

export interface PostureFeatures {
  /** Vertical drop of the head relative to the shoulder line (2D). Lower = more hunched. */
  readonly headForward: number | null;
  /** Head depth toward the camera relative to the shoulders. Higher = leaning in. */
  readonly screenLean: number | null;
  /** Shoulder height asymmetry (left vs right). Advisory only; not core-weighted. */
  readonly shoulderSlope: number | null;
  /** Apparent shoulder span relative to head size. Lower = shoulders rounded/collapsed. */
  readonly shoulderCollapse: number | null;
  /** Torso lean angle (radians) from shoulders to hips. Only when hips are visible. */
  readonly torsoAngle: number | null;
}

/** Feature keys that participate in the weighted posture score (spec §"weights"). */
export const SCORED_FEATURE_KEYS = [
  "headForward",
  "screenLean",
  "shoulderCollapse",
  "torsoAngle",
] as const;

export type ScoredFeatureKey = (typeof SCORED_FEATURE_KEYS)[number];

interface Point2D {
  readonly x: number;
  readonly y: number;
}

function distance2d(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

/** Smallest normalization anchor we trust; guards against divide-by-near-zero. */
const MIN_ANCHOR = 1e-3;

/**
 * A representative "head size" used to normalize head/shoulder relationships.
 * Prefers inter-ear distance, then inter-eye distance. Returns null if neither
 * pair is available.
 */
function headSize(landmarks: readonly Landmark[]): number | null {
  const leftEar = getLandmark(landmarks, "LEFT_EAR");
  const rightEar = getLandmark(landmarks, "RIGHT_EAR");
  if (leftEar && rightEar) {
    const d = distance2d(leftEar, rightEar);
    if (d > MIN_ANCHOR) return d;
  }
  const leftEye = getLandmark(landmarks, "LEFT_EYE");
  const rightEye = getLandmark(landmarks, "RIGHT_EYE");
  if (leftEye && rightEye) {
    // Inter-eye is ~0.55× inter-ear; scale so the anchor is comparable.
    const d = distance2d(leftEye, rightEye) / 0.55;
    if (d > MIN_ANCHOR) return d;
  }
  return null;
}

/** Vertical head anchor (nose preferred, else ear midpoint). */
function headVerticalAnchor(landmarks: readonly Landmark[]): Landmark | null {
  const nose = getLandmark(landmarks, "NOSE");
  if (nose) return nose;
  const leftEar = getLandmark(landmarks, "LEFT_EAR");
  const rightEar = getLandmark(landmarks, "RIGHT_EAR");
  if (leftEar && rightEar) return midpoint(leftEar, rightEar);
  return leftEar ?? rightEar ?? null;
}

function optionalMidpoint(
  landmarks: readonly Landmark[],
  a: PoseLandmarkName,
  b: PoseLandmarkName,
): Landmark | null {
  const la = getLandmark(landmarks, a);
  const lb = getLandmark(landmarks, b);
  if (!la || !lb) return null;
  return midpoint(la, lb);
}

/**
 * Extract normalized posture features from a landmark list.
 *
 * Shoulders are the primary anchor: without both shoulders we cannot normalize,
 * so all shoulder-relative features are null (detection quality will be low and
 * posture should not be classified).
 */
export function extractFeatures(
  landmarks: readonly Landmark[],
): PostureFeatures {
  const empty: PostureFeatures = {
    headForward: null,
    screenLean: null,
    shoulderSlope: null,
    shoulderCollapse: null,
    torsoAngle: null,
  };

  const leftShoulder = getLandmark(landmarks, "LEFT_SHOULDER");
  const rightShoulder = getLandmark(landmarks, "RIGHT_SHOULDER");
  if (!leftShoulder || !rightShoulder) {
    return empty;
  }

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const shoulderWidth = distance2d(leftShoulder, rightShoulder);
  if (shoulderWidth <= MIN_ANCHOR) {
    return empty;
  }

  const head = headVerticalAnchor(landmarks);
  const hSize = headSize(landmarks);

  // 1. Head-forward: how far the head has dropped toward the shoulder line.
  //    Normally the head sits well above the shoulders; hunching reduces this.
  const headForward =
    head !== null ? (shoulderMid.y - head.y) / shoulderWidth : null;

  // 2. Screen-lean: head depth toward the camera relative to the shoulders.
  //    Uses relative z so that moving the whole body (uniform z shift) cancels.
  const nose = getLandmark(landmarks, "NOSE");
  const screenLean =
    nose !== undefined ? (shoulderMid.z - nose.z) / shoulderWidth : null;

  // 3. Shoulder-slope: vertical asymmetry between the shoulders (advisory).
  const shoulderSlope =
    Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;

  // 4. Shoulder-collapse: apparent shoulder span relative to head size.
  //    Rounding the shoulders inward/forward shrinks this ratio.
  const shoulderCollapse = hSize !== null ? shoulderWidth / hSize : null;

  // 5. Torso-angle: only when both hips are confidently visible.
  const hipMid = optionalMidpoint(landmarks, "LEFT_HIP", "RIGHT_HIP");
  const torsoAngle =
    hipMid !== null
      ? Math.atan2(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y)
      : null;

  return {
    headForward,
    screenLean,
    shoulderSlope,
    shoulderCollapse,
    torsoAngle,
  };
}

/** Count of scored features that are available (non-null) in `features`. */
export function availableScoredFeatureCount(features: PostureFeatures): number {
  return SCORED_FEATURE_KEYS.reduce(
    (n, key) => (features[key] !== null ? n + 1 : n),
    0,
  );
}
