/**
 * Camera lifecycle: acquire a low-resolution stream, expose its dimensions, and
 * fully release it (stopping tracks so the OS camera indicator turns off) when
 * monitoring pauses. getUserMedia must run on the main thread; frames are pulled
 * elsewhere (frameSampler) and discarded immediately.
 */
import {
  CAMERA_CONSTRAINTS,
  type ActiveCamera,
} from "./cameraTypes";
import { cameraErrorFromDom, type SpineIqError } from "../utils/errors";

type Result<T> = { ok: true; value: T } | { ok: false; error: SpineIqError };

export class CameraManager {
  private active: ActiveCamera | null = null;

  get current(): ActiveCamera | null {
    return this.active;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  /**
   * Start the camera, optionally pinned to a specific device. Returns a typed
   * error result rather than throwing so callers must handle failure.
   */
  async start(deviceId?: string): Promise<Result<ActiveCamera>> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return {
        ok: false,
        error: {
          type: "camera_unavailable",
          message: "This platform does not expose a camera API.",
        },
      };
    }

    // Reuse if already running on the requested device.
    if (this.active && (!deviceId || this.active.deviceId === deviceId)) {
      return { ok: true, value: this.active };
    }
    this.stop();

    const constraints: MediaStreamConstraints = deviceId
      ? {
          ...CAMERA_CONSTRAINTS,
          video: {
            ...(CAMERA_CONSTRAINTS.video as MediaTrackConstraints),
            deviceId: { exact: deviceId },
          },
        }
      : CAMERA_CONSTRAINTS;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() ?? {};
      this.active = {
        stream,
        deviceId: settings.deviceId ?? deviceId ?? null,
        width: settings.width ?? 640,
        height: settings.height ?? 360,
      };
      // If the device is unplugged/taken, drop our reference so callers can react.
      track?.addEventListener("ended", () => this.stop());
      return { ok: true, value: this.active };
    } catch (err) {
      return { ok: false, error: cameraErrorFromDom(err) };
    }
  }

  /** Stop all tracks and release the camera (turns off the OS indicator). */
  stop(): void {
    if (!this.active) return;
    for (const track of this.active.stream.getTracks()) {
      track.stop();
    }
    this.active = null;
  }
}
