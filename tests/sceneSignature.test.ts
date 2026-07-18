import { describe, it, expect } from "vitest";
import {
  computeSceneDescriptor,
  sceneDistance,
  classifyPlace,
} from "../src/position/sceneSignature";
import type { GrayFrame } from "../src/position/backgroundMotion";

const W = 160;
const H = 90;

/** Deterministic scene with large-scale structure (not just noise). */
function scene(seed: number): GrayFrame {
  const data = new Uint8ClampedArray(W * H);
  let s = seed;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  // Blocky structure: 8×6 regions with distinct base brightness plus noise.
  const bases = Array.from({ length: 48 }, () => Math.floor(rand() * 220));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cell = Math.floor(y / (H / 6)) * 8 + Math.floor(x / (W / 8));
      data[y * W + x] = Math.min(
        255,
        (bases[cell] ?? 0) + Math.floor(rand() * 30),
      );
    }
  }
  return { data, width: W, height: H };
}

/** Same scene, globally brightened (lighting change). */
function brightened(src: GrayFrame, amount: number): GrayFrame {
  const data = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.min(255, (src.data[i] as number) + amount);
  }
  return { data, width: src.width, height: src.height };
}

const PERSON = { x: 0.3, y: 0.2, width: 0.4, height: 0.8 };

describe("sceneSignature", () => {
  it("marks person-occluded cells as null and still describes the scene", () => {
    const d = computeSceneDescriptor(scene(1), PERSON);
    expect(d).not.toBeNull();
    expect(d?.cells.some((c) => c === null)).toBe(true);
    expect(d?.cells.filter((c) => c !== null).length).toBeGreaterThan(24);
  });

  it("same scene under different lighting stays close; different scenes are far", () => {
    const a = scene(1);
    const same = computeSceneDescriptor(a, PERSON);
    const lit = computeSceneDescriptor(brightened(a, 40), PERSON);
    const other = computeSceneDescriptor(scene(77), PERSON);
    const dSame = sceneDistance(same!, lit!);
    const dOther = sceneDistance(same!, other!);
    expect(dSame).not.toBeNull();
    expect(dOther).not.toBeNull();
    expect(dSame!).toBeLessThan(0.3);
    expect(dOther!).toBeGreaterThan(dSame! * 2);
  });

  it("classifies the current scene to the right place", () => {
    const desk = computeSceneDescriptor(scene(1), PERSON)!;
    const couch = computeSceneDescriptor(scene(77), PERSON)!;
    const nowAtCouch = computeSceneDescriptor(brightened(scene(77), 25), PERSON)!;
    const places = [
      { id: 1, descriptor: desk },
      { id: 2, descriptor: couch },
      { id: 3, descriptor: null },
    ];
    expect(classifyPlace(nowAtCouch, places)).toBe(2);
  });

  it("returns null when nothing matches", () => {
    const desk = computeSceneDescriptor(scene(1), PERSON)!;
    const somewhereNew = computeSceneDescriptor(scene(500), PERSON)!;
    expect(classifyPlace(somewhereNew, [{ id: 1, descriptor: desk }])).toBeNull();
  });
});
