import { describe, it, expect } from "vitest";
import type { PositionFeatures } from "../src/position/positionFeatures";
import { buildPositionBaseline } from "../src/position/positionCalibration";
import { classifyPosition } from "../src/position/positionClassifier";
import {
  PositionStateMachine,
  type PositionMachineConfig,
} from "../src/position/positionStateMachine";
import type { PositionClassification } from "../src/position/positionTypes";

const SITTING: PositionFeatures = {
  shoulderY: 0.6,
  headY: 0.3,
  faceSize: 0.16,
  shoulderWidth: 0.3,
};
const STANDING: PositionFeatures = {
  shoulderY: 0.4,
  headY: 0.12,
  faceSize: 0.12,
  shoulderWidth: 0.24,
};

function baseline(f: PositionFeatures, type: "sitting" | "standing") {
  return buildPositionBaseline(Array.from({ length: 8 }, () => f), type);
}

const sittingBase = baseline(SITTING, "sitting");
const standingBase = baseline(STANDING, "standing");

describe("classifyPosition", () => {
  it("classifies a sitting-like frame as sitting", () => {
    const r = classifyPosition(SITTING, sittingBase, standingBase);
    expect(r.position).toBe("sitting");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("classifies a standing-like frame as standing", () => {
    const r = classifyPosition(STANDING, sittingBase, standingBase);
    expect(r.position).toBe("standing");
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("returns unknown when nothing is close enough (low confidence)", () => {
    const far: PositionFeatures = {
      shoulderY: 0.9,
      headY: 0.9,
      faceSize: 0.02,
      shoulderWidth: 0.05,
    };
    expect(classifyPosition(far, sittingBase, standingBase).position).toBe(
      "unknown",
    );
  });

  it("affirms sitting from the sitting baseline alone, else unknown", () => {
    expect(classifyPosition(SITTING, sittingBase, null).position).toBe(
      "sitting",
    );
    // A standing-like frame with only a sitting baseline should not be forced.
    expect(classifyPosition(STANDING, sittingBase, null).position).toBe(
      "unknown",
    );
  });
});

const FAST: PositionMachineConfig = {
  switchSustainMs: 2000,
  minConfidence: 0.5,
  awayGraceMs: 2000,
};

function classification(
  position: PositionClassification["position"],
  confidence: number,
): PositionClassification {
  return {
    position,
    confidence,
    sittingSimilarity: null,
    standingSimilarity: null,
  };
}

describe("PositionStateMachine", () => {
  it("switches only after a classification is sustained", () => {
    const m = new PositionStateMachine(FAST);
    const first = m.update({
      nowMs: 0,
      classification: classification("sitting", 0.9),
      present: true,
      paused: false,
    });
    expect(first.changed).toBe(false); // not yet sustained
    let switchSource: string | undefined;
    for (let t = 500; t <= 2500; t += 500) {
      const step = m.update({
        nowMs: t,
        classification: classification("sitting", 0.9),
        present: true,
        paused: false,
      });
      if (step.event) switchSource = step.event.source;
    }
    expect(m.current).toBe("sitting");
    expect(switchSource).toBe("automatic");
  });

  it("prefers the previous state when confidence is low", () => {
    const m = new PositionStateMachine(FAST);
    // Establish sitting.
    for (let t = 0; t <= 2500; t += 500) {
      m.update({
        nowMs: t,
        classification: classification("sitting", 0.9),
        present: true,
        paused: false,
      });
    }
    // A low-confidence standing guess must not flip us.
    const step = m.update({
      nowMs: 3000,
      classification: classification("standing", 0.3),
      present: true,
      paused: false,
    });
    expect(step.position).toBe("sitting");
    expect(step.changed).toBe(false);
  });

  it("applies a manual correction immediately with a manual event", () => {
    const m = new PositionStateMachine(FAST);
    const step = m.markManual("standing", 1000);
    expect(m.current).toBe("standing");
    expect(step.changed).toBe(true);
    expect(step.event?.source).toBe("manual");
  });
});
