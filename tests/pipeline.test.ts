/**
 * End-to-end detection-chain test — the Phase 1 goal, proven deterministically:
 * calibrate an upright baseline, then push the head progressively forward and
 * confirm the personalized score climbs monotonically through good → drifting →
 * poor. Also verifies EMA smoothing absorbs a single-frame spike (no false trip).
 */
import { describe, it, expect } from "vitest";
import { extractFeatures } from "../src/pose/featureExtractor";
import type { PostureFeatures } from "../src/pose/featureExtractor";
import { scorePosture } from "../src/posture/postureScorer";
import { buildBaseline } from "../src/posture/calibrationService";
import { ExponentialMovingAverage } from "../src/pose/smoothing";
import { makePose, uprightPose } from "./fixtures";

const META = {
  positionType: "sitting" as const,
  cameraWidth: 640,
  cameraHeight: 360,
  cameraDeviceId: "test-cam",
  createdAt: 0,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A pose leaning forward by fraction `t` (0 = upright, 1 = fully hunched). */
function leanPose(t: number): PostureFeatures {
  const landmarks = makePose({
    NOSE: { y: lerp(0.3, 0.47, t), z: lerp(-0.1, -0.35, t) },
    LEFT_EYE: { y: lerp(0.28, 0.45, t), z: lerp(-0.09, -0.34, t) },
    RIGHT_EYE: { y: lerp(0.28, 0.45, t), z: lerp(-0.09, -0.34, t) },
    LEFT_EAR: { x: lerp(0.42, 0.44, t), y: lerp(0.31, 0.48, t), z: lerp(0, -0.2, t) },
    RIGHT_EAR: { x: lerp(0.58, 0.56, t), y: lerp(0.31, 0.48, t), z: lerp(0, -0.2, t) },
  });
  return extractFeatures(landmarks);
}

describe("detection chain", () => {
  const baseline = buildBaseline(
    Array.from({ length: 12 }, () => extractFeatures(uprightPose())),
    META,
  );

  it("score rises monotonically as the head leans forward", () => {
    const ts = [0, 0.25, 0.5, 0.75, 1];
    const scores = ts.map((t) => scorePosture(leanPose(t), baseline).score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
    // Endpoints land in the expected bands.
    expect(scorePosture(leanPose(0), baseline).band).toBe("good");
    expect(scorePosture(leanPose(1), baseline).band).toBe("poor_candidate");
  });

  it("EMA reaches poor when a forward lean is sustained", () => {
    const ema = new ExponentialMovingAverage(0.25);
    let smoothed = 0;
    for (let i = 0; i < 40; i++) {
      smoothed = ema.push(scorePosture(leanPose(1), baseline).score);
    }
    expect(smoothed).toBeGreaterThan(0.6);
  });

  it("EMA absorbs a single-frame spike (no false trip)", () => {
    const ema = new ExponentialMovingAverage(0.25);
    let smoothed = 0;
    for (let i = 0; i < 20; i++) {
      // One hunched frame in a stream of upright frames.
      const t = i === 10 ? 1 : 0;
      smoothed = ema.push(scorePosture(leanPose(t), baseline).score);
    }
    expect(smoothed).toBeLessThan(0.35);
  });
});
