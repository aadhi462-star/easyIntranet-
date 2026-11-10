import { Glyph } from '../components/icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, timeAgo } from '../lib/store.jsx';
import { newKey } from '../lib/api.js';
import { addEventComment, cancelEvent, deleteEvent, deleteEventComment, fetchEvent, onEventsChange, useEvents } from '../lib/events.js';
import { toast } from '../lib/toast.js';
import { Avatar, AvatarStack, Empty, Field, Modal, PageHeader, Tabs, UserLink } from '../components/ui.jsx';
import CalendarGrid, { RangeNav, viewRange } from '../components/events/CalendarGrid.jsx';
import EventCard, { RsvpButtons } from '../components/events/EventCard.jsx';
import EventForm from '../components/events/EventForm.jsx';
import {
  EVENT_TYPES, TYPE_COLORS, downloadIcs, isUrl, lastOccurrence, nextOccurrence, occurrences,
  recurrenceText, scopeLabel, sectionOf, whenText,
} from '../components/events/eventUtils.js';

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
    key: `${o.id}-${o.occStart}`, title: o.title, start: o.occStart, end: o.occEnd, allDay: o.allDay, icon: o.status === 'cancelled' ? '🚫 ' : undefined,
    color: TYPE_COLORS[o.eventType] ?? '#a3e635', href: `/events/${o.id}`,
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
    <div>
      <PageHeader title="Events" subtitle="Reunions, meet-ups, webinars and contests across the network."
        actions={<>
          <Link to="/calendar" className="btn btn-ghost"><Glyph value="🗓️" tile={false} size={16} /> Calendar</Link>
          <button className="btn btn-primary" onClick={() => openCreate()}>+ Create event</button>
        </>} />

      <Tabs value={section} onChange={(v) => setParam('section', v === 'all' ? null : v)}
        tabs={[{ id: 'all', label: 'All Events', count: count('all') }, { id: 'private', label: 'Private', count: count('private') },
          { id: 'company', label: 'Company', count: count('company') }, { id: 'group', label: 'Group', count: count('group') }]} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {view === 'list' ? <h2 className="text-lg font-bold">Upcoming</h2> : <RangeNav mode={view} cursor={cursor} onChange={setCursor} />}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button className={`btn btn-ghost h-10 ${types.length < EVENT_TYPES.length ? '!border-brand-500 !text-white' : ''}`} aria-expanded={filterOpen}
              onClick={() => { setDraftTypes(types); setFilterOpen(!filterOpen); }}>
              ⏷ Filter{types.length < EVENT_TYPES.length && ` (${types.length})`}
            </button>
            {filterOpen && (
              <div className="glass glass-strong absolute right-0 z-20 mt-2 w-60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Event types</p>
                {EVENT_TYPES.map((t) => (
                  <label key={t} className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={draftTypes.includes(t)}
                      onChange={() => setDraftTypes(draftTypes.includes(t) ? draftTypes.filter((x) => x !== t) : [...draftTypes, t])} />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[t] }} />{t}
                  </label>
                ))}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-ghost flex-1" onClick={() => setDraftTypes(EVENT_TYPES)}>All</button>
                  <button className="btn btn-primary flex-1" onClick={() => { setTypes(draftTypes); setFilterOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <div role="group" aria-label="View" className="glass inline-flex !rounded-xl p-1">
            {[['list', 'List'], ['month', 'Month'], ['week', 'Week']].map(([v, l]) => (
              <button key={v} aria-pressed={view === v} onClick={() => setParam('view', v === 'month' ? null : v)}
                className={`min-h-8 rounded-lg px-3 text-sm font-semibold ${view === v ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mb-3 text-sm text-rose-300">Couldn’t load events: {error}</p>}
      {view === 'list' ? (
        <div className="space-y-3">
          {loading && !loaded.length && <p className="text-sm text-slate-400">Loading events…</p>}
          {!loading && upcoming.length === 0 ? <Empty icon="📅" title="No upcoming events">Try another section or filter, or create one.</Empty>
            : upcoming.map((e) => <EventCard key={`${e.id}-${e.occStart}`} event={e} />)}
          {past.length > 0 && <>
            <h2 className="pt-6 text-lg font-bold">Past events</h2>
            {past.map((e) => <EventCard key={e.id} event={e} />)}
          </>}
        </div>
      ) : (
        <>
          <CalendarGrid mode={view} cursor={cursor} items={items} onDayClick={openCreate} />
          <p className="mt-3 hidden text-xs text-slate-500 sm:block">Tip: click an empty part of a day to create an event on that date.</p>
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

function EventDetail({ id }) {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [e, setE] = useState(undefined); // undefined: loading · null: not found / no access
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
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
      ? <Empty icon="⚠️" title="Couldn’t load this event">{loadError} <button className="text-brand-400 underline" onClick={load}>Try again</button></Empty>
      : <p className="text-sm text-slate-400">Loading event…</p>;
  }
  if (!e) {
    return <Empty icon="🔍" title="Event not found">It may have been deleted, or you might not have access. <Link to="/events" className="text-brand-400 underline">Back to events</Link></Empty>;
  }

  const color = TYPE_COLORS[e.eventType] ?? '#a3e635';
  const cancelled = e.status === 'cancelled';
  const start = nextOccurrence(e);
  const end = start + (e.end - e.start);
  const by = (status) => Object.entries(e.rsvps || {}).filter(([, v]) => v === status).map(([k]) => k);
  const lists = { going: by('going'), maybe: by('maybe'), no: by('no') };
  const awaiting = (e.invitees || []).filter((u) => !e.rsvps?.[u]);
  const role = e.hostId === me.id ? 'Host' : (e.assistants || []).includes(me.id) ? 'Co-host' : (e.invitees || []).includes(me.id) ? 'Invitee' : null;
  const deadlinePassed = !!e.rsvpDeadline && e.rsvpDeadline < Date.now();

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
    if (!confirm('Delete this comment?')) return;
    try {
      await deleteEventComment(c.id);
      setE((x) => ({ ...x, comments: x.comments.filter((y) => y.id !== c.id), commentCount: Math.max(0, (x.commentCount ?? 1) - 1) }));
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async () => {
    if (!confirm(`Delete “${e.title}”? Nobody will be able to see it any more. To keep a record and tell registrants, cancel it instead.`)) return;
    try { await deleteEvent(e.id); toast('Event deleted'); nav('/events'); } catch (err) { toast(err.message, 'error'); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-5">
      <Link to="/events" className="text-sm text-slate-400 hover:text-white">← All events</Link>
      {cancelled && (
        <div role="status" className="glass border border-rose-500/30 p-4 text-sm text-rose-200">
          <strong>This event was cancelled.</strong>{e.cancelReason && <> Reason: {e.cancelReason}</>}
        </div>
      )}
      <section className="glass overflow-hidden">
        <div className="h-2" style={{ background: `linear-gradient(90deg, ${color}, #a3e635)` }} />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip" style={{ background: `${color}26`, color }}>{e.eventType ?? 'Event'}</span>
            <span className="chip !bg-white/10 !text-slate-300">{scopeLabel(e, state.groups)}</span>
            {role && <span className="chip !bg-emerald-500/15 !text-emerald-200">You: {role}</span>}
            {cancelled && <span className="chip !bg-rose-500/15 !text-rose-200">Cancelled</span>}
            {!cancelled && e.over && <span className="chip !bg-white/10 !text-slate-400">Ended</span>}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{e.title}</h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">When</dt><dd className="mt-0.5">🕒 {whenText(e, start, end)}{recurrenceText(e.recurrence) && <div className="text-xs text-slate-400">🔁 {recurrenceText(e.recurrence)}</div>}</dd></div>
            <div><dt className="text-xs text-slate-500">Where</dt><dd className="mt-0.5"><Glyph value="📍" tile={false} size={16} /> {e.location
              ? (isUrl(e.location) ? <a href={e.location} target="_blank" rel="noopener noreferrer" className="text-brand-400 underline">Open in Maps ↗</a> : e.location)
              : 'Not set'}</dd></div>
            {e.reminders?.length > 0 && <div><dt className="text-xs text-slate-500">Reminders</dt><dd className="mt-0.5"><Glyph value="🔔" tile={false} size={16} /> {e.reminders.map((m) => (m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`)).join(', ')} before</dd></div>}
            {e.rsvpEnabled && (e.capacity || e.rsvpDeadline) && (
              <div><dt className="text-xs text-slate-500">Registration</dt><dd className="mt-0.5">
                {e.capacity && <div>🎟 {e.counts.going} of {e.capacity} places taken{e.can.full && ' · Full'}</div>}
                {e.rsvpDeadline && <div>⏳ {deadlinePassed ? 'RSVPs closed' : 'RSVP by'} {new Date(e.rsvpDeadline).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>}
              </dd></div>
            )}
          </dl>
          {e.description && <p className="mt-5 whitespace-pre-wrap leading-relaxed text-slate-200">{e.description}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
            {e.can.rsvp && <><span className="text-sm font-semibold">Are you going?</span><RsvpButtons event={e} /></>}
            {!e.can.rsvp && e.rsvpEnabled && !cancelled && !e.over && deadlinePassed && <span className="text-sm text-slate-400">RSVPs have closed{e.myRsvp ? ` · You said ${e.myRsvp === 'no' ? 'not going' : e.myRsvp}` : ''}.</span>}
            {!e.can.rsvp && e.rsvpEnabled && !cancelled && !e.over && !deadlinePassed && !e.can.comment && <span className="text-sm text-slate-400">Join {e.community?.name ?? 'this community'} to RSVP.</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              {!cancelled && <button className="btn btn-ghost" onClick={() => downloadIcs(e)}>📥 Add to calendar</button>}
              <button className="btn btn-ghost" onClick={copy}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
              {e.can.edit && <button className="btn btn-ghost" onClick={() => setEditing(true)}><Glyph value="✏️" tile={false} size={16} /> Edit</button>}
              {e.can.cancel && <button className="btn btn-ghost !text-amber-200" onClick={() => setCancelling(true)}>🚫 Cancel event</button>}
              {e.can.delete && <button className="btn btn-ghost !text-rose-300" onClick={remove}>🗑 Delete</button>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="glass p-5" aria-label="Discussion">
          <h2 className="font-bold">Discussion <span className="text-sm font-normal text-slate-400">{e.comments?.length || 0}</span></h2>
          <ul className="mt-4 space-y-4">
            {(e.comments || []).map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar user={state.users.find((u) => u.id === c.author.id) ?? { name: c.author.name }} size={34} />
                <div className="flex-1 rounded-xl bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    {c.author.deleted ? <span className="text-slate-400">{c.author.name}</span> : <UserLink id={c.author.id} />}
                    <span className="text-xs text-slate-500">{timeAgo(c.createdAt)}</span>
                    {c.can?.delete && <button className="ml-auto text-xs text-slate-500 hover:text-rose-300" onClick={() => removeComment(c)} aria-label="Delete comment">Delete</button>}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-200">{c.body}</p>
                </div>
              </li>
            ))}
            {!e.comments?.length && <li className="text-sm text-slate-500">No comments yet. Ask a question or share plans.</li>}
          </ul>
          {e.can.comment && (
            <form onSubmit={addComment} className="mt-4 flex gap-2">
              <input className="input" placeholder="Write a comment…" value={comment} onChange={(ev) => setComment(ev.target.value)} aria-label="Comment" maxLength={2000} />
              <button className="btn btn-primary" disabled={!comment.trim() || posting}>{posting ? 'Posting…' : 'Post'}</button>
            </form>
          )}
        </section>

        <aside className="space-y-5">
          <section className="glass p-5" aria-label="People">
            <h2 className="mb-3 font-bold">Roles</h2>
            <RoleRow label="Host" ids={[e.hostId]} />
            <RoleRow label="Co-hosts" ids={e.assistants || []} />
            {e.inviteOnly && <RoleRow label="Invitees" ids={e.invitees || []} />}
            {e.inviteOnly && awaiting.length > 0 && <p className="mt-2 text-xs text-slate-500">{awaiting.length} invitee{awaiting.length > 1 ? 's haven’t' : ' hasn’t'} responded yet.</p>}
          </section>
          {e.rsvpEnabled && (
            <section className="glass p-5" aria-label="Attendees">
              <h2 className="mb-3 font-bold">Attendees</h2>
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'going', label: 'Going', count: e.counts.going }, { id: 'maybe', label: 'Maybe', count: e.counts.maybe }, { id: 'no', label: 'Not going', count: e.counts.no }]} />
              <ul className="space-y-2">
                {lists[tab].map((uidX) => <li key={uidX} className="flex items-center gap-2 text-sm"><Avatar user={state.users.find((u) => u.id === uidX)} size={28} /><UserLink id={uidX} /></li>)}
                {lists[tab].length === 0 && <li className="text-sm text-slate-500">Nobody yet.</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {editing && <EventForm initial={e} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {cancelling && <CancelEvent event={e} onClose={() => setCancelling(false)} />}
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
        <p className="text-sm text-slate-300">The event stays visible as cancelled, nobody can RSVP any more, and everyone who said going or maybe gets an email with your reason.</p>
        <Field label="Reason"><textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus /></Field>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Keep event</button>
          <button className="btn btn-primary" disabled={pending}>{pending ? 'Cancelling…' : 'Cancel event'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RoleRow({ label, ids }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      {ids.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {ids.length > 3 ? <AvatarStack ids={ids} /> : ids.map((id) => <span key={id} className="text-sm"><UserLink id={id} /></span>)}
        </div>
      ) : <div className="mt-1 text-sm text-slate-500">None</div>}
    </div>
  );
}
