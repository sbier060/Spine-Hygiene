/**
 * Camera-layer types and the low-resource capture constraints Spine-IQ uses.
 */

/**
 * Low-resolution, low-frame-rate constraints (spec §"Camera behavior"). These are
 * all `ideal` (hints), never `exact`, so a camera that can't hit them still opens.
 * macOS WKWebView is picky about `max` framerate ranges, so we only hint `ideal`;
 * cameraManager falls back to a bare `{ video: true }` if even these are refused.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 10 },
  },
  // Never request the microphone.
  audio: false,
};

/** Minimal fallback used when the detailed constraints are rejected. */
export const FALLBACK_CONSTRAINTS: MediaStreamConstraints = {
  video: true,
  audio: false,
};

export interface CameraDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface ActiveCamera {
  readonly stream: MediaStream;
  readonly deviceId: string | null;
  readonly width: number;
  readonly height: number;
}

export type CameraPermissionState = "prompt" | "granted" | "denied" | "unknown";
