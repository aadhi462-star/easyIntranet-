import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { useEvents } from '../lib/events.js';
import { Avatar, PageHeader, Tabs } from '../components/ui.jsx';
import CalendarGrid, { RangeNav, viewRange } from '../components/events/CalendarGrid.jsx';
import EventForm from '../components/events/EventForm.jsx';
import { TYPE_COLORS, addDays, isInvolved, occurrences, startOfDay, startOfWeek } from '../components/events/eventUtils.js';

const TASK_COLOR = '#84cc16';

export default function Calendar() {
  const [tab, setTab] = useState('mine');
  return (
    <div>
      <PageHeader title="Calendar" subtitle="Events from your communities, by month or week." actions={<Link to="/events" className="btn btn-ghost"><Glyph value="📅" tile={false} size={16} /> Events</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mine', label: 'My calendar' }, { id: 'team', label: 'Team schedule' }]} />
      {tab === 'mine' ? <MyCalendar /> : <TeamSchedule />}
    </div>
  );
}

function MyCalendar() {
  const { state, me } = useStore();
  const nav = useNavigate();
  const [mode, setMode] = useState('month');
  const [cursor, setCursor] = useState(Date.now());
  // Tasks are parked behind a feature flag (decision D2), so their due dates aren't shown.
  const [show, setShow] = useState({ events: true, tasks: false, onlyMine: false });
  const [draft, setDraft] = useState(null);
  const [from, to] = viewRange(mode, cursor);
  // Only events this viewer may see come back from the server (EVT-08).
  const { events, error } = useEvents({ from, to });

  const items = [];
  if (show.events) {
    for (const e of events) {
      if (show.onlyMine && !isInvolved(e, me.id)) continue;
      for (const o of occurrences(e, from, to)) {
        items.push({ key: `e-${o.id}-${o.occStart}`, title: o.title, start: o.occStart, end: o.occEnd, allDay: o.allDay, icon: o.status === 'cancelled' ? '🚫 ' : undefined, color: TYPE_COLORS[o.eventType] ?? '#a3e635', href: `/events/${o.id}` });
      }
    }
  }
  if (show.tasks) {
    for (const t of state.tasks || []) {
      if (!t.dueAt || t.dueAt < from || t.dueAt > to) continue;
      if (show.onlyMine && t.assigneeId !== me.id && !(t.assigneeIds || []).includes(me.id)) continue;
      items.push({ key: `t-${t.id}`, title: t.title, start: t.dueAt, end: t.dueAt, allDay: true, icon: t.done || t.status === 'done' ? '✔️ ' : '☑️ ', color: TASK_COLOR, href: `/tasks/${t.boardId ?? t.id}` });
    }
  }
  // Town halls are parked behind a feature flag (decision D2), so they aren't listed here.

  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <RangeNav mode={mode} cursor={cursor} onChange={setCursor} />
        <div role="group" aria-label="View" className="inline-flex rounded-lg border border-[var(--az-hairline)] p-1">
          {[['month', 'Month'], ['week', 'Week']].map(([v, l]) => (
            <button key={v} aria-pressed={mode === v} onClick={() => setMode(v)}
              className={`min-h-8 rounded-lg px-3 text-sm font-semibold ${mode === v ? 'bg-[var(--az-text)] text-[var(--color-ink-950)]' : 'text-2 hover:bg-white/5'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[['events', 'Events', '#a3e635'], ['onlyMine', 'Only mine', null]].map(([k, l, c]) => (
          <label key={k} className="text-2 flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--az-hairline)] px-3.5">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={show[k]} onChange={() => toggle(k)} />
            {c && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />}{l}
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-300">Couldn’t load events: {error}</p>}
      <CalendarGrid mode={mode} cursor={cursor} items={items} onDayClick={(d) => { const x = new Date(d); x.setHours(18, 0, 0, 0); setDraft(x.getTime()); }} />
      {draft && <EventForm initial={{ start: draft }} onClose={() => setDraft(null)} onSaved={(id) => { setDraft(null); nav(`/events/${id}`); }} />}
    </>
  );
}

/** Week grid with one row per member: their events and assigned tasks. */
function TeamSchedule() {
  const { state, me } = useStore();
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));
  const [groupId, setGroupId] = useState(myGroups[0]?.id ?? 'all');
  const [cursor, setCursor] = useState(Date.now());
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const { events } = useEvents({ from: weekStart, to: addDays(weekStart, 7) - 1 });
  const members = groupId === 'all' ? state.users : state.users.filter((u) => state.groups.find((g) => g.id === groupId)?.members.includes(u.id));

  const cell = (userId, d) => {
    const end = d + 864e5 - 1;
    const evs = events.filter((e) => e.status !== 'cancelled' && isInvolved(e, userId))
      .flatMap((e) => occurrences(e, d, end)).map((o) => ({ key: `e${o.id}${o.occStart}`, title: o.title, href: `/events/${o.id}`, color: TYPE_COLORS[o.eventType] ?? '#a3e635', start: o.occStart, allDay: o.allDay }));
    const tasks = (state.tasks || []).filter((t) => t.dueAt && (t.assigneeId === userId || (t.assigneeIds || []).includes(userId)) && startOfDay(t.dueAt) === d)
      .map((t) => ({ key: `t${t.id}`, title: `☑️ ${t.title}`, href: `/tasks/${t.boardId ?? t.id}`, color: TASK_COLOR, allDay: true }));
    return [...evs, ...tasks];
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <RangeNav mode="week" cursor={cursor} onChange={setCursor} />
        <select className="input !w-auto" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Team">
          {myGroups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          <option value="all">Everyone</option>
        </select>
      </div>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-3">
              <th className="w-44 p-3">Member</th>
              {days.map((d) => (
                <th key={d} className={`p-3 ${startOfDay(Date.now()) === d ? 'text-brand-400' : ''}`}>
                  {new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id} className="border-t border-white/5 align-top">
                <th scope="row" className="p-3 text-left font-normal">
                  <Link to={`/people/${u.id}`} className="flex items-center gap-2 hover:underline"><Avatar user={u} size={28} /><span className="truncate font-semibold">{u.name}</span></Link>
                </th>
                {days.map((d) => {
                  const list = cell(u.id, d);
                  return (
                    <td key={d} className="p-1.5">
                      {list.length === 0 ? <span className="block h-8 rounded-md bg-white/[.02]" aria-label="Free" /> : (
                        <div className="space-y-1">
                          {list.map((it) => (
                            <Link key={it.key} to={it.href} title={it.title} className="block truncate rounded-md px-1.5 py-1 text-[11px] font-medium hover:brightness-125"
                              style={{ background: `${it.color}33`, borderLeft: `3px solid ${it.color}` }}>
                              {!it.allDay && it.start && <span className="mr-1 opacity-70">{new Date(it.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}{it.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-3">Shows events each member hosts, assists, is invited to or is attending.</p>
    </>
  );
}
