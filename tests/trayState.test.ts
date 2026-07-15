import { describe, it, expect } from "vitest";
import {
  postureLabel,
  trayTone,
  positionLabel,
  formatDuration,
} from "../src/tray/trayState";

describe("tray state mapping", () => {
  it("labels posture states for the menu bar", () => {
    expect(postureLabel("good")).toBe("Good");
    expect(postureLabel("poor_confirmed")).toBe("Hunching");
    expect(postureLabel("cooldown")).toBe("Hunching");
    expect(postureLabel("away")).toBe("Away");
    expect(postureLabel("paused")).toBe("Paused");
  });

  it("maps posture to an icon tone (not color-only)", () => {
    expect(trayTone("good")).toBe("normal");
    expect(trayTone("drifting")).toBe("warning");
    expect(trayTone("poor_confirmed")).toBe("alert");
    expect(trayTone("paused")).toBe("paused");
  });

  it("labels positions", () => {
    expect(positionLabel("sitting")).toBe("Sitting");
    expect(positionLabel("unknown")).toBe("Unknown");
  });

  it("formats durations compactly", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(12 * 60_000)).toBe("12m");
    expect(formatDuration(3_600_000 + 4 * 60_000)).toBe("1h 04m");
  });
});
