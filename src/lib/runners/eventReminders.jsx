import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { canSee, isInvolved, occurrences } from '../../components/events/eventUtils.js';

const label = (m) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2160 ? 's' : ''}` : m >= 60 ? `${Math.round(m / 60)} hour${m >= 90 ? 's' : ''}` : `${m} minute${m === 1 ? '' : 's'}`);

/**
 * Sends each event reminder once, when it falls due, to the signed-in member if they're
 * involved in the event (or it's a company event they've RSVPed to). Sent reminders are
 * recorded on the event as `remindersSent` keys so they never repeat.
 */
export default function EventReminders() {
  const { state, me, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;
  // Guards against double sends before the store update lands (e.g. StrictMode re-running effects).
  const sent = useRef(new Set());

  useEffect(() => {
    if (!me) return undefined;
    const tick = () => {
      const s = latest.current;
      const now = Date.now();
      for (const e of s.events) {
        if (!e.reminders?.length || !canSee(e, me, s.groups)) continue;
        if (!isInvolved(e, me.id) && e.rsvps?.[me.id] !== 'going') continue;
        if (e.rsvps?.[me.id] === 'no') continue;
        const maxLead = Math.max(...e.reminders) * 60e3;
        for (const o of occurrences(e, now, now + maxLead)) {
          if (o.occStart <= now) continue;
          const due = e.reminders.filter((m) => now >= o.occStart - m * 60e3 && !(e.remindersSent || []).includes(`${o.occStart}:${m}:${me.id}`) && !sent.current.has(`${o.occStart}:${m}:${me.id}`));
          if (!due.length) continue;
          // Mark every due reminder as sent but notify once, with the real time remaining.
          const keys = due.map((m) => `${o.occStart}:${m}:${me.id}`);
          keys.forEach((k) => sent.current.add(k));
          dispatch({ type: 'update', col: 'events', id: e.id, silent: true, patch: (x) => ({ ...x, remindersSent: [...(x.remindersSent || []), ...keys].slice(-200) }) });
          dispatch({ type: 'notify', silent: true, notification: { userId: me.id, kind: 'event', link: `/events/${e.id}`,
            text: `Reminder: ${e.title} starts in ${label(Math.max(1, Math.round((o.occStart - now) / 60e3)))}` } });
        }
      }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [me?.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
