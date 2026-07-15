/**
 * Camera-placement feedback for onboarding. Turns a live reading into a short
 * checklist with actionable guidance ("Center your head and shoulders", etc.).
 * `evaluatePlacement` is pure so it can be unit-tested independently of React.
 */
import type { Landmark } from "../pose/landmarkTypes";
import { getLandmark } from "../pose/landmarkTypes";
import type { DetectionQuality } from "../pose/poseQuality";

export interface PlacementCheck {
  readonly ok: boolean;
  readonly label: string;
}

/** Shoulder span (fraction of frame width) above which the user is too close. */
const TOO_CLOSE_SHOULDER_WIDTH = 0.85;

export function evaluatePlacement(
  landmarks: readonly Landmark[],
  quality: DetectionQuality,
): PlacementCheck[] {
  const present = landmarks.length > 0;
  const nose = getLandmark(landmarks, "NOSE");
  const leftShoulder = getLandmark(landmarks, "LEFT_SHOULDER");
  const rightShoulder = getLandmark(landmarks, "RIGHT_SHOULDER");
  const bothShoulders = !!leftShoulder && !!rightShoulder;

  const shoulderWidth =
    leftShoulder && rightShoulder
      ? Math.hypot(
          leftShoulder.x - rightShoulder.x,
          leftShoulder.y - rightShoulder.y,
        )
      : 0;
  const tooClose = shoulderWidth > TOO_CLOSE_SHOULDER_WIDTH;

  return [
    { ok: present, label: present ? "Person detected" : "Step into view" },
    {
      ok: !!nose,
      label: nose ? "Face visible" : "Center your head in the frame",
    },
    {
      ok: bothShoulders,
      label: bothShoulders
        ? "Both shoulders visible"
        : "Make sure both shoulders are visible",
    },
    {
      ok: present && !tooClose,
      label: tooClose ? "Move slightly farther from the screen" : "Good distance",
    },
    {
      ok: quality.usable,
      label: quality.usable
        ? "Detection confidence is good"
        : quality.reason === "too_much_movement"
          ? "Hold still for a moment"
          : "Improve the lighting in front of you",
    },
  ];
}

export function PlacementFeedback({
  checks,
}: {
  checks: readonly PlacementCheck[];
}): JSX.Element {
  return (
    <ul className="placement-checks">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? "check ok" : "check pending"}>
          <span aria-hidden>{c.ok ? "✓" : "○"}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}
