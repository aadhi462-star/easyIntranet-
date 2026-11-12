// Explore, My Communities and Home additions (v2 workstream D: D3, D5, D7, D8).
// EDGE_CASE_REGISTER.md IDs in each name.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const at = (days) => new Date(Date.now() + days * 864e5).toISOString();
const ids = (list) => list.map((x) => x.id);

async function community(id, { name = `${id} community`, visibility = 'public', category = 'Other', status = 'active', created = 0, settings = {} } = {}) {
  await q(`insert into communities (id, slug, name, visibility, category, status, created_by, created_at, settings) values ($1, $1, $2, $3, $4, $5, 'own', now() - ($6 || ' days')::interval, $7)`,
    [id, name, visibility, category, status, String(created), JSON.stringify(settings)]);
}
const member = (cid, uid, role = 'member', state = 'active') => q(
  `insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, $4, now())
   on conflict (community_id, user_id) do update set role = excluded.role, state = excluded.state, updated_at = now()`, [cid, uid, role, state]);

before(async () => {
  env = await setup();
  for (const id of ['own', 'ann', 'bob', 'cat', 'dan', 'new']) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase() });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
  // Discovery set: five Public/Private communities with members, one Closed, one archived.
  await community('alpha', { name: 'Alpha Alumni', category: 'Alumni', created: 30 });
  await community('beta', { name: 'Beta Builders', category: 'Technology', visibility: 'private', created: 1 });
  await community('gamma', { name: 'Gamma Grads', category: 'Alumni', created: 10 });
  await community('delta', { name: 'Delta Chapter', category: 'City', created: 20 });
  await community('hidden', { name: 'Hidden Circle', category: 'Alumni', visibility: 'closed' });
  await community('old', { name: 'Old Alumni Club', category: 'Alumni', status: 'archived' });
  for (const id of ['alpha', 'beta', 'gamma', 'delta', 'hidden', 'old']) await member(id, 'own', 'owner');
  for (const uid of ['bob', 'cat', 'dan']) await member('alpha', uid);
  await member('gamma', 'bob');
  await member('hidden', 'ann');
  await member('old', 'ann', 'admin');
});
after(async () => { await env.close(); });

describe('GET /communities?scope=discover (Explore)', () => {
  test('VIS-04 Closed communities never appear in discovery, not even to their members', async () => {
    const r = await c.ann.get('/api/communities?scope=discover');
    assert.equal(r.status, 200);
    assert.ok(!ids(r.body.communities).includes('hidden'));
    assert.ok(!ids(r.body.communities).includes('old'), 'archived communities leave discovery (VIS-14)');
    assert.equal(r.body.categoryCounts.Alumni, 2, 'nor are they counted');
    // The bare list (sidebar, My Communities) still has them for their members.
    const bare = ids((await c.ann.get('/api/communities')).body.communities);
    assert.ok(bare.includes('hidden') && bare.includes('old'));
    assert.ok(!ids((await c.bob.get('/api/communities')).body.communities).includes('hidden'));
  });

  test('SRC-01 search finds Public and Private communities, with your status on yours', async () => {
    const r = await c.bob.get('/api/communities?scope=discover&q=builders');
    assert.deepEqual(ids(r.body.communities), ['beta'], 'a Private community is found by name');
    assert.equal(r.body.communities[0].membership, null);
    const g = (await c.bob.get('/api/communities?scope=discover&q=gamma')).body.communities[0];
    assert.deepEqual(g.membership, { state: 'active', role: 'member' }, 'your own memberships stay in, marked');
    assert.equal((await c.bob.get('/api/communities?scope=discover&q=hidden')).body.total, 0, 'a Closed one is never found');
  });

  test('categories: one of the nine; categories outside the list count and filter as Other', async () => {
    const r = (await c.bob.get('/api/communities?scope=discover')).body;
    assert.deepEqual(Object.keys(r.categoryCounts).length, 9);
    assert.equal(r.categoryCounts.Alumni, 2);
    assert.equal(r.categoryCounts.Technology, 1);
    assert.equal(r.categoryCounts.Other, 1, 'City counts as Other until the category review');
    assert.deepEqual(ids((await c.bob.get('/api/communities?scope=discover&category=Other')).body.communities), ['delta']);
    assert.deepEqual(ids((await c.bob.get('/api/communities?scope=discover&category=Alumni&sort=name')).body.communities), ['alpha', 'gamma']);
    const counts = (await c.bob.get('/api/communities?scope=discover&category=Alumni&q=alpha')).body.categoryCounts;
    assert.equal(counts.Alumni, 1, 'counts follow the search');
    assert.equal(counts.Technology, 0, 'and ignore the chosen category');
    assert.equal((await c.bob.get('/api/communities?scope=discover&category=City')).status, 400);
    assert.equal((await c.bob.get('/api/communities?scope=discover&sort=random')).status, 400);
  });

  test('sorts: most members (then name) by default, newest, A to Z', async () => {
    const list = async (s) => ids((await c.bob.get(`/api/communities?scope=discover${s}`)).body.communities);
    assert.deepEqual(await list(''), ['alpha', 'gamma', 'beta', 'delta']);
    assert.deepEqual(await list('&sort=newest'), ['beta', 'gamma', 'delta', 'alpha']);
    assert.deepEqual(await list('&sort=name'), ['alpha', 'beta', 'delta', 'gamma']);
  });

  test('hideMine drops the ones you are in (active or restricted)', async () => {
    await member('delta', 'cat', 'member', 'restricted');
    try {
      const r = (await c.cat.get('/api/communities?scope=discover&hideMine=1')).body;
      assert.deepEqual(ids(r.communities).sort(), ['beta', 'gamma']);
    } finally { await q(`delete from memberships where community_id = 'delta' and user_id = 'cat'`); }
  });

  test('paging: 24 a page, with total, page and pageSize', async () => {
    for (let i = 0; i < 30; i += 1) await community(`bulk${String(i).padStart(2, '0')}`, { name: `Bulk ${String(i).padStart(2, '0')}`, category: 'Business' });
    try {
      const p1 = (await c.bob.get('/api/communities?scope=discover&category=Business&sort=name')).body;
      assert.equal(p1.communities.length, 24);
      assert.equal(p1.total, 30); assert.equal(p1.page, 1); assert.equal(p1.pageSize, 24);
      assert.equal(p1.categoryCounts.Business, 30);
      const p2 = (await c.bob.get('/api/communities?scope=discover&category=Business&sort=name&page=2')).body;
      assert.equal(p2.communities.length, 6);
      assert.equal(p2.page, 2);
      assert.equal(p2.communities[0].name, 'Bulk 24');
      assert.equal((await c.bob.get('/api/communities?scope=discover&page=nope')).body.page, 1);
      // The bare list keeps today's shape: no paging keys.
      const bare = (await c.bob.get('/api/communities')).body;
      assert.equal(bare.total, undefined);
      assert.ok(bare.communities.length > 24);
    } finally { await q(`delete from communities where id like 'bulk%'`); }
  });

  test('MEM-07 a recent removal says when you can ask again (rejoinAfter), an old one does not', async () => {
    await member('gamma', 'dan', 'member', 'removed');
    try {
      const m = (await c.dan.get('/api/communities?scope=discover&q=gamma')).body.communities[0].membership;
      assert.equal(m.state, 'removed');
      const when = Date.parse(m.rejoinAfter);
      assert.ok(Math.abs(when - (Date.now() + 7 * 864e5)) < 60e3, 'seven days after the removal');
      assert.equal((await c.dan.post('/api/communities/gamma/join')).body.error.code, 'REMOVED', 'the join route agrees');
      await q(`update memberships set updated_at = now() - interval '8 days' where community_id = 'gamma' and user_id = 'dan'`);
      const later = (await c.dan.get('/api/communities')).body.communities.find((x) => x.id === 'gamma').membership;
      assert.equal(later.rejoinAfter, undefined);
    } finally { await q(`delete from memberships where community_id = 'gamma' and user_id = 'dan'`); }
  });

  test('blocked communities stay out of every list', async () => {
    await member('beta', 'dan', 'member', 'blocked');
    try {
      assert.ok(!ids((await c.dan.get('/api/communities?scope=discover')).body.communities).includes('beta'));
      assert.ok(!ids((await c.dan.get('/api/communities')).body.communities).includes('beta'));
    } finally { await q(`delete from memberships where community_id = 'beta' and user_id = 'dan'`); }
  });

  test('PER-01 your role is per community in the list', async () => {
    await member('gamma', 'cat', 'moderator');
    try {
      const list = (await c.cat.get('/api/communities')).body.communities;
      assert.equal(list.find((x) => x.id === 'alpha').membership.role, 'member');
      assert.equal(list.find((x) => x.id === 'gamma').membership.role, 'moderator');
      assert.equal(list.find((x) => x.id === 'beta').membership, null);
    } finally { await q(`delete from memberships where community_id = 'gamma' and user_id = 'cat'`); }
  });
});

describe('GET /dashboard additions (Home, D3 and D4)', () => {
  test('existing keys are all still there', async () => {
    const d = (await c.bob.get('/api/dashboard')).body;
    for (const k of ['communities', 'upcomingEvents', 'mandatoryReads', 'announcements', 'connectionRequests', 'newMembers', 'replies', 'recentPosts', 'suggested',
      'comingUp', 'pendingRequests', 'invitations', 'canPostIn', 'canCreateEventsIn']) assert.ok(k in d, k);
  });

  test('suggested: up to 6 when you are in no communities, else 3', async () => {
    for (let i = 0; i < 6; i += 1) await community(`sug${i}`, { name: `Suggested ${i}` });
    try {
      assert.equal((await c.new.get('/api/dashboard')).body.suggested.length, 6);
      assert.equal((await c.new.get('/api/dashboard')).body.communities.length, 0);
      assert.equal((await c.bob.get('/api/dashboard')).body.suggested.length, 3);
    } finally { await q(`delete from communities where id like 'sug%'`); }
  });

  test('comingUp: next 14 days, events you have not answered first, then by start', async () => {
    const ev = (id, days) => q(`insert into events (id, community_id, host_id, title, start_at, end_at) values ($1, 'alpha', 'own', $1, $2, $2::timestamptz + interval '1 hour')`, [id, at(days)]);
    await ev('e-answered', 1); await ev('e-open-late', 5); await ev('e-open-soon', 2); await ev('e-far', 20);
    await q(`insert into event_rsvps (event_id, user_id, status) values ('e-answered', 'bob', 'going')`);
    try {
      const d = (await c.bob.get('/api/dashboard')).body;
      assert.deepEqual(ids(d.comingUp), ['e-open-soon', 'e-open-late', 'e-answered']);
      assert.equal(d.comingUp[0].myRsvp, null);
      assert.equal(d.comingUp[2].myRsvp, 'going');
      assert.ok(ids(d.upcomingEvents).includes('e-far'), 'upcomingEvents is unchanged');
    } finally { await q(`delete from events where community_id = 'alpha'`); }
  });

  test('pendingRequests: your join requests still waiting', async () => {
    assert.equal((await c.dan.post('/api/communities/beta/join')).body.membership.state, 'pending');
    try {
      const d = (await c.dan.get('/api/dashboard')).body;
      assert.equal(d.pendingRequests.length, 1);
      assert.deepEqual(d.pendingRequests[0].community, { id: 'beta', slug: 'beta', name: 'Beta Builders', accent: 'violet', visibility: 'private' });
      assert.ok(Date.parse(d.pendingRequests[0].requestedAt));
      assert.ok(!ids(d.communities).includes('beta'));
    } finally { await c.dan.post('/api/communities/beta/leave'); }
    assert.equal((await c.dan.get('/api/dashboard')).body.pendingRequests.length, 0, 'withdrawn requests leave');
  });

  test('invitations: your open invitations, the same ones /me/invitations lists', async () => {
    const r = await c.own.post('/api/communities/hidden/invitations', { userIds: ['dan'] });
    assert.equal(r.status, 201);
    const d = (await c.dan.get('/api/dashboard')).body;
    assert.equal(d.invitations.length, 1);
    const [i] = d.invitations;
    assert.deepEqual(i.community, { id: 'hidden', slug: 'hidden', name: 'Hidden Circle', accent: 'violet', visibility: 'closed' });
    assert.equal(i.role, 'member'); assert.equal(i.invitedBy, 'OWN'); assert.ok(Date.parse(i.expiresAt) > Date.now());
    const mine = (await c.dan.get('/api/me/invitations')).body.invitations;
    assert.deepEqual(mine.map((x) => x.id), [i.id]);
    assert.equal((await c.dan.post(`/api/me/invitations/${i.id}/accept`)).status, 200);
    assert.equal((await c.dan.get('/api/dashboard')).body.invitations.length, 0, 'an accepted invitation leaves');
    await q(`delete from memberships where community_id = 'hidden' and user_id = 'dan'`);
  });

  test('canPostIn and canCreateEventsIn agree with the post and event routes', async () => {
    await community('rules', { name: 'Rules Club', settings: { whoCanPost: 'admins' } });
    await community('quiet', { name: 'Quiet Club', settings: { sections: ['events'] } });
    await community('evadm', { name: 'Event Admins', settings: { whoCanCreateEvents: 'admins' } });
    for (const id of ['rules', 'quiet', 'evadm']) { await member(id, 'own', 'owner'); await member(id, 'cat'); }
    await member('gamma', 'cat', 'member', 'restricted');
    try {
      const d = (await c.cat.get('/api/dashboard')).body;
      assert.deepEqual([...d.canPostIn].sort(), ['alpha', 'evadm']);
      assert.deepEqual([...d.canCreateEventsIn].sort(), ['alpha', 'quiet']);
      // The routes give the same answers.
      const post = (cid) => c.cat.post(`/api/communities/${cid}/posts`, { body: 'Hello there' }).then((x) => x.status);
      assert.equal(await post('rules'), 403, 'whoCanPost = admins');
      assert.equal(await post('quiet'), 404, 'Discussions switched off');
      assert.equal(await post('gamma'), 403, 'restricted');
      assert.equal(await post('evadm'), 201);
      const event = (cid) => c.cat.post(`/api/communities/${cid}/events`, { title: 'Meetup', start: at(3), end: at(3.1) }).then((x) => x.status);
      assert.equal(await event('evadm'), 403, 'whoCanCreateEvents = admins');
      assert.equal(await event('quiet'), 201);
      // The owner may post where members may not.
      assert.ok((await c.own.get('/api/dashboard')).body.canPostIn.includes('rules'));
      // An archived community takes nothing new.
      assert.ok(!(await c.ann.get('/api/dashboard')).body.canPostIn.includes('old'));
    } finally {
      await q(`delete from communities where id in ('rules', 'quiet', 'evadm')`);
      await q(`delete from memberships where community_id = 'gamma' and user_id = 'cat'`);
    }
  });
});
