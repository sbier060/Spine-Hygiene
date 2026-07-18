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

// ---- Branded app icon -------------------------------------------------------
// Dark rounded square, soft vital-green glow, five vertebra dots tracing the
// Spine-IQ S-curve (mirrors src/components/Logo.tsx). Rendered per-pixel so we
// need no image dependencies.

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (c1, c2, t) => [
  lerp(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t),
];
// Vital-green gradient stops (top → mid → bottom), from BRAND.md.
const VITAL_TOP = [84, 230, 192];
const VITAL_MID = [62, 207, 142];
const VITAL_DEEP = [31, 157, 95];
const vitalAt = (t) =>
  t < 0.55
    ? lerp3(VITAL_TOP, VITAL_MID, t / 0.55)
    : lerp3(VITAL_MID, VITAL_DEEP, (t - 0.55) / 0.45);

// Signed distance to a rounded rectangle centered at (cx,cy).
function roundedRectDist(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function makeAppIcon(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const margin = size * 0.08;
  const half = size / 2;
  const hw = half - margin;
  const radius = size * 0.185;
  // Spine dots in the 64-unit logo space, mapped into the tile with padding.
  const DOTS = [
    [27, 10, 7],
    [34, 23.5, 5],
    [37, 35.5, 5.5],
    [33, 46.5, 6],
    [26, 56, 6.5],
  ];
  const inset = size * 0.2;
  const scale = (size - inset * 2) / 64;
  const glowCx = half + size * 0.02;
  const glowCy = size * 0.62;
  const glowR = size * 0.52;
  const edge = Math.max(1.5, size / 300);

  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Tile alpha from the rounded-rect SDF (antialiased edge).
      const d = roundedRectDist(x, y, half, half, hw, hw, radius);
      const tileA = d <= -edge ? 1 : d >= 0 ? 0 : -d / edge;

      // Background: vertical charcoal-navy blend + radial green glow.
      const tv = y / (size - 1);
      let [r, g, b] = lerp3([16, 24, 38], [9, 13, 19], tv);
      const gd = Math.hypot(x - glowCx, y - glowCy) / glowR;
      if (gd < 1) {
        const glow = (1 - gd) * (1 - gd) * 0.22;
        r = lerp(r, VITAL_DEEP[0], glow);
        g = lerp(g, VITAL_DEEP[1], glow);
        b = lerp(b, VITAL_DEEP[2], glow);
      }

      // Spine dots (drawn over the background, antialiased).
      for (const [dx, dy, dr] of DOTS) {
        const px = inset + dx * scale;
        const py = inset + dy * scale;
        const rr = dr * scale;
        const dist = Math.hypot(x - px, y - py);
        if (dist < rr + edge) {
          const a = dist <= rr - edge ? 1 : Math.max(0, (rr + edge - dist) / (2 * edge));
          const c = vitalAt(dy / 64);
          r = lerp(r, c[0], a);
          g = lerp(g, c[1], a);
          b = lerp(b, c[2], a);
        }
      }

      raw[o++] = Math.round(r);
      raw[o++] = Math.round(g);
      raw[o++] = Math.round(b);
      raw[o++] = Math.round(tileA * 255);
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

// App icons (branded; macOS .icns/.ico come from `npm run tauri icon ./app-icon.png`).
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
  writeFileSync(dest, makeAppIcon(size));
  console.log(`✓ ${name} (${size}×${size}, branded)`);
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
