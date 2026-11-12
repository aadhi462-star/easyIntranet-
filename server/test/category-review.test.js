// v2 decision D6: categories set by a reviewed list, not a silent mapping. The dry run, who may
// read and apply it, applying the confirmed list once (logged, audited) and undoing it.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { client, makeUser, setup, signIn } from './helpers.js';
import { D6, proposeCategory, undoDataMigration } from '../lib/data-migrations.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PW = 'correct-horse-battery';
const categories = async () => Object.fromEntries((await q(`select id, category from communities`)).rows.map((r) => [r.id, r.category]));
const counts = async () => (await q(`select (select count(*)::int from data_migrations) as dm, (select count(*)::int from migration_log) as ml,
  (select count(*)::int from audit_log) as al, (select coalesce(sum(version), 0)::int from communities) as v`)).rows[0];

// The seed's communities as runSeed stores them: AlumniZone ('Alumni') and each prototype group
// with its old type as the category. All Hands is merged into AlumniZone by the seed.
const proto = JSON.parse(await readFile(new URL('../seed/prototype.json', import.meta.url), 'utf8'));
const EXPECTED = {
  alumnizone: 'Alumni', g1: 'Alumni', g2: 'Alumni', g3: 'Hobbies and Interests', g4: 'Hobbies and Interests',
  g5: 'Alumni', g6: 'Organisation', g7: 'Alumni', tech: 'Technology', blank: 'Other', sport: 'Other', arch: 'Alumni',
};

before(async () => {
  env = await setup();
  await makeUser(env.db, { id: 'pa', email: 'pa@example.com', name: 'Aisha Admin', roles: ['platform_admin'] });
  await makeUser(env.db, { id: 'cm', email: 'cm@example.com', name: 'Cory Communities', roles: ['community_manager'] });
  await makeUser(env.db, { id: 'um', email: 'um@example.com', name: 'Uma Users', roles: ['user_manager'] });
  for (const id of ['own', 'mem']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  const add = (id, name, category, extra = {}) => q(`insert into communities (id, slug, name, category, visibility, status, merged_into, created_by) values ($1, $1, $2, $3, 'public', $4, $5, 'own')`,
    [id, name, category, extra.status ?? 'active', extra.mergedInto ?? null]);
  await add('alumnizone', 'AlumniZone', 'Alumni');
  for (const g of proto.groups) await add(g.id, g.name, g.type, g.id === 'g0' ? { mergedInto: 'alumnizone' } : {});
  await add('tech', 'Tech Talk', 'technology');
  await add('blank', 'No Type Yet', null);
  await add('sport', 'Cricket Club', 'Sports');
  await add('arch', 'Old Batch', 'BATCH', { status: 'archived' });
  await add('gone', 'Deleted Place', 'City', { status: 'deleted' });
  await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('g3', 'own', 'owner', 'active', now()), ('g3', 'mem', 'member', 'active', now())`);
  for (const id of ['pa', 'cm', 'um', 'own', 'mem']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });
});
after(() => env?.close());

describe('D6 category review', () => {
  test('the dry run writes nothing and matches the rule for the seed communities', async () => {
    const before = { cats: await categories(), counts: await counts() };
    const res = await c.pa.get('/api/admin/category-review');
    assert.equal(res.status, 200);
    assert.equal(res.body.applied, null);
    const byId = Object.fromEntries(res.body.rows.map((r) => [r.id, r]));
    assert.deepEqual(Object.keys(byId).sort(), Object.keys(EXPECTED).sort(), 'every community that isn’t deleted or merged away');
    for (const [id, proposed] of Object.entries(EXPECTED)) assert.equal(byId[id].proposed, proposed, id);
    assert.equal(byId.g3.name, 'Founders Circle');
    assert.equal(byId.g4.name, 'Mentorship Program');
    assert.equal(byId.g3.current, 'Interest');
    assert.equal(byId.blank.current, null);
    assert.deepEqual(await categories(), before.cats, 'no category changed');
    assert.deepEqual(await counts(), before.counts, 'nothing logged, audited or versioned');
    assert.equal(proposeCategory('  department '), 'Alumni');
    assert.equal(proposeCategory('hobbies and interests'), 'Hobbies and Interests');
    assert.equal(proposeCategory(''), 'Other');
  });

  test('only Platform Admins (communities permission) may read or apply', async () => {
    const list = (await c.pa.get('/api/admin/category-review')).body.rows.map((r) => ({ id: r.id, category: r.proposed }));
    for (const who of ['mem', 'own', 'um']) {
      assert.equal((await c[who].get('/api/admin/category-review')).status, 403, `${who} reads`);
      assert.equal((await c[who].post('/api/admin/category-review', { rows: list })).status, 403, `${who} applies`);
    }
    assert.equal((await client(env.app).get('/api/admin/category-review')).status, 401);
    // The Community Manager platform role holds communities.*, so it may read the review.
    assert.equal((await c.cm.get('/api/admin/category-review')).status, 200);
    assert.equal((await q(`select count(*)::int as n from data_migrations where name = $1`, [D6])).rows[0].n, 0);
  });

  test('refuses an unknown category, an unknown community and an incomplete list, writing nothing', async () => {
    const before = { cats: await categories(), counts: await counts() };
    const list = (await c.pa.get('/api/admin/category-review')).body.rows.map((r) => ({ id: r.id, category: r.proposed }));
    const bad = (await c.pa.post('/api/admin/category-review', { rows: list.map((r, i) => (i === 0 ? { ...r, category: 'Sports' } : r)) })).body;
    assert.equal(bad.error.code, 'INVALID_CATEGORY');
    const unknown = (await c.pa.post('/api/admin/category-review', { rows: [...list, { id: 'nope', category: 'Other' }] }));
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'UNKNOWN_COMMUNITY');
    assert.equal((await c.pa.post('/api/admin/category-review', { rows: [...list, { id: 'gone', category: 'Other' }] })).body.error.code, 'UNKNOWN_COMMUNITY', 'a deleted community');
    const short = (await c.pa.post('/api/admin/category-review', { rows: list.filter((r) => r.id !== 'g4') })).body;
    assert.equal(short.error.code, 'INCOMPLETE_LIST');
    assert.deepEqual(short.error.ids, ['g4']);
    assert.equal((await c.pa.post('/api/admin/category-review', { rows: [...list, list[0]] })).body.error.code, 'DUPLICATE_COMMUNITY');
    assert.equal((await c.pa.post('/api/admin/category-review', {})).status, 400);
    assert.deepEqual(await categories(), before.cats);
    assert.deepEqual(await counts(), before.counts);
  });

  test('applying writes exactly the confirmed values, logs, audits and refuses a second run', async () => {
    const before = await categories();
    const list = (await c.pa.get('/api/admin/category-review')).body.rows.map((r) => ({ id: r.id, category: r.proposed }));
    const confirmed = list.map((r) => (r.id === 'g3' ? { ...r, category: 'Business' } : r.id === 'g4' ? { ...r, category: 'professional networking' } : r));
    const res = await c.pa.post('/api/admin/category-review', { rows: confirmed });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied.by, 'Aisha Admin');
    assert.ok(res.body.applied.at);
    const after = await categories();
    const want = { ...Object.fromEntries(Object.entries(EXPECTED)), g3: 'Business', g4: 'Professional Networking', g0: before.g0, gone: before.gone };
    assert.deepEqual(after, want, 'confirmed values in their canonical spelling; merged and deleted untouched');
    // Logged: one row per community whose category changed, with its previous category.
    const { rows: log } = await q(`select row_key->>'id' as id, before->>'category' as before, after->>'category' as after from migration_log where migration = $1 order by 1`, [D6]);
    const changed = Object.keys(EXPECTED).filter((id) => before[id] !== want[id]).sort();
    assert.deepEqual(log.map((r) => r.id), changed);
    assert.ok(!changed.includes('alumnizone'), 'AlumniZone already Alumni: no write');
    assert.deepEqual(log.find((r) => r.id === 'g3'), { id: 'g3', before: 'Interest', after: 'Business' });
    assert.equal(log.find((r) => r.id === 'blank').before, null);
    const { rows: [m] } = await q(`select summary from data_migrations where name = $1`, [D6]);
    assert.equal(m.summary.communities, Object.keys(EXPECTED).length, 'unchanged rows are part of the confirmed record');
    assert.equal(m.summary.changedByStaff, 2);
    const { rows: [a] } = await q(`select actor_id, context from audit_log where action = 'data_migration.apply' and target_id = $1`, [D6]);
    assert.equal(a.actor_id, 'pa');
    assert.deepEqual(a.context.staffChanges.map((x) => x.id).sort(), ['g3', 'g4']);
    // The review now shows the confirmed record, read-only.
    const view = (await c.pa.get('/api/admin/category-review')).body;
    assert.equal(view.applied.by, 'Aisha Admin');
    assert.equal(view.rows.find((r) => r.id === 'g4').confirmed, 'Professional Networking');
    const again = await c.pa.post('/api/admin/category-review', { rows: confirmed });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ALREADY_APPLIED');
    assert.deepEqual(await categories(), after);
  });

  test('undo restores the previous categories, except where the Owner has changed it since', async () => {
    // The Owner of Founders Circle picks another category in settings afterwards.
    const { rows: [{ version }] } = await q(`select version from communities where id = 'g3'`);
    assert.equal((await c.own.patch('/api/communities/g3', { version, category: 'Technology' })).status, 200);
    const undo = await undoDataMigration(env.db, D6);
    const now = await categories();
    assert.equal(now.g4, 'Interest');
    assert.equal(now.g2, 'City');
    assert.equal(now.g6, 'Project');
    assert.equal(now.tech, 'technology');
    assert.equal(now.blank, null);
    assert.equal(now.g3, 'Technology', 'the Owner’s own choice stays');
    assert.equal(undo.skipped, 1);
    assert.ok(undo.restored >= 8);
    assert.equal((await undoDataMigration(env.db, D6)).alreadyUndone, true);
    assert.ok((await q(`select 1 from audit_log where action = 'data_migration.undo' and target_id = $1`, [D6])).rows.length);
    // The review is open again, from the categories as they are now.
    const view = (await c.pa.get('/api/admin/category-review')).body;
    assert.equal(view.applied, null);
    assert.equal(view.rows.find((r) => r.id === 'g3').proposed, 'Technology');
  });
});
