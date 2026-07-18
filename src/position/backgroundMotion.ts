/**
 * Background motion tracking (sit/stand spec §6). When a webcam rides on an
 * adjustable desk, raising or lowering the desk shifts the WHOLE background
 * coherently in the frame — a far stronger sit/stand signal than pose geometry.
 *
 * Pure block-matching between two consecutive downscaled grayscale frames:
 * pick textured grid points outside the person region, find each patch's best
 * match in the next frame, and report median displacement + vertical coherence.
 * No I/O, no image retention — callers pass transient luma buffers.
 */

export interface GrayFrame {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** Normalized (0..1) region occupied by the user, excluded from tracking. */
export interface ExclusionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BackgroundMotionFeatures {
  readonly trackedPointCount: number;
  readonly validPointCount: number;
  readonly medianDeltaX: number;
  readonly medianDeltaY: number;
  /** Fraction of valid points moving with the median vertical displacement. */
  readonly verticalCoherence: number;
  readonly backgroundStable: boolean;
  /** Coherent vertical camera/desk motion per the spec heuristic. */
  readonly likelyCameraMotion: boolean;
}

export interface MotionOptions {
  /** Grid spacing between candidate points (px). */
  readonly gridStep: number;
  /** Patch half-size (patch is (2r+1)². */
  readonly patchRadius: number;
  /** Search half-window around the original location (px). */
  readonly searchRadius: number;
  /** Minimum patch variance — flat patches can't be matched reliably. */
  readonly minTextureVariance: number;
  /** Spec thresholds. */
  readonly minPoints: number;
  readonly minVerticalMotion: number;
  readonly minCoherence: number;
  readonly maxHorizontalRatio: number;
}

export const DEFAULT_MOTION_OPTIONS: MotionOptions = {
  gridStep: 16,
  patchRadius: 4,
  searchRadius: 12,
  minTextureVariance: 60,
  minPoints: 12,
  minVerticalMotion: 1.5,
  minCoherence: 0.6,
  maxHorizontalRatio: 0.5,
};

/**
 * Person-exclusion region from normalized pose landmarks: the landmark bounding
 * box expanded sideways and extended to the frame bottom (the torso continues
 * below the visible landmarks).
 */
export function personExclusionFromLandmarks(
  points: readonly { readonly x: number; readonly y: number }[],
): ExclusionRect | null {
  if (points.length === 0) return null;
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
  }
  const w = Math.max(0.05, maxX - minX);
  const x = Math.max(0, minX - w * 0.25);
  const width = Math.min(1 - x, w * 1.5);
  const y = Math.max(0, minY - 0.2);
  return { x, y, width, height: 1 - y };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function patchVariance(f: GrayFrame, cx: number, cy: number, r: number): number {
  let sum = 0;
  let sumSq = 0;
  const n = (2 * r + 1) * (2 * r + 1);
  for (let y = cy - r; y <= cy + r; y++) {
    const row = y * f.width;
    for (let x = cx - r; x <= cx + r; x++) {
      const v = f.data[row + x] as number;
      sum += v;
      sumSq += v * v;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Sum of absolute differences between a prev patch and a cur patch. */
function sad(
  prev: GrayFrame,
  px: number,
  py: number,
  cur: GrayFrame,
  cx: number,
  cy: number,
  r: number,
): number {
  let total = 0;
  for (let dy = -r; dy <= r; dy++) {
    const prow = (py + dy) * prev.width;
    const crow = (cy + dy) * cur.width;
    for (let dx = -r; dx <= r; dx++) {
      total += Math.abs(
        (prev.data[prow + px + dx] as number) - (cur.data[crow + cx + dx] as number),
      );
    }
  }
  return total;
}

/**
 * Compute background displacement from `prev` to `cur`. Positive deltaY means
 * the background content moved DOWN in the frame (camera moved up — with a
 * desk-mounted camera that usually means the desk is rising).
 */
export function computeBackgroundMotion(
  prev: GrayFrame,
  cur: GrayFrame,
  exclusion: ExclusionRect | null,
  options: MotionOptions = DEFAULT_MOTION_OPTIONS,
): BackgroundMotionFeatures {
  const { gridStep, patchRadius: r, searchRadius: s } = options;
  const margin = r + s + 1;

  const exl = exclusion
    ? {
        x0: exclusion.x * prev.width,
        y0: exclusion.y * prev.height,
        x1: (exclusion.x + exclusion.width) * prev.width,
        y1: (exclusion.y + exclusion.height) * prev.height,
      }
    : null;

  const dxs: number[] = [];
  const dys: number[] = [];
  let tracked = 0;

  for (let py = margin; py < prev.height - margin; py += gridStep) {
    for (let px = margin; px < prev.width - margin; px += gridStep) {
      if (exl && px >= exl.x0 && px <= exl.x1 && py >= exl.y0 && py <= exl.y1) {
        continue;
      }
      tracked++;
      if (patchVariance(prev, px, py, r) < options.minTextureVariance) continue;

      let bestSad = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      for (let dy = -s; dy <= s; dy++) {
        for (let dx = -s; dx <= s; dx++) {
          const cost = sad(prev, px, py, cur, px + dx, py + dy, r);
          if (cost < bestSad) {
            bestSad = cost;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }
      dxs.push(bestDx);
      dys.push(bestDy);
    }
  }

  const valid = dys.length;
  const medianDeltaX = median(dxs);
  const medianDeltaY = median(dys);
  const coherent =
    valid === 0
      ? 0
      : dys.filter((dy) => Math.abs(dy - medianDeltaY) <= 2).length / valid;

  const backgroundStable =
    valid >= options.minPoints &&
    Math.abs(medianDeltaY) < 1 &&
    Math.abs(medianDeltaX) < 1 &&
    coherent >= options.minCoherence;

  const likelyCameraMotion =
    valid >= options.minPoints &&
    Math.abs(medianDeltaY) >= options.minVerticalMotion &&
    coherent >= options.minCoherence &&
    Math.abs(medianDeltaX) <= options.maxHorizontalRatio * Math.abs(medianDeltaY);

  return {
    trackedPointCount: tracked,
    validPointCount: valid,
    medianDeltaX,
    medianDeltaY,
    verticalCoherence: coherent,
    backgroundStable,
    likelyCameraMotion,
  };
}
