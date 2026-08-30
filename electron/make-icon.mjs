/**
 * Generates electron/resources/icon.ico — a 256×256 "Dark Terminal" mark:
 * warm-charcoal rounded square with the amber ▌ bar. No image libraries.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 256;
const bg = [17, 16, 21]; // #111015
const surface = [28, 25, 22]; // #1C1916
const amber = [245, 166, 35]; // #F5A623

const px = Buffer.alloc(S * S * 4); // RGBA
const r = 44; // corner radius
const inset = 14;

function rounded(x, y) {
  const lo = inset,
    hi = S - inset;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = x < lo + r ? lo + r : x > hi - r ? hi - r : x;
  const cy = y < lo + r ? lo + r : y > hi - r ? hi - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    let c = bg;
    let a = 0;
    if (rounded(x, y)) {
      c = surface;
      a = 255;
      // amber bar
      if (x >= 62 && x <= 96 && y >= 64 && y <= 192) c = amber;
      // three "ticker rows" to the right
      if (x >= 112 && x <= 200) {
        if ((y >= 78 && y <= 96) || (y >= 118 && y <= 136) || (y >= 158 && y <= 176))
          c = [122, 112, 104];
      }
    }
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = a;
  }
}

// ── PNG encode ─────────────────────────────────────────────────────────────
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type RGBA

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

// ── ICO wrapper (PNG payload) ──────────────────────────────────────────────
const dir = Buffer.alloc(16);
dir[0] = 0; // width 256 → 0
dir[1] = 0; // height 256 → 0
dir.writeUInt16LE(1, 4); // colour planes
dir.writeUInt16LE(32, 6); // bpp
dir.writeUInt32LE(png.length, 8);
dir.writeUInt32LE(22, 12); // offset

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count

const ico = Buffer.concat([header, dir, png]);
const out = resolve(dirname(fileURLToPath(import.meta.url)), 'resources', 'icon.ico');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, ico);
console.log(`wrote ${out} (${ico.length} bytes)`);
