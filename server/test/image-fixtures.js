// Small, real image files of any size for the branding tests (E4): a grey PNG, a JPEG header
// and WebP headers with the dimensions asked for. `pad` adds bytes after the image data, to make
// a file over a size limit without a huge picture.
import { crc32, deflateSync } from 'node:zlib';

const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};

/** A valid 8-bit greyscale PNG of w by h pixels. */
export function png(w, h, { pad = 0 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; // bit depth 8, greyscale
  const raw = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y += 1) raw[y * (w + 1)] = 0; // filter byte per row
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw))];
  if (pad) parts.push(chunk('tEXt', Buffer.concat([Buffer.from('Comment\0'), Buffer.alloc(pad, 0x61)])));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** A JPEG's opening markers (APP0, then a baseline frame header) for w by h pixels. */
export function jpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}

/** A WebP (extended format) header for w by h pixels. */
export function webp(w, h) {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(22, 4); b.write('WEBP', 8, 'latin1'); b.write('VP8X', 12, 'latin1');
  b.writeUInt32LE(10, 16); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
}

/** An SVG, which the store refuses whatever it's called. */
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><script>alert(1)</script></svg>');
