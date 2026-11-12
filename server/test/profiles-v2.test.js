// v2 workstream D (D10): a profile's communities and posts, and Preview as a member/connection.
// IDs from EDGE_CASE_REGISTER.md: VIS-16 (new, P0), SRC-02, CNT-15, USR-01, USR-02.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; let dan; let pri; let eve; let staff;
const q = (s, p) => env.db.query(s, p);
const ids = (list) => (list || []).map((x) => x.id).sort();

before(async () => {
  env = await setup();
  for (const [id, name, roles] of [['dan', 'Daniel Okafor', []], ['pri', 'Priya Sharma', []], ['eve', 'Eve Stranger', []], ['staff', 'Sam Staff', ['user_manager']], ['own', 'Owner Person', []]]) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name, roles });
    await q(`insert into profiles (user_id, headline, contact_visibility) values ($1, $2, $3)`, [id, `${name} headline`, id === 'pri' ? 'connections' : 'everyone']);
  }
  // Communities: az (Public, Dan and Priya), cs (Public, Dan only), pv (Private, Dan and Priya),
  // pv2 (Private, Dan only), cl (Closed, Dan only), cl2 (Closed, Priya only), quiet (Public,
  // Dan only, Discussions switched off), arch (Public but archived, Dan only).
  const rows = [['az', 'AlumniZone', 'public', 'active', null], ['cs', 'Computer Science Alumni', 'public', 'active', null], ['pv', 'Mentorship Program', 'private', 'active', null],
    ['pv2', 'Secret Supper Club', 'private', 'active', null], ['cl', 'Homecoming Committee', 'closed', 'active', null], ['cl2', 'Class of 2016', 'closed', 'active', null],
    ['quiet', 'Quiet Corner', 'public', 'active', { sections: ['events'] }], ['arch', 'Old Archive', 'public', 'archived', null]];
  for (const [id, name, vis, status, settings] of rows) {
    await q(`insert into communities (id, slug, name, visibility, status, created_by, settings) values ($1, $2, $3, $4, $5, 'own', coalesce($6::jsonb, '{}'::jsonb))`,
      [id, id, name, vis, status, settings ? JSON.stringify(settings) : null]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
  }
  const join = (cid, uid, role = 'member', state = 'active') => q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, $4, now())`, [cid, uid, role, state]);
  for (const cid of ['az', 'pv', 'pv2', 'cl', 'quiet', 'arch']) await join(cid, 'dan');
  await join('cs', 'dan', 'admin');
  for (const cid of ['az', 'pv', 'cl2']) await join(cid, 'pri');
  // Posts by Dan, one second apart so the order is certain.
  const post = (id, cid, body, mins, status = 'published', deleted = false) => q(`insert into posts (id, community_id, author_id, body, status, published_at, created_at, deleted_at)
    values ($1, $2, 'dan', $3, $4, now() - ($5 || ' minutes')::interval, now() - ($5 || ' minutes')::interval, $6)`, [id, cid, body, status, String(mins), deleted ? new Date() : null]);
  await post('d-az', 'az', 'Football on Saturday, all welcome', 1);
  await post('d-cs', 'cs', 'New ML reading group', 2);
  await post('d-pv', 'pv', 'Mentors only: pairing list', 3);
  await post('d-pv2', 'pv2', 'Supper club secret menu', 4);
  await post('d-cl', 'cl', 'Homecoming budget is final', 5);
  await post('d-quiet', 'quiet', 'Quiet corner reading', 6);
  await post('d-draft', 'az', 'Draft nobody sees', 7, 'draft');
  await post('d-sch', 'az', 'Scheduled for later', 8, 'scheduled');
  await post('d-del', 'az', 'Deleted thought', 9, 'published', true);
  dan = await signIn(env.app, { email: 'dan@example.com', password: 'correct-horse-battery' });
  pri = await signIn(env.app, { email: 'pri@example.com', password: 'correct-horse-battery' });
  eve = await signIn(env.app, { email: 'eve@example.com', password: 'correct-horse-battery' });
  staff = await signIn(env.app, { email: 'staff@example.com', password: 'correct-horse-battery' });
});
after(async () => { await env.close(); });

describe('a profile’s communities', () => {
  test('VIS-16 shared communities first, then the person’s Public ones; never a Private or Closed one the viewer isn’t in', async () => {
    const r = await pri.get('/api/profiles/dan/communities');
    assert.equal(r.status, 200);
    const list = r.body.communities;
    assert.deepEqual(list.filter((c) => c.shared).map((c) => c.id).sort(), ['az', 'pv'], 'in common: AlumniZone and the Private one both are in');
    assert.deepEqual(list.filter((c) => !c.shared).map((c) => c.id).sort(), ['cs', 'quiet'], 'plus Dan’s Public ones; not archived, Private or Closed');
    assert.ok(list.findIndex((c) => !c.shared) > list.findLastIndex((c) => c.shared), 'shared ones come first');
    const text = JSON.stringify(r.body);
    for (const hidden of ['Secret Supper Club', 'Homecoming Committee', 'pv2', '"cl"']) assert.ok(!text.includes(hidden), `${hidden} must not appear`);
    assert.deepEqual(Object.keys(list[0]).sort(), ['accent', 'category', 'id', 'name', 'role', 'shared', 'slug', 'visibility']);
    assert.equal(list.find((c) => c.id === 'cs').role, 'admin', 'the role is that person’s role there');
  });

  test('VIS-16 a stranger sees only Public ones; platform staff get no more than anyone else', async () => {
    assert.deepEqual(ids((await eve.get('/api/profiles/dan/communities')).body.communities), ['az', 'cs', 'quiet']);
    assert.deepEqual(ids((await staff.get('/api/profiles/dan/communities')).body.communities), ['az', 'cs', 'quiet']);
    assert.deepEqual(ids((await staff.get('/api/profiles/dan/communities', { 'x-admin-mode': '1' })).body.communities), ['az', 'cs', 'quiet'], 'admin mode doesn’t widen a profile');
  });

  test('your own profile lists every community you’re in, Closed ones included', async () => {
    assert.deepEqual(ids((await dan.get('/api/profiles/me/communities')).body.communities), ['arch', 'az', 'cl', 'cs', 'pv', 'pv2', 'quiet']);
    assert.ok((await dan.get('/api/profiles/dan/communities')).body.communities.every((c) => c.shared));
  });

  test('a removed membership stops counting as shared', async () => {
    await q(`update memberships set state = 'left' where community_id = 'pv' and user_id = 'pri'`);
    try {
      assert.ok(!ids((await pri.get('/api/profiles/dan/communities')).body.communities).includes('pv'));
    } finally { await q(`update memberships set state = 'active' where community_id = 'pv' and user_id = 'pri'`); }
  });
});

describe('a profile’s posts', () => {
  test('SRC-02 only posts in communities the viewer can read, newest first; Private ones hidden from non-members', async () => {
    const r = await eve.get('/api/profiles/dan/posts');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.posts.map((p) => p.id), ['d-az', 'd-cs'], 'Public communities only; Discussions switched off excluded');
    assert.equal(r.body.next, null);
    assert.deepEqual(Object.keys(r.body.posts[0]).sort(), ['community', 'excerpt', 'id', 'publishedAt', 'type']);
    assert.deepEqual(r.body.posts[0].community, { id: 'az', slug: 'az', name: 'AlumniZone' });
    assert.deepEqual((await pri.get('/api/profiles/dan/posts')).body.posts.map((p) => p.id), ['d-az', 'd-cs', 'd-pv'], 'a fellow member of the Private one reads that too');
  });

  test('CNT-15 a Private or Closed post, a draft, a scheduled or a deleted one is never quoted', async () => {
    const text = JSON.stringify((await eve.get('/api/profiles/dan/posts')).body);
    for (const secret of ['pairing list', 'secret menu', 'Homecoming budget', 'Draft nobody', 'Scheduled for later', 'Deleted thought', 'Quiet corner']) {
      assert.ok(!text.includes(secret), `“${secret}” must not leak`);
    }
    const own = (await dan.get('/api/profiles/me/posts')).body.posts.map((p) => p.id);
    assert.ok(!own.includes('d-draft') && !own.includes('d-sch') && !own.includes('d-del'), 'not even on your own profile');
  });

  test('blocks: nothing across a block either way, and someone who blocked you looks like they don’t exist', async () => {
    await q(`insert into blocks (blocker_id, blocked_id) values ('dan', 'eve')`);
    try {
      for (const path of ['', '/communities', '/posts']) assert.equal((await eve.get(`/api/profiles/dan${path}`)).status, 404, `profile${path}`);
      assert.deepEqual((await dan.get('/api/profiles/eve/posts')).body.posts, [], 'the blocker sees none of theirs either');
    } finally { await q(`delete from blocks where blocker_id = 'dan'`); }
  });

  test('hidden accounts answer the way the profile does', async () => {
    await q(`update users set status = 'suspended' where id = 'dan'`);
    try {
      for (const path of ['', '/communities', '/posts']) assert.equal((await eve.get(`/api/profiles/dan${path}`)).status, 404, `profile${path}`);
    } finally { await q(`update users set status = 'active' where id = 'dan'`); }
    assert.equal((await eve.get('/api/profiles/nobody/posts')).status, 404);
    assert.equal((await client(env.app).get('/api/profiles/dan/posts')).status, 401);
  });

  test('20 a page, with a cursor that neither repeats nor skips', async () => {
    const stamp = new Date();
    for (let i = 0; i < 25; i += 1) {
      await q(`insert into posts (id, community_id, author_id, body, status, published_at) values ($1, 'cs', 'dan', $2, 'published', $3)`, [`bulk-${String(i).padStart(2, '0')}`, `Bulk ${i}`, stamp]);
    }
    try {
      const first = (await eve.get('/api/profiles/dan/posts')).body;
      assert.equal(first.posts.length, 20);
      assert.ok(first.next);
      const second = (await eve.get(`/api/profiles/dan/posts?before=${encodeURIComponent(first.next)}`)).body;
      const all = [...first.posts, ...second.posts].map((p) => p.id);
      assert.equal(new Set(all).size, all.length, 'no repeats, even when posts share a timestamp');
      assert.equal(all.length, 27, 'every readable post once');
      assert.equal(second.next, null);
      assert.equal((await eve.get('/api/profiles/dan/posts?before=yesterday')).status, 400);
    } finally { await q(`delete from posts where id like 'bulk-%'`); }
  });
});

describe('Preview as (D10)', () => {
  test('VIS-16 as=member: contact hidden, only Public communities and their posts, as for a stranger', async () => {
    const p = await pri.get('/api/profiles/me?as=member');
    assert.equal(p.status, 200);
    assert.equal(p.body.profile.preview, 'member');
    assert.equal(p.body.profile.email, null, 'Priya shares contact details with connections only');
    assert.equal(p.body.profile.contactHidden, true);
    assert.equal(p.body.profile.version, undefined, 'none of the owner-only fields');
    assert.deepEqual(ids((await pri.get('/api/profiles/me/communities?as=member')).body.communities), ['az'], 'not the Private or Closed ones');
    assert.deepEqual(ids((await dan.get('/api/profiles/me/communities?as=member')).body.communities), ['az', 'cs', 'quiet']);
    assert.deepEqual((await dan.get('/api/profiles/dan/posts?as=member')).body.posts.map((p) => p.id), ['d-az', 'd-cs']);
  });

  test('as=connection shows what a connection sees: contact details, still no Private or Closed community', async () => {
    const p = (await pri.get('/api/profiles/pri?as=connection')).body.profile;
    assert.equal(p.email, 'pri@example.com');
    assert.equal(p.contactHidden, false);
    assert.equal(p.connection, 'connected');
    assert.deepEqual(ids((await pri.get('/api/profiles/me/communities?as=connection')).body.communities), ['az']);
  });

  test('as is refused for anyone else’s id, and an unknown value is refused', async () => {
    for (const path of ['', '/communities', '/posts']) {
      const r = await pri.get(`/api/profiles/dan${path}?as=member`);
      assert.equal(r.status, 403, `profile${path}`);
      assert.equal(r.body.error.code, 'PREVIEW_OWN_ONLY');
    }
    assert.equal((await staff.get('/api/profiles/dan?as=connection')).status, 403, 'staff too');
    assert.equal((await pri.get('/api/profiles/me?as=admin')).status, 400);
  });

  test('without as, your own profile is unchanged and carries your own fields', async () => {
    const p = (await pri.get('/api/profiles/me')).body.profile;
    assert.equal(p.id, 'pri');
    assert.equal(p.email, 'pri@example.com');
    assert.equal(typeof p.version, 'number');
    assert.equal(p.preview, undefined);
  });
});

describe('profile edits still hold', () => {
  test('USR-01 a blank name is refused and names the field', async () => {
    const v = (await dan.get('/api/profiles/me')).body.profile.version;
    const r = await dan.patch('/api/profiles/me', { version: v, name: '  ' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.field, 'name');
  });

  test('USR-02 markup in a profile is stored as text and comes back as text to others', async () => {
    const v = (await dan.get('/api/profiles/me')).body.profile.version;
    assert.equal((await dan.patch('/api/profiles/me', { version: v, bio: '<img src=x onerror=alert(1)>\u0007Hello' })).status, 200);
    assert.equal((await eve.get('/api/profiles/dan')).body.profile.bio, '<img src=x onerror=alert(1)>Hello');
  });
});
