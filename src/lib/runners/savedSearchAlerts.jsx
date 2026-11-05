import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { buildIndex, savedSearchIds, typeLabel } from '../searchIndex.js';

// Alerts already sent this page load (savedSearchId + new ids), so StrictMode's double
// effects and the gap before the lastSeenIds update lands can't double-notify.
const handled = new Set();
const MAX_SEEN = 1000;

/**
 * Every 60s, re-runs the signed-in member's saved searches against the same
 * visibility-filtered index as the Search page and notifies them once when results they
 * haven't seen appear. `lastSeenIds` on each saved search is the persisted marker.
 */
export default function SavedSearchAlerts() {
  const { state, me, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!me) return undefined;
    const tick = () => {
      const s = latest.current;
      const viewer = s.users.find((u) => u.id === me.id);
      if (!viewer) return;
      const mine = (s.savedSearches || []).filter((x) => x.userId === viewer.id && String(x.q || '').trim());
      if (!mine.length) return;
      const byId = Object.fromEntries(s.users.map((u) => [u.id, u]));
      const index = buildIndex(s, (id) => byId[id], viewer);
      for (const ss of mine) {
        const seen = new Set(ss.lastSeenIds || []);
        const fresh = savedSearchIds(index, ss).filter((id) => !seen.has(id));
        if (!fresh.length) continue;
        const key = `${ss.id}:${[...fresh].sort().join(',')}`;
        if (handled.has(key)) continue;
        handled.add(key);
        dispatch({ type: 'update', col: 'savedSearches', id: ss.id, silent: true,
          patch: (x) => ({ ...x, lastSeenIds: [...new Set([...(x.lastSeenIds || []), ...fresh])].slice(-MAX_SEEN) }) });
        const params = new URLSearchParams({ q: ss.q, ...(ss.type && ss.type !== 'all' ? { type: ss.type } : {}) });
        const n = fresh.length;
        dispatch({ type: 'notify', silent: true, notification: { userId: viewer.id, kind: 'search', link: `/search?${params}`,
          text: `${n} new result${n === 1 ? '' : 's'} for your saved search “${ss.name || ss.q}”${ss.type && ss.type !== 'all' ? ` in ${typeLabel(ss.type)}` : ''}` } });
      }
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [me?.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
