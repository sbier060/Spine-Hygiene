/**
 * Onboarding: privacy → camera permission → placement. Kept as one screen with
 * three steps driven by app phase. The user must acknowledge the privacy notice
 * before any camera access is requested.
 */
import { useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { CameraManager } from "../camera/cameraManager";
import { CameraPreview } from "../components/CameraPreview";
import {
  PlacementFeedback,
  evaluatePlacement,
} from "../components/PlacementFeedback";

const PRIVACY_COPY =
  "Spine-IQ analyzes posture directly on this computer. Camera images are not uploaded, recorded, or saved.";

export function OnboardingScreen({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
}): JSX.Element {
  const { state, dispatch } = useAppContext();
  const [requesting, setRequesting] = useState(false);

  if (state.phase === "privacy") {
    return (
      <section className="screen onboarding">
        <h1>Welcome to Spine-IQ</h1>
        <p className="privacy">{PRIVACY_COPY}</p>
        <button
          className="primary"
          onClick={() => dispatch({ type: "set_phase", phase: "camera" })}
        >
          Continue
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
