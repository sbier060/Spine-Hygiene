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
