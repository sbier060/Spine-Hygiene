# Spine-IQ

A quiet macOS **menu-bar wellness utility** that watches your posture — locally,
privately — and nudges you when you've been leaning forward or sitting too long.
It's a wellness tool, **not a medical device**.

> **All five MVP phases done.** Phase 1: detection sandbox. Phase 2: the posture
> monitor — timed **state machine** (drift → poor-candidate → poor-confirmed →
> cooldown), **adaptive inference** (camera released when paused), **away
> detection**, calm **native notifications**, **menu-bar status** with
> **pause/resume**, and **settings** that tune the monitor. Phase 3: **position
> tracking** — optional standing calibration, a confidence-based **sitting/standing
> classifier**, **duration tracking**, **sitting/standing reminders**, and manual
> "I'm sitting / I'm standing". Phase 4: **history** — local **SQLite** (derived
> summaries only, never frames), a **dashboard** (today's sitting/standing/away,
> longest sessions, reminder count, posture consistency), a position-change
> **timeline**, and **delete/export**. Phase 5: **optimization** — rolling
> performance instrumentation (developer mode) and camera-lifecycle hardening; see
> [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) for budgets + a macOS profiling
> checklist. On-device CPU/RAM/battery numbers are measured on the Mac.

## What it does

- Detects when your head leans forward / your shoulders round, relative to a
  **personalized** calibrated baseline (not universal thresholds).
- Runs pose detection **on-device** in a Web Worker; webcam frames are discarded
  the instant inference finishes.
- Designed to run all day with minimal CPU/RAM (adaptive inference; no continuous
  30 fps; no visible preview during normal monitoring).

## Privacy

All processing is local. **No camera uploads, no video recording, no screenshots,
no microphone, no accounts, no cloud, no analytics, no external inference API, and
no background network for monitoring** once the model is installed. The camera
indicator turns off whenever monitoring pauses. Full details:
[`docs/PRIVACY.md`](docs/PRIVACY.md).

## Architecture (summary)

Tauri 2 (Rust shell) + React/TypeScript/Vite (front end). Camera → frame sample →
pose worker (MediaPipe) → normalized features → detection quality → personalized
score → smoothing → UI. Scoring/calibration/smoothing are pure and unit-tested;
camera and MediaPipe sit behind small seams. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/POSTURE_MODEL.md`](docs/POSTURE_MODEL.md).

## Prerequisites

- Node.js and npm
- Rust (via <https://rustup.rs>)
- Apple Command Line Tools — check first with `xcode-select -p` (if it prints a
  path you already have them; skip). Otherwise `xcode-select --install`. This is
  the small standalone compiler/linker package and **does not require the Xcode
  IDE**, an Apple Developer Program membership, or App Store submission.
- An editor: Cursor, VS Code, or another. (Xcode is not required.)

## Installation

```sh
git clone https://github.com/sbier060/Spine-Hygiene.git
cd Spine-Hygiene
npm install            # postinstall downloads the pose model + MediaPipe wasm
```

## Development

```sh
npm run tauri dev      # full macOS app (camera, tray, WebView)
npm run dev            # web front end only, in a browser
```

## Build

```sh
npm run tauri icon ./app-icon.png   # once: generate real icons (.icns/.ico)
npm run tauri build                 # produces a macOS .app / .dmg
```

## Tests

```sh
npm run test:run       # Vitest unit tests (feature extraction, scoring, smoothing)
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint (type-aware)
```

## Camera-permission notes

On first run macOS asks for camera access. If you deny it, re-enable it in
**System Settings › Privacy & Security › Camera**. The required
`NSCameraUsageDescription` is bundled via `src-tauri/Info.plist`; without it macOS
silently blocks the WebView camera.

## Known limitations (Phase 1)

- The Tauri app builds and runs on **macOS**; only the pure-TS logic is
  cross-platform (and unit-tested headless).
- Hip landmarks are often not visible on laptop webcams — torso-angle is optional
  and the score reweights around it.
- Automatic sitting-vs-standing classification (Phase 3) is inherently less
  reliable from a laptop webcam and is confidence-gated with manual override.
- Notifications, history, dashboard, and the adaptive scheduler are not in this
  phase.

## Performance goals

Measured on modern Apple Silicon while monitoring: average RAM < 250 MB (target
< 180 MB), CPU < 2% during stable posture and < 5% during active analysis, ~0%
with the camera off. Achieved via adaptive inference, a hidden low-res camera, an
offscreen inference canvas, and immediate frame disposal.

## Troubleshooting

- **Camera blocked / black preview** — grant access in System Settings › Privacy &
  Security › Camera, then restart the app. Make sure no other app holds the camera.
- **"model_load_failed"** — run `npm run setup:models` to (re)download the model and
  copy the MediaPipe wasm into `public/`.
- **`tauri build` fails on icons** — run `npm run tauri icon ./app-icon.png` first.
- **Rust/linker errors** — ensure `xcode-select --install` has completed and Rust
  is installed via rustup.

## License

MIT.
