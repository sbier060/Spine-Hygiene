import { describe, it, expect } from "vitest";
import {
  extractFeatures,
  availableScoredFeatureCount,
} from "../src/pose/featureExtractor";
import { makePose, uprightPose, hunchedPose, HIDDEN } from "./fixtures";

describe("extractFeatures", () => {
  it("computes all features for a clean upright pose", () => {
    const f = extractFeatures(uprightPose());
    expect(f.headForward).not.toBeNull();
    expect(f.screenLean).not.toBeNull();
    expect(f.shoulderCollapse).not.toBeNull();
    expect(f.shoulderSlope).not.toBeNull();
    expect(f.torsoAngle).not.toBeNull();
    // Head sits well above the shoulders when upright.
    expect(f.headForward as number).toBeGreaterThan(0.5);
    // A level, forward-facing torso has ~0 slope and ~0 torso angle.
    expect(Math.abs(f.shoulderSlope as number)).toBeLessThan(0.05);
    expect(Math.abs(f.torsoAngle as number)).toBeLessThan(0.05);
  });

  it("registers a large head-forward change when hunching", () => {
    const up = extractFeatures(uprightPose());
    const hunched = extractFeatures(hunchedPose());
    // Head drops toward the shoulders → head-forward shrinks.
    expect(hunched.headForward as number).toBeLessThan(up.headForward as number);
    // Head moves toward the camera → screen-lean grows.
    expect(hunched.screenLean as number).toBeGreaterThan(up.screenLean as number);
  });

  it("tolerates missing hips — torso-angle is null, the rest survive", () => {
    const f = extractFeatures(
      makePose({ LEFT_HIP: HIDDEN, RIGHT_HIP: HIDDEN }),
    );
    expect(f.torsoAngle).toBeNull();
    expect(f.headForward).not.toBeNull();
    expect(f.screenLean).not.toBeNull();
    expect(f.shoulderCollapse).not.toBeNull();
    expect(availableScoredFeatureCount(f)).toBe(3);
  });

  it("returns all-null when a shoulder is missing (no anchor)", () => {
    const f = extractFeatures(makePose({ LEFT_SHOULDER: HIDDEN }));
    expect(f.headForward).toBeNull();
    expect(f.screenLean).toBeNull();
    expect(f.shoulderCollapse).toBeNull();
    expect(f.torsoAngle).toBeNull();
    expect(availableScoredFeatureCount(f)).toBe(0);
  });

  it("falls back to ears for the head anchor when the nose is missing", () => {
    const f = extractFeatures(makePose({ NOSE: HIDDEN }));
    // Head-forward can still be derived from the ears...
    expect(f.headForward).not.toBeNull();
    // ...but screen-lean needs the nose's depth, so it drops out.
    expect(f.screenLean).toBeNull();
  });

  it("returns all-null for an empty landmark list", () => {
    const f = extractFeatures([]);
    expect(availableScoredFeatureCount(f)).toBe(0);
  });
});

describe("occlusion guard (phone in front of the face)", () => {
  it("flags physiologically impossible features as face_blocked, not slouching", async () => {
    const { assessDetectionQuality } = await import("../src/pose/poseQuality");
    // A held phone drags the hallucinated eyes/ears toward its center: the
    // apparent head shrinks to a fraction of normal size while shoulders stay
    // put — shoulderCollapse explodes far past any human ratio.
    const occluded = makePose({
      NOSE: { x: 0.5, y: 0.52, z: -0.05, visibility: 0.8 },
      LEFT_EAR: { x: 0.485, y: 0.5, z: 0, visibility: 0.75 },
      RIGHT_EAR: { x: 0.515, y: 0.5, z: 0, visibility: 0.75 },
      LEFT_EYE: { x: 0.49, y: 0.5, z: -0.04, visibility: 0.8 },
      RIGHT_EYE: { x: 0.51, y: 0.5, z: -0.04, visibility: 0.8 },
    });
    const features = extractFeatures(occluded);
    const quality = assessDetectionQuality(occluded, features);
    expect(quality.usable).toBe(false);
    expect(quality.reason).toBe("face_blocked");
  });

  it("keeps normal and hunched poses classifiable", async () => {
    const { assessDetectionQuality } = await import("../src/pose/poseQuality");
    for (const pose of [uprightPose(), hunchedPose()]) {
      const q = assessDetectionQuality(pose, extractFeatures(pose));
      expect(q.reason).not.toBe("face_blocked");
      expect(q.usable).toBe(true);
    }
  });
});
