// Public discovery and joining the default community (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, lastToken, makeUser, setup, signIn } from './helpers.js';
import { joinDefaultCommunity } from '../lib/community.js';

let env; let visitor;
const q = (s, p) => env.db.query(s, p);
const at = (days) => new Date(Date.now() + days * 864e5);

before(async () => {
  env = await setup();
  visitor = client(env.app);
  await makeUser(env.db, { id: 'own', email: 'own@example.com', name: 'Owner' });
  await makeUser(env.db, { id: 'mem', email: 'mem@example.com', name: 'Member' });
  await makeUser(env.db, { id: 'gone', email: 'gone@example.com', name: 'Suspended', status: 'suspended' });
  const rows = [['alumnizone', 'AlumniZone', 'public', 'active', 'Alumni'], ['pub', 'Bengaluru Chapter', 'public', 'active', 'City'],
    ['pri', 'Founders Circle', 'private', 'active', 'Interest'], ['clo', 'Class of 2016', 'closed', 'active', 'Batch'],
    ['arc', 'Old Archive', 'public', 'archived', 'City'], ['sus', 'Suspended Space', 'public', 'suspended', 'City']];
  for (const [id, name, vis, status, cat] of rows) {
    await q(`insert into communities (id, slug, name, visibility, status, category, description, created_by) values ($1, $1, $2, $3, $4, $5, 'About ' || $2, 'own')`, [id, name, vis, status, cat]);
    for (const uid of ['own', 'mem', 'gone']) await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now())`, [id, uid, uid === 'own' ? 'owner' : 'member']);
  }
  const ev = (id, cid, title, start, extra = '') => q(`insert into events (id, community_id, host_id, title, start_at, end_at${extra ? ', ' + extra.split('=')[0] : ''})
    values ($1, $2, 'own', $3, $4, $4::timestamptz + interval '1 hour'${extra ? ', ' + extra.split('=')[1] : ''})`, [id, cid, title, start]);
  await ev('e1', 'pub', 'Open meet-up', at(5));
  await ev('e2', 'pub', 'Secret supper', at(6), 'invite_only=true');
  await ev('e3', 'pub', 'Called off', at(7), "status='cancelled'");
  await ev('e4', 'pub', 'Last month', at(-30));
  await ev('e5', 'pri', 'Founders dinner', at(3));
  await q(`insert into events (id, community_id, host_id, title, start_at, end_at, recurrence) values ('e6', 'alumnizone', 'own', 'Weekly office hours', $1, $1::timestamptz + interval '1 hour', '{"freq":"weekly"}')`, [at(-20)]);
});
after(async () => { await env.close(); });

const list = async (query = '') => (await visitor.get(`/api/public/communities${query}`)).body;

describe('public discovery', () => {
  test('VIS-04 visitors see Public and Private communities, never Closed, archived or suspended, even by search', async () => {
    const ids = (await list()).communities.map((c) => c.id).sort();
    assert.deepEqual(ids, ['alumnizone', 'pri', 'pub']);
    assert.equal((await list('?q=class%20of%202016')).communities.length, 0);
    assert.ok(!(await list()).categories.includes('Batch'), 'a Closed community’s category doesn’t leak either');
  });

  test('VIS-01/11 cards carry public metadata and a count, never members or content', async () => {
    const body = await list();
    const pri = body.communities.find((c) => c.id === 'pri');
    assert.deepEqual(Object.keys(pri).sort(), ['category', 'description', 'id', 'memberCount', 'name', 'slug', 'upcomingEvents', 'visibility']);
    assert.deepEqual(pri.upcomingEvents, [], 'a Private community’s events stay private');
    assert.ok(!JSON.stringify(body).includes('@'), 'no email addresses');
    assert.equal(body.communities.find((c) => c.id === 'pub').memberCount, 2, 'suspended accounts aren’t counted');
  });

  test('EVT-08 only upcoming, scheduled, open events of Public communities are listed', async () => {
    const pub = (await list()).communities.find((c) => c.id === 'pub');
    assert.deepEqual(pub.upcomingEvents.map((e) => e.title), ['Open meet-up']);
    const az = (await list()).communities.find((c) => c.id === 'alumnizone');
    assert.equal(az.upcomingEvents[0].title, 'Weekly office hours');
    assert.ok(Date.parse(az.upcomingEvents[0].start) > Date.now(), 'a repeating event shows its next date');
  });

  test('filters, validation and no sign-in needed', async () => {
    assert.deepEqual((await list('?category=City')).communities.map((c) => c.id), ['pub']);
    assert.equal((await visitor.get('/api/public/communities?limit=500')).status, 400);
    assert.equal((await list('?limit=1')).communities.length, 1);
  });
});

describe('joining the default community (R5)', () => {
  test('confirming your email makes you an AlumniZone member', async () => {
    const c = client(env.app);
    assert.equal((await c.post('/api/auth/register', { name: 'Riya Menon', email: 'riya@example.com', password: 'a-good-password' })).status, 201);
    const { rows: [u] } = await q(`select id from users where email = 'riya@example.com'`);
    assert.equal((await q(`select count(*)::int n from memberships where user_id = $1`, [u.id])).rows[0].n, 0, 'not before confirming');
    assert.equal((await c.post('/api/auth/verify', { token: await lastToken(env.db, 'riya@example.com') })).status, 200);
    const { rows } = await q(`select role, state from memberships where community_id = 'alumnizone' and user_id = $1`, [u.id]);
    assert.deepEqual(rows, [{ role: 'member', state: 'active' }]);
    const dash = (await c.get('/api/dashboard')).body;
    assert.ok(dash.communities.some((x) => x.id === 'alumnizone'), 'their Home isn’t empty');
  });

  test('with approval required, membership waits for the admin’s approval', async () => {
    await q(`update platform_settings set value = value || '{"requireApproval": true}' where key = 'registration'`);
    try {
      const c = client(env.app);
      await c.post('/api/auth/register', { name: 'Waiting Person', email: 'wait@example.com', password: 'a-good-password' });
      await c.post('/api/auth/verify', { token: await lastToken(env.db, 'wait@example.com') });
      const { rows: [u] } = await q(`select id, status from users where email = 'wait@example.com'`);
      assert.equal(u.status, 'pending_approval');
      assert.equal((await q(`select count(*)::int n from memberships where user_id = $1`, [u.id])).rows[0].n, 0);
      await makeUser(env.db, { id: 'pa', email: 'pa@example.com', roles: ['platform_admin'] });
      const admin = await signIn(env.app, { email: 'pa@example.com', password: 'correct-horse-battery' });
      assert.equal((await admin.post(`/api/admin/users/${u.id}/approve`)).status, 200);
      assert.equal((await q(`select state from memberships where community_id = 'alumnizone' and user_id = $1`, [u.id])).rows[0].state, 'active');
    } finally {
      await q(`update platform_settings set value = value || '{"requireApproval": false}' where key = 'registration'`);
    }
  });

  test('R5 someone who left, was removed or blocked is never re-added (the MEM-05 rule)', async () => {
    for (const state of ['left', 'removed', 'blocked']) {
      await q(`update memberships set state = $1 where community_id = 'alumnizone' and user_id = 'mem'`, [state]);
      await joinDefaultCommunity(env.db, 'mem');
      assert.equal((await q(`select state from memberships where community_id = 'alumnizone' and user_id = 'mem'`)).rows[0].state, state);
    }
  });
});
