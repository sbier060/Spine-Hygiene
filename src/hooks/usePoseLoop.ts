/**
 * usePoseLoop — the runtime that ties the pipeline together for Phase 1:
 *
 *   camera → frame sample → pose worker → features → quality → score → smoothing
 *
 * It captures ONE frame at a fixed cadence (adaptive scheduling is Phase 2),
 * runs inference off-thread, and dispatches a LiveReading. Frames are closed
 * immediately after inference; nothing is stored. Camera + engine are kept alive
 * across screens via refs so switching onboarding steps doesn't restart them.
 */
import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { CameraManager } from "../camera/cameraManager";
import { captureFrameBitmap } from "../camera/frameSampler";
import { PoseEngine } from "../pose/poseLandmarker";
import { extractFeatures } from "../pose/featureExtractor";
import { assessDetectionQuality } from "../pose/poseQuality";
import { ExponentialMovingAverage } from "../pose/smoothing";
import { scorePosture } from "../posture/postureScorer";
import type { CalibrationBaseline, PostureBand } from "../posture/postureTypes";
import { statusHeadline, trayTone } from "../tray/trayState";
import { updateTrayStatus } from "../tray/trayCommands";
import { cameraErrorFromDom, isSpineIqError } from "../utils/errors";
import type { AppAction } from "../app/appState";

/** Fixed sandbox cadence (~2 fps). Adaptive inference arrives in Phase 2. */
const SANDBOX_PERIOD_MS = 500;

export interface CameraInfo {
  readonly deviceId: string | null;
  readonly width: number;
  readonly height: number;
}

export function usePoseLoop(
  videoRef: React.RefObject<HTMLVideoElement>,
  running: boolean,
  baseline: CalibrationBaseline | null,
  deviationSaturation: number,
  dispatch: Dispatch<AppAction>,
): React.MutableRefObject<CameraInfo | null> {
  const cameraRef = useRef<CameraManager | null>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const emaRef = useRef(new ExponentialMovingAverage(0.2));
  const cameraInfoRef = useRef<CameraInfo | null>(null);
  const baselineRef = useRef<CalibrationBaseline | null>(baseline);
  baselineRef.current = baseline;
  const saturationRef = useRef(deviationSaturation);
  saturationRef.current = deviationSaturation;

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tsCounter = 0;

    const camera = (cameraRef.current ??= new CameraManager());
    const engine = (engineRef.current ??= new PoseEngine());

    async function tick(): Promise<void> {
      if (cancelled) return;
      const video = videoRef.current;
      if (video) {
        try {
          const bitmap = await captureFrameBitmap(video);
          if (bitmap && !cancelled) {
            tsCounter += SANDBOX_PERIOD_MS;
            const frame = await engine.detect(bitmap, tsCounter);
            if (!cancelled) publish(frame.landmarks, frame.inferenceMs);
          }
        } catch (err) {
          // A single dropped/failed frame is non-fatal; keep looping.
          if (isSpineIqError(err) && err.type === "model_load_failed") {
            dispatch({ type: "set_error", error: err });
          }
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), SANDBOX_PERIOD_MS);
    }

    function publish(
      landmarks: Parameters<typeof extractFeatures>[0],
      inferenceMs: number,
    ): void {
      const features = extractFeatures(landmarks);
      const quality = assessDetectionQuality(landmarks, features);
      let rawScore = 0;
      let band: PostureBand = "good";
      if (baselineRef.current && quality.usable) {
        const result = scorePosture(features, baselineRef.current, {
          deviationSaturation: saturationRef.current,
        });
        rawScore = result.score;
        band = result.band;
      }
      const smoothedScore = emaRef.current.push(rawScore);
      dispatch({
        type: "set_reading",
        reading: {
          features,
          landmarks,
          quality,
          rawScore,
          smoothedScore,
          band,
          inferenceMs,
        },
      });
      // Keep the menu-bar dot/label in sync with the live sandbox reading (band
      // is a subset of PostureState; position is unknown here).
      void updateTrayStatus({
        postureLabel: statusHeadline(band, "unknown"),
        positionLabel: "Unknown",
        durationLabel: "",
        tone: trayTone(band),
      });
    }

    async function startup(): Promise<void> {
      const result = await camera.start();
      if (cancelled) return;
      if (!result.ok) {
        dispatch({ type: "set_error", error: result.error });
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = result.value.stream;
        try {
          await video.play();
        } catch (err) {
          dispatch({ type: "set_error", error: cameraErrorFromDom(err) });
        }
      }
      cameraInfoRef.current = {
        deviceId: result.value.deviceId,
        width: result.value.width,
        height: result.value.height,
      };
      try {
        await engine.init();
      } catch (err) {
        if (isSpineIqError(err)) dispatch({ type: "set_error", error: err });
        return;
      }
      if (!cancelled) void tick();
    }

    void startup();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      emaRef.current.reset();
    };
  }, [running, videoRef, dispatch]);

  // Release the camera fully when the loop is no longer needed.
  useEffect(() => {
    if (running) return;
    cameraRef.current?.stop();
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, [running, videoRef]);

  return cameraInfoRef;
}
