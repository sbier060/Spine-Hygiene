/**
 * Calibration for sitting (required) and standing (optional). The user holds the
 * posture; we collect ~10 s of valid frames and build a personalized median
 * baseline. Sitting calibration also builds the posture-scoring baseline; both
 * build a position baseline (absolute frame features) for sit/stand classification.
 * Low-confidence frames are rejected, so poor lighting slows the bar rather than
 * poisoning the baseline.
 */
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { useHistory } from "../app/HistoryProvider";
import { CameraPreview } from "../components/CameraPreview";
import {
  CalibrationCollector,
  type CalibrationMeta,
} from "../posture/calibrationService";
import { PositionCalibrationCollector } from "../position/positionCalibration";
import { extractPositionFeatures } from "../position/positionFeatures";
import type { CameraInfo } from "../hooks/usePoseLoop";

/** Valid frames to gather (~10 s at the sandbox 2 fps cadence). */
const TARGET_SAMPLES = 20;

export function CalibrationScreen({
  videoRef,
  cameraInfoRef,
  positionType,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraInfoRef: React.MutableRefObject<CameraInfo | null>;
  positionType: "sitting" | "standing";
}): JSX.Element {
  const { state, dispatch } = useAppContext();
  const history = useHistory();
  const postureRef = useRef(new CalibrationCollector());
  const positionRef = useRef(new PositionCalibrationCollector());
  const [collecting, setCollecting] = useState(false);
  const [count, setCount] = useState(0);

  const reading = state.latest;
  const isStanding = positionType === "standing";

  useEffect(() => {
    if (!collecting || !reading) return;
    const posture = postureRef.current;
    const position = positionRef.current;
    posture.add(reading.features, reading.quality);
    position.add(
      extractPositionFeatures(reading.landmarks),
      reading.quality,
    );
    setCount(posture.validSampleCount);

    if (posture.validSampleCount >= TARGET_SAMPLES) {
      setCollecting(false);
      const info = cameraInfoRef.current;
      const now = Date.now();
      const positionBaseline = position.build(positionType);
      let postureBaseline = null;
      if (!isStanding) {
        const meta: CalibrationMeta = {
          positionType: "sitting",
          cameraWidth: info?.width ?? 640,
          cameraHeight: info?.height ?? 360,
          cameraDeviceId: info?.deviceId ?? null,
          createdAt: now,
        };
        postureBaseline = posture.build(meta);
        dispatch({ type: "set_baseline", baseline: postureBaseline });
      }
      dispatch({ type: "set_position_baseline", baseline: positionBaseline });
      // Persist so the user doesn't recalibrate next launch (native app only).
      void history.saveCalibration(
        { positionType, postureBaseline, positionBaseline },
        now,
      );
      dispatch({
        type: "set_phase",
        phase: isStanding ? "sandbox" : "calibrate_standing",
      });
    }
  }, [
    collecting,
    reading,
    cameraInfoRef,
    dispatch,
    history,
    isStanding,
    positionType,
  ]);

  const start = (): void => {
    postureRef.current.reset();
    positionRef.current.reset();
    setCount(0);
    setCollecting(true);
  };

  const progress = Math.min(1, count / TARGET_SAMPLES);

  return (
    <section className="screen calibration">
      <h1>
        {isStanding ? "Calibrate standing (optional)" : "Calibrate your sitting posture"}
      </h1>
      <p>
        {isStanding
          ? "Stand the way you normally would at your desk, then start. You can skip this."
          : "Sit the way you want to hold yourself, then start calibration."}
      </p>
      <CameraPreview videoRef={videoRef} landmarks={reading?.landmarks ?? []} />

      {collecting ? (
        <>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="hint">
            Hold still… {count}/{TARGET_SAMPLES} good frames
            {reading && !reading.quality.usable
              ? " (waiting for a clear view)"
              : ""}
          </p>
        </>
      ) : (
        <div className="pause-controls">
          <button className="primary" onClick={start}>
            Start calibration
          </button>
          {isStanding && (
            <button
              className="ghost"
              onClick={() => dispatch({ type: "set_phase", phase: "sandbox" })}
            >
              Skip
            </button>
          )}
        </div>
      )}
    </section>
  );
}
