import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, uid, timeAgo } from '../lib/store.jsx';
import { Avatar, AvatarStack, Empty, PageHeader, Tabs, UserLink } from '../components/ui.jsx';
import CalendarGrid, { RangeNav, viewRange } from '../components/events/CalendarGrid.jsx';
import EventCard, { RsvpButtons } from '../components/events/EventCard.jsx';
import EventForm from '../components/events/EventForm.jsx';
import {
  EVENT_TYPES, TYPE_COLORS, canSee, downloadIcs, fmtSize, isUrl, nextOccurrence, occurrences,
  recurrenceText, scopeLabel, sectionOf, whenText,
} from '../components/events/eventUtils.js';

export default function Events() {
  const { id } = useParams();
  return id ? <EventDetail id={id} /> : <EventsHome />;
}

function EventsHome() {
  const { state, me } = useStore();
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

  const visible = state.events.filter((e) => canSee(e, me, state.groups) && types.includes(e.eventType ?? 'Meetup'));
  const count = (s) => visible.filter((e) => s === 'all' || sectionOf(e) === s).length;
  const events = visible.filter((e) => section === 'all' || sectionOf(e) === section);

  const [from, to] = viewRange(view === 'week' ? 'week' : 'month', cursor);
  const items = events.flatMap((e) => occurrences(e, from, to)).map((o) => ({
    key: `${o.id}-${o.occStart}`, title: o.title, start: o.occStart, end: o.occEnd, allDay: o.allDay,
    color: TYPE_COLORS[o.eventType] ?? '#a3e635', href: `/events/${o.id}`,
  }));

  const now = Date.now();
  const upcoming = events.flatMap((e) => occurrences(e, now, now + 180 * 864e5).slice(0, 4)).sort((a, b) => a.occStart - b.occStart);
  const past = events.filter((e) => e.end < now && (!e.recurrence || e.recurrence.freq === 'none')).sort((a, b) => b.start - a.start);

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

      {view === 'list' ? (
        <div className="space-y-3">
          {upcoming.length === 0 ? <Empty icon="📅" title="No upcoming events">Try another section or filter, or create one.</Empty>
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
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('going');
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState(false);
  const e = state.events.find((x) => x.id === id);

  if (!e || !canSee(e, me, state.groups)) {
    return <Empty icon="🔍" title="Event not found">It may have been deleted, or you might not have access. <Link to="/events" className="text-brand-400 underline">Back to events</Link></Empty>;
  }

  const isHost = e.hostId === me.id || me.admin;
  const color = TYPE_COLORS[e.eventType] ?? '#a3e635';
  const start = nextOccurrence(e);
  const end = start + (e.end - e.start);
  const by = (status) => Object.entries(e.rsvps || {}).filter(([, v]) => v === status).map(([k]) => k);
  const lists = { going: by('going'), maybe: by('maybe'), no: by('no') };
  const awaiting = (e.invitees || []).filter((u) => !e.rsvps?.[u]);
  const role = e.hostId === me.id ? 'Host' : (e.assistants || []).includes(me.id) ? 'Event Assistant' : (e.invitees || []).includes(me.id) ? 'Invitee' : null;

  const addComment = (ev) => {
    ev.preventDefault();
    const text = comment.trim();
    if (!text) return;
    dispatch({ type: 'update', col: 'events', id: e.id, meta: 'comment',
      patch: (x, uidMe) => ({ ...x, comments: [...(x.comments || []), { id: uid('ec'), authorId: uidMe, text, createdAt: Date.now() }] }) });
    if (e.hostId !== me.id) dispatch({ type: 'notify', silent: true, notification: { userId: e.hostId, kind: 'event', text: `${me.name} commented on ${e.title}`, link: `/events/${e.id}` } });
    setComment('');
  };

  const remove = () => {
    if (!confirm(`Delete “${e.title}”? Invitees will no longer see it.`)) return;
    for (const userId of new Set([...(e.invitees || []), ...(e.assistants || []), ...Object.keys(e.rsvps || {})])) {
      if (userId !== me.id) dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `${me.name} cancelled ${e.title}`, link: '/events' } });
    }
    dispatch({ type: 'event/delete', id: e.id });
    nav('/events');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-5">
      <Link to="/events" className="text-sm text-slate-400 hover:text-white">← All events</Link>
      <section className="glass overflow-hidden">
        <div className="h-2" style={{ background: `linear-gradient(90deg, ${color}, #a3e635)` }} />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip" style={{ background: `${color}26`, color }}>{e.eventType ?? 'Event'}</span>
            <span className="chip !bg-white/10 !text-slate-300">{scopeLabel(e, state.groups)}</span>
            {role && <span className="chip !bg-emerald-500/15 !text-emerald-200">You: {role}</span>}
            {end < Date.now() && <span className="chip !bg-white/10 !text-slate-400">Ended</span>}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{e.title}</h1>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">When</dt><dd className="mt-0.5">🕒 {whenText(e, start, end)}{recurrenceText(e.recurrence) && <div className="text-xs text-slate-400">🔁 {recurrenceText(e.recurrence)}</div>}</dd></div>
            <div><dt className="text-xs text-slate-500">Where</dt><dd className="mt-0.5"><Glyph value="📍" tile={false} size={16} /> {e.location
              ? (isUrl(e.location) ? <a href={e.location} target="_blank" rel="noopener noreferrer" className="text-brand-400 underline">Open in Maps ↗</a> : e.location)
              : 'Not set'}</dd></div>
            {e.reminders?.length > 0 && <div><dt className="text-xs text-slate-500">Reminders</dt><dd className="mt-0.5"><Glyph value="🔔" tile={false} size={16} /> {e.reminders.map((m) => (m >= 1440 ? `${m / 1440}d` : m >= 60 ? `${m / 60}h` : `${m}m`)).join(', ')} before</dd></div>}
          </dl>
          {e.description && <p className="mt-5 whitespace-pre-wrap leading-relaxed text-slate-200">{e.description}</p>}

          {e.attachments?.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Attachments</h2>
              <ul className="flex flex-wrap gap-2">{e.attachments.map((a, i) => <li key={i} className="chip !bg-white/5 !text-slate-200"><Glyph value="📎" tile={false} size={16} /> {a.name} · {fmtSize(a.size)}</li>)}</ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
            {end >= Date.now() && e.rsvpEnabled && <><span className="text-sm font-semibold">Are you going?</span><RsvpButtons event={e} /></>}
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={() => downloadIcs(e)}>📥 Add to calendar</button>
              <button className="btn btn-ghost" onClick={copy}>{copied ? '✓ Copied' : '🔗 Copy link'}</button>
              {isHost && <button className="btn btn-ghost" onClick={() => setEditing(true)}><Glyph value="✏️" tile={false} size={16} /> Edit</button>}
              {isHost && <button className="btn btn-ghost !text-rose-300" onClick={remove}>🗑 Delete</button>}
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
                <Avatar user={state.users.find((u) => u.id === c.authorId)} size={34} />
                <div className="flex-1 rounded-xl bg-white/5 px-3 py-2">
                  <div className="text-sm"><UserLink id={c.authorId} /> <span className="text-xs text-slate-500">{timeAgo(c.createdAt)}</span></div>
                  <p className="mt-0.5 text-sm text-slate-200">{c.text}</p>
                </div>
              </li>
            ))}
            {!e.comments?.length && <li className="text-sm text-slate-500">No comments yet. Ask a question or share plans.</li>}
          </ul>
          <form onSubmit={addComment} className="mt-4 flex gap-2">
            <input className="input" placeholder="Write a comment…" value={comment} onChange={(ev) => setComment(ev.target.value)} aria-label="Comment" />
            <button className="btn btn-primary" disabled={!comment.trim()}>Post</button>
          </form>
        </section>

        <aside className="space-y-5">
          <section className="glass p-5" aria-label="People">
            <h2 className="mb-3 font-bold">Roles</h2>
            <RoleRow label="Host" ids={[e.hostId]} />
            <RoleRow label="Event Assistants" ids={e.assistants || []} />
            <RoleRow label="Invitees" ids={e.invitees || []} />
            {awaiting.length > 0 && <p className="mt-2 text-xs text-slate-500">{awaiting.length} invitee{awaiting.length > 1 ? 's haven’t' : ' hasn’t'} responded yet.</p>}
          </section>
          {e.rsvpEnabled && (
            <section className="glass p-5" aria-label="Attendees">
              <h2 className="mb-3 font-bold">Attendees</h2>
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'going', label: 'Going', count: lists.going.length }, { id: 'maybe', label: 'Maybe', count: lists.maybe.length }, { id: 'no', label: 'Not going', count: lists.no.length }]} />
              <ul className="space-y-2">
                {lists[tab].map((uidX) => <li key={uidX} className="flex items-center gap-2 text-sm"><Avatar user={state.users.find((u) => u.id === uidX)} size={28} /><UserLink id={uidX} /></li>)}
                {lists[tab].length === 0 && <li className="text-sm text-slate-500">Nobody yet.</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {editing && <EventForm initial={e} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
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
