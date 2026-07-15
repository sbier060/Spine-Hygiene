# Spine-IQ — Product Specification

This is the source-of-truth spec for Spine-IQ, an internal/personal-use macOS
menu-bar posture & position wellness utility. It is a **wellness utility, not a
medical device**. Avoid medical language (spinal damage, diagnosis, disc
compression, alignment diagnosis, "medically correct" posture). Use behavioral
language (leaning forward, posture drift, shoulders rounded, sitting/standing
duration).

## Constraints

**Do not use:** Electron · Xcode as the dev environment · native SwiftUI · App
Store distribution · Apple Developer Program features · cloud processing · user
accounts · a backend · video recording · image uploads.

**Use:** Tauri 2 · React · TypeScript · Vite · Rust (Tauri shell) · MediaPipe Pose
Landmarker · SQLite (local history) · native Tauri notifications · Tauri system
tray · Tauri autostart · Apple Command Line Tools only where macOS compilation
requires them.

## Product goal

Run quietly in the background all workday and:

1. Detect leaning forward / hunching.
2. Wait until poor posture is sustained before notifying.
3. Track sitting / standing / away / unknown.
4. Track how long the user has held the current position.
5. Notify after sitting or standing too long.
6. Show current posture & position state from the menu bar.
7. Process all webcam frames locally.
8. Discard frames immediately after inference.
9. Use minimal CPU, RAM, battery.

## Primary technical constraint — resource budgets (Apple Silicon)

- Average RAM while monitoring < 250 MB (preferred < 180 MB)
- Average CPU during stable posture < 2%; during active analysis < 5%
- Camera-off CPU near 0%
- No continuous 30 fps; no visible preview during normal monitoring; no
  full-resolution frame storage; no background dashboard rendering when closed
- Use **adaptive inference**, not a fixed high frame rate.

## Menu-bar application

Primarily a menu-bar app; the main window is not visible during normal
monitoring. Menu shows: current posture state · current position state · time in
current position · Start monitoring · Pause 15/30/60 min · Resume · Mark sitting ·
Mark standing · Open dashboard · Settings · Quit.

- **Posture states:** Good · Drifting · Hunching · Low confidence · Away · Paused
- **Position states:** Sitting · Standing · Away · Unknown
- **Tray icon states:** Normal · Warning · Alert · Paused · Camera unavailable —
  never rely on color alone; also change shape or status label.

## Onboarding

1. **Privacy** — "Spine-IQ analyzes posture directly on this computer. Camera
   images are not uploaded, recorded, or saved." Require continue before camera.
2. **Camera permission** — request access; clear failure + re-enable instructions.
3. **Camera placement** — temporary preview; check person present, face visible,
   both shoulders visible, landmark confidence, not too close, adequate lighting;
   show actionable feedback.
4. **Sitting calibration** — collect ~10 s of valid landmarks; reject low
   confidence; build a personalized baseline via **median**; store baseline
   features, variance, camera dimensions, device id, timestamp, confidence.
5. **Standing calibration** — optional; separate standing baseline; skippable.
6. **Reminder settings** — defaults: sitting reminder 50 min · standing 45 min ·
   poor-posture persistence 60 s · posture cooldown 15 min · position cooldown
   15 min · launch at login on · sound off.

## Camera behavior

Browser camera API inside the Tauri WebView. Lowest practical resolution:

```
{ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 5, max: 10 } }, audio: false }
```

No microphone. Preview only during onboarding, calibration, camera testing, and
dev mode. During normal monitoring: keep the video hidden; don't draw frames to
visible UI; use a small offscreen canvas; discard image data immediately; never
save screenshots or video.

## Pose detection

MediaPipe Pose Landmarker, in a Web Worker where possible. Do **not** run
inference at camera frame rate. Prioritized landmarks: nose, left/right ear,
left/right shoulder, left/right hip. Hips may be missing on laptop webcams — all
posture logic must tolerate missing hips and must not fail with only head +
shoulders visible.

## Feature extraction

Normalized (shoulder width / face size / stable body-relative measure), not raw
pixels. Compute at least: head-forward, screen-lean (avoid triggering when the
whole camera moves), shoulder-slope (cautiously), shoulder-collapse, torso-angle
(optional; hips only), and a detection-quality score. If confidence is too low,
do not classify.

## Personalized score

Compare against the user's baseline, per feature:

```
normalizedDeviation = Math.abs(currentValue - baselineMedian) / Math.max(baselineDeviation, minimumAllowedDeviation)
```

Weights (rebalance when a feature is unavailable):
`{ headForward: 0.4, screenLean: 0.3, shoulderCollapse: 0.2, torsoAngle: 0.1 }`.
Score 0–1: 0.00–0.35 good · 0.35–0.60 drifting · > 0.60 poor candidate. Tunable
constants. Don't notify from one high score.

## Smoothing

EMA (`alpha` 0.15–0.3), rolling medians, outlier rejection, confidence weighting,
minimum-state durations, hysteresis (enter poor > 0.60, return good < 0.40).

## Posture state machine

`good | drifting | poor_candidate | poor_confirmed | cooldown | low_confidence |
away | paused`. Drifting: score exceeds drift threshold ≥ 10 s (no notify). Poor
candidate: exceeds poor threshold; start persistence timer. Poor confirmed:
sustained for the configured duration (default 60 s) → one notification. Cooldown:
no posture notification for 15 min (keep tracking). Reset: return to good only
after score stays below the reset threshold 15–20 s.

Calm, short, behavioral notifications; avoid "bad posture detected", spine-damage,
danger, medical warnings, or repeated alerts.

## Adaptive inference

Scheduler adjusts frequency: away → presence check every 5 s (no full inference);
stable good → every 1.5–2 s; drifting → 2–3×/s; confirmed poor → ~1/s (reduce
after notifying); paused/camera-off → stop inference, stop tracks, CPU ≈ 0.
Implement independently of the posture model and unit test it.

## Presence / away

Away when no reliable person/face for ≥ 20 s (not after one missed frame). While
away: pause sitting/standing timers, don't count away as sitting, no posture
notifications, reduce camera workload. On return: require several valid detections
before resuming classification.

## Sitting vs standing (secondary)

Confidence-based layered classification (similarity to sitting/standing
calibration, head/shoulder height, face size, torso visibility, framing, previous
state, transition movement). Require sustained classification; don't switch on one
frame; prefer previous state when low confidence; show unknown when poor; allow
manual "I'm sitting" / "I'm standing". On manual correction: update immediately,
store a correction event, optionally improve baseline, never silently retrain from
low-confidence data.

## Duration tracking & reminders

Track current sitting/standing/away/unknown durations, longest sitting/standing
sessions, number of position changes. Sitting reminder after 50 continuous min;
standing after 45; 15-min reminder cooldown; a position change resets the relevant
timer; away time counts as neither.

## Local notifications

Tauri notification plugin; request permission during onboarding. Categories: poor
posture, sitting duration, standing duration, camera unavailable, calibration
needed. Clicking opens the current-status window. Don't notify while paused, away,
computer locked, in onboarding, or during a cooldown.

## Local persistence (SQLite)

Store only derived measurements/summaries — never frames. Tables: `settings`,
`calibration_profiles`, `work_sessions`, `posture_events`, `position_events`
(sources: automatic · manual · calibration · system). Aggregate in memory; write
summaries periodically (e.g. once/min and at session end).

## Dashboard

Current posture/position, time in position, today's sitting/standing/away, longest
uninterrupted sitting/standing, posture reminder count, posture consistency
`good / (good + poor)` (excluding away/unknown/paused/low-confidence), timeline of
position changes. Not a medical health score.

## Settings

Posture (sensitivity low/balanced/high, persistence, cooldown, recalibrate
sitting/standing) · position reminders (enable + durations) · camera (selection,
test, show confidence, dev landmark overlay) · general (launch at login, auto-start
monitoring, sound, working hours, pause, reset onboarding) · privacy (local
processing explanation, delete history, delete calibration, export summary, confirm
no image storage).

## System behavior

Pause/reduce work when sleeping, screen locked, logged out, camera unavailable,
manually paused, or another app has exclusive camera. Resume gracefully; never
crash if the camera disappears or permissions change. Clear status messages
(camera unavailable, monitoring paused, camera in use, recalibration recommended,
detection confidence low).

## Error handling

Every camera/database/notification/MediaPipe operation has explicit handling — no
silent failures. Typed errors, e.g.:

```ts
type SpineIqError =
  | { type: "camera_permission_denied"; message: string }
  | { type: "camera_unavailable"; message: string }
  | { type: "model_load_failed"; message: string }
  | { type: "database_error"; message: string }
  | { type: "notification_permission_denied"; message: string };
```

Log technical errors locally during development; never log raw camera data.

## Developer mode

Disabled by default; may show preview, landmarks, confidence, raw & smoothed
features, posture score, state, inference rate, average inference duration,
estimated workload, position-classification confidence. Essential for tuning.
Performance instrumentation (inference duration, inferences/min, rejected frames,
average score, scheduler mode, resolution, worker/main-thread time) is shown only
in dev mode as rolling averages — no third-party analytics.

## Testing

Vitest unit tests for: posture scorer (good near baseline, large head-forward,
missing torso, missing shoulder, low confidence, reweighting) · state machine (one
poor frame no notify, sustained transitions, cooldown, good resets, low confidence
pauses) · duration tracker (sitting increases, away pauses, position change resets,
sitting fires once, cooldown) · adaptive inference (stable reduces, drifting
increases, away reduces, paused stops) · position classifier (sitting/standing
similarity, low-confidence unknown, manual override).

## Privacy requirements

No camera uploads, no video recording, no screenshot storage, no microphone, no
cloud account, no third-party analytics, no external inference API, no background
network for monitoring after model install. Prefer bundling the model; document
exact local data in `docs/PRIVACY.md`.

## Implementation phases

1. **Detection sandbox** — shell, camera permission, preview, landmarks, dev
   overlay, live features + score, sitting calibration, no notifications. *(this
   build)*
2. **Posture monitor** — smoothing, state machine, adaptive inference, away
   detection, native notifications, menu-bar status, pause/resume, local settings.
3. **Position tracking** — standing calibration, classifier, manual controls,
   duration tracking, sitting/standing reminders.
4. **History** — SQLite, daily summaries, dashboard, timeline, delete/export.
5. **Optimization** — CPU, RAM, inference time, battery, camera lifecycle, hidden
   WebView behavior, worker behavior.

## Definition of done (MVP)

Menu-bar app · starts without a permanent window · requests camera · sitting
calibration · detects sustained forward drift · notifies only after sustained poor
posture · notification cooldown · away detection · tracks sitting/standing/away/
unknown · manual sit/stand corrections · sitting/standing reminders · stores only
local derived data · never stores frames · pause/resume · dev diagnostics · unit
tests pass · builds from the command line · no Xcode IDE · no Apple Developer
Program · no App Store.
