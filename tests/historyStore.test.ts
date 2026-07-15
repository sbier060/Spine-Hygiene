import { describe, it, expect } from "vitest";
import { HistoryStore } from "../src/storage/historyStore";

describe("HistoryStore (in-memory, no database)", () => {
  it("reports no database and accumulates a session for the dashboard", async () => {
    const store = new HistoryStore(null);
    expect(store.hasDatabase).toBe(false);
    await store.startSession(0);
    store.record(0, {
      position: "sitting",
      postureState: "good",
      postureNotified: false,
      positionNotified: false,
      paused: false,
    });
    store.record(2000, {
      position: "sitting",
      postureState: "good",
      postureNotified: false,
      positionNotified: false,
      paused: false,
    });
    const stats = await store.loadTodayStats(2000);
    expect(stats.sittingSeconds).toBe(2);
    expect(stats.postureConsistency).toBe(1);
  });

  it("records a position event into the timeline", async () => {
    const store = new HistoryStore(null);
    await store.startSession(0);
    await store.addPositionEvent({
      previous: "sitting",
      next: "standing",
      confidence: 0.9,
      source: "automatic",
      atMs: 1000,
    });
    const timeline = await store.loadTimeline(1000);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.new_position).toBe("standing");
  });

  it("exports a JSON summary and clears on deleteHistory", async () => {
    const store = new HistoryStore(null);
    await store.startSession(0);
    store.record(0, {
      position: "standing",
      postureState: "good",
      postureNotified: false,
      positionNotified: false,
      paused: false,
    });
    store.record(1000, {
      position: "standing",
      postureState: "good",
      postureNotified: false,
      positionNotified: false,
      paused: false,
    });
    await store.addPositionEvent({
      previous: "unknown",
      next: "standing",
      confidence: 1,
      source: "manual",
      atMs: 0,
    });

    const json = await store.exportSummary(1000);
    const parsed = JSON.parse(json) as {
      stats: { standingSeconds: number };
      timeline: unknown[];
    };
    expect(parsed.stats.standingSeconds).toBe(1);
    expect(parsed.timeline).toHaveLength(1);

    await store.deleteHistory();
    expect(await store.loadTimeline(1000)).toHaveLength(0);
    expect((await store.loadTodayStats(1000)).standingSeconds).toBe(0);
  });
});
