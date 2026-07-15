/**
 * Position features — ABSOLUTE (non-normalized) frame measurements used to tell
 * sitting from standing. Unlike posture features (which are deliberately
 * distance-invariant), these capture where the body sits in the frame and how
 * big it appears, which is exactly what changes when a person stands up at a
 * fixed webcam. Pure and side-effect free.
 */
import { type Landmark, getLandmark } from "../pose/landmarkTypes";

export interface PositionFeatures {
  /** Shoulder-midpoint height in the frame (0 = top, 1 = bottom). */
  readonly shoulderY: number | null;
  /** Head height in the frame. */
  readonly headY: number | null;
  /** Apparent face size (inter-ear / inter-eye distance), absolute. */
  readonly faceSize: number | null;
  /** Apparent shoulder width, absolute. */
  readonly shoulderWidth: number | null;
}

export type PositionFeatureKey = keyof PositionFeatures;

export const POSITION_FEATURE_KEYS: readonly PositionFeatureKey[] = [
  "shoulderY",
  "headY",
  "faceSize",
  "shoulderWidth",
];

const MIN_SIZE = 1e-3;

export function extractPositionFeatures(
  landmarks: readonly Landmark[],
): PositionFeatures {
  const empty: PositionFeatures = {
    shoulderY: null,
    headY: null,
    faceSize: null,
    shoulderWidth: null,
  };

  const leftShoulder = getLandmark(landmarks, "LEFT_SHOULDER");
  const rightShoulder = getLandmark(landmarks, "RIGHT_SHOULDER");
  if (!leftShoulder || !rightShoulder) return empty;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  );

  const nose = getLandmark(landmarks, "NOSE");
  const leftEar = getLandmark(landmarks, "LEFT_EAR");
  const rightEar = getLandmark(landmarks, "RIGHT_EAR");
  const headY = nose
    ? nose.y
    : leftEar && rightEar
      ? (leftEar.y + rightEar.y) / 2
      : null;

  let faceSize: number | null = null;
  if (leftEar && rightEar) {
    faceSize = Math.hypot(leftEar.x - rightEar.x, leftEar.y - rightEar.y);
  } else {
    const leftEye = getLandmark(landmarks, "LEFT_EYE");
    const rightEye = getLandmark(landmarks, "RIGHT_EYE");
    if (leftEye && rightEye) {
      faceSize =
        Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y) / 0.55;
    }
  }

  return {
    shoulderY,
    headY,
    faceSize: faceSize !== null && faceSize > MIN_SIZE ? faceSize : null,
    shoulderWidth: shoulderWidth > MIN_SIZE ? shoulderWidth : null,
  };
}
