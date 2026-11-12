// A community's Events tab (board V2EModules, Events; E13), on the v2 tokens. List is the
// default, upcoming first with past events folded at the end; Month reuses CalendarGrid for this
// community. Without `groupId` it lists every event the viewer can see.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { useEvents } from '../../lib/events.js';
import { Icon } from '../icons.jsx';
import { Button, Skeleton } from '../ui/Controls.jsx';
import CalendarGrid, { RangeNav, viewRange } from './CalendarGrid.jsx';
import EventCard from './EventCard.jsx';
import EventForm from './EventForm.jsx';
import { lastOccurrence, occurrences } from './eventUtils.js';

const DAY = 864e5;

export default function EventList({ groupId, limit, showPast = true, member }) {
  const { state, me } = useStore();
  const [creating, setCreating] = useState(null); // null, or the draft ({} or { start })
  const [pastOpen, setPastOpen] = useState(false);
  const [view, setView] = useState('list');
  const [cursor, setCursor] = useState(Date.now);
  // Fixed for the mount so the request range doesn't change on every render.
  const [now] = useState(Date.now);
  // `member` comes from pages that know (the community page); otherwise look the group up.
  // Whether a member may create a community-wide event is the server's call (whoCanCreateEvents);
  // anyone in the community can make an invite-only one, so the form is offered to members.
  const isMember = member ?? (!groupId || state.groups.find((g) => g.id === groupId)?.members.includes(me.id));

  // The list needs a year back and four months ahead; the month view widens it as it moves.
  const [monthFrom, monthTo] = viewRange('month', cursor);
  const month = view === 'month';
  // The server returns only events this viewer may see (EVT-08).
  const { events, loading, error } = useEvents({
    community: groupId,
    from: month ? Math.min(monthFrom, now - 365 * DAY) : now - 365 * DAY,
    to: month ? Math.max(monthTo, now + 120 * DAY) : now + 120 * DAY,
  });
  const upcoming = events.flatMap((e) => occurrences(e, now, now + 120 * DAY).slice(0, 3)).sort((a, b) => a.occStart - b.occStart);
  // One-off events that are over, plus recurring series that have ended (shown at their last date).
  const past = events.flatMap((e) => {
    if (!e.recurrence || e.recurrence.freq === 'none') return e.end < now ? [e] : [];
    if (!e.recurrence.until || e.recurrence.until >= now) return [];
    const last = lastOccurrence(e, now);
    return last == null ? [] : [{ ...e, occStart: last, occEnd: last + (e.end - e.start) }];
  }).sort((a, b) => (b.occStart ?? b.start) - (a.occStart ?? a.start));
  const shown = limit ? upcoming.slice(0, limit) : upcoming;
  const items = month ? events.flatMap((e) => occurrences(e, monthFrom, monthTo)).map((o) => ({
    key: `${o.id}-${o.occStart}`, title: o.title, start: o.occStart, end: o.occEnd, allDay: o.allDay,
    cancelled: o.status === 'cancelled', href: `/events/${o.id}`,
  })) : [];
  const firstLoad = loading && !events.length;
  const draftOn = (d) => { const x = new Date(d); x.setHours(18, 0, 0, 0); setCreating({ start: x.getTime() }); };

  return (
    <section aria-label="Events" className="flex min-w-0 flex-col gap-4">
      {groupId && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="View" className="flex gap-1.5">
            <button type="button" className="filter-chip gap-1.5" aria-pressed={!month} onClick={() => setView('list')}><Icon name="list" size={16} />List</button>
            <button type="button" className="filter-chip gap-1.5" aria-pressed={month} onClick={() => setView('month')}><Icon name="calendar" size={16} />Month</button>
          </div>
          {isMember && <Button variant="primary" icon="plus" onClick={() => setCreating({})}>Create event</Button>}
        </div>
      )}
      {error && <p role="alert" className="notice notice-bad"><strong>Couldn’t load events:</strong> {error}</p>}

      {month ? (
        <div className="flex min-w-0 flex-col gap-3">
          <RangeNav mode="month" cursor={cursor} onChange={setCursor} />
          {firstLoad ? <div className="panel p-5"><Skeleton lines={4} label="Loading events" /></div>
            : <CalendarGrid mode="month" cursor={cursor} items={items} accent onDayClick={isMember ? draftOn : undefined} />}
          {isMember && <p className="t-small hidden sm:block">Click an empty part of a day to create an event on that date.</p>}
        </div>
      ) : firstLoad ? (
        <div className="panel p-5"><Skeleton lines={4} label="Loading events" /></div>
      ) : error && !events.length ? null : (
        <div className="panel min-w-0 overflow-hidden">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <Icon name="events" size={28} className="text-2" />
              <p className="t-h3 text-[var(--az-text)]">No upcoming events</p>
              <p className="text-2 max-w-md text-sm">{isMember ? 'Create one to get people together.' : 'When this community plans something, it will be here.'}</p>
            </div>
          ) : (
            <ul aria-label="Upcoming events" className="list-rows">
              {shown.map((e) => <li key={`${e.id}-${e.occStart}`}><EventCard event={e} flat showCommunity={!groupId} /></li>)}
            </ul>
          )}
          {limit && upcoming.length > limit && (
            <div className="border-t border-[var(--az-divider)] px-5 py-3"><Link to="/events?view=list" className="link text-sm">See all events</Link></div>
          )}
          {showPast && past.length > 0 && (
            <div className="border-t border-[var(--az-divider)]">
              <div className="px-3 py-2 sm:px-4">
                <button type="button" className="btn btn-ghost btn-sm !border-transparent !bg-transparent" aria-expanded={pastOpen} aria-controls="past-events" onClick={() => setPastOpen(!pastOpen)}>
                  <Icon name={pastOpen ? 'up' : 'down'} size={16} />Past events ({past.length})
                </button>
              </div>
              {pastOpen && (
                <ul id="past-events" aria-label="Past events" className="list-rows border-t border-[var(--az-divider)]">
                  {past.map((e) => <li key={`${e.id}-${e.occStart ?? e.start}`}><EventCard event={e} flat showCommunity={!groupId} /></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {creating && (
        <EventForm initial={{ groupId, scope: groupId ? { type: 'group', id: groupId } : undefined, ...creating }}
          onClose={() => setCreating(null)} onSaved={() => setCreating(null)} />
      )}
    </section>
  );
}
