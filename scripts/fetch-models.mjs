// Downloads the MediaPipe assets Spine-IQ needs into public/ so the app can run
// fully offline afterwards. Run once: `npm run setup:models`.
//
// Privacy note: this is the ONLY network access the app requires, and it happens
// at setup time — never during monitoring. See docs/PRIVACY.md.
import { createWriteStream } from "node:fs";
import { mkdir, access, readdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);

// The pose landmarker LITE model — smallest, best fit for the CPU/RAM budget.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const MODEL_DEST = join(root, "public", "models", "pose_landmarker_lite.task");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  await mkdir(dirname(dest), { recursive: true });
  if (await exists(dest)) {
    console.log(`✓ already present: ${dest}`);
    return;
  }
  console.log(`↓ downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`✓ saved ${dest}`);
}

// Copy the MediaPipe WASM runtime out of node_modules so it is served locally
// (no CDN at runtime). tasks-vision ships these under its `wasm/` folder. The
// package's `exports` map blocks resolving package.json, so locate the package
// root via its main entry and fall back to the conventional node_modules path.
async function copyWasm() {
  let pkgRoot;
  try {
    const entry = require.resolve("@mediapipe/tasks-vision");
    pkgRoot = dirname(entry);
  } catch {
    pkgRoot = join(root, "node_modules", "@mediapipe", "tasks-vision");
  }
  let wasmSrcDir = join(pkgRoot, "wasm");
  if (!(await exists(wasmSrcDir))) {
    wasmSrcDir = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
  }
  const wasmDestDir = join(root, "public", "wasm");
  await mkdir(wasmDestDir, { recursive: true });
  const { cp } = await import("node:fs/promises");
  await cp(wasmSrcDir, wasmDestDir, { recursive: true });
  const files = await readdir(wasmDestDir);
  console.log(`✓ copied ${files.length} MediaPipe wasm files → public/wasm`);
}

let failed = false;

// Copy WASM first — it's a local copy out of node_modules and never touches the
// network, so it should always succeed once deps are installed.
try {
  await copyWasm();
} catch (err) {
  failed = true;
  console.error("✗ could not copy MediaPipe wasm:", err.message);
}

try {
  await download(MODEL_URL, MODEL_DEST);
} catch (err) {
  failed = true;
  console.error("✗ model download failed:", err.message);
  console.error(
    "  Retry `npm run setup:models`, or place pose_landmarker_lite.task in public/models/ manually.",
  );
}

if (failed) {
  process.exit(1);
}
console.log("\nDone. Spine-IQ can now run offline.");
