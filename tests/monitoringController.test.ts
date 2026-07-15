import { describe, it, expect } from "vitest";
import { MonitoringController } from "../src/monitoring/monitoringController";
import { extractFeatures } from "../src/pose/featureExtractor";
import { buildBaseline } from "../src/posture/calibrationService";
import { uprightPose } from "./fixtures";

const baseline = buildBaseline(
  Array.from({ length: 12 }, () => extractFeatures(uprightPose())),
  {
    positionType: "sitting",
    cameraWidth: 640,
    cameraHeight: 360,
    cameraDeviceId: "cam",
    createdAt: 0,
  },
);

describe("MonitoringController", () => {
  it("schedules the stable cadence for a calibrated upright user", () => {
    const c = new MonitoringController();
    let result = c.ingest({
      nowMs: 0,
      landmarks: uprightPose(),
      baseline,
      paused: false,
      inferenceMs: 5,
    });
    // Warm up presence (needs 3 consecutive detections) + a couple of frames.
    for (let i = 1; i <= 5; i++) {
      result = c.ingest({
        nowMs: i * 1000,
        landmarks: uprightPose(),
        baseline,
        paused: false,
        inferenceMs: 5,
      });
    }
    expect(result.present).toBe(true);
    expect(result.state).toBe("good");
    expect(result.mode).toBe("stable");
    expect(result.nextIntervalMs).toBe(1800);
  });

  it("goes away and polls slowly when no one is detected", () => {
    const c = new MonitoringController();
    let result = c.ingest({
      nowMs: 0,
      landmarks: [],
      baseline,
      paused: false,
      inferenceMs: 0,
    });
    for (let i = 1; i <= 6; i++) {
      result = c.ingest({
        nowMs: i * 5000,
        landmarks: [],
        baseline,
        paused: false,
        inferenceMs: 0,
      });
    }
    expect(result.present).toBe(false);
    expect(result.state).toBe("away");
    expect(result.nextIntervalMs).toBe(5000);
  });

  it("stops inference when paused", () => {
    const c = new MonitoringController();
    const result = c.ingest({
      nowMs: 0,
      landmarks: uprightPose(),
      baseline,
      paused: true,
      inferenceMs: 5,
    });
    expect(result.state).toBe("paused");
    expect(result.nextIntervalMs).toBeNull();
  });
});
