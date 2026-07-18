import { describe, it, expect } from "vitest";
import {
  PostureStateMachine,
  type PostureMachineConfig,
  type PostureInput,
} from "../src/posture/postureStateMachine";

// Fast config so tests run in a handful of synthetic frames.
const CFG: PostureMachineConfig = {
  driftThreshold: 0.35,
  enterPoor: 0.6,
  exitPoor: 0.4,
  driftSustainMs: 1000,
  poorPersistenceMs: 3000,
  cooldownMs: 10_000,
  resetSustainMs: 2000,
  awayGraceMs: 2000,
};

interface Frame {
  score?: number;
  usable?: boolean;
  present?: boolean;
  paused?: boolean;
}

/** Drive the machine over `count` frames spaced `dt` ms apart; return notify count + last state. */
function run(
  machine: PostureStateMachine,
  frame: Frame,
  count: number,
  dt: number,
  startMs: number,
): { notifies: number; lastState: string; endMs: number } {
  let notifies = 0;
  let t = startMs;
  let lastState = machine.current;
  for (let i = 0; i < count; i++) {
    const input: PostureInput = {
      nowMs: t,
      smoothedScore: frame.score ?? 0.1,
      usable: frame.usable ?? true,
      present: frame.present ?? true,
      paused: frame.paused ?? false,
    };
    const step = machine.update(input);
    if (step.notify) notifies++;
    lastState = step.state;
    t += dt;
  }
  return { notifies, lastState, endMs: t };
}

describe("PostureStateMachine", () => {
  it("does not notify on a single poor frame", () => {
    const m = new PostureStateMachine(CFG);
    const step = m.update({
      nowMs: 0,
      smoothedScore: 0.8,
      usable: true,
      present: true,
      paused: false,
    });
    expect(step.notify).toBe(false);
    expect(step.state).toBe("poor_candidate");
  });

  it("notifies exactly once after poor posture is sustained", () => {
    const m = new PostureStateMachine(CFG);
    const { notifies } = run(m, { score: 0.8 }, 12, 500, 0);
    expect(notifies).toBe(1);
  });

  it("keeps the cooldown state and does not re-notify within the window", () => {
    const m = new PostureStateMachine(CFG);
    // ~6s of sustained poor: notify once, then remain in cooldown.
    const { notifies, lastState } = run(m, { score: 0.8 }, 13, 500, 0);
    expect(notifies).toBe(1);
    expect(lastState).toBe("cooldown");
  });

  it("re-arms after good posture resets, then notifies again past cooldown", () => {
    const m = new PostureStateMachine(CFG);
    const a = run(m, { score: 0.8 }, 10, 500, 0); // notify #1
    expect(a.notifies).toBe(1);
    // Good long enough to reset AND to outlast the 10s cooldown.
    const b = run(m, { score: 0.1 }, 30, 500, a.endMs);
    expect(b.notifies).toBe(0);
    expect(b.lastState).toBe("good");
    // New sustained poor episode → notify #2.
    const c = run(m, { score: 0.8 }, 12, 500, b.endMs);
    expect(c.notifies).toBe(1);
  });

  it("low confidence pauses evaluation (no persistence accrues, no notify)", () => {
    const m = new PostureStateMachine(CFG);
    // Long span of poor-but-unusable frames must never confirm.
    const { notifies, lastState } = run(
      m,
      { score: 0.9, usable: false },
      40,
      500,
      0,
    );
    expect(notifies).toBe(0);
    expect(lastState).toBe("low_confidence");
  });

  it("goes away after sustained absence and paused when paused", () => {
    const away = new PostureStateMachine(CFG);
    const r = run(away, { present: false }, 10, 500, 0);
    expect(r.lastState).toBe("away");

    const paused = new PostureStateMachine(CFG);
    const p = paused.update({
      nowMs: 0,
      smoothedScore: 0.9,
      usable: true,
      present: true,
      paused: true,
    });
    expect(p.state).toBe("paused");
    expect(p.notify).toBe(false);
  });

  it("shows drifting only after drift is sustained", () => {
    const m = new PostureStateMachine(CFG);
    const first = m.update({
      nowMs: 0,
      smoothedScore: 0.45,
      usable: true,
      present: true,
      paused: false,
    });
    expect(first.state).toBe("good"); // not yet sustained
    const { lastState } = run(m, { score: 0.45 }, 6, 500, 500);
    expect(lastState).toBe("drifting");
  });
});

describe("acknowledge (I fixed my posture)", () => {
  it("ends the episode immediately; a continued slouch must re-earn the alert", () => {
    const m = new PostureStateMachine({
      driftThreshold: 0.35,
      enterPoor: 0.6,
      exitPoor: 0.4,
      driftSustainMs: 500,
      poorPersistenceMs: 1000,
      cooldownMs: 10_000,
      resetSustainMs: 1000,
      awayGraceMs: 2000,
    });
    let t = 0;
    const step = (score: number) =>
      m.update({
        nowMs: (t += 200),
        smoothedScore: score,
        usable: true,
        present: true,
        paused: false,
      });
    for (let i = 0; i < 10; i++) step(0.9);
    expect(["poor_confirmed", "cooldown"]).toContain(m.current);

    m.acknowledge();
    expect(m.current).toBe("good");

    // Still slouching: back to candidate, confirmed only after persistence.
    const s1 = step(0.9);
    expect(s1.state).toBe("poor_candidate");
    for (let i = 0; i < 6; i++) step(0.9);
    expect(["poor_confirmed", "cooldown"]).toContain(m.current);
  });
});
