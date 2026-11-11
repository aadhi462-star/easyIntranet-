import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { setRsvp } from '../../lib/events.js';
import { toast } from '../../lib/toast.js';
import { AvatarStack } from '../ui.jsx';
import { TYPE_COLORS, recurrenceText, scopeLabel, whenText } from './eventUtils.js';

/** RSVP choices. The server decides whether they're open (`can.rsvp`) and has the last word on
 * capacity and deadlines, so a refusal is shown as its message. */
export function RsvpButtons({ event, compact = false }) {
  const [pending, setPending] = useState(null);
  if (!event.rsvpEnabled || !event.can?.rsvp) return null;
  const mine = event.myRsvp;
  const opts = [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Not going']];
  const choose = async (v) => {
    if (pending || v === mine) return;
    setPending(v);
    try { await setRsvp(event.id, v); toast('RSVP saved'); } catch (err) { toast(err.message, 'error'); } finally { setPending(null); }
  };
  return (
    <div role="group" aria-label="RSVP" className="flex flex-wrap gap-1.5">
      {opts.map(([v, l]) => (
        <button key={v} aria-pressed={mine === v} disabled={!!pending || (v === 'going' && event.can.full && mine !== 'going')}
          onClick={(e) => { e.preventDefault(); choose(v); }}
          className={`rounded-lg px-3 font-semibold transition ${mine === v ? (v === 'going' ? 'bg-accent-fill' : 'bg-[var(--az-text)] text-[var(--color-ink-950)]') : 'text-2 border border-[var(--az-hairline)] hover:text-white'} ${compact ? 'min-h-9 text-xs' : 'min-h-11 px-4 text-sm'}`}>
          {v === 'going' && event.can.full && mine !== 'going' ? 'Full' : l}
        </button>
      ))}
    </div>
  );
}

/** One event occurrence as a card. `event.occStart` / `occEnd` are used when present. */
export default function EventCard({ event }) {
  const { state } = useStore();
  const start = event.occStart ?? event.start;
  const d = new Date(start);
  const going = Object.entries(event.rsvps || {}).filter(([, v]) => v === 'going').map(([k]) => k);
  const cancelled = event.status === 'cancelled';
  const color = TYPE_COLORS[event.eventType] ?? '#a3e635';
  const past = (event.occEnd ?? event.end) < Date.now();
  return (
    <article className={`glass flex flex-col gap-4 p-4 sm:flex-row sm:items-center ${past || cancelled ? 'opacity-70' : ''}`}>
      <Link to={`/events/${event.id}`} className="flex flex-1 items-start gap-4">
        <div className="grid w-14 shrink-0 place-items-center rounded-xl py-2 text-center" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}55` }}>
          <span className="text-[11px] font-bold uppercase" style={{ color }}>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
          <span className="text-xl font-extrabold leading-none">{d.getDate()}</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold hover:underline">{event.title}</h3>
            <span className="chip" style={{ background: `${color}26`, color }}>{event.eventType ?? 'Event'}</span>
            {cancelled && <span className="chip !bg-rose-500/15 !text-rose-200">Cancelled</span>}
            {!cancelled && past && <span className="chip !bg-white/10 !text-slate-400">Ended</span>}
            {event.inviteOnly && <span className="chip !bg-white/10 !text-slate-300">Invite-only</span>}
          </div>
          <p className="mt-1 text-sm text-2">{whenText(event)}</p>
          <p className="mt-0.5 truncate text-xs text-3">
            {scopeLabel(event, state.groups)}{event.location && ` · 📍 ${event.location}`}{recurrenceText(event.recurrence) && ` · 🔁 ${recurrenceText(event.recurrence)}`}
          </p>
          {going.length > 0 && <div className="mt-2 flex items-center gap-2 text-xs text-3"><AvatarStack ids={going} size={22} />{event.counts?.going ?? going.length} going{event.capacity ? ` of ${event.capacity}` : ''}</div>}
        </div>
      </Link>
      {!past && !cancelled && <RsvpButtons event={event} compact />}
    </article>
  );
}
