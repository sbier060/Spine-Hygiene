/**
 * Dashboard — the home surface of Spine-IQ. Live status chip, today's
 * percent-good-posture ring, the 14-day trend, behavioral stat tiles, the
 * position timeline, and monitoring controls. Reads the HistoryStore
 * (in-memory everywhere, SQLite in the native app). Behavioral summaries only —
 * never a medical score.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { useHistory } from "../app/HistoryProvider";
import {
  SettingsRepository,
  type SettingsData,
} from "../storage/settingsRepository";
import { Logo } from "../components/Logo";
import { PostureRing } from "../components/PostureRing";
import { DailyBars } from "../components/DailyBars";
import { statusHeadline, formatDuration } from "../tray/trayState";
import type { PostureState } from "../posture/postureTypes";
import type { DayStats, DailyStat } from "../storage/dashboardMetrics";
import type { PositionEventRow } from "../storage/schema";

const fmtSecs = (s: number): string => formatDuration(s * 1000);
const fmtTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function chipTone(state: PostureState | undefined, paused: boolean): string {
  if (paused) return "tone-paused";
  switch (state) {
    case "good":
      return "tone-good";
    case "poor_candidate":
    case "poor_confirmed":
    case "cooldown":
      return "tone-alert";
    default:
      return "tone-paused";
  }
}

function heroHeadline(pct: number | null): string {
  if (pct === null) return "Let's build today's picture";
  if (pct >= 0.85) return "Excellent posture today";
  if (pct >= 0.65) return "Solid — keep stacking good minutes";
  if (pct >= 0.4) return "A slouchy day so far";
  return "Rough day for your spine";
}

export function DashboardScreen(): JSX.Element {
  const { state, dispatch } = useAppContext();
  const history = useHistory();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [timeline, setTimeline] = useState<PositionEventRow[]>([]);
  const settingsRepoRef = useRef<SettingsRepository | null>(null);
  settingsRepoRef.current ??= new SettingsRepository();
  const [settings, setSettings] = useState<SettingsData>(() =>
    (settingsRepoRef.current as SettingsRepository).load(),
  );
  const [nameDraft, setNameDraft] = useState("");
  const updateSettings = (patch: Partial<SettingsData>): void => {
    setSettings((settingsRepoRef.current as SettingsRepository).update(patch));
  };

  const reload = useCallback(() => {
    const now = Date.now();
    void history.loadTodayStats(now).then(setStats);
    void history.loadDailyStats(now).then(setDaily);
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
  const status = state.monitoringStatus;
  const running = status.kind === "running";
  const paused = status.kind === "paused";
  const pct = stats?.postureConsistency ?? null;
  const hasTrend = daily.some((d) => d.consistency !== null);

  const chipLabel = !running && !paused
    ? "Not monitoring"
    : paused
      ? "Paused"
      : monitor
        ? statusHeadline(monitor.state, monitor.position)
        : "Starting…";

  return (
    <section className="screen dashboard">
      <header className="hub-header">
        <Logo />
        <div className="header-actions">
          <span className={`live-chip ${chipTone(monitor?.state, paused || !running)}`}>
            <span className="chip-dot" />
            {chipLabel}
          </span>
        </div>
      </header>

      <div className="hero-card">
        <PostureRing pct={pct} />
        <div className="hero-copy">
          <span className="hero-headline">{heroHeadline(pct)}</span>
          <p>
            {stats && stats.goodPostureSeconds + stats.poorPostureSeconds > 0
              ? `${fmtSecs(stats.goodPostureSeconds)} sitting well · ${fmtSecs(stats.poorPostureSeconds)} slouched`
              : "Time in good posture appears here as Spine-IQ watches your day."}
          </p>
          {monitor && running && (
            <p className="hint">
              Now: {statusHeadline(monitor.state, monitor.position)} ·{" "}
              {formatDuration(monitor.durations.currentMs)} in position
            </p>
          )}
        </div>
      </div>

      {!settings.userName && (
        <div className="card name-card">
          <span className="hero-headline">What should I call you?</span>
          <div className="pause-controls">
            <input
              type="text"
              value={nameDraft}
              placeholder="Your first name"
              autoComplete="given-name"
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <button
              className="primary"
              disabled={!nameDraft.trim()}
              onClick={() => updateSettings({ userName: nameDraft.trim() })}
            >
              Save
            </button>
          </div>
          <span className="hint">
            Used by the voice: “{nameDraft.trim() || "Alek"}, you’re slouching.”
          </span>
        </div>
      )}

      <h2 className="section-title">Last 14 days</h2>
      {hasTrend ? (
        <DailyBars data={daily} />
      ) : (
        <p className="hint">
          Your daily percent-good-posture trend will fill in here — one bar per
          day, starting today.
        </p>
      )}

      <h2 className="section-title">Today</h2>
      <div className="stat-grid">
        <Stat label="Sitting" value={fmtSecs(stats?.sittingSeconds ?? 0)} />
        <Stat label="Standing" value={fmtSecs(stats?.standingSeconds ?? 0)} />
        <Stat label="Longest sit" value={fmtSecs(stats?.longestSittingSeconds ?? 0)} />
        <Stat label="Longest stand" value={fmtSecs(stats?.longestStandingSeconds ?? 0)} />
        <Stat label="Away" value={fmtSecs(stats?.awaySeconds ?? 0)} />
        <Stat label="Reminders" value={String(stats?.postureNotificationCount ?? 0)} />
      </div>

      <div className="pause-controls">
        {running ? (
          <button onClick={() => dispatch({ type: "pause_monitoring", untilMs: Date.now() + 30 * 60_000 })}>
            Pause 30m
          </button>
        ) : paused ? (
          <button className="primary" onClick={() => dispatch({ type: "resume_monitoring" })}>
            Resume monitoring
          </button>
        ) : (
          <button
            className="primary"
            disabled={!state.baseline}
            onClick={() => dispatch({ type: "start_monitoring" })}
          >
            Start monitoring
          </button>
        )}
        <button onClick={() => dispatch({ type: "set_phase", phase: "monitor" })}>
          Live view
        </button>
        <button className="ghost" onClick={() => dispatch({ type: "set_phase", phase: "sandbox" })}>
          Tune detection
        </button>
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
                {e.previous_position} → {e.new_position}
              </span>
              <span className="hint">{e.source}</span>
            </li>
          ))}
        </ul>
      )}

      <details className="danger-zone">
        <summary>Voice, data &amp; privacy</summary>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => updateSettings({ voiceEnabled: e.target.checked })}
          />
          Spoken slouch alerts
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.morningGreetingEnabled}
            onChange={(e) =>
              updateSettings({ morningGreetingEnabled: e.target.checked })
            }
          />
          Daily greeting when the app opens
        </label>
        <p className="hint">
          {history.hasDatabase
            ? "History is stored locally on this computer."
            : "History is in-memory this session (SQLite runs in the desktop app)."}{" "}
          Camera images are never stored, and Spine-IQ never touches the network.
        </p>
        <div className="pause-controls">
          <button onClick={exportSummary}>Export summary</button>
          <button
            className="danger"
            onClick={() => {
              void history.deleteHistory().then(reload);
            }}
          >
            Delete history
          </button>
          <button
            className="danger"
            onClick={() => {
              void history.deleteCalibration();
            }}
          >
            Delete calibration
          </button>
        </div>
      </details>
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
