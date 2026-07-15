/**
 * Main-thread facade over the pose worker. Owns the Worker instance, initializes
 * the model once, and exposes a serial `detect()` that resolves with a PoseFrame.
 * Inference is single-in-flight: MediaPipe's VIDEO mode needs monotonic
 * timestamps and one detect at a time, and adaptive scheduling calls it serially.
 */
import type { PoseFrame } from "./landmarkTypes";
import type {
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "../workers/poseWorker";
import { spineError, type SpineIqError } from "../utils/errors";

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

export class PoseEngine {
  private worker: Worker | null = null;
  private ready = false;
  private pending:
    | {
        resolve: (frame: PoseFrame) => void;
        reject: (err: SpineIqError) => void;
      }
    | null = null;

  async init(options: PoseEngineOptions = {}): Promise<void> {
    if (this.ready) return;
    const base = assetBase();
    const wasmPath = options.wasmPath ?? `${base}wasm`;
    const modelPath = options.modelPath ?? `${base}models/pose_landmarker_lite.task`;

    this.worker = new Worker(
      new URL("../workers/poseWorker.ts", import.meta.url),
      { type: "module" },
    );

    await new Promise<void>((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(spineError("model_load_failed", "worker failed to start"));
        return;
      }
      const onInit = (event: MessageEvent<PoseWorkerResponse>): void => {
        const msg = event.data;
        if (msg.type === "ready") {
          this.ready = true;
          worker.removeEventListener("message", onInit);
          worker.addEventListener("message", this.onMessage);
          resolve();
        } else if (msg.type === "init_error") {
          worker.removeEventListener("message", onInit);
          reject(spineError("model_load_failed", msg.message));
        }
      };
      worker.addEventListener("message", onInit);
      this.send({ type: "init", wasmPath, modelPath });
    });
  }

  private readonly onMessage = (
    event: MessageEvent<PoseWorkerResponse>,
  ): void => {
    const msg = event.data;
    if (!this.pending) return;
    if (msg.type === "result") {
      const { resolve } = this.pending;
      this.pending = null;
      resolve({
        landmarks: msg.landmarks,
        timestampMs: msg.timestampMs,
        inferenceMs: msg.inferenceMs,
      });
    } else if (msg.type === "detect_error") {
      const { reject } = this.pending;
      this.pending = null;
      reject(spineError("inference_failed", msg.message));
    }
  };

  private send(msg: PoseWorkerRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(msg, transfer);
  }

  /** Run inference on one frame. Rejects if the engine is busy or not ready. */
  detect(bitmap: ImageBitmap, timestampMs: number): Promise<PoseFrame> {
    if (!this.ready || !this.worker) {
      bitmap.close();
      return Promise.reject(
        spineError("inference_failed", "pose engine not initialized"),
      );
    }
    if (this.pending) {
      bitmap.close();
      return Promise.reject(
        spineError("inference_failed", "inference already in flight"),
      );
    }
    return new Promise<PoseFrame>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.send({ type: "detect", bitmap, timestampMs }, [bitmap]);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.pending = null;
  }
}
