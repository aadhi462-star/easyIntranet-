// Password hashing and random tokens, using only Node's built-in crypto (no native modules).
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
// scrypt parameters: N=2^15, r=8, p=1 (OWASP-recommended baseline); 64-byte key, 16-byte salt.
const N = 32768, R = 8, P = 1, KEYLEN = 64, MAXMEM = 128 * N * R * 2;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, n, r, p, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A URL-safe random token and the hash we store for it. */
export function newToken(bytes = 32) {
  const token = randomBytes(bytes).toString('base64url');
  return { token, hash: sha256(token) };
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const newId = (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`;

// Password rules shared by registration, reset and change.
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use a password of at least 8 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}
