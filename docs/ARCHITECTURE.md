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
| `posture/`  | `postureTypes`, `postureThresholds`, `postureScorer`, `calibrationService`, `postureStateMachine` | pure |
| `monitoring/`| `monitoringController`, `adaptiveInference`, `presenceDetector`, `monitoringConfig`, `performanceInstrumentation`, `monitoringTypes` | pure |
| `position/` | `positionFeatures`, `positionCalibration`, `positionClassifier`, `positionStateMachine`, `durationTracker`, `positionTypes` | pure |
| `notifications/`| `notificationTypes`, `interventionRules`, `notificationService` (Tauri) | pure except the service |
| `storage/`  | `settingsRepository` (localStorage); `schema`, `database`, `session/event/calibration` repositories, `sessionAggregator`, `dashboardMetrics`, `historyStore` (SQLite) | pure logic + injectable DB |
| `camera/`   | `cameraTypes`, `cameraPermissions`, `cameraManager`, `frameSampler`     | side-effectful (browser APIs) |
| `workers/`  | `poseWorker`                                                            | worker |
| `tray/`     | `trayState` (pure mapping), `trayCommands` (Tauri bridge)              | mixed |
| `app/`      | `appState` (reducer), `AppProvider`, `router`                          | state/UI |
| `hooks/`    | `usePoseLoop` (sandbox), `useMonitoring` (adaptive background monitor)  | effectful |
| `components/`| `CameraPreview`, `LandmarkOverlay`, `PlacementFeedback`               | UI |
| `screens/`  | `OnboardingScreen`, `CalibrationScreen`, `DevSandboxScreen`, `MonitorScreen` | UI |
| `utils/`    | `errors` (typed `SpineIqError`)                                        | pure |
| `src-tauri/`| `lib.rs`, `main.rs`, `tray.rs`, `app_lifecycle.rs`, `commands.rs`      | Rust |

## Monitoring loop (Phase 2)

`useMonitoring` runs an **adaptive** loop: each tick captures one frame, and
`MonitoringController.ingest()` returns the smoothed score, posture state, whether
to notify, and the delay until the next inference. The loop reschedules itself
from that delay — frequent while drifting/poor, sparse when stable, a 5 s poll
when away, and it releases the camera entirely when paused. Notifications and tray
updates are side effects the hook performs on the controller's outputs; all the
decision logic (state machine, scheduler, presence, scoring) is pure and tested.

## Design rules honored

- **Separation:** scoring, state, camera, and UI are distinct. No camera logic or
  business logic inside React components.
- **Testability:** every scoring/feature/smoothing function is pure and unit
  tested (see `tests/`); browser/Tauri APIs are isolated at the edges.
- **No large global store:** a single typed reducer (`appState`) holds UI state.
- **Adaptive by design:** the sandbox uses a fixed ~2 fps cadence; Phase 2 swaps
  in the adaptive scheduler behind the same `usePoseLoop` seam.

## Phase status

- **Phase 1 (done):** shell + tray + camera + MediaPipe + overlay + sitting
  calibration + live features/scores + unit tests.
- **Phase 2 (done):** posture state machine, adaptive inference, presence/away
  detection, native notifications (guarded, behavioral copy), menu-bar status +
  pause/resume via the tray, settings (sensitivity/persistence) that tune the
  monitor, autostart/single-instance/window-state plugins.
- **Phase 3 (done):** optional standing calibration, confidence-based
  sitting/standing classifier (absolute frame features), position state machine
  (sustained switch, prefer-previous, manual override), duration tracking
  (current/longest/changes, away excluded), and sitting/standing duration
  reminders with cooldown. Manual "I'm sitting / I'm standing" from the window
  and the tray.
- **Phase 4 (done):** SQLite history via the Tauri SQL plugin (settings kept in
  localStorage; sessions/events/calibration in SQLite), an in-memory session
  aggregator flushed ~once/min + at session end, a dashboard (today's sitting/
  standing/away, longest sessions, reminder count, posture consistency), a
  position-change timeline, and delete/export controls.
- **Phase 5 (done):** performance instrumentation (rolling averages of inference
  time, inferences/min, rejected frames, avg score, scheduler mode, resolution —
  shown in developer mode), camera-lifecycle hardening, and an on-device profiling
  checklist (`docs/PERFORMANCE.md`). On-device CPU/RAM/battery measurement is done
  on the Mac.

**All five MVP phases are implemented.** See `docs/PERFORMANCE.md` for budgets and
profiling, and `docs/PRODUCT_SPEC.md` for the definition of done.

### History (Phase 4)

Repositories depend on a small `SpineDatabase` interface, not on Tauri, so their
logic is unit-tested with an in-memory fake; the real implementation is the Tauri
SQL plugin and only runs natively. `HistoryStore` always keeps an in-memory
aggregator (so the dashboard works in a plain browser) and, when a database
attaches (native app), persists summaries/events/calibration. Only derived
numbers are stored — **never frames**, and writes are periodic, never per frame.

### Position tracking (Phase 3)

Posture and position run in parallel inside `MonitoringController`. Position uses
**absolute** frame features (`positionFeatures`) — shoulder/head height, face
size — because normalized posture features are distance-invariant and can't tell
sitting from standing. The classifier is deliberately conservative: it returns
`unknown` unless one calibrated baseline is clearly closer. The position state
machine requires a sustained classification before switching and prefers the
previous state when uncertain; manual corrections apply immediately. Away/unknown
time never counts as sitting or standing.
