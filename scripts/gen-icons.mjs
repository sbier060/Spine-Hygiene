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

const ACCENT = [80, 200, 255, 255]; // Spine-IQ accent
const TEMPLATE = [255, 255, 255, 255]; // macOS template icon is drawn in white

const files = [
  ["32x32.png", 32, ACCENT],
  ["128x128.png", 128, ACCENT],
  ["128x128@2x.png", 256, ACCENT],
  ["icon.png", 512, ACCENT],
  ["app-icon.png", 1024, ACCENT], // source for `tauri icon`
  // Tray icons (see src-tauri/src/tray.rs). Template = white so macOS tints it.
  ["tray-normal.png", 32, TEMPLATE],
  ["tray-warning.png", 32, TEMPLATE],
  ["tray-alert.png", 32, TEMPLATE],
  ["tray-paused.png", 32, TEMPLATE],
];

for (const [name, size, color] of files) {
  const dest =
    name === "app-icon.png"
      ? join(__dirname, "..", "app-icon.png")
      : join(iconsDir, name);
  writeFileSync(dest, makePng(size, color));
  console.log(`✓ ${name} (${size}×${size})`);
}
console.log(
  "\nPlaceholder icons written. On macOS run `npm run tauri icon ./app-icon.png` for real icons + .icns/.ico.",
);
