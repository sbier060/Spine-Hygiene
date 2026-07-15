import { describe, it, expect } from "vitest";
import { MonitoringController } from "../src/monitoring/monitoringController";
import { extractFeatures } from "../src/pose/featureExtractor";
import { buildBaseline } from "../src/posture/calibrationService";
import { uprightPose, hunchedPose } from "./fixtures";
import type { PostureMachineConfig } from "../src/posture/postureStateMachine";

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

  it("runs a full episode: warm-up → sustained hunch notifies once → recovery", () => {
    // Fast config so the episode completes in a handful of synthetic frames.
    const fast: PostureMachineConfig = {
      driftThreshold: 0.35,
      enterPoor: 0.6,
      exitPoor: 0.4,
      driftSustainMs: 500,
      poorPersistenceMs: 1000,
      cooldownMs: 10_000,
      resetSustainMs: 1000,
      awayGraceMs: 2000,
    };
    const c = new MonitoringController({ machineConfig: fast, emaAlpha: 0.6 });

    let notifies = 0;
    let t = 0;
    const feed = (landmarks: ReturnType<typeof uprightPose>, n: number): void => {
      for (let i = 0; i < n; i++) {
        const r = c.ingest({
          nowMs: t,
          landmarks,
          baseline,
          paused: false,
          inferenceMs: 5,
        });
        if (r.notify) notifies++;
        t += 200;
      }
    };

    feed(uprightPose(), 4); // warm up presence + establish good
    expect(c.ingest({ nowMs: t, landmarks: uprightPose(), baseline, paused: false, inferenceMs: 5 }).state).toBe("good");

    feed(hunchedPose(), 20); // sustained hunch → exactly one notification
    expect(notifies).toBe(1);

    const before = notifies;
    feed(hunchedPose(), 10); // still hunched, but within cooldown → no repeat
    expect(notifies).toBe(before);

    feed(uprightPose(), 12); // recover
    const recovered = c.ingest({ nowMs: t, landmarks: uprightPose(), baseline, paused: false, inferenceMs: 5 });
    expect(recovered.state).toBe("good");
  });
});
