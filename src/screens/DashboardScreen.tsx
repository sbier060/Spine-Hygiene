/**
 * Dashboard — today's derived stats + a timeline of position changes, with
 * delete/export controls. Reads the HistoryStore (in-memory everywhere, SQLite in
 * the native app). Not a medical health score — just behavioral summaries.
 */
import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { useHistory } from "../app/HistoryProvider";
import { postureLabel, positionLabel, formatDuration } from "../tray/trayState";
import type { DayStats } from "../storage/dashboardMetrics";
import type { PositionEventRow } from "../storage/schema";

const fmtSecs = (s: number): string => formatDuration(s * 1000);
const fmtPct = (v: number | null): string =>
  v === null ? "—" : `${Math.round(v * 100)}%`;
const fmtTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function DashboardScreen(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const history = useHistory();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [timeline, setTimeline] = useState<PositionEventRow[]>([]);

  const reload = useCallback(() => {
    const now = Date.now();
    void history.loadTodayStats(now).then(setStats);
    void history.loadTimeline(now).then(setTimeline);
  }, [history]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  const exportSummary = (): void => {
    void history.exportSummary(Date.now()).then((json) => {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "spine-iq-summary.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const monitor = state.monitor;

  return (
    <section className="screen dashboard">
      <header className="sandbox-header">
        <h1>Today</h1>
        <button
          className="ghost"
          onClick={() =>
            dispatch({
              type: "set_phase",
              phase: state.monitoringStatus.kind === "stopped" ? "sandbox" : "monitor",
            })
          }
        >
          Back
        </button>
      </header>

      {monitor && (
        <div className="meta-row">
          <span>
            Now: {postureLabel(monitor.state)} ·{" "}
            {positionLabel(monitor.position)}
          </span>
          <span>{formatDuration(monitor.durations.currentMs)} in position</span>
        </div>
      )}

      <div className="stat-grid">
        <Stat label="Sitting" value={fmtSecs(stats?.sittingSeconds ?? 0)} />
        <Stat label="Standing" value={fmtSecs(stats?.standingSeconds ?? 0)} />
        <Stat label="Away" value={fmtSecs(stats?.awaySeconds ?? 0)} />
        <Stat label="Longest sit" value={fmtSecs(stats?.longestSittingSeconds ?? 0)} />
        <Stat label="Longest stand" value={fmtSecs(stats?.longestStandingSeconds ?? 0)} />
        <Stat label="Posture reminders" value={String(stats?.postureNotificationCount ?? 0)} />
        <Stat label="Consistency" value={fmtPct(stats?.postureConsistency ?? null)} />
      </div>

      <h2 className="section-title">Position timeline</h2>
      {timeline.length === 0 ? (
        <p className="hint">No position changes recorded yet today.</p>
      ) : (
        <ul className="timeline">
          {timeline.map((e) => (
            <li key={e.id}>
              <span className="timeline-time">{fmtTime(e.created_at)}</span>
              <span>
                {positionLabel(e.previous_position as never)} →{" "}
                {positionLabel(e.new_position as never)}
              </span>
              <span className="hint">{e.source}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="pause-controls">
        <button onClick={exportSummary}>Export summary</button>
        <button
          onClick={() => {
            void history.deleteHistory().then(reload);
          }}
        >
          Delete history
        </button>
        <button
          onClick={() => {
            void history.deleteCalibration();
          }}
        >
          Delete calibration
        </button>
      </div>

      <p className="hint">
        {history.hasDatabase
          ? "History is stored locally on this computer."
          : "History is in-memory this session (SQLite runs in the desktop app)."}{" "}
        Camera images are never stored.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
