# Posture model

Spine-IQ does not use universal "correct posture" thresholds. It compares what it
sees now against **your own calibrated sitting posture**. This document describes
the features, the personalized score, and the smoothing that keeps it stable.

> Wellness utility, not a medical device. We describe behavior ("leaning
> forward", "shoulders rounded"), never medical conditions.

## Landmarks used

From MediaPipe's 33 pose landmarks we use only: nose, left/right ear, left/right
shoulder, and (when visible) left/right hip. Hips are frequently missing on
laptop webcams, so **every feature tolerates their absence**.

## Features (all normalized, body-relative)

Normalization by shoulder width / head size makes features invariant to distance,
so moving your whole body toward the camera does not by itself look like poor
posture. See `src/pose/featureExtractor.ts`.

| Feature            | Definition                                                        | Weight |
| ------------------ | ----------------------------------------------------------------- | ------ |
| `headForward`      | `(shoulderMidY − headY) / shoulderWidth` — head drop toward shoulders (2D) | 0.4 |
| `screenLean`       | `(shoulderMidZ − noseZ) / shoulderWidth` — head depth toward the camera    | 0.3 |
| `shoulderCollapse` | `shoulderWidth / headSize` — apparent shoulder span vs head size            | 0.2 |
| `torsoAngle`       | angle of shoulders→hips vs vertical (radians) — **only when hips visible**  | 0.1 |
| `shoulderSlope`    | `|leftShoulderY − rightShoulderY| / shoulderWidth` — asymmetry (advisory)   | —   |

`shoulderSlope` is shown in the dev overlay but **excluded from the score** — it's
easily tripped by reaching/turning (spec: "use cautiously").

## Detection quality

`src/pose/poseQuality.ts` produces a confidence in `[0,1]` from required-landmark
visibility, how many features are usable, whether the face is roughly toward the
camera, and (optionally) movement. Below `MIN_USABLE_QUALITY` (0.5) posture is
**not classified** — the UI shows "low confidence" rather than guessing.

## Personalized score

For each comparable feature (present now *and* in the baseline):

```
normalizedDeviation = |current − baselineMedian| / max(baselineDeviation, minDeviation)
featureScore        = min(1, normalizedDeviation / deviationSaturation)
```

Weights are **renormalized** across whatever features are available this frame, so
a missing torso-angle just redistributes its 0.1 across the rest. The final score
is the weighted sum in `[0,1]`. Bands (spec):

| Score       | Band              |
| ----------- | ----------------- |
| 0.00–0.35   | good              |
| 0.35–0.60   | drifting          |
| > 0.60      | poor candidate    |

Constants live in `src/posture/postureThresholds.ts` (weights, band boundaries,
`MIN_ALLOWED_DEVIATION`, `DEVIATION_SATURATION`, sensitivity presets). The
Settings "sensitivity" control and Phase 5 tuning both adjust values there — never
the scoring logic.

## Calibration

`src/posture/calibrationService.ts` collects ~10 s of **valid** frames (low
confidence rejected) and builds the baseline from the **median** of each feature
plus its spread. A feature needs ≥10 samples to be included; otherwise it is
omitted and the scorer reweights around it.

## Smoothing (Phase 1 partial, Phase 2 full)

Pose signals are noisy, so `src/pose/smoothing.ts` provides EMA (`alpha` 0.15–0.3),
rolling median, outlier rejection, and a hysteresis gate (enter poor > 0.60,
return to good < 0.40) to prevent state flapping. The sandbox already smooths the
score with an EMA; the full state machine (drift → poor-candidate → poor-confirmed
→ cooldown, with minimum-state durations) lands in Phase 2.
