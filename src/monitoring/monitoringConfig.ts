/**
 * Maps user settings onto the tuning knobs the monitor actually uses, so the
 * Settings screen (sensitivity, persistence) changes behavior without touching
 * scoring or state-machine logic. Pure and testable.
 */
import {
  DEFAULT_POSTURE_MACHINE_CONFIG,
  type PostureMachineConfig,
} from "../posture/postureStateMachine";
import type { ScoreOptions } from "../posture/postureScorer";
import { SENSITIVITY_PRESETS } from "../posture/postureThresholds";
import type { SettingsData } from "../storage/settingsRepository";

/** Build the posture state-machine config from settings. */
export function machineConfigFromSettings(
  settings: SettingsData,
): PostureMachineConfig {
  return {
    ...DEFAULT_POSTURE_MACHINE_CONFIG,
    poorPersistenceMs: Math.max(1000, settings.poorPersistenceSeconds * 1000),
    cooldownMs: Math.max(60_000, settings.postureCooldownMinutes * 60_000),
  };
}

/** Build score options (sensitivity → how fast a deviation counts) from settings. */
export function scoreOptionsFromSettings(settings: SettingsData): ScoreOptions {
  return {
    deviationSaturation: SENSITIVITY_PRESETS[settings.sensitivity].deviationSaturation,
  };
}
