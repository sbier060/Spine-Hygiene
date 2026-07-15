import { describe, it, expect } from "vitest";
import {
  SettingsRepository,
  DEFAULT_SETTINGS,
  coerceSettings,
  type KeyValueStore,
} from "../src/storage/settingsRepository";

function mapStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

describe("SettingsRepository", () => {
  it("returns defaults when nothing is stored", () => {
    const repo = new SettingsRepository(mapStore());
    expect(repo.load()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a saved patch", () => {
    const repo = new SettingsRepository(mapStore());
    const next = repo.update({ sensitivity: "high", soundEnabled: true });
    expect(next.sensitivity).toBe("high");
    expect(repo.load().sensitivity).toBe("high");
    expect(repo.load().soundEnabled).toBe(true);
    // Untouched fields keep defaults.
    expect(repo.load().sittingReminderMinutes).toBe(50);
  });

  it("falls back to defaults on corrupt data", () => {
    const store = mapStore();
    store.setItem("spine-iq.settings.v1", "{not json");
    const repo = new SettingsRepository(store);
    expect(repo.load()).toEqual(DEFAULT_SETTINGS);
  });

  it("coerces unknown/mistyped fields to defaults", () => {
    const result = coerceSettings({
      sensitivity: "high",
      sittingReminderMinutes: "not a number",
      bogus: 123,
    });
    expect(result.sensitivity).toBe("high");
    expect(result.sittingReminderMinutes).toBe(
      DEFAULT_SETTINGS.sittingReminderMinutes,
    );
  });
});
