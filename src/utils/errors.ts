/**
 * Typed application errors. Every camera / model / notification / database
 * operation surfaces one of these instead of throwing bare strings, so the UI
 * can show a specific, actionable message and we never silently fail.
 */

export type SpineIqError =
  | { readonly type: "camera_permission_denied"; readonly message: string }
  | { readonly type: "camera_unavailable"; readonly message: string }
  | { readonly type: "camera_in_use"; readonly message: string }
  | { readonly type: "model_load_failed"; readonly message: string }
  | { readonly type: "inference_failed"; readonly message: string }
  | { readonly type: "database_error"; readonly message: string }
  | { readonly type: "notification_permission_denied"; readonly message: string };

export type SpineIqErrorType = SpineIqError["type"];

export function spineError(
  type: SpineIqErrorType,
  message: string,
): SpineIqError {
  return { type, message };
}

/** Narrow an unknown thrown value to a SpineIqError shape when possible. */
export function isSpineIqError(value: unknown): value is SpineIqError {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/**
 * Map a DOMException from getUserMedia to a typed camera error.
 * See https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 */
export function cameraErrorFromDom(err: unknown): SpineIqError {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return spineError(
          "camera_permission_denied",
          "Camera access was denied. Enable it in System Settings › Privacy & Security › Camera.",
        );
      case "NotFoundError":
      case "OverconstrainedError":
        return spineError(
          "camera_unavailable",
          "No suitable camera was found.",
        );
      case "NotReadableError":
      case "AbortError":
        return spineError(
          "camera_in_use",
          "The camera is in use by another application.",
        );
      default:
        return spineError("camera_unavailable", err.message || err.name);
    }
  }
  return spineError(
    "camera_unavailable",
    err instanceof Error ? err.message : "Unknown camera error.",
  );
}
