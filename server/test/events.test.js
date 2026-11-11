// Events, RSVPs and the member dashboard (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { occurrences, nextOccurrence } from '../../shared/recurrence.js';
import { timing } from '../routes/events.js';

let env; const c = {};
const PEOPLE = ['own', 'adm', 'mod', 'mem', 'mem2', 'out', 'res', 'pa'];
const DAY = 864e5;
const at = (days, hours = 0) => new Date(Date.now() + days * DAY + hours * 36e5).toISOString();
const q = (s, p) => env.db.query(s, p);

before(async () => {
  env = await setup();
  for (const id of PEOPLE) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase(), roles: id === 'pa' ? ['platform_admin'] : [] });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
  for (const [id, vis] of [['pub', 'public'], ['pri', 'private'], ['clo', 'closed']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `${vis} community`, vis]);
    for (const [uid, role, state] of [['own', 'owner', 'active'], ['adm', 'admin', 'active'], ['mod', 'moderator', 'active'], ['mem', 'member', 'active'], ['mem2', 'member', 'active'], ['res', 'member', 'restricted']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, $4, now())`, [id, uid, role, state]);
    }
  }
});
after(async () => { await env.close(); });

const create = (who, cid, body = {}, headers) => c[who].post(`/api/communities/${cid}/events`, { title: 'Alumni meetup', start: at(7), end: at(7, 2), ...body }, headers);
const rsvp = (who, id, status = 'going') => c[who].put(`/api/events/${id}/rsvp`, { status });

describe('creating and editing', () => {
  test('validation: end before start, repeat-until before start, bad time zone, unknown fields', async () => {
    assert.equal((await create('mem', 'pub', { start: at(3), end: at(2) })).body.error.code, 'END_BEFORE_START');
    assert.equal((await create('mem', 'pub', { recurrence: { freq: 'weekly', until: at(1) } })).body.error.code, 'UNTIL_BEFORE_START');
    assert.equal((await create('mem', 'pub', { timezone: 'Mars/Olympus' })).body.error.code, 'INVALID_TIMEZONE');
    assert.equal((await create('mem', 'pub', { hostId: 'own' })).status, 400, 'cannot set the host');
    assert.equal((await create('mem', 'pub', { title: '   ' })).body.error.code, 'REQUIRED');
  });

  test('a retried create with the same Idempotency-Key makes one event', async () => {
    const h = { 'idempotency-key': 'evt-create-1' };
    const [a, b] = [await create('mem', 'pub', { title: 'Once only' }, h), await create('mem', 'pub', { title: 'Once only' }, h)];
    assert.equal(a.status, 201);
    assert.equal(b.body.event.id, a.body.event.id);
    assert.equal((await q(`select count(*)::int n from events where title = 'Once only'`)).rows[0].n, 1);
  });

  test('restricted members and outsiders can’t create events; communities can keep open events to admins', async () => {
    assert.equal((await create('res', 'pub')).status, 403);
    assert.equal((await create('out', 'pub')).status, 403);
    await q(`update communities set settings = '{"whoCanCreateEvents": "admins"}' where id = 'pri'`);
    assert.equal((await create('mem', 'pri')).body.error.code, 'ADMINS_ONLY');
    assert.equal((await create('mem', 'pri', { inviteOnly: true, invitees: ['mem2'] })).status, 201, 'members may still arrange invite-only events');
    assert.equal((await create('adm', 'pri')).status, 201);
    await q(`update communities set settings = '{}' where id = 'pri'`);
  });

  test('edits need the latest version; plain members can’t edit someone else’s event', async () => {
    const e = (await create('mem', 'pub', { assistants: ['mem2'] })).body.event;
    assert.deepEqual(e.assistants, ['mem2']);
    assert.equal((await c.mod.patch(`/api/events/${e.id}`, { version: e.version, title: 'Hijack' })).status, 403, 'moderator is not host/co-host/admin');
    const cohost = await c.mem2.patch(`/api/events/${e.id}`, { version: e.version, title: 'Edited by co-host' });
    assert.equal(cohost.status, 200);
    const stale = await c.mem.patch(`/api/events/${e.id}`, { version: e.version, title: 'Stale' });
    assert.equal(stale.body.error.code, 'STALE_VERSION');
    assert.equal((await c.mem2.patch(`/api/events/${e.id}`, { version: cohost.body.event.version, assistants: [] })).status, 403, 'co-hosts can’t change co-hosts');
  });

  test('co-hosts and invitees must be members of the community', async () => {
    const r = await create('mem', 'pub', { inviteOnly: true, invitees: ['mem2', 'out'] });
    assert.equal(r.body.error.code, 'NOT_MEMBERS');
    assert.deepEqual(r.body.error.userIds, ['out']);
  });

  test('EVT-06 when the host is suspended, community admins can still manage the event', async () => {
    const e = (await create('mem2', 'pub', { title: 'Host leaves' })).body.event;
    await q(`update users set status = 'suspended' where id = 'mem2'`);
    try {
      const edit = await c.adm.patch(`/api/events/${e.id}`, { version: e.version, title: 'Run by admin' });
      assert.equal(edit.status, 200);
      assert.equal((await c.adm.post(`/api/events/${e.id}/cancel`, { reason: 'Host unavailable' })).status, 200);
    } finally {
      await q(`update users set status = 'active' where id = 'mem2'`);
      c.mem2 = await signIn(env.app, { email: 'mem2@example.com', password: 'correct-horse-battery' });
    }
  });
});

describe('RSVPs', () => {
  test('EVT-01 repeated RSVPs keep one registration; changing it updates the same one', async () => {
    const e = (await create('own', 'pub')).body.event;
    const r = await Promise.all([1, 2, 3].map(() => rsvp('mem', e.id)));
    assert.ok(r.every((x) => x.status === 200));
    await rsvp('mem', e.id, 'maybe');
    const rows = (await q(`select status from event_rsvps where event_id = $1 and user_id = 'mem'`, [e.id])).rows;
    assert.deepEqual(rows, [{ status: 'maybe' }]);
    const view = (await c.mem.get(`/api/events/${e.id}`)).body.event;
    assert.equal(view.myRsvp, 'maybe');
    assert.deepEqual(view.counts, { going: 0, maybe: 1, no: 0, waitlist: 0 });
  });

  test('EVT-02 two people taking the last seat at once: one gets it, the other is told it’s full', async () => {
    const e = (await create('own', 'pub', { capacity: 1 })).body.event;
    const [a, b] = await Promise.all([rsvp('mem', e.id), rsvp('mem2', e.id)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal([a, b].find((x) => x.status === 409).body.error.code, 'EVENT_FULL');
    assert.equal((await q(`select count(*)::int n from event_rsvps where event_id = $1 and status = 'going'`, [e.id])).rows[0].n, 1);
    const winner = a.status === 200 ? 'mem' : 'mem2';
    assert.equal((await rsvp(winner, e.id)).status, 200, 'the seat holder can resend going');
    assert.equal((await rsvp(winner === 'mem' ? 'mem2' : 'mem', e.id, 'maybe')).status, 200, '“maybe” doesn’t need a seat');
  });

  test('EVT-07 a deadline that passes while the form is open is enforced on submit; “no” is still allowed', async () => {
    const e = (await create('own', 'pub', { rsvpDeadline: at(1) })).body.event;
    await rsvp('mem', e.id);
    await q(`update events set rsvp_deadline = now() - interval '1 minute' where id = $1`, [e.id]);
    const late = await rsvp('mem2', e.id);
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'RSVP_CLOSED');
    assert.equal((await rsvp('mem', e.id, 'no')).status, 200, 'freeing a seat after the deadline is fine');
  });

  test('no RSVPs on cancelled, ended or RSVP-off events, or from restricted members', async () => {
    const e = (await create('own', 'pub')).body.event;
    assert.equal((await rsvp('res', e.id)).body.error.code, 'CANNOT_RSVP');
    assert.equal((await rsvp('out', e.id)).body.error.code, 'CANNOT_RSVP', 'non-members of a public community must join first');
    const past = (await create('own', 'pub', { start: at(-3), end: at(-3, 1) })).body.event;
    assert.equal((await rsvp('mem', past.id)).body.error.code, 'EVENT_OVER');
    const off = (await create('own', 'pub', { rsvpEnabled: false })).body.event;
    assert.equal((await rsvp('mem', off.id)).body.error.code, 'RSVP_OFF');
  });

  test('EVT-05 a member removed before the event loses their place and can’t RSVP again', async () => {
    const e = (await create('own', 'pri', { capacity: 1 })).body.event;
    await rsvp('mem2', e.id);
    await q(`update memberships set state = 'removed' where community_id = 'pri' and user_id = 'mem2'`);
    try {
      assert.equal((await c.mem2.get(`/api/events/${e.id}`)).status, 404, 'private community event is gone for them');
      assert.equal((await rsvp('mem2', e.id)).status, 404);
      const view = (await c.mem.get(`/api/events/${e.id}`)).body.event;
      assert.equal(view.counts.going, 0, 'their RSVP no longer counts');
      assert.equal((await rsvp('mem', e.id)).status, 200, 'and no longer holds the only seat');
    } finally {
      await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'mem2'`);
    }
  });
});

describe('cancel and reschedule', () => {
  test('EVT-03 cancelling and rescheduling email the registrants and block stale actions', async () => {
    const e = (await create('own', 'pub', { title: 'Reschedule me' })).body.event;
    await rsvp('mem', e.id);
    await rsvp('mem2', e.id, 'no');
    const before = (await q(`select count(*)::int n from email_outbox`)).rows[0].n;
    const moved = await c.own.patch(`/api/events/${e.id}`, { version: e.version, start: at(8), end: at(8, 2) });
    assert.equal(moved.status, 200);
    const mails = (await q(`select to_email, template from email_outbox order by id desc limit $1`, [(await q(`select count(*)::int n from email_outbox`)).rows[0].n - before])).rows;
    assert.deepEqual(mails, [{ to_email: 'mem@example.com', template: 'event_changed' }], 'going/maybe only, not the host or “no”');

    assert.equal((await c.own.post(`/api/events/${e.id}/cancel`, {})).status, 400, 'a reason is required');
    const cancelled = await c.own.post(`/api/events/${e.id}/cancel`, { reason: 'Venue flooded' });
    assert.equal(cancelled.body.event.status, 'cancelled');
    assert.equal(cancelled.body.event.cancelReason, 'Venue flooded');
    assert.equal((await q(`select template from email_outbox where to_email = 'mem@example.com' order by id desc limit 1`)).rows[0].template, 'event_cancelled');
    assert.equal((await c.own.post(`/api/events/${e.id}/cancel`, { reason: 'again' })).body.error.code, 'ALREADY_CANCELLED');
    assert.equal((await rsvp('mem2', e.id)).body.error.code, 'EVENT_CANCELLED');
    assert.equal((await c.own.patch(`/api/events/${e.id}`, { version: cancelled.body.event.version, title: 'x' })).body.error.code, 'CANCELLED');
  });

  test('delete: host or community admin only; deleted events are gone', async () => {
    const e = (await create('mem', 'pub')).body.event;
    assert.equal((await c.mem2.delete(`/api/events/${e.id}`)).status, 403);
    assert.equal((await c.adm.delete(`/api/events/${e.id}`)).status, 200);
    assert.equal((await c.mem.get(`/api/events/${e.id}`)).status, 404);
  });
});

describe('visibility', () => {
  test('EVT-08 an invite-only event is invisible to members who aren’t on the list, even by URL', async () => {
    const e = (await create('mem', 'pub', { title: 'Secret supper', inviteOnly: true, invitees: ['mem2'] })).body.event;
    assert.equal((await c.mem2.get(`/api/events/${e.id}`)).status, 200);
    assert.equal((await c.adm.get(`/api/events/${e.id}`)).status, 200, 'community admins can see it');
    for (const who of ['mod', 'out', 'res']) {
      const res = await c[who].get(`/api/events/${e.id}`);
      assert.equal(res.status, 404, who);
      assert.ok(!JSON.stringify(res.body).includes('Secret supper'));
      assert.equal((await rsvp(who, e.id)).status, 404);
      assert.equal((await c[who].post(`/api/events/${e.id}/comments`, { body: 'hi' })).status, 404);
      assert.ok(!(await c[who].get('/api/events?community=pub')).body.events.some((x) => x.id === e.id));
    }
    // Taking someone off the guest list removes their access and their RSVP.
    await rsvp('mem2', e.id);
    await c.mem.patch(`/api/events/${e.id}`, { version: e.version, invitees: [] });
    assert.equal((await c.mem2.get(`/api/events/${e.id}`)).status, 404);
    assert.equal((await q(`select count(*)::int n from event_rsvps where event_id = $1`, [e.id])).rows[0].n, 0);
  });

  test('VIS-02/03 private and closed community events are not found for outsiders', async () => {
    const pri = (await create('mem', 'pri', { title: 'Private gathering' })).body.event;
    const clo = (await create('mem', 'clo', { title: 'Closed gathering' })).body.event;
    for (const e of [pri, clo]) {
      const res = await c.out.get(`/api/events/${e.id}`);
      assert.equal(res.status, 404);
      assert.ok(!JSON.stringify(res.body).includes('gathering'));
    }
    assert.equal((await c.out.get('/api/events?community=pri')).body.error.code, 'MEMBERS_ONLY');
    assert.equal((await c.out.get('/api/events?community=clo')).status, 404);
    const mine = (await c.out.get('/api/events')).body.events.map((x) => x.id);
    assert.ok(!mine.includes(pri.id) && !mine.includes(clo.id));
  });

  test('VIS-05 switching Public → Private hides its events from outsiders on the next request', async () => {
    const e = (await create('mem', 'pub', { title: 'Was public' })).body.event;
    assert.equal((await c.out.get(`/api/events/${e.id}`)).status, 200);
    await q(`update communities set visibility = 'private' where id = 'pub'`);
    try {
      assert.equal((await c.out.get(`/api/events/${e.id}`)).status, 404);
    } finally {
      await q(`update communities set visibility = 'public' where id = 'pub'`);
    }
  });

  test('administrative mode opens closed-community events for platform staff, audited', async () => {
    const e = (await create('mem', 'clo', { title: 'Closed review' })).body.event;
    assert.equal((await c.pa.get(`/api/events/${e.id}`)).status, 404, 'normal mode follows membership');
    const res = await c.pa.get(`/api/events/${e.id}`, { 'x-admin-mode': '1' });
    assert.equal(res.status, 200);
    assert.ok((await q(`select 1 from audit_log where actor_id = 'pa' and action = 'admin_mode.access' and target_id = 'clo'`)).rows.length);
    assert.equal((await q(`select count(*)::int n from memberships where user_id = 'pa'`)).rows[0].n, 0, 'no membership created');
  });

  test('comments: members comment; blocked authors are hidden; only authors or moderators delete', async () => {
    const e = (await create('own', 'pub')).body.event;
    const mine = (await c.mem.post(`/api/events/${e.id}/comments`, { body: 'Is there parking?' })).body.comment;
    await c.mem2.post(`/api/events/${e.id}/comments`, { body: 'Following' });
    assert.equal((await c.res.post(`/api/events/${e.id}/comments`, { body: 'restricted' })).status, 403);
    await q(`insert into blocks (blocker_id, blocked_id) values ('mem2', 'mem')`);
    try {
      const seen = (await c.mem2.get(`/api/events/${e.id}`)).body.event.comments.map((x) => x.body);
      assert.deepEqual(seen, ['Following']);
    } finally {
      await q(`delete from blocks where blocker_id = 'mem2'`);
    }
    assert.equal((await c.mem2.delete(`/api/event-comments/${mine.id}`)).status, 403);
    assert.equal((await c.mod.delete(`/api/event-comments/${mine.id}`)).status, 200);
  });
});

describe('time zones and recurrence', () => {
  test('EVT-04 a weekly event keeps the organiser’s local time across a daylight-saving change', async () => {
    // 18:00 in London on Tue 20 Oct 2026 (BST, UTC+1); clocks go back on Sun 25 Oct.
    const res = await create('own', 'pub', { title: 'London weekly', start: '2026-10-20T17:00:00.000Z', end: '2026-10-20T18:00:00.000Z',
      timezone: 'Europe/London', recurrence: { freq: 'weekly', until: '2026-11-30T00:00:00.000Z' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.event.start, '2026-10-20T17:00:00.000Z', 'stored as the same instant');
    const t = timing((await q(`select * from events where id = $1`, [res.body.event.id])).rows[0]);
    const starts = occurrences(t, Date.parse('2026-10-19'), Date.parse('2026-11-05')).map((o) => new Date(o.occStart).toISOString());
    assert.deepEqual(starts, ['2026-10-20T17:00:00.000Z', '2026-10-27T18:00:00.000Z', '2026-11-03T18:00:00.000Z'], '18:00 London each week');
    assert.equal(new Date(nextOccurrence(t, Date.parse('2026-10-21'))).toISOString(), '2026-10-27T18:00:00.000Z');
  });

  test('EVT-04 monthly series skip months without the start day; Kolkata has no DST shift', () => {
    const e = { start: Date.parse('2027-01-31T04:30:00Z'), end: Date.parse('2027-01-31T05:30:00Z'), timezone: 'Asia/Kolkata', recurrence: { freq: 'monthly', until: null } };
    const starts = occurrences(e, Date.parse('2027-01-01'), Date.parse('2027-06-01')).map((o) => new Date(o.occStart).toISOString());
    assert.deepEqual(starts, ['2027-01-31T04:30:00.000Z', '2027-03-31T04:30:00.000Z', '2027-05-31T04:30:00.000Z']);
  });
});

describe('member dashboard', () => {
  test('shows my communities, upcoming visible events, unread Mandatory Reads, announcements and requests', async () => {
    const soon = (await create('own', 'pub', { title: 'Dashboard soon', start: at(1), end: at(1, 1) })).body.event;
    const hidden = (await create('own', 'pub', { title: 'Dashboard hidden', start: at(1), end: at(1, 1), inviteOnly: true, invitees: ['mem2'] })).body.event;
    const mr = (await c.adm.post('/api/communities/pub/posts', { type: 'announcement', body: 'Please read the code of conduct', mandatory: { message: 'I have read it' } })).body.post;
    await c.out.post('/api/connections/mem');
    const d = (await c.mem.get('/api/dashboard')).body;
    assert.deepEqual(d.communities.map((x) => x.id).sort(), ['clo', 'pri', 'pub']);
    const ev = d.upcomingEvents.map((x) => x.id);
    assert.ok(ev.includes(soon.id));
    assert.ok(!ev.includes(hidden.id), 'invite-only event they aren’t on stays hidden');
    assert.ok(d.upcomingEvents.length <= 5);
    assert.ok(d.mandatoryReads.some((x) => x.id === mr.id));
    assert.ok(d.announcements.some((x) => x.id === mr.id));
    assert.equal(d.connectionRequests, 1);
    assert.ok(!d.newMembers.some((x) => x.id === 'mem'), 'never lists yourself');

    await c.mem.post(`/api/posts/${mr.id}/ack`);
    assert.ok(!(await c.mem.get('/api/dashboard')).body.mandatoryReads.some((x) => x.id === mr.id), 'acknowledged reads drop off');
    await q(`insert into blocks (blocker_id, blocked_id) values ('mem', 'adm')`);
    try {
      const b = (await c.mem.get('/api/dashboard')).body;
      assert.ok(!b.announcements.some((x) => x.id === mr.id), 'blocked authors are hidden');
      assert.ok(!b.newMembers.some((x) => x.id === 'adm'));
    } finally {
      await q(`delete from blocks where blocker_id = 'mem'`);
    }
    assert.ok(!(await c.out.get('/api/dashboard')).body.upcomingEvents.some((x) => x.id === soon.id), 'outsiders see only their own communities');
  });
});
