import { describe, it, expect } from "vitest";
import { SessionAggregator } from "../src/storage/sessionAggregator";

function sample(
  position: "sitting" | "standing" | "away" | "unknown",
  postureState:
    | "good"
    | "drifting"
    | "poor_confirmed"
    | "away"
    | "paused",
  extra: { postureNotified?: boolean; positionNotified?: boolean; paused?: boolean } = {},
) {
  return {
    position,
    postureState,
    postureNotified: extra.postureNotified ?? false,
    positionNotified: extra.positionNotified ?? false,
    paused: extra.paused ?? false,
  } as const;
}

describe("SessionAggregator", () => {
  it("accumulates seconds per position and posture", () => {
    const a = new SessionAggregator();
    a.record(0, sample("sitting", "good"));
    a.record(1000, sample("sitting", "good")); // +1s sitting, +1s good
    a.record(2000, sample("sitting", "poor_confirmed")); // +1s sitting, +1s poor
    const s = a.summary();
    expect(s.sittingSeconds).toBe(2);
    expect(s.goodPostureSeconds).toBe(1);
    expect(s.poorPostureSeconds).toBe(1);
  });

  it("excludes paused time", () => {
    const a = new SessionAggregator();
    a.record(0, sample("sitting", "good"));
    a.record(1000, sample("sitting", "good", { paused: true })); // excluded
    a.record(2000, sample("sitting", "good"));
    expect(a.summary().sittingSeconds).toBe(1); // only the last unpaused dt
  });

  it("does not count drifting or away as good or poor", () => {
    const a = new SessionAggregator();
    a.record(0, sample("standing", "drifting"));
    a.record(1000, sample("standing", "drifting"));
    a.record(2000, sample("away", "away"));
    const s = a.summary();
    expect(s.goodPostureSeconds).toBe(0);
    expect(s.poorPostureSeconds).toBe(0);
    expect(s.standingSeconds).toBe(1);
    expect(s.awaySeconds).toBe(1);
  });

  it("counts notifications", () => {
    const a = new SessionAggregator();
    a.record(0, sample("sitting", "good"));
    a.record(1000, sample("sitting", "poor_confirmed", { postureNotified: true }));
    a.record(2000, sample("sitting", "good", { positionNotified: true }));
    const s = a.summary();
    expect(s.postureNotificationCount).toBe(1);
    expect(s.positionNotificationCount).toBe(1);
  });
});
