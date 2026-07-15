/**
 * Camera permission helpers. Uses the Permissions API where available and falls
 * back gracefully (Safari/WKWebView support is partial).
 */
import type { CameraPermissionState } from "./cameraTypes";

/** Query current camera permission without prompting, when the API allows it. */
export async function queryCameraPermission(): Promise<CameraPermissionState> {
  if (
    typeof navigator === "undefined" ||
    !("permissions" in navigator) ||
    typeof navigator.permissions.query !== "function"
  ) {
    return "unknown";
  }
  try {
    // `camera` is not in the standard PermissionName union everywhere.
    const status = await navigator.permissions.query({
      name: "camera",
    });
    return status.state;
  } catch {
    return "unknown";
  }
}

/** List available video input devices (labels require a prior grant). */
export async function listCameraDevices(): Promise<MediaDeviceInfo[]> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.enumerateDevices
  ) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "videoinput");
}
