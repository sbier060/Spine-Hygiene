/**
 * Settings persistence. Phase 2 stores settings locally in the WebView via a
 * simple key/value backend (defaults to localStorage); Phase 4 swaps the backend
 * for the SQLite `settings` table without changing callers. Values are validated
 * on load so a corrupt/blank store falls back to defaults.
 */

export type SensitivityLevel = "low" | "balanced" | "high";

export interface SettingsData {
  readonly sensitivity: SensitivityLevel;
  /** Per-user deviation saturation from two-point training (lower = more sensitive). */
  readonly deviationSaturation: number;
  readonly poorPersistenceSeconds: number;
  readonly postureCooldownMinutes: number;
  readonly sittingReminderEnabled: boolean;
  readonly sittingReminderMinutes: number;
  readonly standingReminderEnabled: boolean;
  readonly standingReminderMinutes: number;
  readonly positionCooldownMinutes: number;
  readonly launchAtLogin: boolean;
  readonly startMonitoringAutomatically: boolean;
  readonly soundEnabled: boolean;
  readonly developerMode: boolean;
}

/** Defaults from the spec's reminder-settings section. */
export const DEFAULT_SETTINGS: SettingsData = {
  sensitivity: "balanced",
  deviationSaturation: 4,
  // Sustained slouch before the red alert / notification fires. Kept short so
  // the popup lands within a few seconds of a real slouch.
  poorPersistenceSeconds: 5,
  postureCooldownMinutes: 15,
  sittingReminderEnabled: true,
  sittingReminderMinutes: 50,
  standingReminderEnabled: true,
  standingReminderMinutes: 45,
  positionCooldownMinutes: 15,
  launchAtLogin: true,
  startMonitoringAutomatically: true,
  soundEnabled: false,
  developerMode: false,
};

/** Minimal key/value backend (localStorage-compatible). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = "spine-iq.settings.v3";
/** Prior version; migrated on first load (alert persistence re-defaulted). */
const LEGACY_KEY_V2 = "spine-iq.settings.v2";

function browserStore(): KeyValueStore | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

/** Merge unknown parsed JSON onto defaults, keeping only known-typed fields. */
export function coerceSettings(parsed: unknown): SettingsData {
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;
  const obj = parsed as Record<string, unknown>;
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = obj[key];
    const expected = typeof defaults[key];
    if (typeof value === expected) merged[key] = value;
  }
  return merged as unknown as SettingsData;
}

export class SettingsRepository {
  constructor(private readonly store: KeyValueStore | null = browserStore()) {}

  load(): SettingsData {
    if (!this.store) return DEFAULT_SETTINGS;
    const raw = this.store.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return coerceSettings(JSON.parse(raw));
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    // Migrate v2: keep the user's trained values (deviation saturation etc.)
    // but re-default the alert persistence — no UI exposes it yet, and the old
    // stored 20 s would otherwise pin every migrated install to the slow alert.
    const legacy = this.store.getItem(LEGACY_KEY_V2);
    if (legacy) {
      try {
        const migrated: SettingsData = {
          ...coerceSettings(JSON.parse(legacy)),
          poorPersistenceSeconds: DEFAULT_SETTINGS.poorPersistenceSeconds,
        };
        this.save(migrated);
        return migrated;
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  }

  save(settings: SettingsData): void {
    this.store?.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  update(patch: Partial<SettingsData>): SettingsData {
    const next = { ...this.load(), ...patch };
    this.save(next);
    return next;
  }
}
