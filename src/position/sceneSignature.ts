/**
 * Scene signatures for place detection (desk / comfy chair / couch). A coarse
 * brightness grid of the background — person region masked out, standardized
 * so lighting changes matter less. 48 numbers, deliberately far too coarse to
 * reconstruct any image content (see docs/PRIVACY.md).
 */
import type { GrayFrame, ExclusionRect } from "./backgroundMotion";

export interface SceneDescriptor {
  readonly cols: number;
  readonly rows: number;
  /** Standardized mean luma per cell; null where the person occluded the cell. */
  readonly cells: readonly (number | null)[];
}

const COLS = 8;
const ROWS = 6;

/** Minimum fraction of mutually valid cells for a meaningful comparison. */
const MIN_VALID_FRACTION = 0.5;

/** Compute a scene descriptor from a grayscale frame, masking the person. */
export function computeSceneDescriptor(
  frame: GrayFrame,
  exclusion: ExclusionRect | null,
): SceneDescriptor | null {
  const cellW = frame.width / COLS;
  const cellH = frame.height / ROWS;
  const raw: (number | null)[] = [];

  const exl = exclusion
    ? {
        x0: exclusion.x * frame.width,
        y0: exclusion.y * frame.height,
        x1: (exclusion.x + exclusion.width) * frame.width,
        y1: (exclusion.y + exclusion.height) * frame.height,
      }
    : null;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.floor((c + 1) * cellW);
      const y0 = Math.floor(r * cellH);
      const y1 = Math.floor((r + 1) * cellH);
      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * frame.width;
        for (let x = x0; x < x1; x++) {
          if (exl && x >= exl.x0 && x <= exl.x1 && y >= exl.y0 && y <= exl.y1) {
            continue;
          }
          sum += frame.data[row + x] as number;
          n++;
        }
      }
      const total = (x1 - x0) * (y1 - y0);
      // A cell mostly covered by the person carries no scene information.
      raw.push(n >= total * 0.5 ? sum / n : null);
    }
  }

  const valid = raw.filter((v): v is number => v !== null);
  if (valid.length < raw.length * MIN_VALID_FRACTION) return null;

  // Standardize over valid cells so global lighting shifts mostly cancel.
  const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
  const sd = Math.sqrt(
    valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length,
  );
  const denom = Math.max(sd, 1);
  return {
    cols: COLS,
    rows: ROWS,
    cells: raw.map((v) => (v === null ? null : (v - mean) / denom)),
  };
}

/**
 * Distance between two descriptors (mean |Δ| in standardized units over
 * mutually valid cells), or null when they don't overlap enough to compare.
 */
export function sceneDistance(
  a: SceneDescriptor,
  b: SceneDescriptor,
): number | null {
  if (a.cols !== b.cols || a.rows !== b.rows) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.cells.length; i++) {
    const av = a.cells[i];
    const bv = b.cells[i];
    if (av === null || av === undefined || bv === null || bv === undefined) {
      continue;
    }
    sum += Math.abs(av - bv);
    n++;
  }
  if (n < a.cells.length * MIN_VALID_FRACTION) return null;
  return sum / n;
}

export interface PlaceCandidate {
  readonly id: number;
  readonly descriptor: SceneDescriptor | null;
}

/** Distance below which a scene counts as "the same place". */
export const DEFAULT_PLACE_MAX_DISTANCE = 0.55;

/** Best-matching place id for the current scene, or null when nothing matches. */
export function classifyPlace(
  scene: SceneDescriptor,
  places: readonly PlaceCandidate[],
  maxDistance = DEFAULT_PLACE_MAX_DISTANCE,
): number | null {
  let bestId: number | null = null;
  let bestDist = Infinity;
  for (const place of places) {
    if (!place.descriptor) continue;
    const d = sceneDistance(scene, place.descriptor);
    if (d !== null && d < bestDist) {
      bestDist = d;
      bestId = place.id;
    }
  }
  return bestDist <= maxDistance ? bestId : null;
}
