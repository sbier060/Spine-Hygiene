/**
 * Pose landmark types and the subset of MediaPipe landmarks Spine-IQ relies on.
 *
 * MediaPipe Pose Landmarker returns 33 body landmarks. For posture we only need
 * head + shoulders (+ hips when visible). Hips are frequently missing on laptop
 * webcams, so all downstream logic must tolerate their absence.
 */

/** A single normalized landmark. x/y are in [0,1] image space; z is relative depth. */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** MediaPipe's per-landmark visibility/presence in [0,1]; may be undefined. */
  readonly visibility?: number;
}

/**
 * Indices into MediaPipe's 33-landmark pose model.
 * https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */
export const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

export type PoseLandmarkName = keyof typeof POSE_LANDMARK;

/** A single inference result: the landmark array plus timing/quality metadata. */
export interface PoseFrame {
  /** Full 33-length landmark list, or empty if no person was detected. */
  readonly landmarks: readonly Landmark[];
  /** Monotonic timestamp (ms) the frame was captured. */
  readonly timestampMs: number;
  /** Wall-clock inference duration (ms) for instrumentation. */
  readonly inferenceMs: number;
}

/** Minimum visibility for a landmark to be treated as usable. */
export const MIN_LANDMARK_VISIBILITY = 0.5;

/** Returns the landmark at `name`, or undefined if it is absent/too low-visibility. */
export function getLandmark(
  landmarks: readonly Landmark[],
  name: PoseLandmarkName,
): Landmark | undefined {
  const lm = landmarks[POSE_LANDMARK[name]];
  if (lm === undefined) return undefined;
  if (lm.visibility !== undefined && lm.visibility < MIN_LANDMARK_VISIBILITY) {
    return undefined;
  }
  return lm;
}
