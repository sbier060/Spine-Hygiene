# Performance

Spine-IQ runs all day, so resource usage is a product requirement, not an
afterthought. This documents the budgets, what the app does to hit them, the
developer-mode instrumentation, and how to profile on a Mac (the only place the
real numbers can be measured).

## Budgets (modern Apple Silicon, while monitoring)

| Metric                              | Target        | Preferred |
| ----------------------------------- | ------------- | --------- |
| Average RAM                         | < 250 MB      | < 180 MB  |
| Average CPU, stable posture         | < 2%          |           |
| Average CPU, active analysis        | < 5%          |           |
| Camera-off CPU                      | ≈ 0%          |           |

No continuous 30 fps. No visible preview during normal monitoring. No
full-resolution frame storage. No dashboard rendering when the dashboard is closed.

## How the app stays cheap

- **Adaptive inference** (`monitoring/adaptiveInference.ts`): the scheduler picks
  the next delay from the current state — away 5 s, stable ~1.8 s, drifting 0.4 s,
  poor ~1 s, paused → stop. Frequency scales with what's happening.
- **Low-res hidden camera**: 640×360 @ 5–10 fps, `audio:false`; the `<video>` is
  never shown during monitoring.
- **Offscreen downscale**: each frame is captured to a ≤256-px ImageBitmap for
  inference (`camera/frameSampler.ts`), then **closed immediately** — no frame is
  retained or drawn to the UI.
- **Worker inference**: MediaPipe runs in `workers/poseWorker.ts`, keeping the
  main thread responsive.
- **Camera lifecycle**: pausing (or the scheduler returning "stop") releases the
  camera tracks, so the macOS camera indicator turns off and CPU approaches zero.
  Leaving the monitor screen resets the controller and stops the camera.
- **Closed-dashboard cost**: the dashboard's refresh timer only runs while the
  `DashboardScreen` is mounted; when it's closed there is no polling.

## Developer-mode instrumentation

`monitoring/performanceInstrumentation.ts` keeps **rolling averages** (not
per-frame logs) and surfaces them in the monitor screen's developer section:

- average inference time (ms) and inferences per minute
- frames rejected for low confidence (count + ratio)
- average posture score
- current scheduler mode
- camera resolution

Enable "developer details" on the monitor screen to see them live.

## Profiling checklist (run on macOS)

Do this on the target hardware — this project's Linux CI can only run the unit
tests and build, not measure CPU/RAM/battery.

1. **Build a release app**: `npm run tauri build`, then launch the `.app`.
2. **RAM / CPU — Activity Monitor**: find "Spine-IQ".
   - Idle stable posture: CPU should sit **< 2%**, RAM **< 250 MB** (aim < 180 MB).
   - Trigger drift/poor: CPU may rise but should stay **< 5%**.
   - Pause monitoring: CPU should fall to **≈ 0%** and the macOS **camera
     indicator should turn off**.
3. **Inference time**: open developer details on the monitor screen; average
   inference should be a few ms to low tens of ms with the `lite` model. If high,
   confirm the GPU delegate loaded (the worker requests `delegate: "GPU"`).
4. **Battery — `powermetrics`** (needs sudo):
   `sudo powermetrics --samplers cpu_power -i 1000 -n 10` while monitoring; note
   package power. Compare paused vs. active.
5. **Instruments (optional)**: Time Profiler to find main-thread hotspots;
   Allocations to watch RAM growth over a long run (should be flat — no per-frame
   retention).
6. **Lifecycle**: sleep the Mac / lock the screen / unplug or cover the camera —
   the app must not crash, should pause/reduce work, and resume cleanly.
7. **All-day soak**: leave it running a full workday; RAM should not creep and
   false posture alerts should be rare.

## If a budget is missed

Tuning knobs, in order of impact: raise the adaptive intervals
(`DEFAULT_INTERVALS`), lower the inference resolution (`INFERENCE_MAX_WIDTH`),
increase EMA smoothing (fewer state changes → fewer notifications), or reduce the
sandbox/monitor UI update rate. All are constants, isolated from the scoring and
state-machine logic.
