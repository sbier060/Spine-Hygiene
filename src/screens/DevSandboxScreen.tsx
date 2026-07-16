/**
 * Developer detection sandbox — the Phase 1 goal made visible. Shows the live
 * preview with landmarks, raw + smoothed posture scores, the current band,
 * detection confidence, per-feature values vs. baseline, and inference time.
 * This is the surface used to prove that hunching reads differently from the
 * calibrated sitting posture.
 */
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { useHistory } from "../app/HistoryProvider";
import { CameraPreview } from "../components/CameraPreview";
import {
  SCORED_FEATURE_KEYS,
  type ScoredFeatureKey,
  type PostureFeatures,
} from "../pose/featureExtractor";
import {
  CalibrationCollector,
  type CalibrationMeta,
} from "../posture/calibrationService";
import { computeDeviationSaturation } from "../posture/postureScorer";
import type { CalibrationBaseline } from "../posture/postureTypes";
import { PositionCalibrationCollector } from "../position/positionCalibration";
import { extractPositionFeatures } from "../position/positionFeatures";
import { SettingsRepository } from "../storage/settingsRepository";

/** Valid frames to gather for an in-place recapture. */
const RECAPTURE_SAMPLES = 15;

type CaptureMode = "good" | "slouched" | null;

/** Median feature values from a built baseline, as a plain PostureFeatures. */
function baselineToFeatures(b: CalibrationBaseline): PostureFeatures {
  return {
    headForward: b.features.headForward?.median ?? null,
    screenLean: b.features.screenLean?.median ?? null,
    shoulderSlope: null,
    shoulderCollapse: b.features.shoulderCollapse?.median ?? null,
    torsoAngle: b.features.torsoAngle?.median ?? null,
  };
}

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
  const history = useHistory();
  const reading = state.latest;
  const baseline = state.baseline;

  // Two-point training. "Good" recaptures the baseline from the live pose; then
  // "slouched" captures the bad end so sensitivity is tuned to YOUR good→bad range.
  const postureRef = useRef(new CalibrationCollector());
  const positionRef = useRef(new PositionCalibrationCollector());
  const settingsRef = useRef<SettingsRepository | null>(null);
  settingsRef.current ??= new SettingsRepository();
  const [captureMode, setCaptureMode] = useState<CaptureMode>(null);
  const [captureCount, setCaptureCount] = useState(0);

  useEffect(() => {
    if (captureMode === null || !reading) return;
    postureRef.current.add(reading.features, reading.quality);
    positionRef.current.add(
      extractPositionFeatures(reading.landmarks),
      reading.quality,
    );
    setCaptureCount(postureRef.current.validSampleCount);
    if (postureRef.current.validSampleCount < RECAPTURE_SAMPLES) return;

    const now = Date.now();
    const meta: CalibrationMeta = {
      positionType: "sitting",
      cameraWidth: 640,
      cameraHeight: 360,
      cameraDeviceId: null,
      createdAt: now,
    };
    const built = postureRef.current.build(meta);

    if (captureMode === "good") {
      const positionBaseline = positionRef.current.build("sitting");
      dispatch({ type: "set_baseline", baseline: built });
      dispatch({ type: "set_position_baseline", baseline: positionBaseline });
      void history.saveCalibration(
        { positionType: "sitting", postureBaseline: built, positionBaseline },
        now,
      );
      console.log("[spine-iq] re-baselined good posture:", built.features);
    } else if (baseline) {
      // Tune saturation so this slouched pose reads ~0.9 against the good baseline.
      const saturation = computeDeviationSaturation(
        baselineToFeatures(built),
        baseline,
      );
      if (saturation !== null) {
        dispatch({ type: "set_saturation", value: saturation });
        settingsRef.current?.update({ deviationSaturation: saturation });
        console.log(
          "[spine-iq] two-point: set posture saturation to",
          saturation.toFixed(2),
        );
      }
    }
    setCaptureMode(null);
  }, [captureMode, reading, baseline, dispatch, history]);

  const startCapture = (mode: Exclude<CaptureMode, null>): void => {
    postureRef.current.reset();
    positionRef.current.reset();
    setCaptureCount(0);
    setCaptureMode(mode);
  };

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

      {captureMode !== null ? (
        <button className="primary" disabled>
          {captureMode === "good" ? "Capturing good posture" : "Capturing slouch"}
          … {captureCount}/{RECAPTURE_SAMPLES}
        </button>
      ) : (
        <div className="pause-controls">
          <button
            className="primary"
            disabled={!reading}
            onClick={() => startCapture("good")}
          >
            This is my good posture
          </button>
          <button
            disabled={!reading || !baseline}
            onClick={() => startCapture("slouched")}
          >
            This is me slouching
          </button>
        </div>
      )}
      <p className="hint">
        1) Sit how you want to sit → “good posture” (score should read ~0). 2) Then
        slouch the way you want to be warned about → “slouching” tunes the
        sensitivity to your range.
      </p>

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
