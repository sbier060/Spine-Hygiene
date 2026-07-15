/// <reference lib="webworker" />
/**
 * Pose inference worker. Runs MediaPipe Pose Landmarker off the main thread so
 * the UI stays responsive. Receives ImageBitmaps, returns landmark arrays, and
 * closes each bitmap immediately after inference so no frame data is retained.
 *
 * The main-thread facade is pose/poseLandmarker.ts.
 */
import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { Landmark } from "../pose/landmarkTypes";

export interface PoseWorkerInit {
  readonly type: "init";
  /** Directory containing the MediaPipe wasm runtime (served locally). */
  readonly wasmPath: string;
  /** Path to the .task model file (served locally). */
  readonly modelPath: string;
}

export interface PoseWorkerDetect {
  readonly type: "detect";
  readonly bitmap: ImageBitmap;
  readonly timestampMs: number;
}

export type PoseWorkerRequest = PoseWorkerInit | PoseWorkerDetect;

export type PoseWorkerResponse =
  | { readonly type: "ready" }
  | { readonly type: "init_error"; readonly message: string }
  | {
      readonly type: "result";
      readonly landmarks: readonly Landmark[];
      readonly timestampMs: number;
      readonly inferenceMs: number;
    }
  | { readonly type: "detect_error"; readonly message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let landmarker: PoseLandmarker | null = null;

function post(msg: PoseWorkerResponse): void {
  ctx.postMessage(msg);
}

async function init(msg: PoseWorkerInit): Promise<void> {
  try {
    const vision = await FilesetResolver.forVisionTasks(msg.wasmPath);
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: msg.modelPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    post({ type: "ready" });
  } catch (err) {
    post({
      type: "init_error",
      message: err instanceof Error ? err.message : "model load failed",
    });
  }
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

function detect(msg: PoseWorkerDetect): void {
  if (!landmarker) {
    post({ type: "detect_error", message: "landmarker not initialized" });
    msg.bitmap.close();
    return;
  }
  try {
    const start = performance.now();
    const result = landmarker.detectForVideo(msg.bitmap, msg.timestampMs);
    const inferenceMs = performance.now() - start;
    post({
      type: "result",
      landmarks: toLandmarks(result),
      timestampMs: msg.timestampMs,
      inferenceMs,
    });
  } catch (err) {
    post({
      type: "detect_error",
      message: err instanceof Error ? err.message : "inference failed",
    });
  } finally {
    // Discard the frame immediately — no image data is ever retained.
    msg.bitmap.close();
  }
}

ctx.addEventListener("message", (event: MessageEvent<PoseWorkerRequest>) => {
  const msg = event.data;
  if (msg.type === "init") {
    void init(msg);
  } else {
    detect(msg);
  }
});
