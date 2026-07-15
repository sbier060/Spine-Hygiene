/**
 * Visible camera preview — shown ONLY during onboarding, calibration, and
 * developer mode (never during normal monitoring). It mirrors the hidden capture
 * <video> onto a small canvas via requestAnimationFrame and stacks the landmark
 * overlay on top. Drawing to this canvas is transient; nothing is saved.
 */
import { useEffect, useRef } from "react";
import type { Landmark } from "../pose/landmarkTypes";
import { LandmarkOverlay } from "./LandmarkOverlay";

export function CameraPreview({
  videoRef,
  landmarks,
  width = 320,
  height = 180,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  landmarks: readonly Landmark[];
  width?: number;
  height?: number;
}): JSX.Element {
  const mirrorRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      const video = videoRef.current;
      const ctx = mirrorRef.current?.getContext("2d");
      if (video && ctx && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [videoRef, width, height]);

  return (
    <div
      className="camera-preview"
      style={{ position: "relative", width, height }}
    >
      <canvas ref={mirrorRef} width={width} height={height} />
      <LandmarkOverlay landmarks={landmarks} width={width} height={height} />
    </div>
  );
}
