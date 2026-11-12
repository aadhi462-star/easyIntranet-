// Platform administration helpers (redesign Stage 7).
//
// - Fresh password (D4): the riskiest actions answer 403 PASSWORD_REQUIRED when the password
//   wasn't entered in the last 10 minutes. `<PasswordGate>` asks for it once, confirms it with the
//   server, and repeats the action; the action is never repeated without the user's password.
// - CSV exports (D6) are downloaded with fetch, so a "password again" answer can be handled the
//   same way instead of landing on a JSON page.
import { createContext, createElement, useCallback, useContext, useRef, useState } from 'react';
import { api, ApiError } from './api.js';

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
