import { describe, it, expect } from "vitest";
import {
  postureConsistency,
  aggregateDay,
  startOfDay,
} from "../src/storage/dashboardMetrics";
import type { WorkSessionRow } from "../src/storage/schema";

function row(overrides: Partial<WorkSessionRow>): WorkSessionRow {
  return {
    id: 1,
    started_at: 0,
    ended_at: null,
    sitting_seconds: 0,
    standing_seconds: 0,
    away_seconds: 0,
    unknown_seconds: 0,
    good_posture_seconds: 0,
    poor_posture_seconds: 0,
    posture_notification_count: 0,
    position_notification_count: 0,
    ...overrides,
  };
}

describe("postureConsistency", () => {
  it("is good / (good + poor)", () => {
    expect(postureConsistency(80, 20)).toBeCloseTo(0.8, 5);
  });
  it("is null when there is no good/poor time", () => {
    expect(postureConsistency(0, 0)).toBeNull();
  });
});

describe("aggregateDay", () => {
  it("sums rows and derives longest sessions + consistency", () => {
    const stats = aggregateDay([
      row({ sitting_seconds: 600, good_posture_seconds: 500, poor_posture_seconds: 100 }),
      row({ sitting_seconds: 1200, standing_seconds: 300, good_posture_seconds: 400, poor_posture_seconds: 100 }),
    ]);
    expect(stats.sittingSeconds).toBe(1800);
    expect(stats.standingSeconds).toBe(300);
    expect(stats.longestSittingSeconds).toBe(1200);
    expect(stats.postureConsistency).toBeCloseTo(900 / 1100, 5);
  });

  it("returns empty stats (null consistency) for no rows", () => {
    expect(aggregateDay([]).postureConsistency).toBeNull();
  });
});

describe("startOfDay", () => {
  it("returns local midnight for the given time", () => {
    const noon = new Date(2026, 5, 15, 12, 30).getTime();
    const midnight = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
    expect(startOfDay(noon)).toBe(midnight);
  });
});
