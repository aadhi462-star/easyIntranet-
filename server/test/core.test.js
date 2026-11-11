// Redesign Stage 3: global search, community addresses, merging All Hands (R4) and onboarding
// (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, lastToken, makeUser, setup, signIn } from './helpers.js';
import { mergeCommunity, undoMerge } from '../lib/merge.js';

let env; let ana; let ben;
const q = (s, p) => env.db.query(s, p);
const at = (days) => new Date(Date.now() + days * 864e5);
const search = async (c, query, type) => (await c.get(`/api/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ''}`));
const ids = (list) => (list || []).map((x) => x.id).sort();

before(async () => {
  env = await setup();
  for (const [id, name] of [['ana', 'Ana Rao'], ['ben', 'Ben Thomas'], ['own', 'Owner Person'], ['hid', 'Hidden Harbour']]) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name });
    await q(`insert into profiles (user_id, headline, directory_visible) values ($1, $2, $3)`, [id, `${name} works on harbour logistics`, id !== 'hid']);
  }
  const rows = [['alumnizone', 'AlumniZone', 'public'], ['pub', 'Harbour Public', 'public'], ['pri', 'Harbour Private', 'private'],
    ['clo', 'Harbour Closed', 'closed'], ['g0', 'All Hands', 'public']];
  for (const [id, name, vis] of rows) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $2, $3, $4, 'own')`, [id, name.toLowerCase().replace(/ /g, '-'), name, vis]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
  }
  // Ana is in the Private and Closed ones; Ben is in neither.
  for (const cid of ['pri', 'clo', 'alumnizone', 'g0']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, 'ana', 'active', now())`, [cid]);
  for (const cid of ['alumnizone', 'g0']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, 'ben', 'active', now())`, [cid]);
  const post = (id, cid, body, extra = {}) => q(`insert into posts (id, community_id, author_id, body, status, published_at, deleted_at)
    values ($1, $2, 'own', $3, $4, now(), $5)`, [id, cid, body, extra.status ?? 'published', extra.deleted ? new Date() : null]);
  await post('p-pub', 'pub', 'Harbour cleanup this Saturday, everyone welcome');
  await post('p-pri', 'pri', 'Harbour budget for members only');
  await post('p-clo', 'clo', 'Harbour secret plan');
  await post('p-draft', 'pub', 'Harbour draft nobody should see', { status: 'draft' });
  await post('p-del', 'pub', 'Harbour deleted post', { deleted: true });
  await post('p-all', 'g0', 'Harbour town hall announcement');
  await q(`insert into events (id, community_id, host_id, title, start_at, end_at) values ('e-all', 'g0', 'own', 'Harbour all-hands meeting', $1, $1::timestamptz + interval '1 hour')`, [at(4)]);
  await q(`insert into events (id, community_id, host_id, title, start_at, end_at) values ('e-pri', 'pri', 'own', 'Harbour private dinner', $1, $1::timestamptz + interval '1 hour')`, [at(5)]);
  ana = await signIn(env.app, { email: 'ana@example.com', password: 'correct-horse-battery' });
  ben = await signIn(env.app, { email: 'ben@example.com', password: 'correct-horse-battery' });
});
after(async () => { await env.close(); });

describe('global search', () => {
  test('SRC-01 Closed communities appear only for their members', async () => {
    assert.ok(!ids((await search(ben, 'harbour')).body.results.communities).includes('clo'));
    assert.ok(ids((await search(ana, 'harbour')).body.results.communities).includes('clo'), 'a member finds their own Closed community');
  });

  test('SRC-02 post content from Private and Closed communities is only found by members', async () => {
    assert.deepEqual(ids((await search(ben, 'harbour', 'posts')).body.results.posts), ['p-all', 'p-pub']);
    assert.deepEqual(ids((await search(ana, 'harbour', 'posts')).body.results.posts), ['p-all', 'p-clo', 'p-pri', 'p-pub']);
    const text = JSON.stringify((await search(ben, 'harbour')).body);
    for (const secret of ['budget', 'secret plan', 'draft nobody', 'deleted post']) assert.ok(!text.includes(secret), `“${secret}” must not leak`);
  });

  test('a repeating event is found at its next date, not the day the series began', async () => {
    await q(`insert into events (id, community_id, host_id, title, start_at, end_at, recurrence) values ('e-rep', 'g0', 'own', 'Harbour weekly walk', $1, $1::timestamptz + interval '1 hour', '{"freq": "weekly"}')`, [at(-20)]);
    try {
      const hit = (await search(ana, 'weekly walk', 'events')).body.results.events.find((e) => e.id === 'e-rep');
      assert.ok(hit, 'the series is found');
      assert.ok(Date.parse(hit.start) >= Date.now() - 60e3, `shown at its next date, not ${hit.start}`);
      assert.ok(Date.parse(hit.start) < Date.now() + 8 * 864e5);
    } finally { await q(`delete from events where id = 'e-rep'`); }
  });

  test('SRC-02 events follow the Events page rules', async () => {
    assert.deepEqual(ids((await search(ben, 'harbour', 'events')).body.results.events), ['e-all']);
    assert.deepEqual(ids((await search(ana, 'harbour', 'events')).body.results.events), ['e-all', 'e-pri']);
  });

  test('people follow the directory rules: hidden profiles and blocks', async () => {
    assert.deepEqual(ids((await search(ben, 'harbour', 'people')).body.results.people), ['ana', 'ben', 'own']);
    await q(`insert into blocks (blocker_id, blocked_id) values ('ana', 'ben')`);
    try {
      assert.ok(!ids((await search(ben, 'harbour', 'people')).body.results.people).includes('ana'), 'someone who blocked you isn’t found');
      assert.ok(!ids((await search(ana, 'harbour', 'people')).body.results.people).includes('ben'), 'nor someone you blocked');
    } finally { await q(`delete from blocks where blocker_id = 'ana'`); }
  });

  test('SRC-05 access is checked again when a result is opened', async () => {
    assert.ok(ids((await search(ana, 'harbour', 'posts')).body.results.posts).includes('p-pri'));
    await q(`update memberships set state = 'removed' where community_id = 'pri' and user_id = 'ana'`);
    try {
      assert.equal((await ana.get('/api/posts/p-pri')).status, 403, 'the post page refuses once access is gone (members only)');
      assert.ok(!ids((await search(ana, 'harbour', 'posts')).body.results.posts).includes('p-pri'), 'and search stops listing it');
    } finally { await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'ana'`); }
  });

  test('SRC-06 short, invalid and wildcard queries', async () => {
    assert.equal((await search(ana, 'h')).status, 400);
    assert.equal((await search(ana, 'harbour', 'secrets')).status, 400);
    const none = (await search(ana, '100%')).body.results;
    assert.deepEqual(Object.values(none).flat(), [], '% is matched literally, not as “anything”');
    assert.equal((await client(env.app).get('/api/search?q=harbour')).status, 401);
  });
});

describe('community addresses', () => {
  test('a community opens by its slug as well as its id', async () => {
    const r = await ana.get('/api/communities/harbour-private');
    assert.equal(r.status, 200);
    assert.equal(r.body.community.id, 'pri');
    assert.equal(r.body.community.slug, 'harbour-private');
  });

  test('VIS-04 a Closed community’s slug is as unknown as its id to outsiders', async () => {
    assert.equal((await ben.get('/api/communities/harbour-closed')).status, 404);
  });

  test('VIS-01 member counts agree everywhere: suspended accounts aren’t counted', async () => {
    await makeUser(env.db, { id: 'sus', email: 'sus@example.com', status: 'suspended' });
    await q(`insert into memberships (community_id, user_id, state, joined_at) values ('pub', 'sus', 'active', now())`);
    const detail = (await ana.get('/api/communities/pub')).body.community.memberCount;
    const listed = (await ana.get('/api/communities')).body.communities.find((c) => c.id === 'pub').memberCount;
    const pub = (await client(env.app).get('/api/public/communities')).body.communities.find((c) => c.id === 'pub').memberCount;
    assert.deepEqual([detail, listed, pub], [1, 1, 1]);
  });

  test('an id beats a slug that looks like it', async () => {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ('x1', 'pub', 'Lookalike', 'public', 'own')`);
    try { assert.equal((await ana.get('/api/communities/pub')).body.community.id, 'pub'); } finally { await q(`delete from communities where id = 'x1'`); }
  });
});

describe('merging All Hands into AlumniZone (R4)', () => {
  test('posts and events move, the old community disappears and its address points to AlumniZone', async () => {
    await q(`update memberships set state = 'left' where community_id = 'alumnizone' and user_id = 'ben'`);
    await makeUser(env.db, { id: 'new', email: 'new@example.com', name: 'Only In All Hands' });
    await q(`insert into memberships (community_id, user_id, state, joined_at) values ('g0', 'new', 'active', now())`);
    const r = await mergeCommunity(env.db, { from: 'g0', to: 'alumnizone' });
    assert.deepEqual({ posts: r.posts, events: r.events, members: r.members }, { posts: 1, events: 1, members: 1 });
    assert.match(r.id, /^merge_/);
    assert.equal((await q(`select community_id from posts where id = 'p-all'`)).rows[0].community_id, 'alumnizone');
    assert.equal((await q(`select community_id from events where id = 'e-all'`)).rows[0].community_id, 'alumnizone');
    assert.equal((await q(`select state from memberships where community_id = 'alumnizone' and user_id = 'ben'`)).rows[0].state, 'left', 'MEM-05: someone who left AlumniZone isn’t put back');
    assert.equal((await q(`select state from memberships where community_id = 'alumnizone' and user_id = 'new'`)).rows[0].state, 'active');
    const old = await ana.get('/api/communities/g0');
    assert.equal(old.status, 404);
    assert.deepEqual(old.body.error.mergedInto, { id: 'alumnizone', slug: 'alumnizone' });
    assert.ok(!ids((await ana.get('/api/communities')).body.communities).includes('g0'), 'not listed, even for its members');
    // Members of the merged community keep that membership row (for undo); every screen that
    // loops over "my communities" must skip it rather than fail.
    const from = new Date().toISOString(); const to = at(60).toISOString();
    for (const path of ['/api/dashboard', '/api/feed', `/api/events?from=${from}&to=${to}`, '/api/search?q=harbour']) {
      assert.equal((await ana.get(path)).status, 200, `${path} still works for a member of the merged community`);
    }
    assert.ok(!ids((await ana.get('/api/dashboard')).body.communities).includes('g0'), 'nor on Home');
    assert.ok((await ana.get('/api/feed')).body.posts.some((p) => p.id === 'p-all' && p.communityId === 'alumnizone'), 'its posts show under AlumniZone');
    assert.ok(!ids((await search(ana, 'all hands', 'communities')).body.results.communities).includes('g0'), 'nor in search');
    assert.equal(await mergeCommunity(env.db, { from: 'g0', to: 'alumnizone' }), null, 'running it twice changes nothing');
  });

  test('undo moves back exactly what moved; newer AlumniZone posts stay', async () => {
    await q(`insert into posts (id, community_id, author_id, body, status, published_at) values ('p-new', 'alumnizone', 'own', 'Written after the merge', 'published', now())`);
    const r = await undoMerge(env.db, { from: 'g0' });
    assert.deepEqual(r, { posts: 1, events: 1 });
    assert.equal((await q(`select community_id from posts where id = 'p-all'`)).rows[0].community_id, 'g0');
    assert.equal((await q(`select community_id from posts where id = 'p-new'`)).rows[0].community_id, 'alumnizone');
    assert.equal((await q(`select community_id from events where id = 'e-all'`)).rows[0].community_id, 'g0');
    const back = await ana.get('/api/communities/g0');
    assert.equal(back.status, 200);
    assert.equal(back.body.community.status, 'active', 'its old status returns');
    const actions = (await q(`select action from audit_log where target_id = 'g0' order by at`)).rows.map((x) => x.action);
    assert.deepEqual(actions, ['community.merge', 'community.merge_undone']);
    await assert.rejects(undoMerge(env.db, { from: 'g0' }), /hasn’t been merged/);
  });
});

describe('onboarding', () => {
  test('a new account starts not onboarded; finishing is remembered and can’t be undone by repeating', async () => {
    const c = client(env.app);
    await c.post('/api/auth/register', { name: 'Neha Iyer', email: 'neha@example.com', password: 'a-good-password' });
    await c.post('/api/auth/verify', { token: await lastToken(env.db, 'neha@example.com') });
    assert.equal((await c.get('/api/auth/me')).body.user.onboarded, false);
    assert.equal((await c.post('/api/account/onboarded', {})).status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.onboarded, true);
    const first = (await q(`select onboarded_at from users where email = 'neha@example.com'`)).rows[0].onboarded_at;
    await c.post('/api/account/onboarded', {});
    assert.deepEqual((await q(`select onboarded_at from users where email = 'neha@example.com'`)).rows[0].onboarded_at, first);
  });
});

describe('community accents (refined design system)', () => {
  test('a new community gets the least-used accent, never lime or AlumniZone’s sky, and every view returns it', async () => {
    const used = async () => Object.fromEntries((await q(`select accent, count(*)::int as n from communities group by accent`)).rows.map((r) => [r.accent, r.n]));
    const before = await used();
    const a = await ana.post('/api/communities', { name: 'Harbour Rowers', visibility: 'public' });
    assert.equal(a.status, 201);
    const pickable = ['violet', 'amber', 'teal', 'rose', 'orange'];
    const least = Math.min(...pickable.map((x) => before[x] ?? 0));
    assert.ok(pickable.includes(a.body.community.accent));
    assert.equal(before[a.body.community.accent] ?? 0, least);
    const id = a.body.community.id;
    assert.equal((await ana.get(`/api/communities/${id}`)).body.community.accent, a.body.community.accent);
    assert.equal((await ana.get('/api/communities')).body.communities.find((x) => x.id === id).accent, a.body.community.accent);
    assert.equal((await search(ana, 'Harbour Rowers', 'communities')).body.results.communities.find((x) => x.id === id).accent, a.body.community.accent);
    assert.equal((await ana.get('/api/dashboard')).body.communities.find((x) => x.id === id).accent, a.body.community.accent);
    const b = await ana.post('/api/communities', { name: 'Harbour Swimmers', visibility: 'public' });
    assert.notEqual(b.body.community.accent, a.body.community.accent);
    await assert.rejects(q(`update communities set accent = 'lime' where id = $1`, [id]));
  });
});

describe('Home dashboard (refined design): replies, what’s new, communities to join', () => {
  // Cy is a fresh AlumniZone member (Ben left AlumniZone in an earlier test).
  let cy;
  before(async () => {
    await makeUser(env.db, { id: 'cy', email: 'cy@example.com', name: 'Cy Fernandes' });
    await q(`insert into memberships (community_id, user_id, state, joined_at) values ('alumnizone', 'cy', 'active', now())`);
    cy = await signIn(env.app, { email: 'cy@example.com', password: 'correct-horse-battery' });
  });

  test('replies to your posts leave out your own and blocked people’s; what’s new leaves out your own posts', async () => {
    await q(`insert into posts (id, community_id, author_id, body, status, published_at) values ('p-ana', 'alumnizone', 'ana', 'Ana asks about harbour ferries', 'published', now())`);
    for (const [id, who] of [['k-own', 'own'], ['k-ana', 'ana'], ['k-cy', 'cy']]) {
      await q(`insert into comments (id, post_id, author_id, body) values ($1, 'p-ana', $2, $3)`, [id, who, `reply from ${who}`]);
    }
    const mine = (await ana.get('/api/dashboard')).body;
    const r = mine.replies.find((x) => x.postId === 'p-ana');
    assert.equal(r.count, 2, 'your own reply isn’t counted');
    assert.deepEqual(r.latest.map((x) => x.id).sort(), ['k-cy', 'k-own']);
    assert.ok(!mine.recentPosts.some((p) => p.id === 'p-ana'), 'your own post isn’t “new in your communities”');
    const forCy = (await cy.get('/api/dashboard')).body;
    const p = forCy.recentPosts.find((x) => x.id === 'p-ana');
    assert.equal(p.replies, 3);
    assert.equal(p.community.accent, 'violet');
    await q(`insert into blocks (blocker_id, blocked_id) values ('ana', 'cy')`);
    try {
      assert.equal((await ana.get('/api/dashboard')).body.replies.find((x) => x.postId === 'p-ana').count, 1, 'a blocked person’s reply isn’t shown');
      assert.ok(!(await cy.get('/api/dashboard')).body.recentPosts.some((x) => x.id === 'p-ana'), 'nor their posts to you');
    } finally { await q(`delete from blocks where blocker_id = 'ana'`); }
  });

  test('communities to join are Public ones you aren’t in or waiting on', async () => {
    const ids = async (c) => (await c.get('/api/dashboard')).body.suggested.map((x) => x.id);
    const forCy = await ids(cy);
    assert.ok(forCy.includes('pub'));
    for (const id of ['pri', 'clo', 'alumnizone']) assert.ok(!forCy.includes(id), `${id} isn’t suggested`);
    await q(`insert into memberships (community_id, user_id, state) values ('pub', 'cy', 'pending')`);
    try { assert.ok(!(await ids(cy)).includes('pub'), 'a community you asked to join isn’t suggested again'); }
    finally { await q(`delete from memberships where community_id = 'pub' and user_id = 'cy'`); }
  });
});

describe('Platform Admin overview (refined design)', () => {
  test('only staff with analytics see it; totals match the database and leave out merged communities', async () => {
    await makeUser(env.db, { id: 'padm', email: 'padm@example.com', name: 'Plat Admin', roles: ['platform_admin'] });
    await makeUser(env.db, { id: 'umgr', email: 'umgr@example.com', name: 'User Manager', roles: ['user_manager'] });
    const padm = await signIn(env.app, { email: 'padm@example.com', password: 'correct-horse-battery' });
    const umgr = await signIn(env.app, { email: 'umgr@example.com', password: 'correct-horse-battery' });
    await q(`insert into communities (id, slug, name, visibility, created_by) values ('tmpm', 'harbour-temp', 'Harbour Temp', 'public', 'own')`);
    await mergeCommunity(env.db, { from: 'tmpm', to: 'alumnizone', actorId: 'own' });
    assert.equal((await ana.get('/api/admin/overview')).status, 403);
    assert.equal((await umgr.get('/api/admin/overview')).status, 403, 'a User Manager has no analytics');
    const r = await padm.get('/api/admin/overview');
    assert.equal(r.status, 200);
    const one = async (sql) => (await q(sql)).rows[0].n;
    assert.equal(r.body.totals.accounts.total, await one(`select count(*)::int as n from users`));
    assert.equal(r.body.totals.communities.total, await one(`select count(*)::int as n from communities where merged_into is null`));
    assert.equal(r.body.totals.posts, await one(`select count(*)::int as n from posts p join communities c on c.id = p.community_id where p.status = 'published' and p.deleted_at is null and c.merged_into is null`));
    assert.equal(r.body.communities.length, r.body.totals.communities.total);
    assert.ok(!r.body.communities.some((c) => c.id === 'tmpm'), 'a merged community isn’t listed');
    const pub = r.body.communities.find((c) => c.id === 'pub');
    assert.equal(pub.owner, 'Owner Person');
    assert.equal(pub.canOpen, true);
    assert.equal(r.body.communities.find((c) => c.id === 'clo').canOpen, false, 'a Closed community the admin isn’t in doesn’t open without Administrative Mode');
    assert.ok(Array.isArray(r.body.activity));
    assert.equal(typeof r.body.pendingAccounts, 'number');
  });
});
