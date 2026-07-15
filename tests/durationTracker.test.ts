import { describe, it, expect } from "vitest";
import {
  DurationTracker,
  type DurationConfig,
} from "../src/position/durationTracker";

const FAST: DurationConfig = {
  sittingReminderMs: 3000,
  standingReminderMs: 3000,
  reminderCooldownMs: 5000,
  sittingEnabled: true,
  standingEnabled: true,
};

describe("DurationTracker", () => {
  it("increases sitting duration over time", () => {
    const t = new DurationTracker(FAST);
    t.update(0, "sitting");
    t.update(1000, "sitting");
    const snap = t.update(2000, "sitting").snapshot;
    expect(snap.currentMs).toBe(2000);
    expect(snap.totalSittingMs).toBe(2000);
  });

  it("does not count away time as sitting", () => {
    const t = new DurationTracker(FAST);
    t.update(0, "sitting");
    t.update(1000, "sitting"); // +1000 sitting
    t.update(2000, "away"); // +1000 sitting, then switch to away
    const snap = t.update(5000, "away").snapshot; // +3000 away
    expect(snap.totalSittingMs).toBe(2000);
    expect(snap.totalAwayMs).toBe(3000);
    expect(snap.position).toBe("away");
  });

  it("resets the continuous timer on a position change", () => {
    const t = new DurationTracker(FAST);
    t.update(0, "sitting");
    t.update(4000, "sitting"); // currentMs 4000
    const changed = t.update(5000, "standing"); // +1000 sitting, switch
    expect(changed.snapshot.currentMs).toBe(0);
    expect(changed.snapshot.positionChanges).toBe(2); // unknown→sitting, sitting→standing
    expect(changed.snapshot.longestSittingMs).toBeGreaterThanOrEqual(5000);
  });

  it("fires a sitting reminder once, then respects the cooldown", () => {
    const t = new DurationTracker(FAST);
    let reminders = 0;
    // Sit continuously; threshold 3000, cooldown 5000, dt 1000.
    for (let ms = 0; ms <= 7000; ms += 1000) {
      if (t.update(ms, "sitting").reminder === "sitting") reminders++;
    }
    expect(reminders).toBe(1); // one fire in [3000, 8000)

    // Past the cooldown, still sitting → a second reminder.
    for (let ms = 8000; ms <= 9000; ms += 1000) {
      if (t.update(ms, "sitting").reminder === "sitting") reminders++;
    }
    expect(reminders).toBe(2);
  });
});
