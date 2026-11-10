import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { fetchEvents } from '../events.js';
import { occurrences } from '../../components/events/eventUtils.js';

const label = (m) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2160 ? 's' : ''}` : m >= 60 ? `${Math.round(m / 60)} hour${m >= 90 ? 's' : ''}` : `${m} minute${m === 1 ? '' : 's'}`);
const DAY = 864e5;
const SENT_KEY = 'c1-reminders-sent';
const REFRESH_MS = 5 * 60e3;

// Which reminders this browser already showed (per person), so they never repeat. Storage can
// be unavailable (private mode); then the in-memory set still stops repeats for this tab.
const readSent = () => { try { return new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]')); } catch { return new Set(); } };
const saveSent = (set) => { try { localStorage.setItem(SENT_KEY, JSON.stringify([...set].slice(-300))); } catch { /* storage blocked */ } };

/**
 * Shows each event reminder once, when it falls due, to the signed-in member for events they
 * host, co-host, are invited to or said going/maybe to. The events come from the server
 * (`view: 'mine'`, refreshed every few minutes and after sign-in); cancelled events and
 * "not going" never remind.
 */
export default function EventReminders() {
  const { me, dispatch } = useStore();
  const events = useRef([]);
  const sent = useRef(readSent());

  useEffect(() => {
    if (!me) return undefined;
    let live = true;
    const refresh = async () => {
      try {
        const now = Date.now();
        const list = await fetchEvents({ view: 'mine', from: now, to: now + 8 * DAY });
        if (live) events.current = list;
      } catch { /* offline or signed out: try again on the next refresh */ }
    };
    const tick = () => {
      const now = Date.now();
      let added = false;
      for (const e of events.current) {
        if (!e.reminders?.length || e.status === 'cancelled' || e.myRsvp === 'no') continue;
        const maxLead = Math.max(...e.reminders) * 60e3;
        for (const o of occurrences(e, now, now + maxLead)) {
          if (o.occStart <= now) continue;
          const due = e.reminders.filter((m) => now >= o.occStart - m * 60e3 && !sent.current.has(`${e.id}:${o.occStart}:${m}:${me.id}`));
          if (!due.length) continue;
          // Mark every due reminder as sent but notify once, with the real time remaining.
          due.forEach((m) => sent.current.add(`${e.id}:${o.occStart}:${m}:${me.id}`));
          added = true;
          dispatch({ type: 'notify', silent: true, notification: { userId: me.id, kind: 'event', link: `/events/${e.id}`,
            text: `Reminder: ${e.title} starts in ${label(Math.max(1, Math.round((o.occStart - now) / 60e3)))}` } });
        }
      }
      if (added) saveSent(sent.current);
    };
    refresh().then(() => live && tick());
    const t = setInterval(tick, 30_000);
    const r = setInterval(refresh, REFRESH_MS);
    const onSession = () => { events.current = []; refresh().then(() => live && tick()); };
    window.addEventListener('c1-session-changed', onSession);
    return () => { live = false; clearInterval(t); clearInterval(r); window.removeEventListener('c1-session-changed', onSession); };
  }, [me?.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
