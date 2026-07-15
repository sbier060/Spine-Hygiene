import { describe, it, expect } from "vitest";
import {
  machineConfigFromSettings,
  scoreOptionsFromSettings,
} from "../src/monitoring/monitoringConfig";
import { DEFAULT_SETTINGS } from "../src/storage/settingsRepository";
import { SENSITIVITY_PRESETS } from "../src/posture/postureThresholds";

describe("monitoringConfig", () => {
  it("maps persistence seconds and cooldown minutes to ms", () => {
    const cfg = machineConfigFromSettings({
      ...DEFAULT_SETTINGS,
      poorPersistenceSeconds: 45,
      postureCooldownMinutes: 10,
    });
    expect(cfg.poorPersistenceMs).toBe(45_000);
    expect(cfg.cooldownMs).toBe(600_000);
  });

  it("maps sensitivity to deviation saturation (higher sensitivity trips sooner)", () => {
    const high = scoreOptionsFromSettings({
      ...DEFAULT_SETTINGS,
      sensitivity: "high",
    });
    const low = scoreOptionsFromSettings({
      ...DEFAULT_SETTINGS,
      sensitivity: "low",
    });
    expect(high.deviationSaturation).toBe(SENSITIVITY_PRESETS.high.deviationSaturation);
    expect(low.deviationSaturation).toBe(SENSITIVITY_PRESETS.low.deviationSaturation);
    expect(high.deviationSaturation!).toBeLessThan(low.deviationSaturation!);
  });
});
