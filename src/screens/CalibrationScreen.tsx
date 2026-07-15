/**
 * Sitting calibration. The user sits in the posture they want to keep; we collect
 * ~10 s of valid frames and build a personalized median baseline. Low-confidence
 * frames are rejected, so poor lighting simply slows the progress bar rather than
 * poisoning the baseline.
 */
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../app/AppProvider";
import { CameraPreview } from "../components/CameraPreview";
import {
  CalibrationCollector,
  type CalibrationMeta,
} from "../posture/calibrationService";
import type { CameraInfo } from "../hooks/usePoseLoop";

/** Valid frames to gather (~10 s at the sandbox 2 fps cadence). */
const TARGET_SAMPLES = 20;

export function CalibrationScreen({
  videoRef,
  cameraInfoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraInfoRef: React.MutableRefObject<CameraInfo | null>;
}): JSX.Element {
  const { state, dispatch } = useAppContext();
  const collectorRef = useRef(new CalibrationCollector());
  const [collecting, setCollecting] = useState(false);
  const [count, setCount] = useState(0);

  const reading = state.latest;

  useEffect(() => {
    if (!collecting || !reading) return;
    const collector = collectorRef.current;
    collector.add(reading.features, reading.quality);
    setCount(collector.validSampleCount);

    if (collector.validSampleCount >= TARGET_SAMPLES) {
      setCollecting(false);
      const info = cameraInfoRef.current;
      const meta: CalibrationMeta = {
        positionType: "sitting",
        cameraWidth: info?.width ?? 640,
        cameraHeight: info?.height ?? 360,
        cameraDeviceId: info?.deviceId ?? null,
        createdAt: Date.now(),
      };
      dispatch({ type: "set_baseline", baseline: collector.build(meta) });
      dispatch({ type: "set_phase", phase: "sandbox" });
    }
  }, [collecting, reading, cameraInfoRef, dispatch]);

  const start = (): void => {
    collectorRef.current.reset();
    setCount(0);
    setCollecting(true);
  };

  const progress = Math.min(1, count / TARGET_SAMPLES);

  return (
    <section className="screen calibration">
      <h1>Calibrate your sitting posture</h1>
      <p>Sit the way you want to hold yourself, then start calibration.</p>
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
        <button className="primary" onClick={start}>
          Start calibration
        </button>
      )}
    </section>
  );
}
