/**
 * Spine-IQ voice. Uses the free system voice on both surfaces: the macOS `say`
 * command in the native app (via the `speak` IPC command) and the Web Speech
 * API as a dev-browser fallback. No cloud TTS — nothing leaves the machine.
 *
 * Line building is pure and unit-tested; speaking is the only effect.
 */
import type { SettingsData } from "../storage/settingsRepository";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Speak a line out loud. Fire-and-forget; failures are silent by design.
 * `voice` is a macOS voice name (e.g. "Ava (Premium)"); empty uses the system
 * default. Premium/Enhanced voices are free downloads in System Settings →
 * Accessibility → Spoken Content → System Voice → Manage Voices.
 */
export async function speak(text: string, voice = ""): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("speak", { text, voice: voice || null });
      return;
    } catch (err) {
      console.error("Spine-IQ: speak failed", err);
      return;
    }
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

/**
 * Voices offered in the picker. All are built into macOS or free downloads;
 * a voice that isn't downloaded simply won't speak until it's installed.
 */
export const VOICE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "System default" },
  { value: "Samantha", label: "Samantha (US)" },
  { value: "Ava (Premium)", label: "Ava — Premium (US)" },
  { value: "Zoe (Premium)", label: "Zoe — Premium (US)" },
  { value: "Evan (Enhanced)", label: "Evan — Enhanced (US)" },
  { value: "Nathan (Enhanced)", label: "Nathan — Enhanced (US)" },
  { value: "Karen (Enhanced)", label: "Karen — Enhanced (AU)" },
  { value: "Daniel (Enhanced)", label: "Daniel — Enhanced (UK)" },
];

/** "Alek, you're slouching." — prefix a name naturally when we have one. */
function withName(name: string, sentence: string): string {
  const trimmed = name.trim();
  if (!trimmed) return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return `${trimmed}, ${sentence}`;
}

/** Focus-area-specific nudge, falling back to a general reset line. */
function focusLine(focusAreas: readonly string[]): string {
  if (focusAreas.includes("screen-lean")) {
    return "your head is drifting toward the screen. Bring it back.";
  }
  if (focusAreas.includes("shoulders")) {
    return "shoulders back and down.";
  }
  return "reset your posture. Tall and relaxed.";
}

/**
 * The rotating spoken slouch alert. Deterministic by `rotation` so tests and
 * playback order are predictable; personalization comes from settings.
 */
export function slouchLine(
  settings: Pick<SettingsData, "userName" | "motivation" | "focusAreas">,
  rotation: number,
): string {
  const name = settings.userName;
  const motivation = settings.motivation.trim();
  const lines: string[] = [
    withName(name, "you're slouching."),
    motivation
      ? withName(name, `sit up. ${motivation}`)
      : withName(name, "sit up straight."),
    withName(name, focusLine(settings.focusAreas)),
    withName(name, "sit back. Long and tall."),
  ];
  const idx = ((Math.trunc(rotation) % lines.length) + lines.length) % lines.length;
  return lines[idx] as string;
}

/** First-open-of-the-day greeting; the salutation follows the clock. */
export function greetingLine(
  settings: Pick<SettingsData, "userName">,
  hour: number,
): string {
  const salutation =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = settings.userName.trim();
  return `${salutation}${name ? ` ${name}` : ""}. I've got your back. Sit tall today.`;
}

const GREETED_KEY = "spine-iq.greeting.last";

/** Local calendar-day key, so the greeting resets at midnight, not per 24h. */
function dayKey(nowMs: number): string {
  const d = new Date(nowMs);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1)}-${String(d.getDate())}`;
}

export interface GreetingStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** True when today's greeting hasn't played yet. */
export function shouldGreetToday(store: GreetingStore, nowMs: number): boolean {
  return store.getItem(GREETED_KEY) !== dayKey(nowMs);
}

export function markGreeted(store: GreetingStore, nowMs: number): void {
  store.setItem(GREETED_KEY, dayKey(nowMs));
}
