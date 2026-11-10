import { useEffect, useRef } from 'react';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { syncDirectory } from '../../lib/people.js';
import { syncCommunities } from '../../lib/communities.js';

/**
 * Keeps the app's signed-in person in step with the server session, which is the authority:
 * checks on load, when the tab regains focus, and whenever an API call comes back 401. A
 * suspended or signed-out-everywhere account is signed out here on the next check.
 */
export default function AuthSync() {
  const { state, dispatch } = useStore();
  const localId = state.session?.userId ?? null;
  const groupIds = useRef([]);
  groupIds.current = state.groups.map((g) => g.id);

  // Tell per-person caches (e.g. "my communities" in lib/feed.js) that the signed-in person
  // changed. AuthSync renders before the routes, so this runs before the pages refetch.
  useEffect(() => { window.dispatchEvent(new CustomEvent('c1-session-changed', { detail: localId })); }, [localId]);

  // Once per signed-in person: bring the directory and communities in from the server.
  useEffect(() => {
    if (!localId) return;
    syncDirectory(dispatch).catch(() => { /* offline: the local copy stays usable */ });
    syncCommunities(dispatch, { me: localId, localIds: groupIds.current }).catch(() => { /* offline: keep the local groups */ });
  }, [localId, dispatch]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { user } = await api('/auth/session');
        if (cancelled) return;
        if (user && user.id !== localId) dispatch({ type: 'session/adopt', user });
        if (!user && localId) dispatch({ type: 'logout' });
      } catch { /* offline: keep the current state and check again later */ }
    };
    check();
    const onFocus = () => { if (document.visibilityState === 'visible') check(); };
    const onSignedOut = () => { if (localId) dispatch({ type: 'logout' }); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('c1-signed-out', onSignedOut);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('c1-signed-out', onSignedOut); };
  }, [localId, dispatch]);

  return null;
}
