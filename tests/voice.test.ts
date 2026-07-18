import { describe, it, expect } from "vitest";
import {
  slouchLine,
  greetingLine,
  shouldGreetToday,
  markGreeted,
  type GreetingStore,
} from "../src/audio/voice";

const profile = (over: Partial<Parameters<typeof slouchLine>[0]> = {}) => ({
  userName: "Alek",
  motivation: "You want to be able to pick up Jack when you're older.",
  focusAreas: [] as readonly string[],
  ...over,
});

function memStore(): GreetingStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
  };
}

describe("slouchLine", () => {
  it("says the user's name and rotates deterministically", () => {
    expect(slouchLine(profile(), 0)).toBe("Alek, you're slouching.");
    expect(slouchLine(profile(), 1)).toBe(
      "Alek, sit up. You want to be able to pick up Jack when you're older.",
    );
    expect(slouchLine(profile(), 4)).toBe(slouchLine(profile(), 0));
  });

  it("speaks naturally without a name", () => {
    expect(slouchLine(profile({ userName: "" }), 0)).toBe("You're slouching.");
  });

  it("falls back to a generic line when no motivation is set", () => {
    expect(slouchLine(profile({ motivation: "  " }), 1)).toBe(
      "Alek, sit up straight.",
    );
  });

  it("uses a focus-area nudge when one is chosen", () => {
    expect(slouchLine(profile({ focusAreas: ["screen-lean"] }), 2)).toContain(
      "drifting toward the screen",
    );
    expect(slouchLine(profile({ focusAreas: ["shoulders"] }), 2)).toContain(
      "shoulders back",
    );
  });
});

describe("greetingLine", () => {
  it("matches the clock and includes the name", () => {
    expect(greetingLine({ userName: "Alek" }, 8)).toBe(
      "Good morning Alek. I've got your back. Sit tall today.",
    );
    expect(greetingLine({ userName: "" }, 14)).toBe(
      "Good afternoon. I've got your back. Sit tall today.",
    );
    expect(greetingLine({ userName: "Alek" }, 20)).toContain("Good evening");
  });
});

describe("shouldGreetToday", () => {
  it("greets once per local calendar day", () => {
    const store = memStore();
    const morning = new Date(2026, 6, 18, 8).getTime();
    expect(shouldGreetToday(store, morning)).toBe(true);
    markGreeted(store, morning);
    const evening = new Date(2026, 6, 18, 20).getTime();
    expect(shouldGreetToday(store, evening)).toBe(false);
    const nextMorning = new Date(2026, 6, 19, 8).getTime();
    expect(shouldGreetToday(store, nextMorning)).toBe(true);
  });
});
