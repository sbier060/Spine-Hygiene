/**
 * Guided good-posture capture. A single held pose makes the baseline so narrow
 * that natural variation — leaning a little left/right, glancing down — reads
 * as slouching. Sampling several comfortable variations widens each feature's
 * measured spread, so the scorer tolerates the user's real "good" range while
 * a genuine slouch still stands out. Pure data + helpers, unit-tested.
 */

export interface GuidedPose {
  /** What the user should do while frames for this pose are captured. */
  readonly instruction: string;
  /** Valid frames to capture in this pose. */
  readonly samples: number;
}

export const GOOD_POSE_SEQUENCE: readonly GuidedPose[] = [
  { instruction: "Sit tall, facing your screen", samples: 10 },
  { instruction: "Stay tall — lean a little to the left", samples: 8 },
  { instruction: "Stay tall — lean a little to the right", samples: 8 },
  { instruction: "Stay tall — look down at your keyboard", samples: 8 },
];

export const GOOD_POSE_TOTAL_SAMPLES = GOOD_POSE_SEQUENCE.reduce(
  (sum, pose) => sum + pose.samples,
  0,
);

/** Pause after each pose switch so the user can move before frames count. */
export const POSE_SETTLE_MS = 1500;

/** Index of the pose the user should hold given how many valid samples exist. */
export function poseIndexForCount(validCount: number): number {
  let cumulative = 0;
  for (let i = 0; i < GOOD_POSE_SEQUENCE.length; i++) {
    cumulative += GOOD_POSE_SEQUENCE[i]?.samples ?? 0;
    if (validCount < cumulative) return i;
  }
  return GOOD_POSE_SEQUENCE.length - 1;
}

/** The pose entry for a sample count (clamped to the last pose). */
export function poseForCount(validCount: number): GuidedPose {
  // Non-null: the sequence is a non-empty constant and the index is clamped.
  return GOOD_POSE_SEQUENCE[poseIndexForCount(validCount)] as GuidedPose;
}
