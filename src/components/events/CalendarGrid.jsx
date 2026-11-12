// Month and week grids for the Events page, the Calendar page and a community's Events tab
// (E13), on the v2 tokens. Items keep their own colour as a thin marker; `accent` draws them in
// the community's accent instead (identity only, E3).
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';
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

/** Prev / today / next controls. `today={false}` leaves out the Today button. */
export function RangeNav({ mode, cursor, onChange, today = true }) {
  const unit = mode === 'week' ? 'week' : 'month';
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(stepCursor(mode, cursor, -1))} aria-label={`Previous ${unit}`} title={`Previous ${unit}`}>
        <Icon name="down" size={18} className="rotate-90" />
      </button>
      {today && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(Date.now())}>Today</button>}
      <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(stepCursor(mode, cursor, 1))} aria-label={`Next ${unit}`} title={`Next ${unit}`}>
        <Icon name="down" size={18} className="-rotate-90" />
      </button>
      <h2 className="t-h3 ml-1.5 min-w-0 truncate text-[var(--az-text)]" aria-live="polite">{rangeTitle(mode, cursor)}</h2>
    </div>
  );
}

/**
 * Month or week grid. `items`: [{ key, title, start, end, color, href, allDay, cancelled }].
 * With `onDayClick`, clicking an empty part of a day calls onDayClick(dayStart); without it the
 * days are plain cells.
 */
export default function CalendarGrid({ mode = 'month', cursor, items, onDayClick, accent = false }) {
  const [from] = viewRange(mode, cursor);
  const days = Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => addDays(from, i));
  const month = new Date(cursor).getMonth();
  const today = startOfDay(Date.now());
  const on = (d) => items.filter((it) => startOfDay(it.start) <= d && startOfDay(it.end ?? it.start) >= d).sort((a, b) => a.start - b.start);
  const clickable = !!onDayClick;
  const dayProps = (d, label) => (clickable ? {
    role: 'button', tabIndex: 0, 'aria-label': label,
    onClick: () => onDayClick(d),
    onKeyDown: (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onDayClick(d)),
  } : {});
  const dayNum = (d) => (
    <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold ${d === today ? 'bg-accent-fill' : 'text-[var(--az-text)]'}`}>{new Date(d).getDate()}</span>
  );

  const chip = (it) => (
    <Link key={it.key} to={it.href} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} title={it.title}
      className={`block truncate rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-5 hover:underline ${it.cancelled ? 'line-through' : ''} ${accent
        ? 'border border-[var(--cm-line,var(--az-hairline))] bg-[var(--cm-tint,var(--az-sunken))] text-[var(--cm-ink,var(--az-text))]'
        : 'border-l-[3px] bg-[var(--az-sunken)] text-[var(--az-text)]'}`}
      style={accent ? undefined : { borderLeftColor: it.color }}>
      {!it.allDay && <span className="text-2 mr-1">{time(it.start)}</span>}{it.title}
    </Link>
  );

  const dot = (it) => <span key={it.key} aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${accent ? 'bg-[var(--cm-ink,var(--az-text-2))]' : ''}`} style={accent ? undefined : { background: it.color }} />;

  if (mode === 'week') {
    return (
      <div className="panel grid grid-cols-1 overflow-hidden sm:grid-cols-7">
        {days.map((d) => {
          const list = on(d);
          return (
            <div key={d} {...dayProps(d, `Create event on ${new Date(d).toDateString()}`)}
              className={`min-h-24 min-w-0 border-b border-[var(--az-divider)] p-2 last:border-b-0 sm:min-h-72 sm:border-b-0 sm:border-r sm:last:border-r-0 ${clickable ? 'cursor-pointer hover:bg-[var(--az-sunken)]' : ''}`}>
              <div className="t-label mb-2 flex items-center gap-1">{WEEKDAYS[new Date(d).getDay()]} {dayNum(d)}</div>
              <div className="space-y-1">{list.map(chip)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  const monthItems = items.filter((it) => new Date(it.start).getMonth() === month).sort((a, b) => a.start - b.start);
  return (
    <div className="min-w-0">
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--az-hairline)] text-center">
          {WEEKDAYS.map((w) => <div key={w} className="t-label py-2"><span className="sm:hidden">{w.slice(0, 1)}</span><span className="hidden sm:inline">{w}</span></div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const list = on(d);
            const out = new Date(d).getMonth() !== month;
            return (
              <div key={d} {...dayProps(d, `${new Date(d).toDateString()}, ${list.length} ${list.length === 1 ? 'item' : 'items'}. Create event`)}
                className={`min-h-14 min-w-0 border-b border-[var(--az-divider)] p-1 sm:min-h-28 sm:p-1.5 ${i % 7 !== 6 ? 'border-r' : ''} ${i >= 35 ? 'border-b-0' : ''} ${out ? 'bg-[var(--az-band)] [&>span:first-child]:text-[var(--az-text-3)]' : ''} ${clickable ? 'cursor-pointer hover:bg-[var(--az-sunken)]' : ''}`}>
                {dayNum(d)}
                <div className="mt-1 hidden min-w-0 space-y-1 sm:block">
                  {list.slice(0, 3).map(chip)}
                  {list.length > 3 && <div className="t-small px-1">+{list.length - 3} more</div>}
                </div>
                <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 4).map(dot)}</div>
              </div>
            );
          })}
        </div>
      </div>
      {/* Phones: the grid only shows dots, so list the month's items underneath. */}
      <ul className="mt-4 space-y-2 sm:hidden" aria-label={`In ${rangeTitle('month', cursor)}`}>
        {monthItems.length === 0 && <li className="t-small">Nothing this month.</li>}
        {monthItems.map((it) => (
          <li key={it.key}>
            <Link to={it.href} className="panel flex min-w-0 items-center gap-3 p-3 text-sm">
              <span aria-hidden="true" className={`h-8 w-1 shrink-0 rounded-full ${accent ? 'bg-[var(--cm-ink,var(--az-text-2))]' : ''}`} style={accent ? undefined : { background: it.color }} />
              <span className="min-w-0 flex-1"><span className={`block truncate font-semibold text-[var(--az-text)] ${it.cancelled ? 'line-through' : ''}`}>{it.title}</span>
                <span className="t-small">{new Date(it.start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{!it.allDay && ` · ${time(it.start)}`}{it.cancelled ? ' · Cancelled' : ''}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { sameDay };
