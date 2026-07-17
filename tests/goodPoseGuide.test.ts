import { describe, it, expect } from "vitest";
import {
  GOOD_POSE_SEQUENCE,
  GOOD_POSE_TOTAL_SAMPLES,
  poseIndexForCount,
  poseForCount,
} from "../src/posture/goodPoseGuide";

describe("goodPoseGuide", () => {
  it("total samples is the sum of the per-pose targets", () => {
    const sum = GOOD_POSE_SEQUENCE.reduce((s, p) => s + p.samples, 0);
    expect(GOOD_POSE_TOTAL_SAMPLES).toBe(sum);
    expect(sum).toBeGreaterThan(0);
  });

  it("maps sample counts to pose indices at the boundaries", () => {
    // First pose runs from 0 up to (but excluding) its own sample target.
    const first = GOOD_POSE_SEQUENCE[0]!;
    expect(poseIndexForCount(0)).toBe(0);
    expect(poseIndexForCount(first.samples - 1)).toBe(0);
    expect(poseIndexForCount(first.samples)).toBe(1);
    // The final count (and beyond) clamps to the last pose.
    expect(poseIndexForCount(GOOD_POSE_TOTAL_SAMPLES - 1)).toBe(
      GOOD_POSE_SEQUENCE.length - 1,
    );
    expect(poseIndexForCount(GOOD_POSE_TOTAL_SAMPLES + 100)).toBe(
      GOOD_POSE_SEQUENCE.length - 1,
    );
  });

  it("is monotonic: more samples never moves to an earlier pose", () => {
    let prev = 0;
    for (let c = 0; c <= GOOD_POSE_TOTAL_SAMPLES; c++) {
      const idx = poseIndexForCount(c);
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it("poseForCount always returns a pose with an instruction", () => {
    for (const c of [0, 5, 15, 25, GOOD_POSE_TOTAL_SAMPLES, 999]) {
      expect(poseForCount(c).instruction.length).toBeGreaterThan(0);
    }
  });
});
