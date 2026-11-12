// Events foundation (Phase 1, step 4c): community events with RSVPs, co-hosts, invite-only
// guest lists and comments. Every route re-checks community access and event visibility on the
// server (EVT-08, VIS-*). Recurrence is expanded by shared/recurrence.js, the same code the
// web app uses.
import { audit } from '../lib/audit.js';
import { access, requireSection, sectionOn } from '../lib/community.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { idempotent } from '../lib/session.js';
import { notBlockedSql } from '../lib/relations.js';
import { isValidTimeZone, nextOccurrence, seriesEnd } from '../../shared/recurrence.js';
import { notify } from '../lib/notify.js';
import { pickCategory } from '../lib/categories.js';

export const EVENT_TYPES = ['Meetup', 'Reunion', 'Conference', 'Contest', 'Webinar', 'ShowTime', 'Meeting'];
const REMINDERS = [5, 15, 30, 60, 120, 1440, 10080];
const DAY = 864e5;

const clean = (s, max, field, { required = false } = {}) => {
  const t = String(s ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (!t && required) throw badRequest('REQUIRED', 'This field is required.', { field });
  if (t.length > max) throw badRequest('TOO_LONG', `That’s too long (at most ${max} characters).`, { field });
  return t || null;
};
const instant = (v, field) => {
  const d = new Date(v ?? '');
  if (v == null || v === '' || Number.isNaN(d.getTime())) throw badRequest('INVALID_DATE', 'Pick a valid date and time.', { field });
  return d;
};

/** The shape shared/recurrence.js works with (epoch ms). */
export const timing = (r) => ({
  start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime(), timezone: r.timezone,
  recurrence: { freq: r.recurrence?.freq ?? 'none', until: r.recurrence?.until ? Date.parse(r.recurrence.until) : null },
});

const FIELDS = {
  type: 'object', additionalProperties: false, properties: {
    title: { type: 'string' }, description: { type: ['string', 'null'] }, eventType: { type: 'string', enum: EVENT_TYPES },
    // F13: one of the community's event categories (settings.eventCategories), or null.
    category: { type: ['string', 'null'], maxLength: 80 },
    start: { type: 'string' }, end: { type: 'string' }, allDay: { type: 'boolean' }, timezone: { type: 'string' },
    location: { type: ['string', 'null'] }, inviteOnly: { type: 'boolean' }, rsvpEnabled: { type: 'boolean' },
    capacity: { type: ['integer', 'null'] }, rsvpDeadline: { type: ['string', 'null'] },
    recurrence: { type: 'object', additionalProperties: false, required: ['freq'], properties: { freq: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'] }, until: { type: ['string', 'null'] } } },
    reminders: { type: 'array', items: { type: 'integer', enum: REMINDERS }, maxItems: REMINDERS.length },
    assistants: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    invitees: { type: 'array', items: { type: 'string' }, maxItems: 500 },
  },
};

/**
 * Validates a create body, or a patch merged over the stored event, into column values.
 * Times arrive as ISO instants and are stored as timestamptz with the organiser's zone (EVT-04).
 */
function readEvent(b, prev = null) {
  const pick = (k, fallback) => (k in b ? b[k] : fallback);
  const title = clean(pick('title', prev?.title), 140, 'title', { required: true });
  const start = 'start' in b || !prev ? instant(b.start, 'start') : new Date(prev.start_at);
  const end = 'end' in b || !prev ? instant(b.end, 'end') : new Date(prev.end_at);
  if (end < start) throw badRequest('END_BEFORE_START', 'The event can’t end before it starts.', { field: 'end' });
  if (end - start > 31 * DAY) throw badRequest('TOO_LONG', 'An event can last at most 31 days. Use a repeating event for longer series.', { field: 'end' });
  const timezone = pick('timezone', prev?.timezone ?? 'Asia/Kolkata');
  if (!isValidTimeZone(timezone)) throw badRequest('INVALID_TIMEZONE', 'Pick a valid time zone.', { field: 'timezone' });
  const rec = pick('recurrence', prev?.recurrence ?? { freq: 'none' });
  const recurrence = { freq: rec.freq ?? 'none' };
  if (recurrence.freq !== 'none' && rec.until) {
    const until = instant(rec.until, 'recurrence');
    if (until < start) throw badRequest('UNTIL_BEFORE_START', 'A repeating event must repeat until a date after it starts.', { field: 'recurrence' });
    recurrence.until = until.toISOString();
  }
  const capacity = pick('capacity', prev?.capacity ?? null);
  if (capacity != null && (capacity < 1 || capacity > 100000)) throw badRequest('INVALID_CAPACITY', 'Capacity must be between 1 and 100,000.', { field: 'capacity' });
  const deadlineIn = pick('rsvpDeadline', prev?.rsvp_deadline ?? null);
  const rsvpDeadline = deadlineIn ? instant(deadlineIn, 'rsvpDeadline') : null;
  return {
    title, start, end, timezone, recurrence, capacity, rsvpDeadline,
    description: clean(pick('description', prev?.description), 5000, 'description'),
    eventType: pick('eventType', prev?.event_type ?? 'Meetup'),
    allDay: pick('allDay', prev?.all_day ?? false),
    location: clean(pick('location', prev?.location), 300, 'location'),
    inviteOnly: pick('inviteOnly', prev?.invite_only ?? false),
    rsvpEnabled: pick('rsvpEnabled', prev?.rsvp_enabled ?? true),
    reminders: [...new Set(pick('reminders', prev?.reminders ?? []))].sort((x, y) => y - x),
  };
}

/** Throws unless every id is an active member of the community (guest lists stay in-community). */
async function requireMembers(q, communityId, ids, field) {
  const unique = [...new Set(ids)];
  if (!unique.length) return unique;
  const { rows } = await q(`select m.user_id from memberships m join users u on u.id = m.user_id
    where m.community_id = $1 and m.user_id = any($2) and m.state = 'active' and u.status = 'active'`, [communityId, unique]);
  const ok = new Set(rows.map((r) => r.user_id));
  const missing = unique.filter((id) => !ok.has(id));
  if (missing.length) throw badRequest('NOT_MEMBERS', 'Everyone you add must be a member of this community.', { field, userIds: missing });
  return unique;
}

/** SQL: the viewer (`$uid`) may see event `e` given community admin ids (`$admin`). */
const visibleSql = (uid, admin) => `(not e.invite_only or e.host_id = ${uid} or e.community_id = any(${admin})
  or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = ${uid})
  or exists (select 1 from event_invitees i where i.event_id = e.id and i.user_id = ${uid}))`;

// Registrants count only while they're active members with an active account, so a removed
// member's RSVP stops counting (and stops holding a seat) at once (EVT-05).
export const COUNTED = `exists (select 1 from memberships mm join users uu on uu.id = mm.user_id
  where mm.community_id = e.community_id and mm.user_id = r.user_id and mm.state = 'active' and uu.status = 'active')`;

// Fills free places from the waitlist, oldest first, with people who still count (active
// members with active accounts). Someone who left the waitlist has another answer now, so
// they're never put back (EVT-09). Runs inside the caller's transaction, with the event locked.
export async function promoteWaitlist(t, eventId) {
  const { rows: [ev] } = await t.query(`select capacity, status from events where id = $1`, [eventId]);
  if (!ev || ev.status !== 'scheduled') return [];
  let free = Infinity;
  if (ev.capacity != null) {
    const { rows: [c] } = await t.query(`select count(*)::int as n from event_rsvps r join events e on e.id = r.event_id
      where r.event_id = $1 and r.status = 'going' and ${COUNTED}`, [eventId]);
    free = ev.capacity - c.n;
  }
  if (free <= 0) return [];
  const { rows } = await t.query(`select r.user_id, r.waitlisted_at from event_rsvps r join events e on e.id = r.event_id
    where r.event_id = $1 and r.status = 'waitlist' and ${COUNTED} order by r.waitlisted_at, r.user_id limit $2`, [eventId, Number.isFinite(free) ? free : 10000]);
  for (const r of rows) await t.query(`update event_rsvps set status = 'going', updated_at = now() where event_id = $1 and user_id = $2 and status = 'waitlist'`, [eventId, r.user_id]);
  return rows;
}

/** Shapes events for one viewer. `accessById` holds that viewer's access to each community. */
export async function presentEvents(db, req, rows, accessById, now = Date.now()) {
  if (!rows.length) return [];
  const ids = rows.map((e) => e.id);
  const uid = req.user.id;
  const [people, staff, invitees, rsvps, comments, communities] = await Promise.all([
    db.query(`select id, name, status from users where id = any($1)`, [[...new Set(rows.map((e) => e.host_id))]]),
    db.query(`select event_id, user_id from event_staff where event_id = any($1)`, [ids]),
    db.query(`select event_id, user_id from event_invitees where event_id = any($1)`, [ids]),
    db.query(`select r.event_id, r.user_id, r.status, r.waitlisted_at from event_rsvps r join events e on e.id = r.event_id
      where r.event_id = any($1) and ${COUNTED} and (r.user_id = $2 or ${notBlockedSql('r.user_id', '$2')})`, [ids, uid]),
    db.query(`select event_id, count(*)::int as n from event_comments where event_id = any($1) and deleted_at is null group by event_id`, [ids]),
    db.query(`select id, name, emoji, visibility from communities where id = any($1)`, [[...new Set(rows.map((e) => e.community_id))]]),
  ]);
  const group = (r) => r.rows.reduce((m, x) => (m[x.event_id] ??= []).push(x) && m, {});
  const person = Object.fromEntries(people.rows.map((u) => [u.id, u]));
  const community = Object.fromEntries(communities.rows.map((c) => [c.id, c]));
  const S = group(staff); const I = group(invitees); const R = group(rsvps);
  const C = Object.fromEntries(comments.rows.map((x) => [x.event_id, x.n]));
  return rows.map((e) => {
    const a = accessById[e.community_id];
    const t = timing(e);
    const assistants = (S[e.id] || []).map((x) => x.user_id);
    const isHost = e.host_id === uid;
    const manage = isHost || assistants.includes(uid) || !!a?.canAdmin;
    const rs = Object.fromEntries((R[e.id] || []).map((x) => [x.user_id, x.status]));
    const counts = { going: 0, maybe: 0, no: 0, waitlist: 0 };
    for (const s of Object.values(rs)) counts[s] += 1;
    // Your place on the waitlist (S4-4): first come, first served.
    const queue = (R[e.id] || []).filter((x) => x.status === 'waitlist').sort((x, y) => new Date(x.waitlisted_at) - new Date(y.waitlisted_at));
    const waitlistPosition = rs[uid] === 'waitlist' ? queue.findIndex((x) => x.user_id === uid) + 1 : null;
    const over = seriesEnd(t) < now;
    const closed = e.rsvp_deadline && new Date(e.rsvp_deadline).getTime() < now;
    const host = person[e.host_id];
    return {
      id: e.id, communityId: e.community_id,
      community: community[e.community_id] ? { id: e.community_id, name: community[e.community_id].name, emoji: community[e.community_id].emoji, visibility: community[e.community_id].visibility } : null,
      title: e.title, description: e.description, eventType: e.event_type, category: e.category ?? null,
      start: new Date(e.start_at).toISOString(), end: new Date(e.end_at).toISOString(), allDay: e.all_day, timezone: e.timezone,
      location: e.location, recurrence: e.recurrence, inviteOnly: e.invite_only, rsvpEnabled: e.rsvp_enabled,
      capacity: e.capacity, rsvpDeadline: e.rsvp_deadline ? new Date(e.rsvp_deadline).toISOString() : null, reminders: e.reminders,
      status: e.status, cancelReason: e.cancel_reason, version: e.version, createdAt: e.created_at ? new Date(e.created_at).toISOString() : null,
      hostId: e.host_id, host: host?.status === 'deleted' ? { id: e.host_id, name: 'Deleted member', deleted: true } : { id: e.host_id, name: host?.name },
      assistants, invitees: (I[e.id] || []).map((x) => x.user_id),
      rsvps: rs, counts, myRsvp: rs[uid] ?? null, waitlistPosition, commentCount: C[e.id] ?? 0,
      nextStart: new Date(nextOccurrence(t, now)).toISOString(), over,
      can: {
        edit: manage && e.status === 'scheduled', cancel: manage && e.status === 'scheduled', delete: isHost || !!a?.canAdmin,
        rsvp: e.rsvp_enabled && e.status === 'scheduled' && !!a?.canComment && !over && !closed,
        comment: !!a?.canComment, manageCohosts: isHost || !!a?.canAdmin,
        full: e.capacity != null && counts.going >= e.capacity,
      },
    };
  });
}

/**
 * Events the viewer may see whose series overlaps [from, to], in their communities (or one
 * community). Used by the events list, the calendar and the dashboard.
 */
export async function listEvents(db, req, { from, to, communityId = null, view = 'all', limit = 500 }) {
  const uid = req.user.id;
  const accessById = {};
  let communityIds;
  if (communityId) {
    const a = await access(db, req, communityId);
    if (!a.canView) throw forbidden('Join this community to see its events.', 'MEMBERS_ONLY');
    requireSection(a, 'events');
    communityIds = [a.community.id]; accessById[a.community.id] = a;
  } else {
    const { rows } = await db.query(`select community_id from memberships m join communities c on c.id = m.community_id
      where m.user_id = $1 and m.state in ('active', 'restricted') and c.status not in ('suspended', 'deleted') and c.merged_into is null`, [uid]);
    for (const { community_id: id } of rows) accessById[id] = await access(db, req, id, { audited: false });
    // The calendar and Home leave out communities whose Events are switched off.
    communityIds = rows.map((r) => r.community_id).filter((id) => sectionOn(accessById[id].community, 'events'));
  }
  const adminIds = communityIds.filter((id) => accessById[id]?.canAdmin);
  const { rows } = await db.query(
    `select e.* from events e
      where e.community_id = any($1) and e.deleted_at is null and ${visibleSql('$2', '$3')}
        and e.start_at <= $5
        and (case when e.recurrence->>'freq' = 'none' then e.end_at >= $4
                  else (e.recurrence->>'until') is null or (e.recurrence->>'until')::timestamptz + (e.end_at - e.start_at) >= $4 end)
        and ($6 = 'all'
             or ($6 = 'hosting' and (e.host_id = $2 or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = $2)))
             or ($6 = 'mine' and (e.host_id = $2
                  or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = $2)
                  or exists (select 1 from event_invitees i where i.event_id = e.id and i.user_id = $2)
                  or exists (select 1 from event_rsvps r where r.event_id = e.id and r.user_id = $2 and r.status in ('going', 'maybe')))))
        and ${notBlockedSql('e.host_id', '$2')}
      order by e.start_at, e.id limit $7`, [communityIds, uid, adminIds, from, to, view, limit]);
  return presentEvents(db, req, rows, accessById);
}

export default async function eventRoutes(app, { ctx }) {
  const { db, mailer } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const origin = (req) => ctx.appOrigin || `${req.protocol}://${req.headers.host}`;

  const tellPromoted = (req, e, rows) => Promise.all(rows.map((r) => notify(ctx, req, { to: [r.user_id], type: 'waitlist_promoted', communityId: e.community_id,
    targetType: 'event', targetId: e.id, dedupe: `waitlist:${e.id}:${r.user_id}:${new Date(r.waitlisted_at).getTime()}` })));
  // In-app notices to everyone going; the email goes out separately (emailRegistrants).
  async function tellGoing(req, e, type, dedupe) {
    const { rows } = await db.query(`select r.user_id from event_rsvps r join events e on e.id = r.event_id where r.event_id = $1 and r.status = 'going' and ${COUNTED}`, [e.id]);
    await notify(ctx, req, { to: rows.map((r) => r.user_id), type, actorId: req.user.id, communityId: e.community_id, targetType: 'event', targetId: e.id, dedupe, email: false });
  }

  // Loads an event the caller may see. Anything they may not see (another community's members-
  // only event, an invite-only event they aren't on, a deleted one) is "not found" (EVT-08).
  // With Events switched off, only staff still see it, and nobody changes or answers it (`write`).
  // `removing` names the author of what's being deleted ('event' for the event's host), so hosts
  // and commenters can still delete their own while it's off.
  async function loadEvent(req, id, { write = false, removing = null } = {}) {
    const uid = signedIn(req);
    const { rows: [e] } = await db.query(`select * from events where id = $1 and deleted_at is null`, [id]);
    if (!e) throw notFound('That event doesn’t exist or was deleted.');
    const a = await access(db, req, e.community_id);
    if (!a.canView) throw notFound('That event doesn’t exist or was deleted.');
    if ((removing === 'event' ? e.host_id : removing) !== uid) requireSection(a, 'events', { write });
    const { rows: [rel] } = await db.query(`select
        exists (select 1 from event_staff where event_id = $1 and user_id = $2) as staff,
        exists (select 1 from event_invitees where event_id = $1 and user_id = $2) as invited`, [e.id, uid]);
    const isHost = e.host_id === uid;
    if (e.invite_only && !isHost && !rel.staff && !rel.invited && !a.canAdmin) throw notFound('That event doesn’t exist or was deleted.');
    return { e, a, isHost, manage: isHost || rel.staff || a.canAdmin };
  }
  const one = async (req, e, a) => (await presentEvents(db, req, [e], { [e.community_id]: a }))[0];

  // Tell people who said going/maybe (not the person who made the change).
  async function emailRegistrants(req, e, template, extra = {}) {
    const { rows } = await db.query(`select u.email, u.name, c.name as community from event_rsvps r join events e on e.id = r.event_id
      join users u on u.id = r.user_id join communities c on c.id = e.community_id
      where r.event_id = $1 and r.status in ('going', 'maybe') and r.user_id <> $2 and ${COUNTED}`, [e.id, req.user.id]);
    for (const r of rows) await mailer.send(r.email, template, { name: r.name, title: e.title, community: r.community, link: `${origin(req)}/#/events/${e.id}`, ...extra }, { req });
    return rows.length;
  }

  app.get('/events', async (req) => {
    signedIn(req);
    const now = Date.now();
    const from = req.query.from ? instant(req.query.from, 'from') : new Date(now - 90 * DAY);
    const to = req.query.to ? instant(req.query.to, 'to') : new Date(now + 365 * DAY);
    if (to < from || to - from > 800 * DAY) throw badRequest('INVALID_RANGE', 'Choose a date range of up to two years.');
    const view = String(req.query.view ?? 'all');
    if (!['all', 'mine', 'hosting'].includes(view)) throw badRequest('INVALID_INPUT', 'Unknown view.');
    return { events: await listEvents(db, req, { from, to, view, communityId: req.query.community ? String(req.query.community) : null }) };
  });

  app.get('/events/:id', async (req) => {
    const { e, a } = await loadEvent(req, req.params.id);
    const event = await one(req, e, a);
    const { rows } = await db.query(
      `select c.id, c.body, c.created_at, c.author_id, u.name, u.status from event_comments c join users u on u.id = c.author_id
        where c.event_id = $1 and c.deleted_at is null and ${notBlockedSql('c.author_id', '$2')} order by c.created_at`, [e.id, req.user.id]);
    event.comments = rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.created_at,
      author: c.status === 'deleted' ? { id: c.author_id, name: 'Deleted member', deleted: true } : { id: c.author_id, name: c.name },
      can: { delete: c.author_id === req.user.id || a.canModerate } }));
    return { event };
  });

  // ---- Create / edit / cancel / delete --------------------------------------------------------
  app.post('/communities/:id/events', { schema: { body: { ...FIELDS, required: ['title', 'start', 'end'] } } },
    async (req, reply) => idempotent(db, req, reply, async () => {
      const a = await access(db, req, req.params.id);
      if (!a.canParticipate) throw forbidden(a.state === 'restricted' ? 'You’ve been restricted from taking part here.' : 'Join this community to create events in it.', 'CANNOT_POST');
      requireSection(a, 'events', { write: true });
      const v = readEvent(req.body);
      const category = pickCategory(req.body.category, a.community.settings?.eventCategories, { label: 'event category' });
      // Communities can keep open events to admins; any member may still arrange an
      // invite-only event with other members (the prototype's "invited members only").
      if (a.community.settings?.whoCanCreateEvents === 'admins' && !a.canAdmin && !v.inviteOnly) {
        throw forbidden('Only community admins can create events open to everyone here. You can create an invite-only event.', 'ADMINS_ONLY');
      }
      const q = (s, p) => db.query(s, p);
      const assistants = (await requireMembers(q, a.community.id, req.body.assistants ?? [], 'assistants')).filter((x) => x !== req.user.id);
      const invitees = v.inviteOnly ? await requireMembers(q, a.community.id, req.body.invitees ?? [], 'invitees') : [];
      const id = newId('evt');
      await db.tx(async (t) => {
        await t.query(`insert into events (id, community_id, host_id, title, description, event_type, start_at, end_at, all_day, timezone, location,
            recurrence, invite_only, rsvp_enabled, capacity, rsvp_deadline, reminders, category)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [id, a.community.id, req.user.id, v.title, v.description, v.eventType, v.start, v.end, v.allDay, v.timezone, v.location,
          JSON.stringify(v.recurrence), v.inviteOnly, v.rsvpEnabled, v.capacity, v.rsvpDeadline, v.reminders, category]);
        for (const u of assistants) await t.query(`insert into event_staff (event_id, user_id) values ($1, $2)`, [id, u]);
        for (const u of invitees) await t.query(`insert into event_invitees (event_id, user_id) values ($1, $2)`, [id, u]);
      });
      await audit(db, { actorId: req.user.id, action: 'event.create', targetType: 'event', targetId: id, context: { communityId: a.community.id, inviteOnly: v.inviteOnly }, ip: req.ip });
      const { rows: [e] } = await db.query(`select * from events where id = $1`, [id]);
      reply.status(201);
      return { event: await one(req, e, a) };
    }));

  // Host, co-hosts or community admins, from the latest version. Registrants are emailed when
  // the time or place changes (EVT-03).
  app.patch('/events/:id', { schema: { body: { ...FIELDS, required: ['version'], properties: { ...FIELDS.properties, version: { type: 'integer' } } } } }, async (req) => {
    const { e, a, isHost, manage } = await loadEvent(req, req.params.id, { write: true });
    if (!manage) throw forbidden('Only the host, co-hosts or community admins can edit this event.');
    if (e.status === 'cancelled') throw conflict('CANCELLED', 'This event was cancelled, so it can’t be edited.');
    if (!a.canComment) throw forbidden('You can’t take part in this community right now.', 'READ_ONLY');
    const v = readEvent(req.body, e);
    // An unchanged older category is kept even if the community's list no longer has it.
    const category = 'category' in req.body
      ? pickCategory(req.body.category, a.community.settings?.eventCategories, { previous: e.category, label: 'event category' }) : e.category;
    const q = (s, p) => db.query(s, p);
    let assistants = null;
    if ('assistants' in req.body) {
      if (!isHost && !a.canAdmin) throw forbidden('Only the host or community admins can change co-hosts.');
      assistants = (await requireMembers(q, e.community_id, req.body.assistants, 'assistants')).filter((x) => x !== e.host_id);
    }
    const invitees = 'invitees' in req.body ? await requireMembers(q, e.community_id, req.body.invitees, 'invitees') : null;
    const rows = await db.tx(async (t) => {
      const res = await t.query(`update events set title = $3, description = $4, event_type = $5, start_at = $6, end_at = $7, all_day = $8, timezone = $9,
          location = $10, recurrence = $11, invite_only = $12, rsvp_enabled = $13, capacity = $14, rsvp_deadline = $15, reminders = $16,
          category = $17, updated_at = now(), version = version + 1
        where id = $1 and version = $2 and status = 'scheduled' and deleted_at is null returning *`,
      [e.id, req.body.version, v.title, v.description, v.eventType, v.start, v.end, v.allDay, v.timezone, v.location,
        JSON.stringify(v.recurrence), v.inviteOnly, v.rsvpEnabled, v.capacity, v.rsvpDeadline, v.reminders, category]);
      if (!res.rows.length) return res.rows;
      if (assistants) {
        await t.query(`delete from event_staff where event_id = $1`, [e.id]);
        for (const u of assistants) await t.query(`insert into event_staff (event_id, user_id) values ($1, $2)`, [e.id, u]);
      }
      if (invitees || !v.inviteOnly) {
        const keep = v.inviteOnly ? invitees : [];
        await t.query(`delete from event_invitees where event_id = $1`, [e.id]);
        for (const u of keep) await t.query(`insert into event_invitees (event_id, user_id) values ($1, $2)`, [e.id, u]);
        // People taken off an invite-only guest list lose their RSVP with it.
        if (v.inviteOnly) {
          await t.query(`delete from event_rsvps r where r.event_id = $1 and r.user_id <> $2 and not (r.user_id = any($3))
            and not exists (select 1 from event_staff s where s.event_id = $1 and s.user_id = r.user_id)`, [e.id, e.host_id, keep]);
        }
      }
      return res.rows;
    });
    if (!rows.length) {
      const now = (await db.query(`select status from events where id = $1`, [e.id])).rows[0];
      if (now?.status === 'cancelled') throw conflict('CANCELLED', 'This event was cancelled, so it can’t be edited.');
      throw conflict('STALE_VERSION', 'This event changed since you opened it. Reload and edit again.');
    }
    const fresh = rows[0];
    const moved = ['start_at', 'end_at', 'all_day', 'timezone', 'location'].some((k) => String(fresh[k]) !== String(e[k]))
      || JSON.stringify(fresh.recurrence) !== JSON.stringify(e.recurrence);
    const notified = moved ? await emailRegistrants(req, fresh, 'event_changed') : 0;
    if (moved) await tellGoing(req, fresh, 'event_changed', `event:${e.id}:v${fresh.version}`);
    // A bigger capacity (or none) opens places for the waitlist.
    const promoted = await db.tx(async (t) => { await t.query(`select id from events where id = $1 for update`, [e.id]); return promoteWaitlist(t, e.id); });
    await tellPromoted(req, fresh, promoted);
    await audit(db, { actorId: req.user.id, action: 'event.edit', targetType: 'event', targetId: e.id, context: { moved, notified, adminMode: a.adminMode }, ip: req.ip });
    return { event: await one(req, fresh, a) };
  });

  // Cancelling keeps the event (and its RSVPs) for the record; no one can RSVP afterwards.
  app.post('/events/:id/cancel', { schema: { body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string' } } } } }, async (req) => {
    const { e, a, manage } = await loadEvent(req, req.params.id, { write: true });
    if (!manage) throw forbidden('Only the host, co-hosts or community admins can cancel this event.');
    const reason = clean(req.body.reason, 300, 'reason', { required: true });
    const { rows } = await db.query(`update events set status = 'cancelled', cancel_reason = $2, updated_at = now(), version = version + 1
      where id = $1 and status = 'scheduled' returning *`, [e.id, reason]);
    if (!rows.length) throw conflict('ALREADY_CANCELLED', 'This event was already cancelled.');
    const notified = await emailRegistrants(req, rows[0], 'event_cancelled', { reason });
    await tellGoing(req, rows[0], 'event_cancelled', `event:${e.id}:cancelled`);
    await audit(db, { actorId: req.user.id, action: 'event.cancel', targetType: 'event', targetId: e.id, context: { reason, notified, adminMode: a.adminMode }, ip: req.ip });
    return { event: await one(req, rows[0], a) };
  });

  app.delete('/events/:id', async (req) => {
    const { e, a, isHost } = await loadEvent(req, req.params.id, { removing: 'event' });
    if (!isHost && !a.canAdmin) throw forbidden('Only the host or community admins can delete this event.');
    await db.query(`update events set deleted_at = now() where id = $1 and deleted_at is null`, [e.id]);
    await audit(db, { actorId: req.user.id, action: 'event.delete', targetType: 'event', targetId: e.id, context: { byAdmin: !isHost, adminMode: a.adminMode }, ip: req.ip });
    return { ok: true };
  });

  // ---- RSVP -----------------------------------------------------------------------------------
  // One RSVP per member (EVT-01). Capacity, cancellation, the deadline and the event's end are
  // all re-checked inside one transaction with the event row locked, so two people can't take
  // the last seat at once (EVT-02) and a form left open past the deadline is refused (EVT-07).
  app.put('/events/:id/rsvp', { schema: { body: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { type: 'string', enum: ['going', 'maybe', 'no', 'waitlist'] } } } } }, async (req) => {
    const { e, a } = await loadEvent(req, req.params.id, { write: true });
    if (!a.canComment) throw forbidden(a.member ? 'You can’t take part in this community right now.' : 'Join this community to RSVP.', 'CANNOT_RSVP');
    let status = req.body.status;
    const promoted = await db.tx(async (t) => {
      const { rows: [ev] } = await t.query(`select * from events where id = $1 and deleted_at is null for update`, [e.id]);
      if (!ev) throw notFound('That event doesn’t exist or was deleted.');
      if (ev.status === 'cancelled') throw conflict('EVENT_CANCELLED', 'This event was cancelled.');
      if (!ev.rsvp_enabled) throw conflict('RSVP_OFF', 'This event doesn’t take RSVPs.');
      if (seriesEnd(timing(ev)) < Date.now()) throw conflict('EVENT_OVER', 'This event has already ended.');
      // Saying "no" is always allowed, so people can still free their seat after the deadline.
      if (status !== 'no' && ev.rsvp_deadline && new Date(ev.rsvp_deadline) < new Date()) throw conflict('RSVP_CLOSED', 'RSVPs for this event have closed.');
      if ((status === 'going' || status === 'waitlist') && ev.capacity != null) {
        const { rows: [c] } = await t.query(`select count(*)::int as n, bool_or(r.user_id = $2) as mine from event_rsvps r join events e on e.id = r.event_id
          where r.event_id = $1 and r.status = 'going' and ${COUNTED}`, [ev.id, req.user.id]);
        const full = !c.mine && c.n >= ev.capacity;
        if (full && status === 'going') throw conflict('EVENT_FULL', 'This event is full. Join the waitlist to get the next place that opens.', { waitlist: true });
        if (!full) status = 'going';
      } else if (status === 'waitlist') status = 'going';
      // Joining the waitlist again keeps your place; leaving it (any other answer) gives it up.
      await t.query(`insert into event_rsvps (event_id, user_id, status, waitlisted_at) values ($1, $2, $3, case when $3 = 'waitlist' then now() end)
        on conflict (event_id, user_id) do update set status = excluded.status, updated_at = now(),
          waitlisted_at = case when excluded.status = 'waitlist' then coalesce(event_rsvps.waitlisted_at, now()) end`, [ev.id, req.user.id, status]);
      return promoteWaitlist(t, ev.id);
    });
    await tellPromoted(req, e, promoted);
    const { rows: [fresh] } = await db.query(`select * from events where id = $1`, [e.id]);
    return { event: await one(req, fresh, a) };
  });

  app.delete('/events/:id/rsvp', async (req) => {
    const { e, a } = await loadEvent(req, req.params.id);
    const promoted = await db.tx(async (t) => {
      await t.query(`select id from events where id = $1 for update`, [e.id]);
      await t.query(`delete from event_rsvps where event_id = $1 and user_id = $2`, [e.id, req.user.id]);
      return promoteWaitlist(t, e.id);
    });
    await tellPromoted(req, e, promoted);
    return { event: await one(req, e, a) };
  });

  // ---- Comments -------------------------------------------------------------------------------
  app.post('/events/:id/comments', { schema: { body: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: { type: 'string' } } } } },
    async (req, reply) => idempotent(db, req, reply, async () => {
      const { e, a } = await loadEvent(req, req.params.id, { write: true });
      if (!a.canComment) throw forbidden('You can’t take part in this community right now.', 'READ_ONLY');
      const body = clean(req.body.body, 2000, 'body', { required: true });
      const id = newId('ecm');
      await db.query(`insert into event_comments (id, event_id, author_id, body) values ($1, $2, $3, $4)`, [id, e.id, req.user.id, body]);
      reply.status(201);
      return { comment: { id, body, createdAt: new Date().toISOString(), author: { id: req.user.id, name: req.user.name }, can: { delete: true } } };
    }));

  app.delete('/event-comments/:id', async (req) => {
    signedIn(req);
    const { rows: [c] } = await db.query(`select * from event_comments where id = $1 and deleted_at is null`, [req.params.id]);
    if (!c) throw notFound('That comment doesn’t exist.');
    const { a } = await loadEvent(req, c.event_id, { removing: c.author_id });
    if (c.author_id !== req.user.id && !a.canModerate) throw forbidden('You can only delete your own comments.');
    await db.query(`update event_comments set deleted_at = now() where id = $1`, [c.id]);
    await audit(db, { actorId: req.user.id, action: 'event_comment.delete', targetType: 'event_comment', targetId: c.id, context: { eventId: c.event_id, byModerator: c.author_id !== req.user.id }, ip: req.ip });
    return { ok: true };
  });
}
