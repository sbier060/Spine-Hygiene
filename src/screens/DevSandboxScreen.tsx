/**
 * Developer detection sandbox — the Phase 1 goal made visible. Shows the live
 * preview with landmarks, raw + smoothed posture scores, the current band,
 * detection confidence, per-feature values vs. baseline, and inference time.
 * This is the surface used to prove that hunching reads differently from the
 * calibrated sitting posture.
 */
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { CameraPreview } from "../components/CameraPreview";
import {
  SCORED_FEATURE_KEYS,
  type ScoredFeatureKey,
} from "../pose/featureExtractor";
import {
  CalibrationCollector,
  type CalibrationMeta,
} from "../posture/calibrationService";
import { PositionCalibrationCollector } from "../position/positionCalibration";
import { extractPositionFeatures } from "../position/positionFeatures";

/** Valid frames to gather for an in-place "this is my good posture" recapture. */
const RECAPTURE_SAMPLES = 15;

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

  // In-place "this is my good posture" recapture: retrains the baseline from the
  // live pose so the score reflects how you actually sit, right now.
  const postureRef = useRef(new CalibrationCollector());
  const positionRef = useRef(new PositionCalibrationCollector());
  const [capturing, setCapturing] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);

  useEffect(() => {
    if (!capturing || !reading) return;
    postureRef.current.add(reading.features, reading.quality);
    positionRef.current.add(
      extractPositionFeatures(reading.landmarks),
      reading.quality,
    );
    setCaptureCount(postureRef.current.validSampleCount);

    if (postureRef.current.validSampleCount >= RECAPTURE_SAMPLES) {
      setCapturing(false);
      const now = Date.now();
      const meta: CalibrationMeta = {
        positionType: "sitting",
        cameraWidth: 640,
        cameraHeight: 360,
        cameraDeviceId: null,
        createdAt: now,
      };
      const postureBaseline = postureRef.current.build(meta);
      const positionBaseline = positionRef.current.build("sitting");
      dispatch({ type: "set_baseline", baseline: postureBaseline });
      dispatch({ type: "set_position_baseline", baseline: positionBaseline });
      console.log(
        "[spine-iq] re-baselined good posture from",
        postureBaseline.sampleCount,
        "frames:",
        postureBaseline.features,
      );
    }
  }, [capturing, reading, dispatch]);

  const startRecapture = (): void => {
    postureRef.current.reset();
    positionRef.current.reset();
    setCaptureCount(0);
    setCapturing(true);
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

      <button
        className="primary"
        disabled={capturing || !reading}
        onClick={startRecapture}
      >
        {capturing
          ? `Capturing your posture… ${captureCount}/${RECAPTURE_SAMPLES}`
          : "This is my good posture — retrain"}
      </button>
      <p className="hint">
        Sit the way you actually want to sit, then retrain. The score is measured
        against this, so it should read ~0 right after.
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
