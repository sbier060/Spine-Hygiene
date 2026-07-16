// Generates simple solid-color placeholder PNG icons so `tauri dev` runs out of
// the box. Replace them with real icons by running `npm run tauri icon
// ./app-icon.png` on macOS (that also produces icon.icns / icon.ico for bundling).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Solid RGBA square. color = [r,g,b,a].
function makePng(size, color) {
  const [r, g, b, a] = color;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Vertical-gradient filled circle on a transparent background — a colored menu-bar
// status dot. `top`/`bottom` are [r,g,b]. Antialiased at the circle edge.
function makeGradientCircle(size, top, bottom) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - size * 0.06;
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    const t = y / (size - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // 1px antialiased edge.
      let a = 255;
      if (d > radius) a = 0;
      else if (d > radius - 1.2) a = Math.round(255 * (radius - d) / 1.2);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const ACCENT = [80, 200, 255, 255]; // Spine-IQ accent

// App icons (solid accent placeholder — replace via `tauri icon`).
for (const [name, size] of [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
  ["app-icon.png", 1024],
]) {
  const dest =
    name === "app-icon.png"
      ? join(__dirname, "..", "app-icon.png")
      : join(iconsDir, name);
  writeFileSync(dest, makePng(size, ACCENT));
  console.log(`✓ ${name} (${size}×${size})`);
}

// Colored gradient status dots for the menu bar (rendered non-template so the
// color shows). 44px = crisp on retina menu bars.
const TRAY = 44;
const trayIcons = {
  "tray-normal.png": [[62, 224, 142], [31, 157, 95]], // green
  "tray-warning.png": [[255, 207, 92], [242, 163, 61]], // amber
  "tray-alert.png": [[255, 107, 107], [224, 59, 59]], // red
  "tray-paused.png": [[150, 156, 170], [96, 104, 122]], // gray
};
for (const [name, [top, bottom]] of Object.entries(trayIcons)) {
  writeFileSync(join(iconsDir, name), makeGradientCircle(TRAY, top, bottom));
  console.log(`✓ ${name} (${TRAY}×${TRAY}, gradient)`);
}

console.log(
  "\nIcons written. On macOS run `npm run tauri icon ./app-icon.png` for real app icons + .icns/.ico.",
);
