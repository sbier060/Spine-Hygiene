/**
 * Developer detection sandbox — the Phase 1 goal made visible. Shows the live
 * preview with landmarks, raw + smoothed posture scores, the current band,
 * detection confidence, per-feature values vs. baseline, and inference time.
 * This is the surface used to prove that hunching reads differently from the
 * calibrated sitting posture.
 */
import { useAppContext } from "../app/AppProvider";
import { CameraPreview } from "../components/CameraPreview";
import {
  SCORED_FEATURE_KEYS,
  type ScoredFeatureKey,
} from "../pose/featureExtractor";

const FEATURE_LABELS: Record<ScoredFeatureKey, string> = {
  headForward: "Head-forward",
  screenLean: "Screen-lean",
  shoulderCollapse: "Shoulder-collapse",
  torsoAngle: "Torso-angle",
};

function fmt(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function bandClass(band: string): string {
  return `band band-${band}`;
}

export function DevSandboxScreen({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
}): JSX.Element {
  const { state, dispatch } = useAppContext();
  const reading = state.latest;
  const baseline = state.baseline;

  return (
    <section className="screen sandbox">
      <header className="sandbox-header">
        <h1>Detection sandbox</h1>
        <div className="header-actions">
          <button
            className="ghost"
            onClick={() => dispatch({ type: "set_phase", phase: "calibrate" })}
          >
            Recalibrate
          </button>
          <button
            className="primary"
            disabled={!state.baseline}
            onClick={() => dispatch({ type: "start_monitoring" })}
          >
            Start monitoring
          </button>
        </div>
      </header>

      <div className="sandbox-grid">
        <CameraPreview
          videoRef={videoRef}
          landmarks={reading?.landmarks ?? []}
          width={360}
          height={202}
        />

        <div className="scores">
          <div className="score-block">
            <span className="score-label">Smoothed</span>
            <span className="score-value">{fmt(reading?.smoothedScore, 2)}</span>
          </div>
          <div className="score-block">
            <span className="score-label">Raw</span>
            <span className="score-value">{fmt(reading?.rawScore, 2)}</span>
          </div>
          <div className={bandClass(reading?.band ?? "good")}>
            {reading?.band ?? "—"}
          </div>
          <div className="meta-row">
            <span>
              Confidence: {fmt(reading?.quality.score, 2)}{" "}
              {reading && !reading.quality.usable ? `(${reading.quality.reason ?? "low"})` : ""}
            </span>
            <span>Inference: {fmt(reading?.inferenceMs, 1)} ms</span>
          </div>
        </div>
      </div>

      <table className="feature-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Current</th>
            <th>Baseline</th>
            <th>Deviation</th>
          </tr>
        </thead>
        <tbody>
          {SCORED_FEATURE_KEYS.map((key) => {
            const current = reading?.features[key] ?? null;
            const base = baseline?.features[key];
            return (
              <tr key={key}>
                <td>{FEATURE_LABELS[key]}</td>
                <td>{fmt(current)}</td>
                <td>{base ? fmt(base.median) : "—"}</td>
                <td>
                  {current !== null && base
                    ? fmt(Math.abs(current - base.median))
                    : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="advisory">
            <td>Shoulder-slope</td>
            <td>{fmt(reading?.features.shoulderSlope)}</td>
            <td>—</td>
            <td>advisory</td>
          </tr>
        </tbody>
      </table>

      {baseline && (
        <p className="hint">
          Baseline confidence {fmt(baseline.confidence, 2)} · {baseline.sampleCount}{" "}
          frames · {Object.keys(baseline.features).length}/
          {SCORED_FEATURE_KEYS.length} features
        </p>
      )}
    </section>
  );
}
