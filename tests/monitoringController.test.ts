import { describe, it, expect } from "vitest";
import { MonitoringController } from "../src/monitoring/monitoringController";
import { DEFAULT_INTERVALS } from "../src/monitoring/adaptiveInference";
import { extractFeatures } from "../src/pose/featureExtractor";
import { buildBaseline } from "../src/posture/calibrationService";
import { extractPositionFeatures } from "../src/position/positionFeatures";
import { buildPositionBaseline } from "../src/position/positionCalibration";
import { uprightPose, hunchedPose, standingPose } from "./fixtures";
import type { PostureMachineConfig } from "../src/posture/postureStateMachine";

const sitPositionBaseline = buildPositionBaseline(
  Array.from({ length: 8 }, () => extractPositionFeatures(uprightPose())),
  "sitting",
);
const standPositionBaseline = buildPositionBaseline(
  Array.from({ length: 8 }, () => extractPositionFeatures(standingPose())),
  "standing",
);

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
    expect(result.nextIntervalMs).toBe(DEFAULT_INTERVALS.stable);
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
    expect(result.nextIntervalMs).toBe(DEFAULT_INTERVALS.away);
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

  it("automatically classifies standing after it is sustained", () => {
    const c = new MonitoringController();
    let r = c.ingest({
      nowMs: 0,
      landmarks: standingPose(),
      baseline,
      sittingPositionBaseline: sitPositionBaseline,
      standingPositionBaseline: standPositionBaseline,
      paused: false,
      inferenceMs: 5,
    });
    // Presence warm-up + sustained-switch window (default 4s).
    for (let i = 1; i <= 8; i++) {
      r = c.ingest({
        nowMs: i * 1000,
        landmarks: standingPose(),
        baseline,
        sittingPositionBaseline: sitPositionBaseline,
        standingPositionBaseline: standPositionBaseline,
        paused: false,
        inferenceMs: 5,
      });
    }
    expect(r.position).toBe("standing");
    expect(r.durations.totalStandingMs).toBeGreaterThan(0);
  });

  it("classifies a sitting user as sitting", () => {
    const c = new MonitoringController();
    let r = c.ingest({
      nowMs: 0,
      landmarks: uprightPose(),
      baseline,
      sittingPositionBaseline: sitPositionBaseline,
      standingPositionBaseline: standPositionBaseline,
      paused: false,
      inferenceMs: 5,
    });
    for (let i = 1; i <= 8; i++) {
      r = c.ingest({
        nowMs: i * 1000,
        landmarks: uprightPose(),
        baseline,
        sittingPositionBaseline: sitPositionBaseline,
        standingPositionBaseline: standPositionBaseline,
        paused: false,
        inferenceMs: 5,
      });
    }
    expect(r.position).toBe("sitting");
  });

  it("applies a manual position mark and accrues duration for it", () => {
    const c = new MonitoringController();
    // Warm up presence with a few frames.
    for (let i = 0; i < 4; i++) {
      c.ingest({
        nowMs: i * 1000,
        landmarks: uprightPose(),
        baseline,
        paused: false,
        inferenceMs: 5,
      });
    }
    const event = c.markPosition("sitting", 4000);
    expect(event?.source).toBe("manual");
    expect(event?.next).toBe("sitting");

    const r1 = c.ingest({
      nowMs: 5000,
      landmarks: uprightPose(),
      baseline,
      paused: false,
      inferenceMs: 5,
    });
    expect(r1.position).toBe("sitting");
    const r2 = c.ingest({
      nowMs: 6000,
      landmarks: uprightPose(),
      baseline,
      paused: false,
      inferenceMs: 5,
    });
    expect(r2.durations.totalSittingMs).toBeGreaterThan(0);
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

describe("desk transition integration", () => {
  const moving = (dy: number) => ({
    trackedPointCount: 30,
    validPointCount: 24,
    medianDeltaX: 0,
    medianDeltaY: dy,
    verticalCoherence: 0.9,
    backgroundStable: false,
    likelyCameraMotion: true,
  });
  const stable = {
    trackedPointCount: 30,
    validPointCount: 24,
    medianDeltaX: 0,
    medianDeltaY: 0,
    verticalCoherence: 0.9,
    backgroundStable: true,
    likelyCameraMotion: false,
  };

  it("a completed desk-rise forces standing and holds against the classifier", () => {
    const c = new MonitoringController();
    let t = 0;
    const feed = (motion: ReturnType<typeof moving>, n: number, stepMs = 400) => {
      let r = null as ReturnType<MonitoringController["ingest"]> | null;
      for (let i = 0; i < n; i++) {
        t += stepMs;
        r = c.ingest({
          nowMs: t,
          landmarks: uprightPose(),
          baseline,
          sittingPositionBaseline: sitPositionBaseline,
          standingPositionBaseline: standPositionBaseline,
          paused: false,
          inferenceMs: 5,
          backgroundMotion: motion,
        });
      }
      return r!;
    };

    // Warm up: present + classified as sitting (upright pose matches the
    // sitting baseline). Long enough for the position machine to settle.
    let r = feed(stable, 16, 800);
    expect(r.position).toBe("sitting");

    // Desk rises: sustained coherent downward background shift, then settle.
    feed(moving(4), 6);
    r = feed(stable, 3, 1000);
    expect(r.position).toBe("standing");
    expect(c.lastCompletedTransition?.direction).toBe("background_down");

    // The static classifier still matches the sitting baseline, but the
    // transition hold keeps the state at standing.
    r = feed(stable, 10, 400);
    expect(r.position).toBe("standing");
  });
});
