import { describe, it, expect } from "vitest";
import {
  postureConsistency,
  aggregateDay,
  aggregateDaily,
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

describe("aggregateDaily", () => {
  const now = new Date(2026, 6, 18, 15, 0).getTime();
  const day = (offset: number, hour = 10): number => {
    const d = new Date(2026, 6, 18, hour);
    d.setDate(d.getDate() + offset);
    return d.getTime();
  };

  it("returns one entry per trailing day, oldest first, today last", () => {
    const daily = aggregateDaily([], now, 14);
    expect(daily).toHaveLength(14);
    expect(daily[13]!.dayStartMs).toBe(startOfDay(now));
    expect(daily[0]!.dayStartMs).toBeLessThan(daily[13]!.dayStartMs);
    expect(daily.every((d) => d.consistency === null)).toBe(true);
  });

  it("buckets sessions by local day and computes consistency", () => {
    const rows = [
      row({ started_at: day(0), good_posture_seconds: 90, poor_posture_seconds: 10, sitting_seconds: 100 }),
      row({ started_at: day(0, 16), good_posture_seconds: 10, poor_posture_seconds: 90, standing_seconds: 100 }),
      row({ started_at: day(-1), good_posture_seconds: 30, poor_posture_seconds: 10, sitting_seconds: 40 }),
    ];
    const daily = aggregateDaily(rows, now, 3);
    expect(daily[2]!.consistency).toBeCloseTo(0.5, 5);
    expect(daily[2]!.activeSeconds).toBe(200);
    expect(daily[1]!.consistency).toBeCloseTo(0.75, 5);
    expect(daily[0]!.consistency).toBeNull();
  });

  it("ignores sessions older than the window", () => {
    const rows = [row({ started_at: day(-5), good_posture_seconds: 100 })];
    const daily = aggregateDaily(rows, now, 3);
    expect(daily.every((d) => d.consistency === null)).toBe(true);
  });
});
