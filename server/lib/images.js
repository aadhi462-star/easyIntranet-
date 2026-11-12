// Image type and size from the file's own bytes (v2 workstream E, decision E4). Reads only the
// header, so no image library is needed. Returns { mime, width, height }, or null when the bytes
// aren't a PNG, JPEG or WebP whose header can be read. SVG, GIF and everything else give null
// (FIL-01): the type comes from the bytes, never from the name.

const starts = (b, bytes, at = 0) => bytes.every((x, i) => b[at + i] === x);

function png(b) {
  // Signature, then the IHDR chunk first: width and height as 32-bit big-endian numbers.
  if (b.length < 24 || !starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { mime: 'image/png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// Start-of-frame markers carry the size; C4 (Huffman tables), C8 (reserved) and CC (arithmetic
// coding) share the range but aren't frames.
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function jpeg(b) {
  if (b.length < 4 || !starts(b, [0xff, 0xd8, 0xff])) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; } // fill byte
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; } // no length
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (SOF.has(marker)) {
      if (i + 9 > b.length) return null;
      return { mime: 'image/jpeg', height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function webp(b) {
  if (b.length < 30 || !starts(b, [0x52, 0x49, 0x46, 0x46]) || !starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return null;
  const chunk = b.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    // Lossy: a frame tag, the start code 9D 01 2A, then 14-bit width and height.
    if (!starts(b, [0x9d, 0x01, 0x2a], 23)) return null;
    return { mime: 'image/webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    // Lossless: signature 2F, then width - 1 and height - 1 in 14 bits each.
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Extended: canvas width - 1 and height - 1 in 24 bits each.
    return { mime: 'image/webp', width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  return null;
}

/** { mime, width, height } of a PNG, JPEG or WebP, from its bytes; null for anything else. */
export function imageInfo(bytes) {
  if (!bytes?.length) return null;
  // The database driver may hand back a plain Uint8Array; view it as a Buffer without copying.
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const info = png(buf) ?? jpeg(buf) ?? webp(buf);
  return info && info.width > 0 && info.height > 0 ? info : null;
}
