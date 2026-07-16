/**
 * Pose engine. Runs MediaPipe Pose Landmarker on the main thread.
 *
 * (We originally ran this in a module Web Worker, but MediaPipe loads its WASM
 * via a dynamic import of a file under /public, which Vite's dev server refuses
 * to serve as a module. On the main thread MediaPipe loads the WASM with a
 * <script> tag — a plain static fetch — which works in both `vite dev` and the
 * production build. At the adaptive inference rate the main-thread cost is tiny,
 * and each frame's ImageBitmap is closed immediately after inference.)
 */
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { Landmark, PoseFrame } from "./landmarkTypes";
import { spineError } from "../utils/errors";

/** Local asset locations (bundled under public/, served with the app). */
function assetBase(): string {
  const base =
    typeof import.meta.env.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  return base.endsWith("/") ? base : `${base}/`;
}

export interface PoseEngineOptions {
  readonly wasmPath?: string;
  readonly modelPath?: string;
}

function toLandmarks(result: PoseLandmarkerResult): readonly Landmark[] {
  const pose = result.landmarks[0];
  if (!pose) return [];
  return pose.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility,
  }));
}

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private ready = false;

  async init(options: PoseEngineOptions = {}): Promise<void> {
    if (this.ready) return;
    const base = assetBase();
    const wasmPath = options.wasmPath ?? `${base}wasm`;
    const modelPath =
      options.modelPath ?? `${base}models/pose_landmarker_lite.task`;

    try {
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      this.landmarker = await this.createLandmarker(vision, modelPath);
      this.ready = true;
    } catch (err) {
      throw spineError(
        "model_load_failed",
        err instanceof Error ? err.message : "model load failed",
      );
    }
  }

  /** Try the GPU delegate first, fall back to CPU if the WebView lacks WebGL. */
  private async createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    modelPath: string,
  ): Promise<PoseLandmarker> {
    const common = {
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate: "GPU" },
        ...common,
      });
    } catch {
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate: "CPU" },
        ...common,
      });
    }
  }

  /** Run inference on one frame, then close the bitmap. Timestamps must increase. */
  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseFrame> {
    if (!this.ready || !this.landmarker) {
      bitmap.close();
      return Promise.reject(
        spineError("inference_failed", "pose engine not initialized"),
      );
    }
    try {
      const start = performance.now();
      const result = this.landmarker.detectForVideo(bitmap, timestampMs);
      const inferenceMs = performance.now() - start;
      return Promise.resolve({
        landmarks: toLandmarks(result),
        timestampMs,
        inferenceMs,
      });
    } catch (err) {
      return Promise.reject(
        spineError(
          "inference_failed",
          err instanceof Error ? err.message : "inference failed",
        ),
      );
    } finally {
      bitmap.close();
    }
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.ready = false;
  }
}
