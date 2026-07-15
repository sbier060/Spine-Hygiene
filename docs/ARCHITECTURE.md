# Architecture

Spine-IQ is a Tauri 2 app: a Rust shell hosting a WebView that runs the React/TS
front end. Posture logic lives in the front end (where the camera and MediaPipe
are); the Rust shell owns native surfaces (tray, window, and — in later phases —
notifications, autostart, SQLite).

## Data flow (per inference tick)

```
CameraManager (getUserMedia, low-res)
        │  hidden <video>
        ▼
frameSampler.captureFrameBitmap ──► ImageBitmap (downscaled)
        │  transferred (zero-copy)
        ▼
poseWorker (Web Worker)  ── MediaPipe Pose Landmarker ─► landmarks[]
        │  bitmap.close()  ← frame discarded here
        ▼
featureExtractor.extractFeatures ─► normalized PostureFeatures
        ▼
poseQuality.assessDetectionQuality ─► usable? confidence
        ▼
postureScorer.scorePosture(features, baseline) ─► score 0–1 + band
        ▼
smoothing (EMA) ─► smoothed score
        ▼
appState reducer ─► LiveReading ─► UI (sandbox / overlay)
```

The frame never touches the visible UI during monitoring and is closed the moment
inference returns. Previews (onboarding/calibration/dev) mirror the hidden video
onto a canvas separately; they draw nothing to disk.

## Module map

| Area        | Modules                                                                 | Purity |
| ----------- | ----------------------------------------------------------------------- | ------ |
| `pose/`     | `landmarkTypes`, `featureExtractor`, `poseQuality`, `smoothing`, `poseLandmarker` (facade) | pure except the facade |
| `posture/`  | `postureTypes`, `postureThresholds`, `postureScorer`, `calibrationService` | pure |
| `camera/`   | `cameraTypes`, `cameraPermissions`, `cameraManager`, `frameSampler`     | side-effectful (browser APIs) |
| `workers/`  | `poseWorker`                                                            | worker |
| `app/`      | `appState` (reducer), `AppProvider`, `router`                          | state/UI |
| `hooks/`    | `usePoseLoop` (ties the pipeline together)                             | effectful |
| `components/`| `CameraPreview`, `LandmarkOverlay`, `PlacementFeedback`               | UI |
| `screens/`  | `OnboardingScreen`, `CalibrationScreen`, `DevSandboxScreen`            | UI |
| `utils/`    | `errors` (typed `SpineIqError`)                                        | pure |
| `src-tauri/`| `lib.rs`, `main.rs`, `tray.rs`, `app_lifecycle.rs`, `commands.rs`      | Rust |

## Design rules honored

- **Separation:** scoring, state, camera, and UI are distinct. No camera logic or
  business logic inside React components.
- **Testability:** every scoring/feature/smoothing function is pure and unit
  tested (see `tests/`); browser/Tauri APIs are isolated at the edges.
- **No large global store:** a single typed reducer (`appState`) holds UI state.
- **Adaptive by design:** the sandbox uses a fixed ~2 fps cadence; Phase 2 swaps
  in the adaptive scheduler behind the same `usePoseLoop` seam.

## Phase status

Phase 1 (this build): shell + tray + camera + MediaPipe + overlay + sitting
calibration + live features/scores + unit tests. Phases 2–5 (state machine,
adaptive inference, away detection, notifications, position tracking, SQLite,
dashboard, optimization) are scaffolded for but not yet implemented — see
`docs/PRODUCT_SPEC.md`.
