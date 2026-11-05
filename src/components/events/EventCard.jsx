import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { AvatarStack } from '../ui.jsx';
import { TYPE_COLORS, recurrenceText, scopeLabel, whenText } from './eventUtils.js';

export function RsvpButtons({ event, compact = false }) {
  const { me, dispatch } = useStore();
  if (!event.rsvpEnabled) return null;
  const mine = event.rsvps?.[me.id];
  const opts = [['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Not going']];
  return (
    <div role="group" aria-label="RSVP" className="flex flex-wrap gap-1.5">
      {opts.map(([v, l]) => (
        <button key={v} aria-pressed={mine === v} onClick={(e) => { e.preventDefault(); dispatch({ type: 'event/rsvp', id: event.id, status: v }); }}
          className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${mine === v ? (v === 'going' ? 'bg-emerald-500 text-white' : v === 'maybe' ? 'bg-amber-500 text-black' : 'bg-rose-500/80 text-white') : 'bg-white/5 text-slate-300 hover:bg-white/10'} ${compact ? '' : 'sm:min-h-10 sm:px-4 sm:text-sm'}`}>
          {l}
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
  const color = TYPE_COLORS[event.eventType] ?? '#a3e635';
  const past = (event.occEnd ?? event.end) < Date.now();
  return (
    <article className={`glass flex flex-col gap-4 p-4 sm:flex-row sm:items-center ${past ? 'opacity-70' : ''}`}>
      <Link to={`/events/${event.id}`} className="flex flex-1 items-start gap-4">
        <div className="grid w-14 shrink-0 place-items-center rounded-xl py-2 text-center" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}55` }}>
          <span className="text-[11px] font-bold uppercase" style={{ color }}>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
          <span className="text-xl font-extrabold leading-none">{d.getDate()}</span>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold hover:underline">{event.title}</h3>
            <span className="chip" style={{ background: `${color}26`, color }}>{event.eventType ?? 'Event'}</span>
            {past && <span className="chip !bg-white/10 !text-slate-400">Ended</span>}
          </div>
          <p className="mt-1 text-sm text-slate-300">{whenText(event)}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {scopeLabel(event, state.groups)}{event.location && ` · 📍 ${event.location}`}{recurrenceText(event.recurrence) && ` · 🔁 ${recurrenceText(event.recurrence)}`}
          </p>
          {going.length > 0 && <div className="mt-2 flex items-center gap-2 text-xs text-slate-400"><AvatarStack ids={going} size={22} />{going.length} going</div>}
        </div>
      </Link>
      {!past && <RsvpButtons event={event} compact />}
    </article>
  );
}
