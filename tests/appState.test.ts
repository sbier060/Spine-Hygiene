import { describe, it, expect } from "vitest";
import { appReducer, initialAppState } from "../src/app/appState";

describe("appReducer monitoring actions", () => {
  it("starts monitoring into the monitor phase and running status", () => {
    const s = appReducer(initialAppState, { type: "start_monitoring" });
    expect(s.phase).toBe("monitor");
    expect(s.monitoringStatus).toEqual({ kind: "running" });
  });

  it("pauses with an end time and resumes back to running", () => {
    const paused = appReducer(initialAppState, {
      type: "pause_monitoring",
      untilMs: 123,
    });
    expect(paused.monitoringStatus).toEqual({ kind: "paused", untilMs: 123 });
    const resumed = appReducer(paused, { type: "resume_monitoring" });
    expect(resumed.monitoringStatus).toEqual({ kind: "running" });
  });

  it("toggles developer mode", () => {
    const on = appReducer(initialAppState, { type: "toggle_dev" });
    expect(on.devMode).toBe(true);
    const off = appReducer(on, { type: "toggle_dev" });
    expect(off.devMode).toBe(false);
  });
});
