# Privacy

Spine-IQ is built to watch your posture **without watching you**. Everything runs
on your own computer.

## Guarantees

- **No camera uploads.** Frames never leave the machine.
- **No video recording.** Frames are held only in memory for inference and then
  discarded (`ImageBitmap.close()` immediately after each detection).
- **No screenshots or frame storage.** Nothing from the camera is written to disk.
- **No microphone access.** The camera stream is requested with `audio: false`.
- **No accounts, no cloud, no analytics, no crash reporting.**
- **No inference through an external API.** The MediaPipe model runs locally in a
  Web Worker inside the app.
- **No background network for monitoring.** After the model is installed once, the
  app needs no network connection to monitor posture.

## The only network access

The MediaPipe pose model and its WASM runtime are downloaded **once** at setup
time by `npm run setup:models` (invoked automatically on `npm install`):

- Model: `pose_landmarker_lite.task` from Google's public model storage.
- WASM runtime: copied out of the local `@mediapipe/tasks-vision` package.

Both are stored under `public/` and served locally thereafter. You can also place
the model file into `public/models/` manually and run fully offline.

## What is stored locally

Spine-IQ persists **derived summaries only** in a local SQLite database (never
frames). Settings are kept in the WebView's localStorage; sessions, events, and
calibration profiles are in SQLite on this computer. Writes are periodic
(≈once/min and at session end), never per frame:

| Table                 | Contents (all derived, no images)                          |
| --------------------- | ---------------------------------------------------------- |
| `settings`            | Your preferences (reminder times, sensitivity, etc.)       |
| `calibration_profiles`| Baseline feature medians/variances + camera dimensions      |
| `work_sessions`       | Per-session seconds sitting/standing/away + reminder counts |
| `posture_events`      | Posture drift/alert events (scores + timestamps)            |
| `position_events`     | Sitting/standing changes (automatic + manual corrections)   |

Feature values are small normalized numbers (e.g. "head is 0.8× the calibrated
head-forward ratio"). They are not images and cannot reconstruct one.

## Camera indicator

When monitoring pauses or stops, Spine-IQ stops the camera tracks, so the macOS
camera indicator turns **off** — a visible confirmation the camera is not active.
