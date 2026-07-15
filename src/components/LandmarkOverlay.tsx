/**
 * Landmark drawing helpers for the developer overlay and placement/calibration
 * previews. `drawLandmarks` is a pure canvas routine; the React component simply
 * owns a canvas and redraws when landmarks change.
 */
import { useEffect, useRef } from "react";
import {
  type Landmark,
  POSE_LANDMARK,
  MIN_LANDMARK_VISIBILITY,
} from "../pose/landmarkTypes";

/** Skeleton connections we care about (head + shoulders + optional hips). */
const CONNECTIONS: readonly (readonly [number, number])[] = [
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.RIGHT_SHOULDER],
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.LEFT_EAR],
  [POSE_LANDMARK.RIGHT_SHOULDER, POSE_LANDMARK.RIGHT_EAR],
  [POSE_LANDMARK.LEFT_EAR, POSE_LANDMARK.NOSE],
  [POSE_LANDMARK.RIGHT_EAR, POSE_LANDMARK.NOSE],
  [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.LEFT_HIP],
  [POSE_LANDMARK.RIGHT_SHOULDER, POSE_LANDMARK.RIGHT_HIP],
  [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.RIGHT_HIP],
];

const KEY_POINTS: readonly number[] = [
  POSE_LANDMARK.NOSE,
  POSE_LANDMARK.LEFT_EAR,
  POSE_LANDMARK.RIGHT_EAR,
  POSE_LANDMARK.LEFT_SHOULDER,
  POSE_LANDMARK.RIGHT_SHOULDER,
  POSE_LANDMARK.LEFT_HIP,
  POSE_LANDMARK.RIGHT_HIP,
];

function visible(lm: Landmark | undefined): lm is Landmark {
  return (
    lm !== undefined &&
    (lm.visibility === undefined || lm.visibility >= MIN_LANDMARK_VISIBILITY)
  );
}

export function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (landmarks.length === 0) return;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(80, 200, 255, 0.8)";
  for (const [a, b] of CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!visible(la) || !visible(lb)) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 220, 80, 0.95)";
  for (const idx of KEY_POINTS) {
    const lm = landmarks[idx];
    if (!visible(lm)) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function LandmarkOverlay({
  landmarks,
  width,
  height,
}: {
  landmarks: readonly Landmark[];
  width: number;
  height: number;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawLandmarks(ctx, landmarks, width, height);
  }, [landmarks, width, height]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
