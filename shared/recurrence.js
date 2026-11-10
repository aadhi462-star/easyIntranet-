// Event recurrence, shared by the web app and the server so both expand a series the same way.
// Pure (no imports, no DOM). Times are epoch milliseconds.
//
// An event carries the organiser's time zone (`e.timezone`, an IANA name). Occurrences keep the
// organiser's wall-clock time in that zone, so a weekly 18:00 London meeting stays at 18:00
// London across daylight-saving changes and every viewer sees the right local time (EVT-04).
// Without a time zone the runtime's local zone is used (the prototype's behaviour).

const DAY = 864e5;
const formatters = new Map();

function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }));
  }
  return formatters.get(tz);
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { formatter(tz); return true; } catch { return false; }
}

/** Wall-clock parts of instant `t` in zone `tz`: { y, mo (0-based), d, h, mi, s, ms }. */
function partsIn(t, tz) {
  if (!tz) {
    const x = new Date(t);
    return { y: x.getFullYear(), mo: x.getMonth(), d: x.getDate(), h: x.getHours(), mi: x.getMinutes(), s: x.getSeconds(), ms: x.getMilliseconds() };
  }
  const p = Object.fromEntries(formatter(tz).formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return { y: p.year, mo: p.month - 1, d: p.day, h: p.hour, mi: p.minute, s: p.second, ms: ((t % 1000) + 1000) % 1000 };
}

/** The instant whose wall-clock time in `tz` is `p` (two passes settle the zone offset). */
function instantOf(p, tz) {
  if (!tz) return new Date(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms).getTime();
  const wall = Date.UTC(p.y, p.mo, p.d, p.h, p.mi, p.s, p.ms);
  const offset = (t) => { const q = partsIn(t, tz); return Date.UTC(q.y, q.mo, q.d, q.h, q.mi, q.s, q.ms) - t; };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return t;
}

const isRecurring = (e) => !!e.recurrence?.freq && e.recurrence.freq !== 'none';

/**
 * Start of occurrence `i`, always computed from the original start so nothing drifts. Monthly
 * series skip months that don't have the start day (e.g. the 31st), like an RRULE does; those
 * return null.
 */
function nthStart(e, i) {
  const p = partsIn(e.start, e.timezone);
  if (e.recurrence.freq === 'monthly') {
    const m = new Date(Date.UTC(p.y, p.mo + i, 1));
    const date = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), p.d));
    if (date.getUTCMonth() !== m.getUTCMonth()) return null;
    return instantOf({ ...p, y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: p.d }, e.timezone);
  }
  const date = new Date(Date.UTC(p.y, p.mo, p.d + i * (e.recurrence.freq === 'weekly' ? 7 : 1)));
  return instantOf({ ...p, y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate() }, e.timezone);
}

/** An occurrence index at or a little before the one starting at time `t` (never negative). */
function indexNear(e, t) {
  if (t <= e.start) return 0;
  if (e.recurrence.freq === 'monthly') {
    const a = partsIn(e.start, e.timezone); const b = partsIn(t, e.timezone);
    return Math.max(0, (b.y - a.y) * 12 + b.mo - a.mo - 1);
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

/** End of the whole series: the last occurrence's end, or Infinity for an open-ended series. */
export function seriesEnd(e) {
  if (!isRecurring(e)) return e.end;
  if (e.recurrence.until == null) return Infinity;
  const last = lastOccurrence(e, e.recurrence.until);
  return (last ?? e.start) + Math.max(0, e.end - e.start);
}
