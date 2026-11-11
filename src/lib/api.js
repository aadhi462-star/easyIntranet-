// Client for the CommunityOne API (/api). The server is the authority for accounts and sessions:
// the session lives in an HttpOnly cookie this code can't read; state-changing requests echo the
// readable CSRF cookie in a header; creates send an Idempotency-Key so a retry can't duplicate.

export class ApiError extends Error {
  constructor(status, { code = 'ERROR', message = 'Something went wrong. Try again.', ...extra } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const csrfToken = () => document.cookie.split('; ').find((c) => c.startsWith('c1_csrf='))?.slice(8);

async function ensureCsrf() {
  if (!csrfToken()) await fetch('/api/health', { credentials: 'same-origin' });
  return csrfToken();
}

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Administrative Mode (platform staff opening a community they aren't in): requests about the
 * communities in scope carry `x-admin-mode: 1`, which the server checks and logs. Scoped to those
 * communities' own paths and `community=` filters, so background refreshes of other communities
 * never run in admin mode.
 */
let adminScope = new Set();
export const setAdminScope = (keys) => { adminScope = new Set((keys || []).filter(Boolean).map(String)); };
/** Once the server confirms Administrative Mode for a slug, its id joins the scope too. */
export const widenAdminScope = (key, id) => { if (adminScope.has(String(key))) adminScope.add(String(id)); };
const inAdminScope = (path) => {
  if (!adminScope.size) return false;
  const m = path.match(/^\/communities\/([^/?]+)/);
  if (m && adminScope.has(decodeURIComponent(m[1]))) return true;
  const q = path.match(/[?&]community=([^&]+)/);
  return !!q && adminScope.has(decodeURIComponent(q[1]));
};

/**
 * api('/auth/login', { method: 'POST', body: {...} }). Pass `idempotencyKey` (or `idempotent: true`)
 * on creates so double submits and network retries return the first result.
 */
export async function api(path, { method = 'GET', body, idempotent = false, idempotencyKey } = {}) {
  const headers = { accept: 'application/json' };
  if (inAdminScope(path)) headers['x-admin-mode'] = '1';
  if (method !== 'GET') {
    if (body !== undefined) headers['content-type'] = 'application/json';
    headers['x-csrf-token'] = await ensureCsrf();
    if (idempotencyKey || idempotent) headers['idempotency-key'] = idempotencyKey || newKey();
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Can’t reach CommunityOne. Check your connection and try again.' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/me' && !path.startsWith('/auth/login')) window.dispatchEvent(new CustomEvent('c1-signed-out'));
    throw new ApiError(res.status, data?.error);
  }
  return data;
}

export { newKey };
