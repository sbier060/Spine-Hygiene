/**
 * Smoothing primitives for noisy pose signals: exponential moving average,
 * rolling median, outlier rejection, and hysteresis. All are small, pure,
 * deterministic, and unit-testable. State is held in tiny explicit objects so
 * there is no hidden global store.
 */

/** Default EMA smoothing factor. Lower = smoother/slower (spec: 0.15–0.3). */
export const DEFAULT_EMA_ALPHA = 0.2;

/**
 * Exponential moving average. `alpha` in (0,1]; higher reacts faster.
 *   smoothed = alpha * newValue + (1 - alpha) * previous
 */
export class ExponentialMovingAverage {
  private value: number | null = null;

  constructor(private readonly alpha: number = DEFAULT_EMA_ALPHA) {
    if (alpha <= 0 || alpha > 1) {
      throw new RangeError(`EMA alpha must be in (0,1], got ${alpha}`);
    }
  }

  /** Push a new sample and return the updated smoothed value. */
  push(newValue: number): number {
    this.value =
      this.value === null
        ? newValue
        : this.alpha * newValue + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Median of a numeric array. Returns null for an empty array. Non-mutating. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] as number;
  }
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Population standard deviation. Returns 0 for fewer than two values. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Rolling window that reports its running median — robust to single-frame
 * spikes. Keeps at most `size` most-recent samples.
 */
export class RollingMedian {
  private readonly buffer: number[] = [];

  constructor(private readonly size: number = 5) {
    if (size < 1) throw new RangeError(`window size must be >= 1, got ${size}`);
  }

  push(value: number): number {
    this.buffer.push(value);
    if (this.buffer.length > this.size) this.buffer.shift();
    // Non-null: buffer has at least the value we just pushed.
    return median(this.buffer) as number;
  }

  get current(): number | null {
    return median(this.buffer);
  }

  reset(): void {
    this.buffer.length = 0;
  }
}

/**
 * Reject a sample that sits more than `maxDeviations` population-std-devs away
 * from the window mean. Returns true when the value should be KEPT.
 * A window with fewer than two samples always keeps the value.
 */
export function isInlier(
  value: number,
  window: readonly number[],
  maxDeviations = 3,
): boolean {
  if (window.length < 2) return true;
  const mean = window.reduce((s, v) => s + v, 0) / window.length;
  const sd = standardDeviation(window);
  if (sd === 0) return true;
  return Math.abs(value - mean) <= maxDeviations * sd;
}

/**
 * Two-threshold (Schmitt-trigger) gate that prevents rapid flapping between
 * states. Enters the "high" state only above `enter`, and returns to "low" only
 * below `exit` (with `exit < enter`). See spec: enter poor >0.60, exit <0.40.
 */
export class Hysteresis {
  private high = false;

  constructor(
    private readonly enter: number,
    private readonly exit: number,
  ) {
    if (exit >= enter) {
      throw new RangeError(
        `hysteresis exit (${exit}) must be below enter (${enter})`,
      );
    }
  }

  /** Update with a new value; returns the current latched high/low state. */
  update(value: number): boolean {
    if (this.high) {
      if (value < this.exit) this.high = false;
    } else if (value > this.enter) {
      this.high = true;
    }
    return this.high;
  }

  get isHigh(): boolean {
    return this.high;
  }

  reset(): void {
    this.high = false;
  }
}
