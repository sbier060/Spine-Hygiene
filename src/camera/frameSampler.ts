/**
 * Frame sampling. Grabs a single frame from the hidden <video> element as an
 * ImageBitmap that can be transferred to the pose worker with zero copy. The
 * caller MUST close the bitmap after inference so no image data lingers — see
 * docs/PRIVACY.md. Nothing here writes to disk or to any visible canvas.
 */

/** Downscale target for inference — smaller than capture size to save CPU. */
export const INFERENCE_MAX_WIDTH = 256;

/**
 * Capture one frame from `video` as an ImageBitmap, optionally downscaled.
 * Returns null if the video has no data yet.
 */
export async function captureFrameBitmap(
  video: HTMLVideoElement,
): Promise<ImageBitmap | null> {
  if (video.readyState < 2 /* HAVE_CURRENT_DATA */ || video.videoWidth === 0) {
    return null;
  }
  const scale = Math.min(1, INFERENCE_MAX_WIDTH / video.videoWidth);
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  return createImageBitmap(video, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "low",
  });
}
