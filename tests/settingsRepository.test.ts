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

  it("migrates v2 settings: keeps trained values, re-defaults persistence", () => {
    const store = mapStore();
    store.setItem(
      "spine-iq.settings.v2",
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        deviationSaturation: 7.5,
        poorPersistenceSeconds: 20,
      }),
    );
    const repo = new SettingsRepository(store);
    const loaded = repo.load();
    expect(loaded.deviationSaturation).toBe(7.5);
    expect(loaded.poorPersistenceSeconds).toBe(
      DEFAULT_SETTINGS.poorPersistenceSeconds,
    );
    // Migration persists to the new key, so a later save/load keeps it.
    expect(store.getItem("spine-iq.settings.v3")).not.toBeNull();
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
