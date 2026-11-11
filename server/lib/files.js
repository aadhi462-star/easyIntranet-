// Uploaded files (Stage 4, decision S4-1): stored in the database, up to 10 MB each, behind this
// module so a move to object storage later only changes this file.
//
// The type is decided from the bytes, never from the name or the browser's Content-Type
// (FIL-01). Only safe types are accepted: PDF, PNG/JPEG/GIF/WebP images, Office documents
// (docx/xlsx/pptx) and plain text. Anything that can carry script (SVG, HTML) or run (executables,
// archives) is refused. There is no malware scanner (decision S4-6, known gap FIL-04): the
// type allow-list and download-only serving are the protection.
import { createHash } from 'node:crypto';
import { badRequest } from './errors.js';
import { newId } from './crypto.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const OFFICE = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
const TEXT = { txt: 'text/plain', csv: 'text/csv', md: 'text/markdown' };

const starts = (b, bytes, at = 0) => bytes.every((x, i) => b[at + i] === x);
const ext = (name) => (String(name).match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? '').toLowerCase();

/** What a file really is, from its bytes and (for Office and text) its name. Throws if refused. */
export function sniff(buf, name) {
  const e = ext(name);
  if (starts(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: 'pdf', mime: 'application/pdf' };
  if (starts(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mime: 'image/png' };
  if (starts(buf, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg' };
  if (starts(buf, [0x47, 0x49, 0x46, 0x38])) return { kind: 'image', mime: 'image/gif' };
  if (starts(buf, [0x52, 0x49, 0x46, 0x46]) && starts(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { kind: 'image', mime: 'image/webp' };
  // Office files are ZIP archives; only accept one that says it's an Office document.
  if (starts(buf, [0x50, 0x4b, 0x03, 0x04]) && OFFICE[e] && buf.subarray(0, 4096).includes('[Content_Types].xml')) return { kind: 'office', mime: OFFICE[e] };
  if (TEXT[e] && !buf.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return { kind: 'text', mime: `${TEXT[e]}; charset=utf-8` }; } catch { /* not text */ }
  }
  throw badRequest('FILE_TYPE', 'That kind of file can’t be uploaded. Use a PDF, an image (PNG, JPEG, GIF or WebP), a Word, Excel or PowerPoint file, or plain text.');
}

/** A display name that's safe to show and to put in a download header. */
export function cleanName(name) {
  const n = String(name ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 200);
  return n || 'file';
}

/** Stores a file for a community after checking its size and type. Returns its public fields. */
export async function storeFile(db, { communityId, userId, name, buf }) {
  if (!buf?.length) throw badRequest('FILE_EMPTY', 'That file is empty.');
  if (buf.length > MAX_FILE_BYTES) throw badRequest('FILE_TOO_LARGE', 'Files can be up to 10 MB.');
  const display = cleanName(name);
  const { kind, mime } = sniff(buf, display);
  const id = newId('fil');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  await db.query(`insert into files (id, community_id, uploaded_by, name, mime, kind, size, sha256, data) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, communityId, userId, display, mime, kind, buf.length, sha256, buf]);
  return { id, name: display, mime, kind, size: buf.length };
}

export const publicFile = (f) => (f ? { id: f.id, name: f.name, mime: f.mime, kind: f.kind, size: f.size } : null);
