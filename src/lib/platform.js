// Platform administration helpers (redesign Stage 7).
//
// - Fresh password (D4): the riskiest actions answer 403 PASSWORD_REQUIRED when the password
//   wasn't entered in the last 10 minutes. `<PasswordGate>` asks for it once, confirms it with the
//   server, and repeats the action; the action is never repeated without the user's password.
// - CSV exports (D6) are downloaded with fetch, so a "password again" answer can be handled the
//   same way instead of landing on a JSON page.
import { createContext, createElement, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { api, ApiError } from './api.js';
import { useStore } from './store.jsx';

export const ROLE_LABEL = { super_admin: 'Super Admin', platform_admin: 'Platform Admin', user_manager: 'User Manager', community_manager: 'Community Manager',
  lms_manager: 'Learning Manager', trust_safety: 'Trust & Safety', finance_manager: 'Finance', support_agent: 'Support' };
export const STATUS_LABEL = { active: 'Active', suspended: 'Suspended', deactivated: 'Deactivated', deleted: 'Deleted', unverified: 'Email not confirmed', pending_approval: 'Waiting for approval' };

export const dateText = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTimeText = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const fewer = (n, threshold = 5) => (n == null ? `fewer than ${threshold}` : n.toLocaleString());

/** Downloads a CSV from the API. Throws ApiError (e.g. PASSWORD_REQUIRED) like api(). */
export async function downloadCsv(path) {
  let res;
  try { res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { accept: 'text/csv' } }); } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Can’t reach CommunityOne. Check your connection and try again.' });
  }
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error);
  const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'export.csv';
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Who may see which part of Administration (v2 G8, PER-16) -------------------------------
// GET /admin/me/permissions, read once per signed-in person and shared by every caller. The
// server still checks each route; this only decides which sections and buttons are shown.
// Two permissions the server checks aren't in that list yet; until they are, they follow the
// permission every role holding them also holds (same roles in server/lib/permissions.js).
const SAME_HOLDERS = { 'templates.manage': 'communities.manage', 'institutions.manage': 'users.manage' };
let staff = { userId: null, data: null, promise: null, failed: false };
const staffListeners = new Set();

function loadStaff(userId) {
  if (!userId) return;
  if (staff.userId === userId && (staff.data || staff.promise)) return;
  const mine = { userId, data: null, promise: null, failed: false };
  staff = mine;
  mine.promise = api('/admin/me/permissions')
    .then((d) => { if (staff === mine) staff = { ...mine, data: { roles: d.roles ?? [], can: d.can ?? {} }, promise: null }; })
    .catch(() => { if (staff === mine) staff = { ...mine, promise: null, failed: true }; })
    .finally(() => staffListeners.forEach((fn) => fn()));
}

/**
 * `const { loading, any, can } = useStaffAccess()`: `any` is true when the signed-in person holds
 * at least one platform permission (show them Administration); `can('users.view')` checks one.
 * Also `roles`, their platform roles. A failed read counts as no access and is tried again on
 * the next mount.
 */
export function useStaffAccess() {
  const { me } = useStore();
  const userId = me?.id ?? null;
  const [, rerender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    staffListeners.add(rerender);
    if (staff.userId === userId && staff.failed) staff = { userId: null, data: null, promise: null, failed: false };
    loadStaff(userId);
    return () => { staffListeners.delete(rerender); };
  }, [userId]);
  const data = userId && staff.userId === userId ? staff.data : null;
  const loading = !!userId && !data && !(staff.userId === userId && staff.failed);
  const can = useCallback((perm) => {
    const all = data?.can;
    if (!all) return false;
    if (perm in all) return !!all[perm];
    return SAME_HOLDERS[perm] ? !!all[SAME_HOLDERS[perm]] : false;
  }, [data]);
  return { loading, any: !!data && Object.values(data.can).some(Boolean), can, roles: data?.roles ?? [] };
}

const GateContext = createContext(null);

/**
 * `const withPassword = usePasswordGate(); await withPassword(() => api(...))` runs the action; if
 * the server asks for the password, a dialog asks for it, then the action runs once more.
 * Resolves to the action's result, or rejects with the action's error (or a 'CANCELLED' one).
 */
export function usePasswordGate() {
  const gate = useContext(GateContext);
  return gate ?? ((fn) => fn());
}

export function PasswordGateProvider({ children, Dialog }) {
  const [ask, setAsk] = useState(null);
  const pending = useRef(null);
  const run = useCallback(async (fn) => {
    try { return await fn(); } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'PASSWORD_REQUIRED') throw err;
      await new Promise((resolve, reject) => { pending.current = { resolve, reject }; setAsk({}); });
      return fn();
    }
  }, []);
  const confirm = async (password) => {
    await api('/admin/confirm-password', { method: 'POST', body: { password } });
    setAsk(null);
    pending.current?.resolve();
  };
  const cancel = () => { setAsk(null); pending.current?.reject(new ApiError(0, { code: 'CANCELLED', message: 'Cancelled.' })); };
  return createElement(GateContext.Provider, { value: run }, children, ask && createElement(Dialog, { onConfirm: confirm, onCancel: cancel }));
}
