import { describe, it, expect } from "vitest";
import {
  postureLabel,
  trayTone,
  positionLabel,
  formatDuration,
  statusHeadline,
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

  it("combines posture and position into a headline", () => {
    expect(statusHeadline("good", "sitting")).toBe("Sitting well");
    expect(statusHeadline("good", "standing")).toBe("Standing well");
    expect(statusHeadline("poor_confirmed", "standing")).toBe("Standing slouched");
    expect(statusHeadline("drifting", "sitting")).toBe("Sitting drifting");
    // Unknown position → posture only.
    expect(statusHeadline("good", "unknown")).toBe("Good posture");
    expect(statusHeadline("poor_confirmed", "unknown")).toBe("Slouched");
    // Special states win regardless of position.
    expect(statusHeadline("low_confidence", "sitting")).toBe("Low confidence");
    expect(statusHeadline("good", "away")).toBe("Away");
    expect(statusHeadline("paused", "sitting")).toBe("Paused");
  });

  it("formats durations compactly", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(12 * 60_000)).toBe("12m");
    expect(formatDuration(3_600_000 + 4 * 60_000)).toBe("1h 04m");
  });
});
