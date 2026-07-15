import { describe, it, expect } from "vitest";
import {
  RollingMean,
  PerformanceMonitor,
} from "../src/monitoring/performanceInstrumentation";

describe("RollingMean", () => {
  it("averages within the window and drops old samples", () => {
    const m = new RollingMean(3);
    expect(m.push(3)).toBe(3);
    m.push(3);
    m.push(3);
    expect(m.push(9)).toBeCloseTo((3 + 3 + 9) / 3, 5); // oldest 3 dropped
  });

  it("rejects an invalid window size", () => {
    expect(() => new RollingMean(0)).toThrow();
  });
});

describe("PerformanceMonitor", () => {
  it("computes rolling inference time, rejection ratio, and rate", () => {
    const p = new PerformanceMonitor();
    p.record({ nowMs: 0, inferenceMs: 10, usable: true, score: 0.2 });
    p.record({ nowMs: 1000, inferenceMs: 20, usable: false, score: 0 });
    p.record({ nowMs: 2000, inferenceMs: 30, usable: true, score: 0.4 });
    const snap = p.snapshot(60_000);
    expect(snap.avgInferenceMs).toBeCloseTo(20, 5);
    expect(snap.totalInferences).toBe(3);
    expect(snap.rejectedFrames).toBe(1);
    expect(snap.rejectedRatio).toBeCloseTo(1 / 3, 5);
    // 3 inferences over 1 minute.
    expect(snap.inferencesPerMinute).toBeCloseTo(3, 5);
    // Average over usable frames only.
    expect(snap.avgPostureScore).toBeCloseTo(0.3, 5);
  });

  it("reports mode and resolution", () => {
    const p = new PerformanceMonitor();
    p.setMode("drifting");
    p.setResolution(640, 360);
    const snap = p.snapshot(1000);
    expect(snap.schedulerMode).toBe("drifting");
    expect(snap.cameraResolution).toBe("640×360");
  });

  it("resets counters", () => {
    const p = new PerformanceMonitor();
    p.record({ nowMs: 0, inferenceMs: 10, usable: true, score: 0.2 });
    p.reset();
    expect(p.snapshot(1000).totalInferences).toBe(0);
  });
});
