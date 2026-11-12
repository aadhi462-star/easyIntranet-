// Sessions, CSRF and idempotency.
//
// - Session: random 32-byte token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored.
//   Every request re-reads the session *and the user's current status*, so suspension, deletion,
//   password resets and "sign out everywhere" take effect on the next request (REG-12/13/18).
// - CSRF: double-submit token. A readable `c1_csrf` cookie must be echoed in `x-csrf-token` on
//   every state-changing request; a cross-site page can't read the cookie, so it can't forge one.
// - Idempotency: creates accept an `Idempotency-Key`; a retry returns the first result instead of
//   creating a second record (COM-05/06, CNT-02).
import { newToken, sha256 } from './crypto.js';
import { conflict, forbidden } from './errors.js';

export const SESSION_COOKIE = 'c1_sid';
export const CSRF_COOKIE = 'c1_csrf';
const TOUCH_EVERY_MS = 5 * 60e3;
const SIGNED_IN_STATUSES = new Set(['active']);

const cookieOpts = (secure) => ({ path: '/', httpOnly: true, sameSite: 'lax', secure });

export async function startSession(db, reply, user, req, { days = 14, secure = false } = {}) {
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + days * 864e5);
  await db.query(
    `insert into sessions (id_hash, user_id, expires_at, ip, user_agent, password_at) values ($1, $2, $3, $4, $5, now())`,
    [hash, user.id, expires, req.ip, String(req.headers['user-agent'] || '').slice(0, 300)],
  );
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOpts(secure), expires });
  return hash;
}

export async function endSession(db, reply, req, { secure = false } = {}) {
  if (req.sessionHash) await db.query(`update sessions set revoked_at = now() where id_hash = $1`, [req.sessionHash]);
  reply.clearCookie(SESSION_COOKIE, cookieOpts(secure));
}

export const revokeAllSessions = (db, userId, { except } = {}) => db.query(
  `update sessions set revoked_at = now() where user_id = $1 and revoked_at is null and ($2::text is null or id_hash <> $2)`,
  [userId, except ?? null],
);

// D4 (PER-14): the riskiest actions need the password entered in the last 10 minutes.
export const FRESH_MINUTES = 10;
export async function requireFreshPassword(db, req) {
  const { rows: [s] } = await db.query(`select password_at from sessions where id_hash = $1`, [req.sessionHash]);
  if (!s?.password_at || Date.now() - new Date(s.password_at).getTime() > FRESH_MINUTES * 60e3) {
    throw forbidden('Enter your password again to do this.', 'PASSWORD_REQUIRED');
  }
}

/** Loads req.user (with platform roles) from the session cookie, or leaves it null. */
export async function loadSession(db, req) {
  req.user = null;
  req.sessionHash = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  const hash = sha256(token);
  const { rows } = await db.query(
    `select s.id_hash, s.last_seen_at, u.id, u.email, u.name, u.status, u.email_verified_at, u.pending_email, u.onboarded_at, u.version,
            coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
       from sessions s join users u on u.id = s.user_id
       left join platform_roles r on r.user_id = u.id
      where s.id_hash = $1 and s.revoked_at is null and s.expires_at > now()
      group by s.id_hash, u.id`,
    [hash],
  );
  const row = rows[0];
  if (!row) return;
  if (!SIGNED_IN_STATUSES.has(row.status)) {
    // Status changed since sign-in (suspended, deactivated, deleted): the session is dead.
    await db.query(`update sessions set revoked_at = now() where id_hash = $1`, [hash]);
    return;
  }
  req.sessionHash = hash;
  req.user = { id: row.id, email: row.email, name: row.name, status: row.status, emailVerified: !!row.email_verified_at,
    pendingEmail: row.pending_email, onboarded: !!row.onboarded_at, roles: row.roles, version: row.version };
  if (Date.now() - new Date(row.last_seen_at).getTime() > TOUCH_EVERY_MS) {
    await db.query(`update sessions set last_seen_at = now() where id_hash = $1`, [hash]);
  }
}

export function ensureCsrfCookie(req, reply, { secure = false } = {}) {
  let t = req.cookies?.[CSRF_COOKIE];
  if (!t) {
    t = newToken(24).token;
    reply.setCookie(CSRF_COOKIE, t, { path: '/', httpOnly: false, sameSite: 'lax', secure });
  }
  return t;
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export function checkCsrf(req) {
  if (SAFE.has(req.method)) return;
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.headers['x-csrf-token'];
  if (!cookie || !header || cookie !== header) throw forbidden('Your session check failed. Refresh the page and try again.', 'CSRF');
}

/**
 * Runs `fn` once per Idempotency-Key. A retry with the same key gets the stored response; a
 * retry while the first request is still running gets 409 so the client waits instead of racing.
 */
export async function idempotent(db, req, reply, fn) {
  const key = req.headers['idempotency-key'];
  if (!key) return fn();
  const scope = req.user?.id ?? `anon:${req.ip}`;
  const route = `${req.method} ${req.routeOptions?.url ?? req.url}`;
  const ins = await db.query(
    `insert into idempotency_keys (scope, key, route) values ($1, $2, $3) on conflict do nothing returning key`,
    [scope, String(key).slice(0, 100), route],
  );
  if (!ins.rows.length) {
    const { rows } = await db.query(`select status_code, response, route from idempotency_keys where scope = $1 and key = $2`, [scope, key]);
    const prev = rows[0];
    if (prev.route !== route) throw conflict('IDEMPOTENCY_KEY_REUSED', 'That request key was already used for a different action.');
    if (prev.status_code == null) throw conflict('IN_PROGRESS', 'This request is still being processed. Try again in a moment.');
    reply.header('idempotent-replay', 'true');
    return reply.status(prev.status_code).send(prev.response);
  }
  try {
    const result = await fn();
    await db.query(`update idempotency_keys set status_code = $3, response = $4 where scope = $1 and key = $2`,
      [scope, key, reply.statusCode, JSON.stringify(result ?? null)]);
    return result;
  } catch (err) {
    // A failed attempt may be retried with the same key.
    await db.query(`delete from idempotency_keys where scope = $1 and key = $2`, [scope, key]);
    throw err;
  }
}
