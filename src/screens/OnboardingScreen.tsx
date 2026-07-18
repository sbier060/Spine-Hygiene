/**
 * Onboarding: privacy → profile (name + focus) → camera permission → placement.
 * Kept as one screen with steps driven by app phase. The user must acknowledge
 * the privacy notice before any camera access is requested; the profile step
 * personalizes the spoken coach ("Alek, you're slouching").
 */
import { useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { CameraManager } from "../camera/cameraManager";
import { CameraPreview } from "../components/CameraPreview";
import { Logo } from "../components/Logo";
import { SettingsRepository } from "../storage/settingsRepository";
import {
  PlacementFeedback,
  evaluatePlacement,
} from "../components/PlacementFeedback";

const PRIVACY_COPY =
  "Spine-IQ analyzes posture directly on this computer. Camera images are not uploaded, recorded, or saved.";

/** Behavioral focus options — wellness language only, never medical. */
const FOCUS_OPTIONS: readonly { key: string; label: string }[] = [
  { key: "slouching", label: "Slouching at my desk" },
  { key: "screen-lean", label: "Drifting toward the screen" },
  { key: "shoulders", label: "Rounded shoulders" },
  { key: "long-sitting", label: "Sitting too long" },
];

export function OnboardingScreen({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
}): JSX.Element {
  const { state, dispatch } = useAppContext();
  const [requesting, setRequesting] = useState(false);
  const settingsRef = useRef<SettingsRepository | null>(null);
  settingsRef.current ??= new SettingsRepository();
  const [name, setName] = useState("");
  const [motivation, setMotivation] = useState("");
  const [focus, setFocus] = useState<readonly string[]>([]);

  if (state.phase === "privacy") {
    return (
      <section className="screen onboarding">
        <Logo size={30} />
        <h1>Your posture coach, in the menu bar</h1>
        <p className="privacy">{PRIVACY_COPY}</p>
        <button
          className="primary"
          onClick={() => dispatch({ type: "set_phase", phase: "profile" })}
        >
          Continue
        </button>
      </section>
    );
  }

  if (state.phase === "profile") {
    const toggleFocus = (key: string): void => {
      setFocus((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));
    };
    const saveProfile = (): void => {
      settingsRef.current?.update({
        userName: name.trim(),
        motivation: motivation.trim(),
        focusAreas: focus,
      });
      dispatch({ type: "set_phase", phase: "camera" });
    };
    return (
      <section className="screen onboarding">
        <h1>Make it yours</h1>
        <p>
          Spine-IQ speaks up when you slouch — telling it your name makes the
          nudge personal.
        </p>
        <label className="field">
          <span className="field-label">Your first name</span>
          <input
            type="text"
            value={name}
            placeholder="e.g. Alek"
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="field">
          <span className="field-label">What are you working on?</span>
          <div className="chip-row">
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`chip-option${focus.includes(opt.key) ? " selected" : ""}`}
                aria-pressed={focus.includes(opt.key)}
                onClick={() => toggleFocus(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">Why does it matter to you? (optional)</span>
          <input
            type="text"
            value={motivation}
            placeholder="e.g. You want to be pain-free at your desk."
            onChange={(e) => setMotivation(e.target.value)}
          />
          <span className="hint">
            Spoken back to you when you slouch — write it as a reminder to
            yourself.
          </span>
        </label>
        <button className="primary" onClick={saveProfile}>
          {name.trim() ? `Let's go, ${name.trim()}` : "Continue"}
        </button>
      </section>
    );
  }

  if (state.phase === "camera") {
    const denied = state.cameraPermission === "denied";
    const requestCamera = async (): Promise<void> => {
      setRequesting(true);
      // Prompt for permission with a throwaway manager, then hand the camera to
      // the pose loop by advancing to placement.
      const probe = new CameraManager();
      const result = await probe.start();
      setRequesting(false);
      if (result.ok) {
        probe.stop();
        dispatch({ type: "set_permission", permission: "granted" });
        dispatch({ type: "set_phase", phase: "placement" });
      } else {
        dispatch({ type: "set_permission", permission: "denied" });
        dispatch({ type: "set_error", error: result.error });
      }
    };

    return (
      <section className="screen onboarding">
        <h1>Enable your camera</h1>
        <p>
          Spine-IQ needs your camera to read posture. Nothing leaves this
          computer.
        </p>
        {denied && state.error && (
          <div className="error-box">
            <p>{state.error.message}</p>
            <p className="hint">
              Grant access in System Settings › Privacy &amp; Security › Camera,
              then try again.
            </p>
          </div>
        )}
        <button
          className="primary"
          disabled={requesting}
          onClick={() => void requestCamera()}
        >
          {requesting ? "Requesting…" : denied ? "Try again" : "Enable camera"}
        </button>
      </section>
    );
  }

  // placement
  const reading = state.latest;
  const checks = reading
    ? evaluatePlacement(reading.landmarks, reading.quality)
    : [];
  const allGood = checks.length > 0 && checks.every((c) => c.ok);

  return (
    <section className="screen onboarding placement">
      <h1>Position your camera</h1>
      <CameraPreview
        videoRef={videoRef}
        landmarks={reading?.landmarks ?? []}
      />
      {reading ? (
        <PlacementFeedback checks={checks} />
      ) : (
        <p className="hint">Starting camera…</p>
      )}
      <button
        className="primary"
        disabled={!allGood}
        onClick={() => dispatch({ type: "set_phase", phase: "calibrate" })}
      >
        {allGood ? "Looks good — continue" : "Adjust to continue"}
      </button>
    </section>
  );
}
