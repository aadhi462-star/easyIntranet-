import { useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';

/**
 * Keeps the app's signed-in person in step with the server session, which is the authority:
 * checks on load, when the tab regains focus, and whenever an API call comes back 401. A
 * suspended or signed-out-everywhere account is signed out here on the next check.
 */
export default function AuthSync() {
  const { state, dispatch } = useStore();
  const localId = state.session?.userId ?? null;

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
