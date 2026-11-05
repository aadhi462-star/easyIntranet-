// Shared helpers for events, the calendar and reminders.

export const EVENT_TYPES = ['Meetup', 'Reunion', 'Conference', 'Contest', 'Webinar', 'ShowTime', 'Meeting'];
export const TYPE_COLORS = {
  Meetup: '#a3e635', Reunion: '#f0abfc', Conference: '#22d3ee', Contest: '#fbbf24',
  Webinar: '#34d399', ShowTime: '#fb7185', Meeting: '#94a3b8',
};
export const REMINDER_OPTIONS = [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day'], [10080, '1 week']];
export const MAX_ATTACHMENT = 30 * 1024 * 1024;
/** Attachments are stored as data URLs in localStorage, so each one must stay small. */
export const MAX_STORED_ATTACHMENT = 1024 * 1024;

const DAY = 864e5;
const pad = (n) => String(n).padStart(2, '0');

export const sectionOf = (e) => (e.scope?.type === 'network' ? 'company' : e.scope?.type === 'group' ? 'group' : 'private');

export function isInvolved(e, userId) {
  return e.hostId === userId || (e.invitees || []).includes(userId) || (e.assistants || []).includes(userId)
    || ['going', 'maybe'].includes(e.rsvps?.[userId]);
}

/** Whether `me` can see the event at all. */
export function canSee(e, me, groups) {
  if (!me) return false;
  if (e.scope?.type === 'network' || me.admin) return true;
  if (isInvolved(e, me.id) || e.rsvps?.[me.id]) return true;
  if (e.scope?.type === 'group') return !!groups.find((g) => g.id === e.scope.id)?.members.includes(me.id);
  return false;
}

/** Whether `me` can see a town hall: network-wide ones are public, group ones need membership. */
export function canSeeTownhall(th, me, groups = []) {
  if (!th || !me) return false;
  if (!th.groupId || me.admin) return true;
  if (th.hostId === me.id || (th.moderators || []).includes(me.id)) return true;
  const g = groups.find((x) => x.id === th.groupId);
  return !!g && [g.members, g.admins, g.moderators].some((l) => (l || []).includes(me.id));
}

const isRecurring = (e) => !!e.recurrence?.freq && e.recurrence.freq !== 'none';

/**
 * Start of occurrence `i` of a recurring event, always computed from the original start so
 * nothing drifts (DST-safe: local hours are kept). Monthly series skip months that don't
 * have the start day (e.g. the 31st), like an RRULE does; those return null.
 */
function nthStart(e, i) {
  const d = new Date(e.start);
  if (e.recurrence.freq === 'monthly') {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    d.setDate(day);
    return d.getDate() === day ? d.getTime() : null;
  }
  d.setDate(d.getDate() + i * (e.recurrence.freq === 'weekly' ? 7 : 1));
  return d.getTime();
}

/** An occurrence index at or a little before the one starting at time `t` (never negative). */
function indexNear(e, t) {
  if (t <= e.start) return 0;
  if (e.recurrence.freq === 'monthly') {
    const a = new Date(e.start); const b = new Date(t);
    return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - 1);
  }
  const step = (e.recurrence.freq === 'weekly' ? 7 : 1) * DAY;
  return Math.max(0, Math.floor((t - e.start) / step) - 1);
}

/** Expand an event (and its recurrence) into occurrences overlapping [from, to]. */
export function occurrences(e, from, to) {
  const dur = Math.max(0, e.end - e.start);
  if (!isRecurring(e)) return e.end >= from && e.start <= to ? [{ ...e, occStart: e.start, occEnd: e.end }] : [];
  const out = [];
  const until = e.recurrence.until ?? Infinity;
  const first = indexNear(e, from - dur);
  for (let i = first; out.length < 1000 && i < first + 5000; i++) {
    const s = nthStart(e, i);
    if (s == null) continue;
    if (s > to || s > until) break;
    if (s + dur >= from) out.push({ ...e, occStart: s, occEnd: s + dur });
  }
  return out;
}

/** Start of the last occurrence at or before `limit` (and the series' end), or null. */
export function lastOccurrence(e, limit = Date.now()) {
  if (!isRecurring(e)) return e.start <= limit ? e.start : null;
  const cap = Math.min(limit, e.recurrence.until ?? Infinity);
  for (let i = indexNear(e, cap) + 2; i >= 0; i--) {
    const s = nthStart(e, i);
    if (s != null && s <= cap) return s;
  }
  return null;
}

/** Next occurrence start (or the last one, if the series is over). */
export function nextOccurrence(e, now = Date.now()) {
  const next = occurrences(e, now, now + 400 * DAY)[0];
  if (next) return next.occStart;
  return isRecurring(e) ? (lastOccurrence(e, now) ?? e.start) : e.start;
}

export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
export function startOfWeek(t) { const d = new Date(startOfDay(t)); d.setDate(d.getDate() - d.getDay()); return d.getTime(); }
export const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

export function toInput(t, allDay) {
  const d = new Date(t);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return allDay ? date : `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromInput = (v) => (v ? new Date(v.length === 10 ? `${v}T00:00` : v).getTime() : NaN);

export function whenText(e, start = e.occStart ?? e.start, end = e.occEnd ?? e.end) {
  const dOpts = { weekday: 'short', day: 'numeric', month: 'short' };
  const tOpts = { hour: 'numeric', minute: '2-digit' };
  if (e.allDay) {
    const a = new Date(start).toLocaleDateString(undefined, dOpts);
    return sameDay(start, end) ? `${a} · All day` : `${a} – ${new Date(end).toLocaleDateString(undefined, dOpts)} · All day`;
  }
  const a = `${new Date(start).toLocaleDateString(undefined, dOpts)}, ${new Date(start).toLocaleTimeString(undefined, tOpts)}`;
  return sameDay(start, end) ? `${a} – ${new Date(end).toLocaleTimeString(undefined, tOpts)}` : `${a} – ${new Date(end).toLocaleString(undefined, { ...dOpts, ...tOpts })}`;
}

export function recurrenceText(r) {
  if (!r || r.freq === 'none' || !r.freq) return '';
  const until = r.until ? ` until ${new Date(r.until).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  return `Repeats ${r.freq}${until}`;
}

export const scopeLabel = (e, groups) => (e.scope?.type === 'network' ? 'Company event'
  : e.scope?.type === 'group' ? (groups.find((g) => g.id === e.scope.id)?.name ?? 'Group event') : 'Private event');

export const isUrl = (s = '') => /^https?:\/\//i.test(s.trim());

export function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

const icsDate = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
const icsText = (s = '') => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Download an .ics file so the event can be added to any calendar app. */
export function downloadIcs(e) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AlumniZone//Events//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@alumnizone`, `DTSTAMP:${icsDate(Date.now())}`];
  if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDay(e.start)}`, `DTEND;VALUE=DATE:${icsDay(addDays(e.end, 1))}`);
  else lines.push(`DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end)}`);
  if (e.recurrence?.freq && e.recurrence.freq !== 'none') {
    lines.push(`RRULE:FREQ=${e.recurrence.freq.toUpperCase()}${e.recurrence.until ? `;UNTIL=${e.allDay ? icsDay(e.recurrence.until) : icsDate(e.recurrence.until)}` : ''}`);
  }
  lines.push(`SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description)}`, `LOCATION:${icsText(e.location)}`);
  for (const m of e.reminders || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${e.title.replace(/[^\w-]+/g, '-').toLowerCase()}.ics` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
