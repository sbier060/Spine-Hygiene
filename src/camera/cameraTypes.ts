/**
 * Camera-layer types and the low-resource capture constraints Spine-IQ uses.
 */

/** Low-resolution, low-frame-rate constraints (spec §"Camera behavior"). */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 5, max: 10 },
  },
  // Never request the microphone.
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
