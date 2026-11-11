// Notifications and Saved from the server (Stage 4). Both live on the account, so they're the
// same on every device; this module keeps the unread count and the saved set in sync across
// the screens that show them.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const NOTIF = 'c1-notifications-changed';
const SAVED = 'c1-saved-changed';
const ping = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

// ---- Notifications --------------------------------------------------------------------------
export const fetchNotifications = (unread = false) => api(`/notifications${unread ? '?unread=1' : ''}`);
export async function markRead(ids) {
  const r = await api('/notifications/read', { method: 'POST', body: ids === 'all' ? { all: true } : { ids } });
  ping(NOTIF, r.unread);
  return r.unread;
}
export const fetchPrefs = () => api('/notification-prefs').then((r) => r.categories);
export const savePrefs = (patch) => api('/notification-prefs', { method: 'PUT', body: patch }).then((r) => r.categories);

/** The unread count for the bell: on load, every minute, when the window regains focus, and on change. */
export function useUnread(enabled = true) {
  const [n, setN] = useState(0);
  const load = useCallback(() => { if (enabled) api('/notifications/unread-count').then((r) => setN(r.unread), () => {}); }, [enabled]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onChange = (e) => (typeof e.detail === 'number' ? setN(e.detail) : load());
    window.addEventListener('focus', load);
    window.addEventListener(NOTIF, onChange);
    return () => { clearInterval(t); window.removeEventListener('focus', load); window.removeEventListener(NOTIF, onChange); };
  }, [load]);
  return n;
}

// ---- Saved ----------------------------------------------------------------------------------
let savedKeys = null; // Set of "type:id" once loaded
const key = (type, id) => `${type}:${id}`;

export const fetchSaved = (type) => api(`/saved${type ? `?type=${type}` : ''}`).then((r) => r.items);

export async function setSaved(type, id, on) {
  if (on) await api('/saved', { method: 'PUT', body: { type, id } });
  else await api(`/saved/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  savedKeys ??= new Set();
  if (on) savedKeys.add(key(type, id)); else savedKeys.delete(key(type, id));
  ping(SAVED);
}

/** Whether something is saved, kept in step with every other place that shows it. */
export function useIsSaved(type, id) {
  const [, tick] = useState(0);
  useEffect(() => {
    const on = () => tick((x) => x + 1);
    window.addEventListener(SAVED, on);
    if (!savedKeys) fetchSaved().then((items) => { savedKeys = new Set(items.map((i) => key(i.type, i.id))); ping(SAVED); }, () => {});
    return () => window.removeEventListener(SAVED, on);
  }, []);
  return !!savedKeys?.has(key(type, id));
}

/**
 * Bookmarks kept in this browser before Stage 4 move onto the account once, then the local list
 * is cleared. Returns how many were added.
 */
export async function importBookmarks(userId, ids, clear) {
  if (!ids?.length) return 0;
  const { added } = await api('/saved/import', { method: 'POST', body: { postIds: ids.slice(0, 200) } });
  clear();
  savedKeys = null;
  ping(SAVED);
  return added;
}

window.addEventListener?.('c1-session-changed', () => { savedKeys = null; });
