/**
 * Draw Legible's icon: three lines of text with one word lit, as in read-aloud.
 *
 *   node tools/make-icons.mjs
 *
 * Writes an SVG and three PNGs into icons/. The PNGs are rasterised here from the same
 * shapes, with no image library: each pixel is sampled 4 by 4 for smooth edges, and the
 * file is encoded with Node's own zlib.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(out, { recursive: true });

const INK = '#1a1a1a';
const PAPER = '#ffffff';
const LIT = '#ffd447';

/** Shapes on a 512 grid: [x, y, width, height, corner radius, colour]. */
const shapes = (corner) => [
  [0, 0, 512, 512, corner, INK],
  [112, 146, 288, 46, 23, PAPER],
  [112, 233, 92, 46, 23, PAPER],
  [222, 221, 178, 70, 18, LIT],
  [112, 320, 212, 46, 23, PAPER],
];

const svg = (corner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Legible">\n` +
  shapes(corner)
    .map(([x, y, w, h, r, fill]) => `  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`)
    .join('\n') +
  `\n</svg>\n`;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function inside(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function png(size, corner) {
  const scale = 512 / size;
  const list = shapes(corner);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter on this row
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = (x + (sx + 0.5) / 4) * scale;
          const py = (y + (sy + 0.5) / 4) * scale;
          let colour = null;
          for (const shape of list) if (inside(px, py, shape)) colour = shape[5];
          if (!colour) continue;
          const [cr, cg, cb] = rgb(colour);
          r += cr;
          g += cg;
          b += cb;
          a++;
        }
      }
      const at = y * (size * 4 + 1) + 1 + x * 4;
      if (a) {
        raw[at] = Math.round(r / a);
        raw[at + 1] = Math.round(g / a);
        raw[at + 2] = Math.round(b / a);
      }
      raw[at + 3] = Math.round((a / 16) * 255);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, 'icon.svg'), svg(112));
writeFileSync(join(out, 'icon-192.png'), png(192, 112));
writeFileSync(join(out, 'icon-512.png'), png(512, 112));
// "Maskable" icons are cropped to a circle or squircle by the phone, so this one bleeds to the edge.
writeFileSync(join(out, 'maskable-512.png'), png(512, 0));
console.log('icons/icon.svg, icon-192.png, icon-512.png, maskable-512.png');
