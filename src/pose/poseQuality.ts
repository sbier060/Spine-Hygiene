/**
 * Detection-quality scoring — decides whether a frame is trustworthy enough to
 * classify posture at all. Combines required-landmark visibility, how many
 * scored features are usable, whether the face is roughly facing the camera, and
 * (optionally) how much the pose is moving. Pure and side-effect free.
 *
 * If quality is low we deliberately do NOT classify posture; the UI shows a
 * "low confidence" state instead of guessing.
 */
import {
  type Landmark,
  type PoseLandmarkName,
  getLandmark,
} from "./landmarkTypes";
import {
  type PostureFeatures,
  availableScoredFeatureCount,
  SCORED_FEATURE_KEYS,
} from "./featureExtractor";

export interface DetectionQuality {
  /** Combined confidence in [0,1]. */
  readonly score: number;
  /** True when `score` clears the classification threshold. */
  readonly usable: boolean;
  /** Human-readable reason when not usable (for dev overlay). */
  readonly reason: string | null;
}

/** A person must show these to be classifiable at all. */
const REQUIRED_LANDMARKS: readonly PoseLandmarkName[] = [
  "LEFT_SHOULDER",
  "RIGHT_SHOULDER",
];

/** Below this combined score we treat the frame as low-confidence. */
export const MIN_USABLE_QUALITY = 0.5;

function meanVisibility(
  landmarks: readonly Landmark[],
  names: readonly PoseLandmarkName[],
): { mean: number; missing: number } {
  let sum = 0;
  let counted = 0;
  let missing = 0;
  for (const name of names) {
    const lm = getLandmark(landmarks, name);
    if (!lm) {
      missing += 1;
      continue;
    }
    sum += lm.visibility ?? 1;
    counted += 1;
  }
  return { mean: counted === 0 ? 0 : sum / counted, missing };
}

/**
 * Estimate how squarely the user faces the camera in [0,1].
 * When the head turns, the nose shifts off the shoulder midline and one ear
 * drops out. A face turned far to one side makes head-forward/lean unreliable.
 */
function faceForwardness(landmarks: readonly Landmark[]): number {
  const leftShoulder = getLandmark(landmarks, "LEFT_SHOULDER");
  const rightShoulder = getLandmark(landmarks, "RIGHT_SHOULDER");
  const nose = getLandmark(landmarks, "NOSE");
  if (!leftShoulder || !rightShoulder || !nose) return 0.5;

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  );
  if (shoulderWidth <= 1e-3) return 0.5;

  // Nose offset from the shoulder midline, normalized. 0 = centered.
  const offset = Math.abs(nose.x - shoulderMidX) / shoulderWidth;
  const centered = Math.max(0, 1 - offset * 2);

  // Both ears visible ⇒ facing forward; one missing ⇒ turned.
  const leftEar = getLandmark(landmarks, "LEFT_EAR");
  const rightEar = getLandmark(landmarks, "RIGHT_EAR");
  const earSymmetry = leftEar && rightEar ? 1 : leftEar || rightEar ? 0.6 : 0.4;

  return centered * 0.5 + earSymmetry * 0.5;
}

/**
 * Compute detection quality for a frame.
 *
 * @param movement Optional recent movement magnitude (normalized). High movement
 *   (reaching, turning) lowers confidence so transient motion does not trigger
 *   posture changes.
 */
export function assessDetectionQuality(
  landmarks: readonly Landmark[],
  features: PostureFeatures,
  movement?: number,
): DetectionQuality {
  if (landmarks.length === 0) {
    return { score: 0, usable: false, reason: "no_person" };
  }

  const { mean: reqVisibility, missing } = meanVisibility(
    landmarks,
    REQUIRED_LANDMARKS,
  );
  if (missing > 0) {
    return {
      score: reqVisibility * 0.3,
      usable: false,
      reason: "missing_shoulder",
    };
  }

  const featureRatio =
    availableScoredFeatureCount(features) / SCORED_FEATURE_KEYS.length;
  const forwardness = faceForwardness(landmarks);
  const movementPenalty =
    movement === undefined ? 1 : Math.max(0, 1 - Math.min(movement, 1));

  // Weighted blend of the signals.
  const score =
    reqVisibility * 0.4 +
    featureRatio * 0.25 +
    forwardness * 0.25 +
    movementPenalty * 0.1;

  const usable = score >= MIN_USABLE_QUALITY;
  let reason: string | null = null;
  if (!usable) {
    if (forwardness < 0.5) reason = "face_turned";
    else if (featureRatio < 0.5) reason = "too_few_features";
    else if (movementPenalty < 0.5) reason = "too_much_movement";
    else reason = "low_confidence";
  }

  return { score: Math.min(1, score), usable, reason };
}
