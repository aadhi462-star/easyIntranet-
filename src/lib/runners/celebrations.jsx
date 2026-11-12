import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { onDay } from '../celebrations.js';
import { isActiveUser } from '../../components/people/shared.jsx';

// `${userId}:${year}` greeted this page load, so StrictMode's double effects can't double-send
// before the persisted `birthdayGreetedYear` marker lands.
const handled = new Set();

/** Sends the signed-in member one "Happy birthday" notification on their birthday each year. */
export default function Celebrations() {
  const { state, me, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!me) return undefined;
    const tick = () => {
      const u = latest.current.users.find((x) => x.id === me.id);
      if (!u || !isActiveUser(u) || !u.birthday) return;
      const now = new Date();
      const year = now.getFullYear();
      const key = `${u.id}:${year}`;
      if (!onDay(u.birthday, now) || u.birthdayGreetedYear === year || handled.has(key)) return;
      handled.add(key);
      dispatch({ type: 'profile/update', silent: true, patch: { birthdayGreetedYear: year } });
      dispatch({ type: 'notify', silent: true, notification: { id: `bday-${u.id}-${year}`, userId: u.id, kind: 'birthday', text: 'Happy birthday from the community', link: '/feed' } });
    };
    tick();
    // Re-check hourly so a session left open past midnight still greets on the day.
    const t = setInterval(tick, 3600e3);
    return () => clearInterval(t);
  }, [me?.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
