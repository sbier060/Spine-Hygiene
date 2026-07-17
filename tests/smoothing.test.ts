import { describe, it, expect } from "vitest";
import {
  ExponentialMovingAverage,
  RollingMedian,
  Hysteresis,
  median,
  standardDeviation,
  isInlier,
} from "../src/pose/smoothing";

describe("ExponentialMovingAverage", () => {
  it("returns the first value verbatim, then converges toward a constant", () => {
    const ema = new ExponentialMovingAverage(0.2);
    expect(ema.push(1)).toBe(1);
    let v = ema.push(0);
    for (let i = 0; i < 200; i++) v = ema.push(0);
    expect(v).toBeCloseTo(0, 3);
  });

  it("rejects an out-of-range alpha", () => {
    expect(() => new ExponentialMovingAverage(0)).toThrow();
    expect(() => new ExponentialMovingAverage(1.5)).toThrow();
  });

  it("weighs a sample by elapsed time: one 1500ms gap ≈ three 500ms samples", () => {
    const slow = new ExponentialMovingAverage(0.2);
    slow.push(0);
    const afterGap = slow.push(1, 1500);

    const fast = new ExponentialMovingAverage(0.2);
    fast.push(0);
    fast.push(1, 500);
    fast.push(1, 500);
    const afterThree = fast.push(1, 500);

    expect(afterGap).toBeCloseTo(afterThree, 10);
    // And a 500ms elapsed sample behaves exactly like the plain alpha blend.
    const plain = new ExponentialMovingAverage(0.2);
    plain.push(0);
    expect(plain.push(1, 500)).toBeCloseTo(0.2, 10);
  });
});

describe("median / standardDeviation", () => {
  it("computes odd and even medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("computes population standard deviation", () => {
    expect(standardDeviation([2, 2, 2])).toBe(0);
    expect(standardDeviation([1, 3])).toBeCloseTo(1, 5);
  });
});

describe("RollingMedian", () => {
  it("is robust to a single spike", () => {
    const rm = new RollingMedian(5);
    rm.push(1);
    rm.push(1);
    rm.push(1);
    rm.push(1);
    expect(rm.push(100)).toBe(1); // spike doesn't move the median
  });
});

describe("isInlier", () => {
  it("keeps normal values and rejects extreme outliers", () => {
    const window = [1, 1.1, 0.9, 1.05, 0.95];
    expect(isInlier(1.02, window)).toBe(true);
    expect(isInlier(50, window)).toBe(false);
  });
});

describe("Hysteresis", () => {
  it("latches high above enter and only releases below exit", () => {
    const h = new Hysteresis(0.6, 0.4);
    expect(h.update(0.5)).toBe(false); // between thresholds, starts low
    expect(h.update(0.65)).toBe(true); // crosses enter → high
    expect(h.update(0.5)).toBe(true); // between thresholds → stays high
    expect(h.update(0.39)).toBe(false); // below exit → low
  });

  it("rejects exit >= enter", () => {
    expect(() => new Hysteresis(0.4, 0.6)).toThrow();
  });
});
