// Client for the events and dashboard APIs (server/routes/events.js, dashboard.js). The server is
// the source of truth for events, RSVPs and comments. Events come back in the shape the existing
// screens and eventUtils.js expect: epoch-ms `start`/`end`/`recurrence.until`, plus the old
// `scope` ({type:'network'|'group'|'private'}) so labels and sections keep working.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, newKey } from './api.js';

// ---- Change broadcast -------------------------------------------------------------------------
// {type:'event', event} changed · {type:'removed', id} gone for this viewer · {type:'created', event}
const listeners = new Set();
export function onEventsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = (e) => listeners.forEach((fn) => fn(e));
const changed = (event) => { emit({ type: 'event', event }); return event; };

/** The viewer's own time zone, sent with new events so recurrence keeps local time (EVT-04). */
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

/** Server event → the client model. */
export function fromServer(e) {
  if (!e) return e;
  const scope = e.inviteOnly ? { type: 'private' } : { type: 'group', id: e.communityId };
  return {
    ...e,
    scope,
    start: Date.parse(e.start), end: Date.parse(e.end),
    nextStart: e.nextStart ? Date.parse(e.nextStart) : null,
    rsvpDeadline: e.rsvpDeadline ? Date.parse(e.rsvpDeadline) : null,
    recurrence: { freq: e.recurrence?.freq ?? 'none', until: e.recurrence?.until ? Date.parse(e.recurrence.until) : null },
    comments: e.comments?.map((c) => ({ ...c, createdAt: Date.parse(c.createdAt) })),
  };
}

/** Form values (epoch ms) → request body. Only the keys present are sent. */
export function toServer(f) {
  const out = {};
  const iso = (t) => new Date(t).toISOString();
  for (const k of ['title', 'description', 'eventType', 'allDay', 'location', 'inviteOnly', 'rsvpEnabled', 'capacity', 'reminders', 'assistants', 'invitees', 'timezone', 'category']) {
    if (k in f) out[k] = f[k];
  }
  if ('start' in f) out.start = iso(f.start);
  if ('end' in f) out.end = iso(f.end);
  if ('rsvpDeadline' in f) out.rsvpDeadline = f.rsvpDeadline ? iso(f.rsvpDeadline) : null;
  if ('recurrence' in f) {
    const freq = f.recurrence?.freq ?? 'none';
    out.recurrence = freq === 'none' ? { freq } : { freq, until: f.recurrence.until ? iso(f.recurrence.until) : null };
  }
  return out;
}

// ---- Reads ------------------------------------------------------------------------------------
export async function fetchEvents({ from, to, community, view = 'all' } = {}) {
  const q = new URLSearchParams({ view });
  if (from != null) q.set('from', new Date(from).toISOString());
  if (to != null) q.set('to', new Date(to).toISOString());
  if (community) q.set('community', community);
  return (await api(`/events?${q}`)).events.map(fromServer);
}

/** One event with its comments, or null when it doesn't exist / isn't visible (404). */
export async function fetchEvent(id) {
  try {
    return fromServer((await api(`/events/${encodeURIComponent(id)}`)).event);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchDashboard() {
  const d = await api('/dashboard');
  return { ...d, upcomingEvents: d.upcomingEvents.map(fromServer), comingUp: d.comingUp?.map(fromServer) };
}

// ---- Writes -----------------------------------------------------------------------------------
/** `key` is an idempotency key kept by the caller for one submit, so a retry can't duplicate. */
export async function createEvent(communityId, form, key = newKey()) {
  const body = toServer({ timezone: localTimeZone(), ...form });
  const event = fromServer((await api(`/communities/${encodeURIComponent(communityId)}/events`, { method: 'POST', body, idempotencyKey: key })).event);
  emit({ type: 'created', event });
  return event;
}

/** Sends only the changed fields, from the version the editor opened (STALE_VERSION on conflict). */
export const editEvent = async (event, changes) =>
  changed(fromServer((await api(`/events/${event.id}`, { method: 'PATCH', body: { version: event.version, ...toServer(changes) } })).event));

export const cancelEvent = async (id, reason) => changed(fromServer((await api(`/events/${id}/cancel`, { method: 'POST', body: { reason } })).event));

export async function deleteEvent(id) {
  await api(`/events/${id}`, { method: 'DELETE' });
  emit({ type: 'removed', id });
}

export const setRsvp = async (id, status) => changed(fromServer((await api(`/events/${id}/rsvp`, { method: 'PUT', body: { status } })).event));
export const clearRsvp = async (id) => changed(fromServer((await api(`/events/${id}/rsvp`, { method: 'DELETE' })).event));

export async function addEventComment(id, body, key = newKey()) {
  const { comment } = await api(`/events/${id}/comments`, { method: 'POST', body: { body }, idempotencyKey: key });
  return { ...comment, createdAt: Date.parse(comment.createdAt) };
}

export const deleteEventComment = (id) => api(`/event-comments/${id}`, { method: 'DELETE' });

// ---- Hook -------------------------------------------------------------------------------------
/**
 * Events for a range (or a community) from the server, kept current: a changed event is
 * replaced in place, a removed one dropped, and a new one triggers a reload. `from`/`to` are
 * epoch ms; pass `skip` to wait (e.g. until the viewer is known).
 */
export function useEvents({ from, to, community, view = 'all', skip = false } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (skip) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const list = await fetchEvents({ from, to, community, view });
      if (n === seq.current) { setEvents(list); setError(''); }
    } catch (e) {
      if (n === seq.current) setError(e.message);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [from, to, community, view, skip]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onEventsChange((m) => {
    if (m.type === 'event') setEvents((list) => list.map((e) => (e.id === m.event.id ? m.event : e)));
    else if (m.type === 'removed') setEvents((list) => list.filter((e) => e.id !== m.id));
    else if (m.type === 'created') load();
  }), [load]);
  useEffect(() => {
    window.addEventListener('c1-session-changed', load);
    return () => window.removeEventListener('c1-session-changed', load);
  }, [load]);
  return { events, loading, error, reload: load };
}
