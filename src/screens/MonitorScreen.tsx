/**
 * Monitoring screen — the compact status view shown when Spine-IQ is actively
 * monitoring (the tray is the primary surface; this window is the "dashboard"
 * opened from it). Shows current posture state, pause controls, and — in
 * developer mode — the live scheduler mode, score, and inference time.
 */
import { useAppContext } from "../app/AppProvider";
import { postureLabel, positionLabel, formatDuration } from "../tray/trayState";

const PAUSE_OPTIONS = [15, 30, 60] as const;

function fmt(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined ? "—" : v.toFixed(digits);
}

export function MonitorScreen(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const monitor = state.monitor;
  const status = state.monitoringStatus;
  const paused = status.kind === "paused";
  const label = monitor ? postureLabel(monitor.state) : "Starting…";

  const pauseFor = (minutes: number): void => {
    dispatch({
      type: "pause_monitoring",
      untilMs: Date.now() + minutes * 60_000,
    });
  };

  return (
    <section className="screen monitor">
      <header className="sandbox-header">
        <h1>Monitoring</h1>
        <div className="header-actions">
          <button
            className="ghost"
            onClick={() => dispatch({ type: "set_phase", phase: "dashboard" })}
          >
            Dashboard
          </button>
          <button
            className="ghost"
            onClick={() => dispatch({ type: "set_phase", phase: "sandbox" })}
          >
            Sandbox
          </button>
        </div>
      </header>

      <div className={`band band-${monitor?.state ?? "good"}`}>{label}</div>

      <div className="meta-row">
        <span>{paused ? "Paused" : "Active"}</span>
        {monitor && (
          <span>
            {positionLabel((monitor.position) ?? "unknown")} ·{" "}
            {formatDuration(monitor.durations.currentMs)}
          </span>
        )}
      </div>

      {monitor && (
        <div className="meta-row">
          <span>Today sitting: {formatDuration(monitor.durations.totalSittingMs)}</span>
          <span>standing: {formatDuration(monitor.durations.totalStandingMs)}</span>
        </div>
      )}

      <div className="pause-controls">
        <button onClick={() => dispatch({ type: "mark_position", position: "sitting" })}>
          I’m sitting
        </button>
        <button onClick={() => dispatch({ type: "mark_position", position: "standing" })}>
          I’m standing
        </button>
      </div>

      <div className="pause-controls">
        {paused ? (
          <button
            className="primary"
            onClick={() => dispatch({ type: "resume_monitoring" })}
          >
            Resume monitoring
          </button>
        ) : (
          PAUSE_OPTIONS.map((m) => (
            <button key={m} onClick={() => pauseFor(m)}>
              Pause {m}m
            </button>
          ))
        )}
      </div>

      <button
        className="ghost"
        onClick={() => dispatch({ type: "toggle_dev" })}
      >
        {state.devMode ? "Hide" : "Show"} developer details
      </button>

      {state.devMode && monitor && (
        <table className="feature-table">
          <tbody>
            <tr>
              <td>State</td>
              <td>{monitor.state}</td>
            </tr>
            <tr>
              <td>Scheduler mode</td>
              <td>{monitor.mode}</td>
            </tr>
            <tr>
              <td>Smoothed score</td>
              <td>{fmt(monitor.smoothedScore)}</td>
            </tr>
            <tr>
              <td>Next inference</td>
              <td>
                {monitor.nextIntervalMs === null
                  ? "stopped"
                  : `${String(monitor.nextIntervalMs)} ms`}
              </td>
            </tr>
            <tr>
              <td>Inference time</td>
              <td>{fmt(monitor.inferenceMs, 1)} ms</td>
            </tr>
            <tr>
              <td>Present</td>
              <td>{monitor.present ? "yes" : "no"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
