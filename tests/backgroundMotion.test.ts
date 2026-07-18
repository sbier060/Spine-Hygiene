import { describe, it, expect } from "vitest";
import {
  computeBackgroundMotion,
  type GrayFrame,
} from "../src/position/backgroundMotion";

const W = 160;
const H = 120;

/** Deterministic textured image via a seeded LCG. */
function texturedFrame(seed = 7): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H);
  let s = seed;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  return data;
}

function frame(data: Uint8ClampedArray): GrayFrame {
  return { data, width: W, height: H };
}

/** Shift image content by (dx, dy); vacated pixels copy the source edge. */
function shifted(src: Uint8ClampedArray, dx: number, dy: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.min(W - 1, Math.max(0, x - dx));
      const sy = Math.min(H - 1, Math.max(0, y - dy));
      out[y * W + x] = src[sy * W + sx] as number;
    }
  }
  return out;
}

describe("computeBackgroundMotion", () => {
  const base = texturedFrame();

  it("reports stability when nothing moves", () => {
    const m = computeBackgroundMotion(frame(base), frame(base), null);
    expect(m.validPointCount).toBeGreaterThan(12);
    expect(m.medianDeltaY).toBe(0);
    expect(m.backgroundStable).toBe(true);
    expect(m.likelyCameraMotion).toBe(false);
  });

  it("detects coherent downward shift (desk rising signature)", () => {
    const m = computeBackgroundMotion(frame(base), frame(shifted(base, 0, 4)), null);
    expect(m.medianDeltaY).toBeCloseTo(4, 0);
    expect(m.verticalCoherence).toBeGreaterThan(0.6);
    expect(m.likelyCameraMotion).toBe(true);
    expect(m.backgroundStable).toBe(false);
  });

  it("detects coherent upward shift with negative deltaY", () => {
    const m = computeBackgroundMotion(frame(base), frame(shifted(base, 0, -5)), null);
    expect(m.medianDeltaY).toBeCloseTo(-5, 0);
    expect(m.likelyCameraMotion).toBe(true);
  });

  it("rejects horizontal panning as camera/desk motion", () => {
    const m = computeBackgroundMotion(frame(base), frame(shifted(base, 6, 0)), null);
    expect(Math.abs(m.medianDeltaX)).toBeGreaterThan(3);
    expect(m.likelyCameraMotion).toBe(false);
  });

  it("still works with a central person-exclusion region", () => {
    const m = computeBackgroundMotion(
      frame(base),
      frame(shifted(base, 0, 4)),
      { x: 0.3, y: 0.2, width: 0.4, height: 0.8 },
    );
    expect(m.validPointCount).toBeGreaterThanOrEqual(12);
    expect(m.medianDeltaY).toBeCloseTo(4, 0);
    expect(m.likelyCameraMotion).toBe(true);
  });

  it("reports incoherence for uncorrelated noise", () => {
    const m = computeBackgroundMotion(frame(base), frame(texturedFrame(99)), null);
    expect(m.likelyCameraMotion).toBe(false);
  });
});

describe("real camera geometry (160×90 with a centered person)", () => {
  const RW = 160;
  const RH = 90;
  function texturedSmall(seed = 3): { data: Uint8ClampedArray; width: number; height: number } {
    const data = new Uint8ClampedArray(RW * RH);
    let s = seed;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = Math.floor((s / 0xffffffff) * 256);
    }
    return { data, width: RW, height: RH };
  }
  function shiftedSmall(src: Uint8ClampedArray, dy: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(RW * RH);
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const sy = Math.min(RH - 1, Math.max(0, y - dy));
        out[y * RW + x] = src[sy * RW + x] as number;
      }
    }
    return { data: out, width: RW, height: RH };
  }

  it("keeps enough tracked points to detect motion around a person", () => {
    const prev = texturedSmall();
    const cur = shiftedSmall(prev.data, 5);
    // Person occupies the central 40% of the frame down to the bottom.
    const m = computeBackgroundMotion(prev, cur, {
      x: 0.3,
      y: 0.1,
      width: 0.4,
      height: 0.9,
    });
    expect(m.validPointCount).toBeGreaterThanOrEqual(12);
    expect(m.medianDeltaY).toBeCloseTo(5, 0);
    expect(m.likelyCameraMotion).toBe(true);
  });
});
