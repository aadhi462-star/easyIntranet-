import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';
import EventCard from './EventCard.jsx';
import EventForm from './EventForm.jsx';
import { canSee, lastOccurrence, occurrences } from './eventUtils.js';

const DAY = 864e5;

/**
 * Upcoming events list. With `groupId`, shows only that group's events (used on group pages).
 * Without it, shows every event the viewer can see.
 */
export default function EventList({ groupId, limit, showPast = true }) {
  const { state, me } = useStore();
  const [creating, setCreating] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const now = Date.now();
  const isMember = !groupId || state.groups.find((g) => g.id === groupId)?.members.includes(me.id);

  const events = state.events.filter((e) => canSee(e, me, state.groups) && (!groupId || (e.scope?.type === 'group' && e.scope.id === groupId)));
  const upcoming = events.flatMap((e) => occurrences(e, now, now + 120 * DAY).slice(0, 3)).sort((a, b) => a.occStart - b.occStart);
  // One-off events that are over, plus recurring series that have ended (shown at their last date).
  const past = events.flatMap((e) => {
    if (!e.recurrence || e.recurrence.freq === 'none') return e.end < now ? [e] : [];
    if (!e.recurrence.until || e.recurrence.until >= now) return [];
    const last = lastOccurrence(e, now);
    return last == null ? [] : [{ ...e, occStart: last, occEnd: last + (e.end - e.start) }];
  }).sort((a, b) => (b.occStart ?? b.start) - (a.occStart ?? a.start));
  const shown = limit ? upcoming.slice(0, limit) : upcoming;

  return (
    <section aria-label="Events" className="space-y-3">
      {groupId && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">Upcoming events</h2>
          {isMember && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New event</button>}
        </div>
      )}
      {shown.length === 0 ? <Empty icon="📅" title="No upcoming events">{isMember ? 'Create one to get people together.' : ''}</Empty>
        : shown.map((e) => <EventCard key={`${e.id}-${e.occStart}`} event={e} />)}
      {limit && upcoming.length > limit && <Link to="/events?view=list" className="block text-center text-sm text-brand-400 hover:underline">See all events</Link>}
      {showPast && past.length > 0 && (
        <div>
          <button className="btn btn-ghost w-full" aria-expanded={pastOpen} onClick={() => setPastOpen(!pastOpen)}>{pastOpen ? 'Hide' : 'Show'} past events ({past.length})</button>
          {pastOpen && <div className="mt-3 space-y-3">{past.map((e) => <EventCard key={e.id} event={e} />)}</div>}
        </div>
      )}
      {creating && <EventForm initial={{ groupId, scope: { type: 'group', id: groupId } }} onClose={() => setCreating(false)} onSaved={() => setCreating(false)} />}
    </section>
  );
}
