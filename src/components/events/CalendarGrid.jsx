import { Link } from 'react-router-dom';
import { addDays, sameDay, startOfDay, startOfWeek } from './eventUtils.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Range covered by a month or week view for the given cursor date. */
export function viewRange(mode, cursor) {
  if (mode === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 7) - 1]; }
  const first = new Date(cursor); first.setDate(1);
  const s = startOfWeek(first.getTime());
  return [s, addDays(s, 42) - 1];
}

export function stepCursor(mode, cursor, dir) {
  const d = new Date(cursor);
  if (mode === 'week') d.setDate(d.getDate() + 7 * dir); else { d.setDate(1); d.setMonth(d.getMonth() + dir); }
  return d.getTime();
}

export function rangeTitle(mode, cursor) {
  if (mode === 'week') {
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    return `${new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(e).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return new Date(cursor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Prev / today / next controls. */
export function RangeNav({ mode, cursor, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => onChange(stepCursor(mode, cursor, -1))} aria-label="Previous">‹</button>
      <button className="btn btn-ghost h-10" onClick={() => onChange(Date.now())}>Today</button>
      <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => onChange(stepCursor(mode, cursor, 1))} aria-label="Next">›</button>
      <h2 className="ml-2 text-lg font-bold">{rangeTitle(mode, cursor)}</h2>
    </div>
  );
}

/**
 * Month or week grid. `items`: [{ key, title, start, end, color, href, allDay, icon }].
 * Clicking an empty part of a day calls onDayClick(dayStart).
 */
export default function CalendarGrid({ mode = 'month', cursor, items, onDayClick }) {
  const [from] = viewRange(mode, cursor);
  const days = Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => addDays(from, i));
  const month = new Date(cursor).getMonth();
  const today = startOfDay(Date.now());
  const on = (d) => items.filter((it) => startOfDay(it.start) <= d && startOfDay(it.end ?? it.start) >= d).sort((a, b) => a.start - b.start);

  const chip = (it) => (
    <Link key={it.key} to={it.href} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={it.title}
      className="block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white hover:brightness-125"
      style={{ background: `${it.color}33`, borderLeft: `3px solid ${it.color}` }}>
      {it.icon ?? ''}{!it.allDay && <span className="mr-1 opacity-70">{time(it.start)}</span>}{it.title}
    </Link>
  );

  if (mode === 'week') {
    return (
      <div className="glass grid grid-cols-1 overflow-hidden sm:grid-cols-7">
        {days.map((d) => {
          const list = on(d);
          return (
            <div key={d} role="button" tabIndex={0} aria-label={`Create event on ${new Date(d).toDateString()}`}
              onClick={() => onDayClick?.(d)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onDayClick?.(d))}
              className="min-h-24 cursor-pointer border-b border-white/5 p-2 hover:bg-white/[.03] sm:min-h-72 sm:border-b-0 sm:border-r last:border-r-0">
              <div className={`mb-2 text-xs font-semibold ${d === today ? 'text-brand-400' : 'text-slate-400'}`}>
                {WEEKDAYS[new Date(d).getDay()]} <span className={`ml-1 inline-grid h-6 min-w-6 place-items-center rounded-full ${d === today ? 'bg-brand-500 text-white' : ''}`}>{new Date(d).getDate()}</span>
              </div>
              <div className="space-y-1">{list.map(chip)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="glass overflow-hidden">
        <div className="grid grid-cols-7 border-b border-white/5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = on(d);
            const out = new Date(d).getMonth() !== month;
            return (
              <div key={d} role="button" tabIndex={0} aria-label={`${new Date(d).toDateString()}, ${list.length} items. Create event`}
                onClick={() => onDayClick?.(d)} onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onDayClick?.(d))}
                className={`min-h-14 cursor-pointer border-b border-r border-white/5 p-1 hover:bg-white/[.03] sm:min-h-28 sm:p-1.5 ${out ? 'opacity-40' : ''}`}>
                <div className={`mb-1 inline-grid h-6 min-w-6 place-items-center rounded-full text-xs font-semibold ${d === today ? 'bg-brand-500 text-white' : 'text-slate-300'}`}>{new Date(d).getDate()}</div>
                <div className="hidden space-y-1 sm:block">
                  {list.slice(0, 3).map(chip)}
                  {list.length > 3 && <div className="px-1 text-[11px] text-slate-400">+{list.length - 3} more</div>}
                </div>
                <div className="flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 4).map((it) => <span key={it.key} className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} />)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Phones: the grid only shows dots, so list the month's items underneath. */}
      <ul className="mt-4 space-y-2 sm:hidden">
        {items.filter((it) => new Date(it.start).getMonth() === month).sort((a, b) => a.start - b.start).map((it) => (
          <li key={it.key}>
            <Link to={it.href} className="glass flex items-center gap-3 p-3 text-sm">
              <span className="h-8 w-1 rounded-full" style={{ background: it.color }} />
              <span className="flex-1"><span className="block font-semibold">{it.icon ?? ''}{it.title}</span>
                <span className="text-xs text-slate-400">{new Date(it.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{!it.allDay && ` · ${time(it.start)}`}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { sameDay };
