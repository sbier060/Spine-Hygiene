/**
 * Shared posture types: the personalized calibration baseline and the result of
 * scoring a frame against it.
 */
import type { ScoredFeatureKey } from "../pose/featureExtractor";

/** Coarse posture bands derived from the continuous score. */
export type PostureBand = "good" | "drifting" | "poor_candidate";

/**
 * Full posture monitoring state (Phase 2 state machine). Distinct from the
 * instantaneous `PostureBand`: it layers time (persistence, cooldown, away) and
 * confidence/pause handling on top of the raw band.
 */
export type PostureState =
  | "good"
  | "drifting"
  | "poor_candidate"
  | "poor_confirmed"
  | "cooldown"
  | "low_confidence"
  | "away"
  | "paused";

/** Per-feature baseline: the calibrated center and its natural spread. */
export interface FeatureBaseline {
  /** Median of the calibrated samples for this feature. */
  readonly median: number;
  /** Robust spread (std-dev) of the calibrated samples; the "normal wobble". */
  readonly deviation: number;
}

/**
 * A personalized posture baseline built during calibration. Only features that
 * had enough valid samples are present; the scorer reweights around the rest.
 */
export interface CalibrationBaseline {
  /** Which posture this baseline represents. */
  readonly positionType: "sitting" | "standing";
  /** Per-feature baselines (partial: some features may be unavailable). */
  readonly features: Partial<Record<ScoredFeatureKey, FeatureBaseline>>;
  /** How confident we are in this calibration, [0,1]. */
  readonly confidence: number;
  /** Number of valid frames the baseline was built from. */
  readonly sampleCount: number;
  /** Capture-time metadata for validity checks (camera changes, etc.). */
  readonly cameraWidth: number;
  readonly cameraHeight: number;
  readonly cameraDeviceId: string | null;
  /** Epoch-ms timestamp when calibration completed. */
  readonly createdAt: number;
}

/** Contribution of a single feature to the overall posture score. */
export interface FeatureContribution {
  /** Normalized absolute deviation from baseline (unbounded, ~0 when good). */
  readonly normalizedDeviation: number;
  /** Weight actually applied after reweighting for unavailable features. */
  readonly appliedWeight: number;
}

/** Result of scoring one frame's features against the baseline. */
export interface PostureScoreResult {
  /** Continuous posture score in [0,1]; higher = worse. */
  readonly score: number;
  /** Coarse band derived from `score` and the thresholds. */
  readonly band: PostureBand;
  /** Per-feature breakdown (for the developer overlay). */
  readonly contributions: Partial<Record<ScoredFeatureKey, FeatureContribution>>;
  /** How many features actually contributed. */
  readonly usedFeatureCount: number;
}
