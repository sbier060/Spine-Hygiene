/**
 * App shell. Owns the single hidden capture <video> and the pose loop, and
 * renders the phase router. The loop runs once the user reaches placement and
 * keeps the camera + model alive across the remaining onboarding steps.
 */
import { useEffect, useRef } from "react";
import { AppProvider, useAppContext } from "./app/AppProvider";
import { HistoryProvider, useHistory } from "./app/HistoryProvider";
import { AppRouter } from "./app/router";
import { usePoseLoop } from "./hooks/usePoseLoop";
import { useMonitoring } from "./hooks/useMonitoring";
import { listenTrayCommands } from "./tray/trayCommands";
import { SettingsRepository } from "./storage/settingsRepository";
import { machineConfigFromSettings } from "./monitoring/monitoringConfig";

function AppShell(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const history = useHistory();
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
    state.postureSaturation,
    dispatch,
  );

  // Monitor tuning: persistence/cooldown come from saved settings (loaded once);
  // the posture saturation is live from state (two-point training updates it).
  const settingsRef = useRef<SettingsRepository | null>(null);
  settingsRef.current ??= new SettingsRepository();
  const machineConfigRef = useRef<ReturnType<
    typeof machineConfigFromSettings
  > | null>(null);
  machineConfigRef.current ??= machineConfigFromSettings(
    settingsRef.current.load(),
  );

  // Initialize the live saturation from saved settings once.
  const saturationInited = useRef(false);
  useEffect(() => {
    if (saturationInited.current) return;
    saturationInited.current = true;
    dispatch({
      type: "set_saturation",
      value: settingsRef.current?.load().deviationSaturation ?? 4,
    });
  }, [dispatch]);

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
    history,
    dispatch,
    {
      machineConfig: machineConfigRef.current,
      scoreOptions: { deviationSaturation: state.postureSaturation },
    },
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
          dispatch({ type: "set_phase", phase: "dashboard" });
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
      <HistoryProvider>
        <AppShell />
      </HistoryProvider>
    </AppProvider>
  );
}
