// Test harness: a fresh in-memory PostgreSQL (PGlite) per test file, and a tiny cookie-keeping
// client so each "browser" has its own session and CSRF cookie.
import { buildApp } from '../app.js';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { hashPassword } from '../lib/crypto.js';

export async function setup({ rateLimits = false } = {}) {
  const db = await createDb({ url: '', dataDir: 'memory://' });
  await migrate(db);
  const app = await buildApp({ db, rateLimits });
  return { db, app, close: async () => { await app.close(); await db.close(); } };
}

export function client(app) {
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const store = (res) => { for (const c of res.cookies) { if (c.value === '' || (c.expires && new Date(c.expires) < new Date())) delete jar[c.name]; else jar[c.name] = c.value; } };
  async function call(method, url, body, headers = {}) {
    if (method !== 'GET' && !jar.c1_csrf) store(await app.inject({ method: 'GET', url: '/api/health' }));
    const res = await app.inject({ method, url, payload: body, headers: { cookie: cookieHeader(), ...(method !== 'GET' ? { 'x-csrf-token': jar.c1_csrf } : {}), ...headers } });
    store(res);
    let json = null;
    try { json = res.json(); } catch { /* empty */ }
    return { status: res.statusCode, body: json, headers: res.headers, raw: res.rawPayload };
  }
  return {
    jar,
    get: (url, headers) => call('GET', url, undefined, headers),
    post: (url, body = {}, headers) => call('POST', url, body, headers),
    put: (url, body = {}, headers) => call('PUT', url, body, headers),
    patch: (url, body = {}, headers) => call('PATCH', url, body, headers),
    delete: (url, headers) => call('DELETE', url, undefined, headers),
  };
}

/** Creates an active, verified user directly (fast path for tests that aren't about sign-up). */
export async function makeUser(db, { id, email, name = 'Test User', password = 'correct-horse-battery', status = 'active', roles = [] }) {
  await db.query(`insert into users (id, email, name, password_hash, status, email_verified_at) values ($1, $2, $3, $4, $5, now())`,
    [id, email, name, await hashPassword(password), status]);
  for (const r of roles) await db.query(`insert into platform_roles (user_id, role) values ($1, $2)`, [id, r]);
  return { id, email, password };
}

export async function signIn(app, { email, password }) {
  const c = client(app);
  const res = await c.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

/** The token from the newest email to `to` (development outbox). */
export async function lastToken(db, to) {
  const { rows } = await db.query(`select body from email_outbox where lower(to_email) = lower($1) order by id desc limit 1`, [to]);
  return decodeURIComponent(rows[0].body.match(/token=([^\s]+)/)[1]);
}
