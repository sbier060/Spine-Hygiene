/**
 * Frame sampling. Grabs a single frame from the hidden <video> element as an
 * ImageBitmap that can be transferred to the pose worker with zero copy. The
 * caller MUST close the bitmap after inference so no image data lingers — see
 * docs/PRIVACY.md. Nothing here writes to disk or to any visible canvas.
 */

import type { GrayFrame } from "../position/backgroundMotion";

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

/** Tracking resolution for background motion (spec: ~320×240 or below). */
export const GRAY_WIDTH = 160;

let grayCanvas: HTMLCanvasElement | null = null;

/**
 * Capture one downscaled grayscale luma frame for background-motion tracking.
 * The canvas is module-reused and never attached to the DOM; the returned
 * buffer is derived numbers only, discarded by the caller after the next frame.
 */
export function captureGrayFrame(video: HTMLVideoElement): GrayFrame | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const width = GRAY_WIDTH;
  const height = Math.round((video.videoHeight / video.videoWidth) * width);
  grayCanvas ??= document.createElement("canvas");
  if (grayCanvas.width !== width || grayCanvas.height !== height) {
    grayCanvas.width = width;
    grayCanvas.height = height;
  }
  const ctx = grayCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
    data[j] =
      ((img.data[i] as number) * 77 +
        (img.data[i + 1] as number) * 150 +
        (img.data[i + 2] as number) * 29) >>
      8;
  }
  return { data, width, height };
}
