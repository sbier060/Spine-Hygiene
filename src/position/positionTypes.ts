/**
 * Position-tracking types: sitting / standing / away / unknown, plus how a
 * position was determined (automatic classification, a manual correction,
 * calibration, or the system).
 */

export type PositionState = "sitting" | "standing" | "away" | "unknown";

export type PositionSource =
  | "automatic"
  | "manual"
  | "calibration"
  | "system"
  /** Detected desk-height transition (background motion). */
  | "transition";

/** Output of the classifier for a single frame. */
export interface PositionClassification {
  /** Best-guess position, or "unknown" when confidence is too low. */
  readonly position: PositionState;
  /** Confidence in [0,1]. */
  readonly confidence: number;
  /** Similarity to each baseline, for the developer overlay. */
  readonly sittingSimilarity: number | null;
  readonly standingSimilarity: number | null;
}

/** A recorded position change (persisted from Phase 4). */
export interface PositionEvent {
  readonly previous: PositionState;
  readonly next: PositionState;
  readonly confidence: number;
  readonly source: PositionSource;
  readonly atMs: number;
}
