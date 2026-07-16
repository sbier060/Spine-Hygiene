/**
 * Adaptive inference scheduler.
 *
 * Chooses the delay until the next inference based only on the current mode, so
 * CPU scales with what's happening: rarely when away or stable, often while the
 * posture is actively changing, and not at all when paused. Pure and independent
 * of the posture model (spec requirement), so it is unit-tested on its own.
 *
 * Returns `null` to mean "stop inference entirely" (camera can be released).
 */
import type { InferenceMode } from "./monitoringTypes";

export interface AdaptiveIntervals {
  /** No person: just poll for presence occasionally. */
  readonly away: number;
  /** Good & stable: infrequent checks. */
  readonly stable: number;
  /** Posture changing: react quickly. */
  readonly drifting: number;
  /** Confirmed poor: steady ~1/s. */
  readonly poor: number;
  /** Low confidence: retry moderately to regain a clear view. */
  readonly lowConfidence: number;
}

/** Defaults from the spec's adaptive-inference section. */
export const DEFAULT_INTERVALS: AdaptiveIntervals = {
  away: 5000,
  stable: 1800,
  drifting: 400,
  poor: 1000,
  // Re-check quickly when unsure so it recovers fast once you're back in frame.
  lowConfidence: 500,
};

/**
 * Delay (ms) until the next inference for `mode`, or `null` to stop.
 */
export function computeInterval(
  mode: InferenceMode,
  intervals: AdaptiveIntervals = DEFAULT_INTERVALS,
): number | null {
  switch (mode) {
    case "stopped":
      return null;
    case "away":
      return intervals.away;
    case "stable":
      return intervals.stable;
    case "drifting":
      return intervals.drifting;
    case "poor":
      return intervals.poor;
    case "low_confidence":
      return intervals.lowConfidence;
  }
}
