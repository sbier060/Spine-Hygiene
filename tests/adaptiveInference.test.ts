import { describe, it, expect } from "vitest";
import {
  computeInterval,
  DEFAULT_INTERVALS,
} from "../src/monitoring/adaptiveInference";
import { modeForState } from "../src/monitoring/monitoringTypes";
import { PresenceDetector } from "../src/monitoring/presenceDetector";

describe("computeInterval (adaptive scheduler)", () => {
  it("reduces frequency when stable (long interval)", () => {
    expect(computeInterval("stable")).toBe(DEFAULT_INTERVALS.stable);
    expect(computeInterval("stable")).toBeGreaterThan(computeInterval("drifting")!);
  });

  it("increases frequency while drifting (short interval)", () => {
    expect(computeInterval("drifting")).toBe(DEFAULT_INTERVALS.drifting);
    expect(computeInterval("drifting")!).toBeLessThan(computeInterval("poor")!);
  });

  it("reduces frequency when away (long presence poll)", () => {
    expect(computeInterval("away")).toBe(DEFAULT_INTERVALS.away);
    expect(computeInterval("away")!).toBeGreaterThan(computeInterval("stable")!);
  });

  it("stops inference entirely when paused/stopped", () => {
    expect(computeInterval("stopped")).toBeNull();
  });
});

describe("modeForState", () => {
  it("maps posture states to scheduler modes", () => {
    expect(modeForState("good", false)).toBe("stable");
    expect(modeForState("drifting", false)).toBe("drifting");
    expect(modeForState("poor_confirmed", false)).toBe("poor");
    expect(modeForState("away", false)).toBe("away");
    expect(modeForState("good", true)).toBe("stopped");
    expect(modeForState("paused", false)).toBe("stopped");
  });
});

describe("PresenceDetector", () => {
  it("requires several consecutive detections to become present", () => {
    const p = new PresenceDetector(3);
    expect(p.update(true)).toBe(false);
    expect(p.update(true)).toBe(false);
    expect(p.update(true)).toBe(true);
  });

  it("drops presence immediately on a miss and requires re-detection", () => {
    const p = new PresenceDetector(3);
    p.update(true);
    p.update(true);
    p.update(true);
    expect(p.update(false)).toBe(false);
    expect(p.update(true)).toBe(false); // streak restarts
    expect(p.update(true)).toBe(false);
    expect(p.update(true)).toBe(true);
  });
});
