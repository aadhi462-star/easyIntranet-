// Events (board S4Events; v2 tokens, workstream D): the network-wide list and calendar, and the
// event page /events/:id. The full calendar lives at /calendar.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, timeAgo } from '../lib/store.jsx';
import { newKey } from '../lib/api.js';
import { addEventComment, cancelEvent, deleteEvent, deleteEventComment, fetchEvent, onEventsChange, useEvents } from '../lib/events.js';
import { toast } from '../lib/toast.js';
import { Avatar, AvatarStack, Modal, Tabs, UserLink } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { Badge, Button, Skeleton } from '../components/ui/Controls.jsx';
import CalendarGrid, { RangeNav, viewRange } from '../components/events/CalendarGrid.jsx';
import EventCard, { RsvpButtons } from '../components/events/EventCard.jsx';
import EventForm from '../components/events/EventForm.jsx';
import SaveButton from '../components/SaveButton.jsx';
import ReportDialog from '../components/manage/Report.jsx';
import {
  EVENT_TYPES, TYPE_COLORS, downloadIcs, isUrl, lastOccurrence, nextOccurrence, occurrences,
  recurrenceText, scopeLabel, sectionOf, whenText,
} from '../components/events/eventUtils.js';
import { confirmAction } from '../components/ui/Confirm.jsx';

export default function Events() {
  const { id } = useParams();
  return id ? <EventDetail id={id} /> : <EventsHome />;
}

const DAY = 864e5;

function EventsHome() {
  const [params, setParams] = useSearchParams();
  const section = params.get('section') || 'all';
  const view = params.get('view') || 'month';
  const [cursor, setCursor] = useState(Date.now());
  const [types, setTypes] = useState(EVENT_TYPES);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftTypes, setDraftTypes] = useState(EVENT_TYPES);
  const creating = params.get('new') === '1';
  const nav = useNavigate();

  const setParam = (k, v) => { const p = new URLSearchParams(params); if (v == null) p.delete(k); else p.set(k, v); setParams(p, { replace: true }); };
  const openCreate = (start) => { const p = new URLSearchParams(params); p.set('new', '1'); if (start) p.set('date', String(start)); setParams(p); };
  const closeCreate = () => { const p = new URLSearchParams(params); ['new', 'date', 'group'].forEach((k) => p.delete(k)); setParams(p, { replace: true }); };

  const [from, to] = viewRange(view === 'week' ? 'week' : 'month', cursor);
  // A year either side of today, widened when the calendar is moved further out. `now` is fixed
  // for the mount so the request range only changes when the calendar range does.
  const [now] = useState(Date.now);
  const { events: loaded, loading, error } = useEvents({ from: Math.min(from, now - 365 * DAY), to: Math.max(to, now + 365 * DAY) });
  // The server returns only events this viewer may see (EVT-08).
  const visible = loaded.filter((e) => types.includes(e.eventType ?? 'Meetup'));
  const count = (s) => visible.filter((e) => s === 'all' || sectionOf(e) === s).length;
  const events = visible.filter((e) => section === 'all' || sectionOf(e) === section);

  const items = events.flatMap((e) => occurrences(e, from, to)).map((o) => ({
    key: `${o.id}-${o.occStart}`, title: o.title, start: o.occStart, end: o.occEnd, allDay: o.allDay, icon: o.status === 'cancelled' ? '' : undefined,
    color: TYPE_COLORS[o.eventType] ?? '#168c70', href: `/events/${o.id}`,
  }));

  const upcoming = events.filter((e) => e.status !== 'cancelled').flatMap((e) => occurrences(e, now, now + 180 * DAY).slice(0, 4)).sort((a, b) => a.occStart - b.occStart);
  // One-off events that are over, plus recurring series that have ended (shown at their last date).
  const past = events.flatMap((e) => {
    if (!e.recurrence || e.recurrence.freq === 'none') return e.end < now ? [e] : [];
    if (!e.recurrence.until || e.recurrence.until >= now) return [];
    const last = lastOccurrence(e, now);
    return last == null ? [] : [{ ...e, occStart: last, occEnd: last + (e.end - e.start) }];
  }).sort((a, b) => (b.occStart ?? b.start) - (a.occStart ?? a.start));

  const draftStart = params.get('date') ? (() => { const d = new Date(Number(params.get('date'))); d.setHours(18, 0, 0, 0); return d.getTime(); })() : undefined;

  return (
    <div className="min-w-0">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h1 text-[var(--az-text)]">Events</h1>
          <p className="text-2 mt-1 text-[15px]">Reunions, meet-ups, webinars and contests across the network.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/calendar" className="btn btn-secondary"><Icon name="calendar" size={18} /> Calendar</Link>
          <Button variant="primary" icon="plus" onClick={() => openCreate()}>Create event</Button>
        </div>
      </header>

      <Tabs value={section} onChange={(v) => setParam('section', v === 'all' ? null : v)}
        tabs={[{ id: 'all', label: 'All Events', count: count('all') }, { id: 'group', label: 'Communities', count: count('group') },
          { id: 'private', label: 'Invite-only', count: count('private') }]} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {view === 'list' ? <h2 className="t-h3 text-[var(--az-text)]">Upcoming</h2> : <RangeNav mode={view} cursor={cursor} onChange={setCursor} />}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" className="filter-chip gap-1.5" aria-expanded={filterOpen} aria-pressed={types.length < EVENT_TYPES.length}
              onClick={() => { setDraftTypes(types); setFilterOpen(!filterOpen); }}>
              Filter{types.length < EVENT_TYPES.length && ` (${types.length})`}<Icon name={filterOpen ? 'up' : 'down'} size={16} />
            </button>
            {filterOpen && (
              <div className="panel absolute left-0 z-20 mt-2 w-60 p-3 shadow-[var(--az-shadow)] sm:left-auto sm:right-0">
                <p className="t-label mb-2">Event types</p>
                {EVENT_TYPES.map((t) => (
                  <label key={t} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-[var(--az-text)]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={draftTypes.includes(t)}
                      onChange={() => setDraftTypes(draftTypes.includes(t) ? draftTypes.filter((x) => x !== t) : [...draftTypes, t])} />
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />{t}
                  </label>
                ))}
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setDraftTypes(EVENT_TYPES)}>All</Button>
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => { setTypes(draftTypes); setFilterOpen(false); }}>Apply</Button>
                </div>
              </div>
            )}
          </div>
          <div role="group" aria-label="View" className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {[['list', 'List'], ['month', 'Month'], ['week', 'Week']].map(([v, l]) => (
              <button key={v} type="button" className="filter-chip shrink-0" aria-pressed={view === v} onClick={() => setParam('view', v === 'month' ? null : v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="notice notice-bad mb-3"><strong>Couldn’t load events:</strong> {error}</p>}
      {view === 'list' ? (
        <div className="space-y-3">
          {loading && !loaded.length && <div className="panel p-5"><Skeleton lines={3} label="Loading events" /></div>}
          {!loading && upcoming.length === 0 ? <EmptyState icon="events" title="No upcoming events">Try another section or filter, or create one.</EmptyState>
            : upcoming.map((e) => <EventCard key={`${e.id}-${e.occStart}`} event={e} />)}
          {past.length > 0 && <>
            <h2 className="t-h3 pt-6 text-[var(--az-text)]">Past events</h2>
            {past.map((e) => <EventCard key={e.id} event={e} />)}
          </>}
        </div>
      ) : (
        <>
          <CalendarGrid mode={view} cursor={cursor} items={items} onDayClick={openCreate} />
          <p className="t-small mt-3 hidden sm:block">Tip: click an empty part of a day to create an event on that date.</p>
        </>
      )}

      {creating && (
        <EventForm onClose={closeCreate}
          initial={{ start: draftStart, groupId: params.get('group') || undefined, scope: params.get('group') ? { type: 'group', id: params.get('group') } : undefined }}
          onSaved={(newId) => { closeCreate(); nav(`/events/${newId}`); }} />
      )}
    </div>
  );
}

/** A quiet empty or not-found panel (the shared Empty still draws the old style). */
function EmptyState({ icon, title, children }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-8 text-center">
      <Icon name={icon} size={28} className="text-2" />
      <p className="t-h3 text-[var(--az-text)]">{title}</p>
      {children && <p className="text-2 max-w-md text-sm">{children}</p>}
    </div>
  );
}

function EventDetail({ id }) {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [e, setE] = useState(undefined); // undefined: loading · null: not found / no access
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState('going');
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const commentKey = useRef(newKey()); // one per comment: a double click posts it once

  const load = async () => {
    try { setE(await fetchEvent(id)); setLoadError(''); } catch (err) { setLoadError(err.message); }
  };
  useEffect(() => { setE(undefined); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // RSVPs and edits made anywhere on the page come back as the fresh event (without comments).
  useEffect(() => onEventsChange((m) => {
    if (m.type === 'event' && m.event.id === id) setE((x) => ({ ...m.event, comments: x?.comments ?? [] }));
    if (m.type === 'removed' && m.id === id) setE(null);
  }), [id]);

  if (e === undefined) {
    return loadError
      ? <EmptyState icon="alert" title="Couldn’t load this event">{loadError} <button type="button" className="link" onClick={load}>Try again</button></EmptyState>
      : <div className="panel p-6"><Skeleton lines={4} label="Loading event" /></div>;
  }
  if (!e) {
    return <EmptyState icon="search" title="Event not found">It may have been deleted, or you might not have access. <Link to="/events" className="link">Back to events</Link></EmptyState>;
  }

  const color = TYPE_COLORS[e.eventType] ?? '#168c70';
  const cancelled = e.status === 'cancelled';
  const start = nextOccurrence(e);
  const startDate = new Date(start);
  const end = start + (e.end - e.start);
  const by = (status) => Object.entries(e.rsvps || {}).filter(([, v]) => v === status).map(([k]) => k);
  const lists = { going: by('going'), maybe: by('maybe'), no: by('no') };
  const awaiting = (e.invitees || []).filter((u) => !e.rsvps?.[u]);
  const role = e.hostId === me.id ? 'Host' : (e.assistants || []).includes(me.id) ? 'Co-host' : (e.invitees || []).includes(me.id) ? 'Invitee' : null;
  const deadlinePassed = !!e.rsvpDeadline && e.rsvpDeadline < Date.now();
  const closedNote = !e.can.rsvp && !cancelled && !e.over && (deadlinePassed || !e.can.comment);
  const showRsvp = e.rsvpEnabled && (e.can.rsvp || closedNote || e.capacity || e.rsvpDeadline);

  const addComment = async (ev) => {
    ev.preventDefault();
    const text = comment.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const c = await addEventComment(e.id, text, commentKey.current);
      commentKey.current = newKey();
      setE((x) => ({ ...x, comments: [...(x.comments || []), c], commentCount: (x.commentCount ?? 0) + 1 }));
      setComment('');
    } catch (err) { toast(err.message, 'error'); } finally { setPosting(false); }
  };

  const removeComment = async (c) => {
    if (!(await confirmAction('Delete this comment?'))) return;
    try {
      await deleteEventComment(c.id);
      setE((x) => ({ ...x, comments: x.comments.filter((y) => y.id !== c.id), commentCount: Math.max(0, (x.commentCount ?? 1) - 1) }));
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async () => {
    if (!(await confirmAction(`Delete “${e.title}”? Nobody will be able to see it any more. To keep a record and tell registrants, cancel it instead.`))) return;
    try { await deleteEvent(e.id); toast('Event deleted'); nav('/events'); } catch (err) { toast(err.message, 'error'); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="min-w-0 space-y-5">
      <Link to="/events" className="link text-sm">All events</Link>
      {cancelled && (
        <div role="status" className="notice notice-bad">
          <strong>This event was cancelled.</strong>{e.cancelReason && <> Reason: {e.cancelReason}</>}
        </div>
      )}
      <section className="panel overflow-hidden">
        <div className="h-1.5" style={{ background: color }} aria-hidden="true" />
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div aria-hidden="true" className="w-14 shrink-0 rounded-xl border border-[var(--az-hairline)] py-2 text-center">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--az-link)]">{startDate.toLocaleDateString(undefined, { month: 'short' })}</span>
              <span className="block text-[22px] font-bold leading-7 text-[var(--az-text)]">{startDate.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />{e.eventType ?? 'Event'}</Badge>
                <Badge>{scopeLabel(e, state.groups)}</Badge>
                {role && <Badge tone="ok">You: {role}</Badge>}
                {cancelled && <Badge tone="bad">Cancelled</Badge>}
                {!cancelled && e.over && <Badge>Ended</Badge>}
              </div>
              <h1 className="t-h1 mt-3 break-words text-[var(--az-text)]">{e.title}</h1>
            </div>
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="t-label">When</dt><dd className="mt-1 text-[var(--az-text)]">{whenText(e, start, end)}{recurrenceText(e.recurrence) && <div className="t-small">{recurrenceText(e.recurrence)}</div>}</dd></div>
            <div><dt className="t-label">Where</dt><dd className="mt-1 flex min-w-0 items-start gap-1.5 text-[var(--az-text)]"><Icon name="place" size={16} className="text-2 mt-0.5" /><span className="min-w-0 break-words">{e.location
              ? (isUrl(e.location) ? <a href={e.location} target="_blank" rel="noopener noreferrer" className="link">Open in Maps<span className="sr-only"> (opens in a new tab)</span></a> : e.location)
              : 'Not set'}</span></dd></div>
            {e.reminders?.length > 0 && <div><dt className="t-label">Reminders</dt><dd className="mt-1 flex items-center gap-1.5 text-[var(--az-text)]"><Icon name="bell" size={16} className="text-2" /> {e.reminders.map((m) => (m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`)).join(', ')} before</dd></div>}
          </dl>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--az-divider)] pt-5">
            {!cancelled && <Button variant="secondary" icon="calendar" onClick={() => downloadIcs(e)}>Add to calendar</Button>}
            <Button variant="ghost" icon={copied ? 'check' : 'link'} onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
            <SaveButton type="event" id={e.id} label={e.title} />
            {e.can.edit && <Button variant="ghost" icon="pen" onClick={() => setEditing(true)}>Edit</Button>}
            {e.can.cancel && <Button variant="ghost" className="!text-[var(--az-warning)]" onClick={() => setCancelling(true)}>Cancel event</Button>}
            {e.can.delete && <Button variant="ghost" className="!text-[var(--az-danger)]" onClick={remove}>Delete</Button>}
            {e.hostId !== me.id && <Button variant="ghost" icon="flag" onClick={() => setReporting(true)}>Report</Button>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
        {showRsvp && (
          <section className="panel min-w-0 p-5 lg:col-start-2 lg:row-start-1" aria-labelledby="rsvp-h">
            <h2 id="rsvp-h" className="t-h3 mb-3 text-[var(--az-text)]">{e.can.rsvp ? 'Are you going?' : 'Registration'}</h2>
            {e.can.rsvp && <RsvpButtons event={e} />}
            {!e.can.rsvp && !cancelled && !e.over && deadlinePassed && <p className="text-2 text-sm">RSVPs have closed{e.myRsvp ? ` · You said ${e.myRsvp === 'no' ? 'not going' : e.myRsvp}` : ''}.</p>}
            {!e.can.rsvp && !cancelled && !e.over && !deadlinePassed && !e.can.comment && <p className="text-2 text-sm">Join {e.community?.name ?? 'this community'} to RSVP.</p>}
            {(e.capacity || e.rsvpDeadline) && (
              <div className="mt-4 space-y-1 border-t border-[var(--az-divider)] pt-3 text-sm text-[var(--az-text)]">
                {e.capacity && <p>{e.counts.going} of {e.capacity} places taken{e.can.full && ' · Full'}</p>}
                {e.rsvpDeadline && <p className="text-2">{deadlinePassed ? 'RSVPs closed' : 'RSVP by'} {new Date(e.rsvpDeadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              </div>
            )}
          </section>
        )}
        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {e.description && (
            <section className="panel p-5" aria-labelledby="about-h">
              <h2 id="about-h" className="t-h3 text-[var(--az-text)]">About this event</h2>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-[var(--az-text)]">{e.description}</p>
            </section>
          )}
          <section className="panel p-5" aria-label="Discussion">
            <h2 className="t-h3 text-[var(--az-text)]">Discussion <span className="t-small font-normal">{e.comments?.length || 0}</span></h2>
            <ul className="mt-4 space-y-4">
              {(e.comments || []).map((c) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar user={state.users.find((u) => u.id === c.author.id) ?? { name: c.author.name }} size={34} />
                  <div className="min-w-0 flex-1 rounded-xl bg-[var(--az-band)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 text-sm">
                      {c.author.deleted ? <span className="text-2">{c.author.name}</span> : <UserLink id={c.author.id} />}
                      <span className="t-small">{timeAgo(c.createdAt)}</span>
                      {c.can?.delete && <button type="button" className="t-small ml-auto min-h-8 hover:text-[var(--az-danger)]" onClick={() => removeComment(c)} aria-label="Delete comment">Delete</button>}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--az-text)]">{c.body}</p>
                  </div>
                </li>
              ))}
              {!e.comments?.length && <li className="text-2 text-sm">No comments yet. Ask a question or share plans.</li>}
            </ul>
            {e.can.comment && (
              <form onSubmit={addComment} className="mt-4 flex gap-2">
                <input className="input min-w-0 flex-1" placeholder="Write a comment…" value={comment} onChange={(ev) => setComment(ev.target.value)} aria-label="Comment" maxLength={2000} />
                <button className="btn btn-primary shrink-0" disabled={!comment.trim() || posting}>{posting ? 'Posting…' : 'Post'}</button>
              </form>
            )}
          </section>
        </div>

        <aside className={`min-w-0 space-y-5 self-start lg:col-start-2 ${showRsvp ? 'lg:row-start-2' : 'lg:row-start-1'}`}>
          <section className="panel p-5" aria-label="People">
            <h2 className="t-h3 mb-3 text-[var(--az-text)]">Roles</h2>
            <RoleRow label="Host" ids={[e.hostId]} />
            <RoleRow label="Co-hosts" ids={e.assistants || []} />
            {e.inviteOnly && <RoleRow label="Invitees" ids={e.invitees || []} />}
            {e.inviteOnly && awaiting.length > 0 && <p className="t-small mt-2">{awaiting.length} invitee{awaiting.length > 1 ? 's haven’t' : ' hasn’t'} responded yet.</p>}
          </section>
          {e.rsvpEnabled && (
            <section className="panel p-5" aria-label="Attendees">
              <h2 className="t-h3 mb-3 text-[var(--az-text)]">Attendees</h2>
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'going', label: 'Going', count: e.counts.going }, { id: 'maybe', label: 'Maybe', count: e.counts.maybe }, { id: 'no', label: 'Not going', count: e.counts.no }]} />
              <ul className="space-y-2">
                {lists[tab].map((uidX) => <li key={uidX} className="flex min-w-0 items-center gap-2 text-sm"><Avatar user={state.users.find((u) => u.id === uidX)} size={28} /><UserLink id={uidX} className="truncate" /></li>)}
                {lists[tab].length === 0 && <li className="text-2 text-sm">Nobody yet.</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {editing && <EventForm initial={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {cancelling && <CancelEvent event={e} onClose={() => setCancelling(false)} />}
      {reporting && <ReportDialog targetType="event" targetId={e.id} communityId={e.communityId} communityName={e.community?.name} onClose={() => setReporting(false)} />}
    </div>
  );
}

/** Cancelling needs a reason; registrants are emailed it by the server (EVT-03). */
function CancelEvent({ event, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (ev) => {
    ev.preventDefault();
    if (!reason.trim()) return setError('Tell people why it’s cancelled.');
    setPending(true);
    try { await cancelEvent(event.id, reason.trim()); toast('Event cancelled'); onClose(); } catch (err) { setError(err.message); } finally { setPending(false); }
  };
  return (
    <Modal title={`Cancel “${event.title}”?`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-2 text-sm">The event stays visible as cancelled, nobody can RSVP any more, and everyone who said going or maybe gets an email with your reason.</p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[var(--az-text)]">Reason</span>
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus
            aria-invalid={!!error || undefined} aria-describedby={error ? 'cancel-err' : undefined} />
        </label>
        {error && <p id="cancel-err" role="alert" className="field-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Keep event</button>
          <button className="btn btn-danger" disabled={pending}>{pending ? 'Cancelling…' : 'Cancel event'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RoleRow({ label, ids }) {
  return (
    <div className="mb-3">
      <div className="t-label">{label}</div>
      {ids.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {ids.length > 3 ? <AvatarStack ids={ids} /> : ids.map((id) => <span key={id} className="text-sm"><UserLink id={id} /></span>)}
        </div>
      ) : <div className="text-2 mt-1 text-sm">None</div>}
    </div>
  );
}
