import { describe, it, expect } from "vitest";
import { extractFeatures } from "../src/pose/featureExtractor";
import type { PostureFeatures } from "../src/pose/featureExtractor";
import {
  scorePosture,
  computeDeviationSaturation,
} from "../src/posture/postureScorer";
import {
  buildBaseline,
  type CalibrationMeta,
} from "../src/posture/calibrationService";
import type { CalibrationBaseline } from "../src/posture/postureTypes";
import { uprightPose, hunchedPose, makePose, HIDDEN } from "./fixtures";

const META: CalibrationMeta = {
  positionType: "sitting",
  cameraWidth: 640,
  cameraHeight: 360,
  cameraDeviceId: "test-cam",
  createdAt: 0,
};

function sittingBaseline(): CalibrationBaseline {
  const samples: PostureFeatures[] = Array.from({ length: 12 }, () =>
    extractFeatures(uprightPose()),
  );
  return buildBaseline(samples, META);
}

describe("scorePosture", () => {
  it("scores calibrated upright posture as good (~0)", () => {
    const baseline = sittingBaseline();
    const result = scorePosture(extractFeatures(uprightPose()), baseline);
    expect(result.score).toBeLessThan(0.35);
    expect(result.band).toBe("good");
    expect(result.usedFeatureCount).toBeGreaterThanOrEqual(3);
  });

  it("scores a hunched pose as a poor-posture candidate", () => {
    const baseline = sittingBaseline();
    const good = scorePosture(extractFeatures(uprightPose()), baseline);
    const bad = scorePosture(extractFeatures(hunchedPose()), baseline);
    expect(bad.score).toBeGreaterThan(good.score);
    expect(bad.score).toBeGreaterThan(0.6);
    expect(bad.band).toBe("poor_candidate");
  });

  it("reweights around an unavailable feature (missing hips)", () => {
    const baseline = sittingBaseline();
    const noHips = extractFeatures(
      makePose({ LEFT_HIP: HIDDEN, RIGHT_HIP: HIDDEN }),
    );
    const result = scorePosture(noHips, baseline);
    expect(result.usedFeatureCount).toBe(3);
    expect(result.contributions.torsoAngle).toBeUndefined();
    const total = Object.values(result.contributions).reduce(
      (s, c) => s + (c?.appliedWeight ?? 0),
      0,
    );
    expect(total).toBeCloseTo(1, 5);
    // headForward's renormalized weight: 0.4 / (0.4 + 0.3 + 0.2).
    expect(result.contributions.headForward?.appliedWeight).toBeCloseTo(
      0.4 / 0.9,
      5,
    );
  });

  it("returns score 0 / count 0 when nothing is comparable", () => {
    const baseline = sittingBaseline();
    const empty: PostureFeatures = {
      headForward: null,
      screenLean: null,
      shoulderSlope: null,
      shoulderCollapse: null,
      torsoAngle: null,
    };
    const result = scorePosture(empty, baseline);
    expect(result.score).toBe(0);
    expect(result.usedFeatureCount).toBe(0);
    expect(result.band).toBe("good");
  });

  it("lands in the drifting band for a moderate single-feature deviation", () => {
    // Craft a baseline with one feature and a known spread, then a current value
    // 1.8σ away → featureScore = 1.8 / 4 = 0.45 → drifting.
    const baseline: CalibrationBaseline = {
      positionType: "sitting",
      features: { headForward: { median: 1.0, deviation: 0.1 } },
      confidence: 1,
      sampleCount: 20,
      cameraWidth: 640,
      cameraHeight: 360,
      cameraDeviceId: "test-cam",
      createdAt: 0,
    };
    const current: PostureFeatures = {
      headForward: 0.82,
      screenLean: null,
      shoulderSlope: null,
      shoulderCollapse: null,
      torsoAngle: null,
    };
    const result = scorePosture(current, baseline);
    expect(result.score).toBeGreaterThanOrEqual(0.35);
    expect(result.score).toBeLessThan(0.6);
    expect(result.band).toBe("drifting");
  });
});

describe("computeDeviationSaturation (two-point training)", () => {
  it("tunes saturation so the slouched pose scores near the target", () => {
    const baseline = sittingBaseline();
    const slouched = extractFeatures(hunchedPose());
    const saturation = computeDeviationSaturation(slouched, baseline, {
      targetScore: 0.9,
    });
    expect(saturation).not.toBeNull();
    // With this saturation, the slouched pose scores ~0.9 and upright ~0.
    const bad = scorePosture(slouched, baseline, {
      deviationSaturation: saturation!,
    });
    const good = scorePosture(extractFeatures(uprightPose()), baseline, {
      deviationSaturation: saturation!,
    });
    expect(bad.score).toBeGreaterThan(0.7);
    expect(good.score).toBeLessThan(0.1);
  });

  it("clamps to the allowed range and returns null when nothing compares", () => {
    const baseline = sittingBaseline();
    const empty = {
      headForward: null,
      screenLean: null,
      shoulderSlope: null,
      shoulderCollapse: null,
      torsoAngle: null,
    } as const;
    expect(computeDeviationSaturation(empty, baseline)).toBeNull();
  });
});

describe("buildBaseline", () => {
  it("captures medians for available features and omits under-sampled ones", () => {
    const samples: PostureFeatures[] = Array.from({ length: 12 }, () =>
      extractFeatures(uprightPose()),
    );
    const baseline = buildBaseline(samples, META);
    expect(baseline.features.headForward?.median).toBeGreaterThan(0.5);
    expect(baseline.confidence).toBeGreaterThan(0);
    expect(baseline.sampleCount).toBe(12);
  });

  it("omits a feature that lacks enough samples", () => {
    // Only 3 samples have hips; torso-angle should be dropped (needs 10).
    const withHips = Array.from({ length: 3 }, () =>
      extractFeatures(uprightPose()),
    );
    const withoutHips = Array.from({ length: 12 }, () =>
      extractFeatures(makePose({ LEFT_HIP: HIDDEN, RIGHT_HIP: HIDDEN })),
    );
    const baseline = buildBaseline([...withHips, ...withoutHips], META);
    expect(baseline.features.headForward).toBeDefined();
    expect(baseline.features.torsoAngle).toBeUndefined();
  });
});

describe("absorbGoodSample (I'm-not-slouching feedback)", () => {
  it("a flagged pose scores lower after being absorbed as good", async () => {
    const { absorbGoodSample, buildBaseline } = await import(
      "../src/posture/calibrationService"
    );
    const { extractFeatures } = await import("../src/pose/featureExtractor");
    const { uprightPose, hunchedPose } = await import("./fixtures");
    const baseline = buildBaseline(
      Array.from({ length: 12 }, () => extractFeatures(uprightPose())),
      {
        positionType: "sitting",
        cameraWidth: 640,
        cameraHeight: 360,
        cameraDeviceId: null,
        createdAt: 0,
      },
    );
    const pose = extractFeatures(hunchedPose());
    const before = scorePosture(pose, baseline).score;
    let widened = baseline;
    // Two corrections, as a user would give when repeatedly flagged wrongly.
    widened = absorbGoodSample(widened, pose);
    widened = absorbGoodSample(widened, pose);
    const after = scorePosture(pose, widened).score;
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(0.6); // no longer enters the poor band
  });
});
