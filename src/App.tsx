/**
 * App shell. Owns the single hidden capture <video> and the pose loop, and
 * renders the phase router. The loop runs once the user reaches placement and
 * keeps the camera + model alive across the remaining onboarding steps.
 */
import { useRef } from "react";
import { AppProvider, useAppContext } from "./app/AppProvider";
import { AppRouter } from "./app/router";
import { usePoseLoop } from "./hooks/usePoseLoop";

function AppShell(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const videoRef = useRef<HTMLVideoElement>(null);

  // The loop needs the camera during placement, calibration, and the sandbox.
  const running =
    state.phase === "placement" ||
    state.phase === "calibrate" ||
    state.phase === "sandbox";

  const cameraInfoRef = usePoseLoop(
    videoRef,
    running,
    state.baseline,
    dispatch,
  );

  return (
    <main className="app">
      {/* Hidden capture surface — never shown directly; previews mirror it. */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ display: "none" }}
      />

      {state.error && state.phase === "sandbox" && (
        <div className="error-banner" role="alert">
          {state.error.message}
        </div>
      )}

      <AppRouter videoRef={videoRef} cameraInfoRef={cameraInfoRef} />
    </main>
  );
}

export default function App(): JSX.Element {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
