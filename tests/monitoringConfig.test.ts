import { describe, it, expect } from "vitest";
import {
  machineConfigFromSettings,
  scoreOptionsFromSettings,
} from "../src/monitoring/monitoringConfig";
import { DEFAULT_SETTINGS } from "../src/storage/settingsRepository";

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

  it("passes through the per-user deviation saturation", () => {
    expect(
      scoreOptionsFromSettings({ ...DEFAULT_SETTINGS, deviationSaturation: 2.5 })
        .deviationSaturation,
    ).toBe(2.5);
  });
});
