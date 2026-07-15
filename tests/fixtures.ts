/**
 * Test fixtures: builders for synthetic pose landmark arrays. `makePose` starts
 * from a plausible upright pose and applies per-landmark overrides so tests can
 * express "the same pose but hunched" or "the same pose with hips hidden".
 */
import {
  type Landmark,
  type PoseLandmarkName,
  POSE_LANDMARK,
} from "../src/pose/landmarkTypes";

type PartsOverride = Partial<Record<PoseLandmarkName, Partial<Landmark>>>;

/** A relaxed, upright, camera-facing pose. */
const UPRIGHT: Record<PoseLandmarkName, Landmark> = {
  NOSE: { x: 0.5, y: 0.3, z: -0.1, visibility: 0.99 },
  LEFT_EYE_INNER: { x: 0.48, y: 0.28, z: -0.09, visibility: 0.98 },
  LEFT_EYE: { x: 0.46, y: 0.28, z: -0.09, visibility: 0.98 },
  LEFT_EYE_OUTER: { x: 0.44, y: 0.28, z: -0.09, visibility: 0.98 },
  RIGHT_EYE_INNER: { x: 0.52, y: 0.28, z: -0.09, visibility: 0.98 },
  RIGHT_EYE: { x: 0.54, y: 0.28, z: -0.09, visibility: 0.98 },
  RIGHT_EYE_OUTER: { x: 0.56, y: 0.28, z: -0.09, visibility: 0.98 },
  LEFT_EAR: { x: 0.42, y: 0.31, z: 0, visibility: 0.95 },
  RIGHT_EAR: { x: 0.58, y: 0.31, z: 0, visibility: 0.95 },
  LEFT_SHOULDER: { x: 0.35, y: 0.6, z: 0, visibility: 0.97 },
  RIGHT_SHOULDER: { x: 0.65, y: 0.6, z: 0, visibility: 0.97 },
  LEFT_HIP: { x: 0.38, y: 0.95, z: 0.05, visibility: 0.9 },
  RIGHT_HIP: { x: 0.62, y: 0.95, z: 0.05, visibility: 0.9 },
};

/** Build a 33-length landmark array from the upright base plus overrides. */
export function makePose(overrides: PartsOverride = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 1,
  }));
  for (const [name, index] of Object.entries(POSE_LANDMARK)) {
    landmarks[index] = { ...UPRIGHT[name as PoseLandmarkName] };
  }
  for (const [name, override] of Object.entries(overrides)) {
    const index = POSE_LANDMARK[name as PoseLandmarkName];
    landmarks[index] = { ...landmarks[index]!, ...override };
  }
  return landmarks;
}

/** Upright pose. */
export function uprightPose(): Landmark[] {
  return makePose();
}

/** Head craned forward + down and closer to the camera (hunching). */
export function hunchedPose(): Landmark[] {
  return makePose({
    NOSE: { x: 0.5, y: 0.47, z: -0.35, visibility: 0.99 },
    LEFT_EYE: { x: 0.46, y: 0.45, z: -0.34, visibility: 0.98 },
    RIGHT_EYE: { x: 0.54, y: 0.45, z: -0.34, visibility: 0.98 },
    LEFT_EAR: { x: 0.44, y: 0.48, z: -0.2, visibility: 0.9 },
    RIGHT_EAR: { x: 0.56, y: 0.48, z: -0.2, visibility: 0.9 },
  });
}

/** Mark a landmark as effectively missing by dropping its visibility. */
export const HIDDEN: Partial<Landmark> = { visibility: 0.1 };
