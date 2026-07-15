# Development

Spine-IQ targets **macOS on Apple Silicon**. The Tauri app (tray, camera,
MediaPipe-in-WebView) builds and runs on macOS. The pure TypeScript logic
(feature extraction, posture scoring, smoothing) is unit-tested headless and runs
anywhere Node runs.

## Prerequisites (macOS)

- **Node.js** ≥ 18 and **npm**
- **Rust** (stable) — install via <https://rustup.rs>
- **Apple Command Line Tools**:

  ```sh
  xcode-select --install
  ```

  This installs Apple's compiler command-line tools (clang, etc.) that Rust needs
  to link a macOS binary. **It does not require using the Xcode IDE** — you never
  open Xcode. There is no Apple Developer Program membership and no App Store step.

- An editor: **Cursor, VS Code**, or any other. (Xcode is *not* a prerequisite.)

## First-time setup

```sh
npm install            # installs deps; postinstall downloads the pose model + wasm
npm run setup:models   # (re)download model + copy MediaPipe wasm, if needed
npm run setup:icons    # regenerate placeholder icons, if needed
```

`npm run setup:models` fetches `pose_landmarker_lite.task` once and copies the
MediaPipe WASM runtime into `public/`. After that the app runs fully offline.

## Everyday commands

| Command                       | What it does                                            |
| ----------------------------- | ------------------------------------------------------- |
| `npm run tauri dev`           | Run the full macOS app (camera, tray, WebView)          |
| `npm run dev`                 | Run just the web front end in a browser (no Tauri)      |
| `npm run test` / `test:run`   | Vitest unit tests (watch / once)                        |
| `npm run typecheck`           | `tsc --noEmit`                                           |
| `npm run lint`                | ESLint (type-aware)                                     |
| `npm run build`               | Type-check + Vite production build                      |
| `npm run tauri build`         | Build the distributable macOS `.app` / `.dmg`           |

### Real app icons (before `tauri build`)

The repo ships simple placeholder icons so `tauri dev` runs immediately. For a
real bundle, generate the full icon set (including `.icns`/`.ico`) from a source
PNG:

```sh
npm run tauri icon ./app-icon.png
```

## macOS camera permission

`getUserMedia` inside the WKWebView requires `NSCameraUsageDescription`. It is set
in `src-tauri/Info.plist` and merged into the app bundle by Tauri — **without it
macOS silently blocks the camera**. On first run macOS prompts for camera access;
if denied, re-enable it in **System Settings › Privacy & Security › Camera**.

## Project layout

See `docs/ARCHITECTURE.md` for the module map and data flow. Business logic
(scoring, calibration, smoothing) is pure and lives outside React; camera and
MediaPipe live behind small seams so the logic stays testable.

## Coding standards

Strict TypeScript, explicit types, small focused modules, pure functions for
scoring, no `any`, no silent promise failures, no camera/business logic inside
React components, no large global mutable store. Notification/UI strings are
centralized rather than scattered. ESLint enforces `no-explicit-any` and
`no-floating-promises`.
