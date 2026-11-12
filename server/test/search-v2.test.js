// v2 workstream D (D9): global search across six kinds, including resources and courses, and the
// top-bar suggestions (mode=suggest). Each kind follows its own page's rules (SRC-01, SRC-02,
// SRC-05 in EDGE_CASE_REGISTER.md).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; let ana; let ben; let own;
const q = (s, p) => env.db.query(s, p);
const at = (days) => new Date(Date.now() + days * 864e5);
const search = (c, query, extra = '') => c.get(`/api/search?q=${encodeURIComponent(query)}${extra}`);
const ids = (list) => (list || []).map((x) => x.id).sort();

before(async () => {
  env = await setup();
  for (const [id, name] of [['ana', 'Ana Rao'], ['ben', 'Ben Thomas'], ['own', 'Owner Person']]) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name });
    await q(`insert into profiles (user_id, headline) values ($1, $2)`, [id, `${name}, lantern maker`]);
  }
  // pub: Public; pri: Private; clo: Closed; off: Public with Resources and Learning switched off.
  const rows = [['pub', 'Lantern Public', 'public', null], ['pri', 'Lantern Private', 'private', null], ['clo', 'Lantern Closed', 'closed', null],
    ['off', 'Lantern Quiet', 'public', { sections: ['discussions', 'events'] }]];
  for (const [id, name, vis, settings] of rows) {
    await q(`insert into communities (id, slug, name, visibility, created_by, settings) values ($1, $2, $3, $4, 'own', coalesce($5::jsonb, '{}'::jsonb))`,
      [id, name.toLowerCase().replace(/ /g, '-'), name, vis, settings ? JSON.stringify(settings) : null]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
  }
  // Ana belongs to Private, Closed and Quiet; Ben to none.
  for (const cid of ['pri', 'clo', 'off']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, 'ana', 'active', now())`, [cid]);
  const post = (id, cid, body, status = 'published') => q(`insert into posts (id, community_id, author_id, body, status, published_at) values ($1, $2, 'own', $3, $4, now())`, [id, cid, body, status]);
  await post('p-pub', 'pub', 'Lantern festival route for everyone');
  await post('p-pri', 'pri', 'Lantern budget for members only');
  await post('p-clo', 'clo', 'Lantern secret workshop');
  await post('p-sch', 'pub', 'Lantern scheduled announcement', 'scheduled');
  const res = (id, cid, title, extra = {}) => q(`insert into resources (id, community_id, kind, title, url, added_by, deleted_at) values ($1, $2, 'link', $3, 'https://example.com', 'own', $4)`,
    [id, cid, title, extra.deleted ? new Date() : null]);
  await res('r-pub', 'pub', 'Lantern safety guide');
  await res('r-pri', 'pri', 'Lantern supplier list');
  await res('r-clo', 'clo', 'Lantern closed notes');
  await res('r-off', 'off', 'Lantern quiet handbook');
  await res('r-del', 'pub', 'Lantern deleted sheet', { deleted: true });
  const course = (id, cid, title, status = 'published', visibility = 'members') => q(`insert into courses (id, community_id, title, status, visibility, created_by, published_at)
    values ($1, $2, $3, $4, $5, 'own', case when $4 = 'published' then now() end)`, [id, cid, title, status, visibility]);
  await course('c-pub', 'pub', 'Lantern making basics');
  await course('c-draft', 'pub', 'Lantern advanced draft', 'draft');
  await course('c-hidden', 'pub', 'Lantern hidden masterclass', 'published', 'hidden');
  await course('c-pri', 'pri', 'Lantern private course');
  await course('c-off', 'off', 'Lantern quiet course');
  await q(`insert into events (id, community_id, host_id, title, start_at, end_at) values ('e-pub', 'pub', 'own', 'Lantern walk', $1, $1::timestamptz + interval '1 hour')`, [at(3)]);
  ana = await signIn(env.app, { email: 'ana@example.com', password: 'correct-horse-battery' });
  ben = await signIn(env.app, { email: 'ben@example.com', password: 'correct-horse-battery' });
  own = await signIn(env.app, { email: 'own@example.com', password: 'correct-horse-battery' });
});
after(async () => { await env.close(); });

describe('resources and courses in search', () => {
  test('the response keeps its shape and adds resources and courses', async () => {
    const r = await search(ana, 'lantern');
    assert.equal(r.status, 200);
    assert.equal(r.body.q, 'lantern');
    assert.deepEqual(Object.keys(r.body.results).sort(), ['communities', 'courses', 'events', 'people', 'posts', 'resources']);
    const hit = r.body.results.resources.find((x) => x.id === 'r-pub');
    assert.deepEqual(hit.community, { id: 'pub', slug: 'lantern-public', name: 'Lantern Public' });
    assert.equal(hit.kind, 'link');
    assert.deepEqual(r.body.results.courses.find((x) => x.id === 'c-pub'), { id: 'c-pub', title: 'Lantern making basics', community: { id: 'pub', slug: 'lantern-public', name: 'Lantern Public' } });
    assert.equal((await search(ana, 'lantern', '&type=resources')).status, 200);
    assert.equal((await search(ana, 'lantern', '&type=courses')).status, 200);
  });

  test('SRC-05 resources follow the Resources page: membership, switched-off section, deleted', async () => {
    assert.deepEqual(ids((await search(ben, 'lantern', '&type=resources')).body.results.resources), ['r-pub'], 'a non-member finds only the Public community’s');
    assert.deepEqual(ids((await search(ana, 'lantern', '&type=resources')).body.results.resources), ['r-clo', 'r-pri', 'r-pub'],
      'a member finds their own; Resources switched off hides Quiet’s; deleted never');
  });

  test('SRC-05 courses follow the Learning catalogue: drafts, hidden courses, switched-off section, Private communities', async () => {
    assert.deepEqual(ids((await search(ben, 'lantern', '&type=courses')).body.results.courses), ['c-pub']);
    assert.deepEqual(ids((await search(ana, 'lantern', '&type=courses')).body.results.courses), ['c-pri', 'c-pub'], 'no draft, no hidden, no switched-off section');
    // The community's Owner manages every course there, drafts included, as the catalogue shows them.
    assert.deepEqual(ids((await search(own, 'lantern', '&type=courses')).body.results.courses), ['c-draft', 'c-hidden', 'c-pri', 'c-pub']);
    // Enrolled in a hidden course: it is in your catalogue, so search finds it.
    await q(`insert into memberships (community_id, user_id, state, joined_at) values ('pub', 'ben', 'active', now())`);
    await q(`insert into enrollments (course_id, user_id, status, enrolled_at) values ('c-hidden', 'ben', 'active', now())`);
    try {
      assert.deepEqual(ids((await search(ben, 'lantern', '&type=courses')).body.results.courses), ['c-hidden', 'c-pub']);
    } finally {
      await q(`delete from enrollments where user_id = 'ben'`);
      await q(`delete from memberships where user_id = 'ben'`);
    }
  });

  test('SRC-05 the platform’s Learning switch off hides every course', async () => {
    await q(`update feature_flags set enabled = false where key = 'learning'`);
    try {
      assert.deepEqual((await search(ana, 'lantern', '&type=courses')).body.results.courses, []);
    } finally { await q(`update feature_flags set enabled = true where key = 'learning'`); }
  });

  test('SRC-05 losing membership drops a community’s resources and courses at once', async () => {
    await q(`update memberships set state = 'removed' where community_id = 'pri' and user_id = 'ana'`);
    try {
      const r = (await search(ana, 'lantern')).body.results;
      assert.ok(!ids(r.resources).includes('r-pri'));
      assert.ok(!ids(r.courses).includes('c-pri'));
    } finally { await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'ana'`); }
  });
});

describe('suggestions (mode=suggest)', () => {
  test('at most 3 per kind across all six kinds, lighter fields', async () => {
    for (let i = 0; i < 5; i += 1) await q(`insert into resources (id, community_id, kind, title, url, added_by) values ($1, 'pub', 'link', $2, 'https://example.com', 'own')`, [`r-x${i}`, `Lantern extra ${i}`]);
    try {
      const r = await search(ana, 'lantern', '&mode=suggest');
      assert.equal(r.status, 200);
      const k = r.body.results;
      assert.deepEqual(Object.keys(k).sort(), ['communities', 'courses', 'events', 'people', 'posts', 'resources']);
      for (const list of Object.values(k)) assert.ok(list.length <= 3, 'no more than 3 of a kind');
      assert.equal(k.resources.length, 3);
      assert.deepEqual(Object.keys(k.communities[0]).sort(), ['accent', 'id', 'member', 'name', 'slug', 'visibility']);
      assert.deepEqual(Object.keys(k.posts[0]).sort(), ['community', 'excerpt', 'id']);
      // A type is ignored: suggestions always cover every kind.
      assert.equal(Object.keys((await search(ana, 'lantern', '&mode=suggest&type=people')).body.results).length, 6);
    } finally { await q(`delete from resources where id like 'r-x%'`); }
  });

  test('SRC-01 a Closed community’s name never appears in a non-member’s suggestions', async () => {
    const text = JSON.stringify((await search(ben, 'lantern', '&mode=suggest')).body);
    assert.ok(!text.includes('Lantern Closed'));
    assert.ok(!text.includes('lantern-closed'));
    assert.ok(JSON.stringify((await search(ana, 'lantern', '&mode=suggest')).body).includes('Lantern Closed'), 'a member is offered their own');
  });

  test('SRC-02 suggestions never quote a Private or Closed post, a draft or a scheduled one to a non-member', async () => {
    const text = JSON.stringify((await search(ben, 'lantern', '&mode=suggest')).body);
    for (const secret of ['budget', 'secret workshop', 'supplier list', 'private course', 'scheduled announcement']) assert.ok(!text.includes(secret), `“${secret}” must not leak`);
    assert.deepEqual(ids((await search(ben, 'lantern', '&type=posts')).body.results.posts), ['p-pub']);
  });

  test('an unknown mode is refused', async () => {
    assert.equal((await search(ana, 'lantern', '&mode=everything')).status, 400);
    assert.equal((await search(ana, 'l', '&mode=suggest')).status, 400);
  });
});
