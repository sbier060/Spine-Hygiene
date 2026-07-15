/**
 * App shell. Owns the single hidden capture <video> and the pose loop, and
 * renders the phase router. The loop runs once the user reaches placement and
 * keeps the camera + model alive across the remaining onboarding steps.
 */
import { useEffect, useRef } from "react";
import { AppProvider, useAppContext } from "./app/AppProvider";
import { AppRouter } from "./app/router";
import { usePoseLoop } from "./hooks/usePoseLoop";
import { useMonitoring } from "./hooks/useMonitoring";
import { listenTrayCommands } from "./tray/trayCommands";
import { SettingsRepository } from "./storage/settingsRepository";
import {
  machineConfigFromSettings,
  scoreOptionsFromSettings,
} from "./monitoring/monitoringConfig";

function AppShell(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const videoRef = useRef<HTMLVideoElement>(null);

  // The sandbox loop needs the camera during placement, calibration, and sandbox.
  const running =
    state.phase === "placement" ||
    state.phase === "calibrate" ||
    state.phase === "calibrate_standing" ||
    state.phase === "sandbox";

  const cameraInfoRef = usePoseLoop(
    videoRef,
    running,
    state.baseline,
    dispatch,
  );

  // The adaptive background monitor runs during the monitor phase. Its tuning
  // (sensitivity, poor-posture persistence) comes from saved settings.
  const settingsRef = useRef<SettingsRepository | null>(null);
  settingsRef.current ??= new SettingsRepository();
  const monitoringOptionsRef = useRef<{
    machineConfig: ReturnType<typeof machineConfigFromSettings>;
    scoreOptions: ReturnType<typeof scoreOptionsFromSettings>;
  } | null>(null);
  if (!monitoringOptionsRef.current) {
    const settings = settingsRef.current.load();
    monitoringOptionsRef.current = {
      machineConfig: machineConfigFromSettings(settings),
      scoreOptions: scoreOptionsFromSettings(settings),
    };
  }

  const monitoring = state.phase === "monitor";
  const paused = state.monitoringStatus.kind === "paused";
  useMonitoring(
    videoRef,
    monitoring,
    paused,
    {
      posture: state.baseline,
      positionSitting: state.positionBaselineSitting,
      positionStanding: state.positionBaselineStanding,
    },
    state.manualMark,
    dispatch,
    monitoringOptionsRef.current,
  );

  // Auto-resume when a timed pause elapses.
  useEffect(() => {
    if (state.monitoringStatus.kind !== "paused") return;
    const untilMs = state.monitoringStatus.untilMs;
    if (untilMs === null) return;
    const remaining = untilMs - Date.now();
    if (remaining <= 0) {
      dispatch({ type: "resume_monitoring" });
      return;
    }
    const t = setTimeout(() => dispatch({ type: "resume_monitoring" }), remaining);
    return () => clearTimeout(t);
  }, [state.monitoringStatus, dispatch]);

  // Handle native tray menu commands (pause/resume/open dashboard).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenTrayCommands((command) => {
      switch (command.kind) {
        case "pause":
          dispatch({
            type: "pause_monitoring",
            untilMs: Date.now() + command.minutes * 60_000,
          });
          break;
        case "resume":
          dispatch({ type: "resume_monitoring" });
          break;
        case "open_dashboard":
          dispatch({ type: "set_phase", phase: "monitor" });
          break;
        case "mark_sitting":
          dispatch({ type: "mark_position", position: "sitting" });
          break;
        case "mark_standing":
          dispatch({ type: "mark_position", position: "standing" });
          break;
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [dispatch]);

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
