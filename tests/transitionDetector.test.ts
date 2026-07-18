import { describe, it, expect } from "vitest";
import {
  TransitionDetector,
  type TransitionStep,
} from "../src/position/transitionDetector";
import type { BackgroundMotionFeatures } from "../src/position/backgroundMotion";

function motion(over: Partial<BackgroundMotionFeatures>): BackgroundMotionFeatures {
  return {
    trackedPointCount: 30,
    validPointCount: 24,
    medianDeltaX: 0,
    medianDeltaY: 0,
    verticalCoherence: 0.9,
    backgroundStable: true,
    likelyCameraMotion: false,
    ...over,
  };
}

const MOVING_DOWN = motion({
  medianDeltaY: 4,
  likelyCameraMotion: true,
  backgroundStable: false,
});
const MOVING_UP = motion({
  medianDeltaY: -4,
  likelyCameraMotion: true,
  backgroundStable: false,
});
const STABLE = motion({});

describe("TransitionDetector", () => {
  it("detects a desk-rise: sustained downward background then settle", () => {
    const d = new TransitionDetector();
    let t = 0;
    let last: TransitionStep = d.update({ nowMs: t, motion: STABLE, present: true });
    // 2.4s of coherent downward motion (6 frames at 400ms).
    for (let i = 0; i < 6; i++) {
      t += 400;
      last = d.update({ nowMs: t, motion: MOVING_DOWN, present: true });
    }
    expect(last.phase).toBe("active");
    expect(last.completed).toBeNull();
    // Settle for 2s.
    t += 1000;
    last = d.update({ nowMs: t, motion: STABLE, present: true });
    expect(last.completed).toBeNull();
    t += 1000;
    last = d.update({ nowMs: t, motion: STABLE, present: true });
    expect(last.completed).not.toBeNull();
    expect(last.completed?.direction).toBe("background_down");
    expect(last.completed?.cumulativeDeltaY).toBeGreaterThan(10);
  });

  it("detects a desk-lowering with background_up", () => {
    const d = new TransitionDetector();
    let t = 0;
    d.update({ nowMs: t, motion: STABLE, present: true });
    for (let i = 0; i < 6; i++) {
      t += 400;
      d.update({ nowMs: t, motion: MOVING_UP, present: true });
    }
    t += 2000;
    const last = d.update({ nowMs: t, motion: STABLE, present: true });
    expect(last.completed?.direction).toBe("background_up");
  });

  it("ignores a blip too short to confirm", () => {
    const d = new TransitionDetector();
    let t = 0;
    d.update({ nowMs: t, motion: STABLE, present: true });
    t += 400;
    d.update({ nowMs: t, motion: MOVING_DOWN, present: true });
    // Settles again immediately — should never complete.
    for (let i = 0; i < 6; i++) {
      t += 400;
      const step = d.update({ nowMs: t, motion: STABLE, present: true });
      expect(step.completed).toBeNull();
    }
  });

  it("ignores small cumulative displacement even if sustained", () => {
    const d = new TransitionDetector();
    const tiny = motion({
      medianDeltaY: 1.6,
      likelyCameraMotion: true,
      backgroundStable: false,
    });
    let t = 0;
    d.update({ nowMs: t, motion: STABLE, present: true });
    // 3 frames × 1.6px = 4.8px < 10px threshold.
    for (let i = 0; i < 3; i++) {
      t += 400;
      d.update({ nowMs: t, motion: tiny, present: true });
    }
    t += 2000;
    const last = d.update({ nowMs: t, motion: STABLE, present: true });
    expect(last.completed).toBeNull();
  });

  it("abandons a transition that runs past the max duration", () => {
    const d = new TransitionDetector();
    let t = 0;
    d.update({ nowMs: t, motion: STABLE, present: true });
    for (let i = 0; i < 100; i++) {
      t += 400;
      d.update({ nowMs: t, motion: MOVING_DOWN, present: true });
    }
    // 40s of "motion" — someone is carrying the laptop, not a desk move.
    t += 2000;
    const last = d.update({ nowMs: t, motion: STABLE, present: true });
    expect(last.completed).toBeNull();
    expect(last.phase).toBe("none");
  });

  it("holds state when a frame has no measurement", () => {
    const d = new TransitionDetector();
    let t = 0;
    d.update({ nowMs: t, motion: STABLE, present: true });
    for (let i = 0; i < 4; i++) {
      t += 400;
      d.update({ nowMs: t, motion: MOVING_DOWN, present: true });
    }
    t += 400;
    const held = d.update({ nowMs: t, motion: null, present: true });
    expect(held.phase).toBe("active");
  });
});
