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
import {
  GOOD_POSE_TOTAL_SAMPLES,
  POSE_SETTLE_MS,
  poseForCount,
  poseIndexForCount,
} from "../posture/goodPoseGuide";
import type { CameraInfo } from "../hooks/usePoseLoop";

/** Valid frames for the single-pose standing capture (~10 s at 2 fps). */
const STANDING_TARGET_SAMPLES = 20;

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
  // Sitting calibration is a guided multi-pose capture (center, lean left/right,
  // look down) so the baseline tolerates the user's natural range. Sampling
  // pauses briefly after each pose switch so the user has time to move.
  const settleUntilRef = useRef(0);
  const lastPoseRef = useRef(0);
  const targetSamples = isStanding
    ? STANDING_TARGET_SAMPLES
    : GOOD_POSE_TOTAL_SAMPLES;

  useEffect(() => {
    if (!collecting || !reading) return;
    if (!isStanding && performance.now() < settleUntilRef.current) return;
    const posture = postureRef.current;
    const position = positionRef.current;
    posture.add(reading.features, reading.quality);
    position.add(
      extractPositionFeatures(reading.landmarks),
      reading.quality,
    );
    setCount(posture.validSampleCount);
    if (!isStanding && posture.validSampleCount < targetSamples) {
      const pose = poseIndexForCount(posture.validSampleCount);
      if (pose !== lastPoseRef.current) {
        lastPoseRef.current = pose;
        settleUntilRef.current = performance.now() + POSE_SETTLE_MS;
      }
    }

    if (posture.validSampleCount >= targetSamples) {
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
    targetSamples,
  ]);

  const start = (): void => {
    postureRef.current.reset();
    positionRef.current.reset();
    settleUntilRef.current = 0;
    lastPoseRef.current = 0;
    setCount(0);
    setCollecting(true);
  };

  const progress = Math.min(1, count / targetSamples);

  return (
    <section className="screen calibration">
      <h1>
        {isStanding ? "Calibrate standing (optional)" : "Calibrate your sitting posture"}
      </h1>
      <p>
        {isStanding
          ? "Stand the way you normally would at your desk, then start. You can skip this."
          : "Sit the way you want to hold yourself, then start. It walks you through a few comfortable variations — leaning and looking down included — so normal movement never counts against you."}
      </p>
      <CameraPreview videoRef={videoRef} landmarks={reading?.landmarks ?? []} />

      {collecting ? (
        <>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="hint">
            {isStanding ? "Hold still" : poseForCount(count).instruction}…{" "}
            {count}/{targetSamples} good frames
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
