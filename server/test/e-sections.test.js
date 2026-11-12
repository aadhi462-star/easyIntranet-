// v2 workstream E: the picture rules (E4), the pin limit (E8), section switches keeping their data
// (E1) and the once-only conversion of old module lists (E2). Edge-case IDs from
// EDGE_CASE_REGISTER.md lead each test name.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { jpeg, png, SVG, webp } from './image-fixtures.js';
import { convertSectionLists, E2, undoDataMigration } from '../lib/data-migrations.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const MB = 1024 * 1024;
const upload = async (who, cid, name, buf) => c[who].post(`/api/communities/${cid}/files`, buf,
  { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) });
const fileId = async (who, cid, name, buf) => {
  const res = await upload(who, cid, name, buf);
  assert.equal(res.status, 201, `${name} uploads`);
  return res.body.file.id;
};
const brand = (who, cid, body) => c[who].patch(`/api/communities/${cid}/branding`, body);
const page = async (cid) => (await c.own.get(`/api/communities/${cid}`)).body;
const deleted = async (id) => (await q(`select deleted_at from files where id = $1`, [id])).rows[0].deleted_at !== null;

before(async () => {
  env = await setup();
  for (const id of ['own', 'adm', 'mem']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  for (const id of ['br', 'pins', 'sw']) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, 'public', 'own')`, [id, `E ${id}`]);
    for (const [u, role] of [['own', 'owner'], ['adm', 'admin'], ['mem', 'member']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now())`, [id, u, role]);
    }
  }
  for (const id of ['own', 'adm', 'mem']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
});
after(() => env?.close());

describe('E4 logo and cover rules', () => {
  test('FIL-01 a PNG, JPEG or WebP judged from its bytes passes; the dimensions come from the header', async () => {
    assert.equal((await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'logo.jpg', jpeg(512, 512)) })).status, 200, 'a JPEG logo');
    assert.equal((await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'logo.webp', webp(300, 300)) })).status, 200, 'a WebP logo');
    assert.equal((await brand('own', 'br', { coverFileId: await fileId('own', 'br', 'cover.png', png(1600, 404)) })).status, 200, 'a cover within the 2% tolerance');
    assert.equal((await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'near.png', png(512, 505)) })).status, 200, 'a logo within the 2% tolerance');
  });

  test('FIL-01 a renamed SVG is refused at upload and never becomes the logo', async () => {
    const before = (await page('br')).community.logoUrl;
    const res = await upload('own', 'br', 'logo.png', SVG);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'FILE_TYPE');
    assert.equal((await page('br')).community.logoUrl, before);
  });

  test('FIL-01 a GIF or a PDF is an image the store accepts but a logo can’t use', async () => {
    const gif = await fileId('own', 'br', 'logo.gif', Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x00, 0x01, 0x00, 0x01]), Buffer.alloc(20)]));
    const res = await brand('own', 'br', { logoFileId: gif });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'IMAGE_TYPE');
    assert.equal(res.body.error.field, 'logoFileId');
    assert.match(res.body.error.message, /PNG, JPEG or WebP/);
    const pdf = await fileId('own', 'br', 'cover.pdf', Buffer.from('%PDF-1.4\n%%EOF\n'));
    assert.equal((await brand('own', 'br', { coverFileId: pdf })).body.error.code, 'IMAGE_TYPE');
  });

  test('FIL-01 a too-small logo, a non-square logo and a wrong-shape or small cover name the rule', async () => {
    const small = await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'small.png', png(200, 200)) });
    assert.equal(small.body.error.code, 'IMAGE_TOO_SMALL');
    assert.equal(small.body.error.message, 'This image is 200 by 200 px. Logos need at least 256 by 256.');
    const wide = await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'wide.png', png(600, 300)) });
    assert.equal(wide.body.error.code, 'IMAGE_SHAPE');
    assert.match(wide.body.error.message, /square/);
    const shape = await brand('own', 'br', { coverFileId: await fileId('own', 'br', 'cover-169.png', png(1920, 1080)) });
    assert.equal(shape.body.error.code, 'IMAGE_SHAPE');
    assert.equal(shape.body.error.field, 'coverFileId');
    assert.match(shape.body.error.message, /4:1/);
    const tiny = await brand('own', 'br', { coverFileId: await fileId('own', 'br', 'cover-small.png', png(800, 200)) });
    assert.equal(tiny.body.error.code, 'IMAGE_TOO_SMALL');
    assert.equal(tiny.body.error.message, 'This image is 800 by 200 px. Covers need at least 1600 by 400.');
  });

  test('FIL-01 an oversized logo (over 2 MB) or cover (over 5 MB) is refused', async () => {
    const logo = await brand('own', 'br', { logoFileId: await fileId('own', 'br', 'big.png', png(256, 256, { pad: 2 * MB })) });
    assert.equal(logo.body.error.code, 'IMAGE_TOO_LARGE');
    assert.match(logo.body.error.message, /Logos can be up to 2 MB\.$/);
    const cover = await brand('own', 'br', { coverFileId: await fileId('own', 'br', 'big-cover.png', png(1600, 400, { pad: 5 * MB })) });
    assert.equal(cover.body.error.code, 'IMAGE_TOO_LARGE');
    assert.match(cover.body.error.message, /Covers can be up to 5 MB\.$/);
  });

  test('COM-04 a refused picture changes nothing: not the accent sent with it, not the version, no audit row', async () => {
    const before = await page('br');
    const { rows: [{ n }] } = await q(`select count(*)::int as n from audit_log where action = 'community.branding' and target_id = 'br'`);
    const res = await brand('own', 'br', { accent: 'rose', coverFileId: await fileId('own', 'br', 'cover-bad.png', png(1600, 1600)) });
    assert.equal(res.status, 400);
    const after = await page('br');
    assert.equal(after.community.accent, before.community.accent);
    assert.equal(after.community.coverUrl, before.community.coverUrl);
    assert.equal(after.community.version, before.community.version);
    const { rows: [{ n: n2 }] } = await q(`select count(*)::int as n from audit_log where action = 'community.branding' and target_id = 'br'`);
    assert.equal(n2, n);
  });

  test('replacing or clearing a picture removes the old file from the store; audited with what was removed', async () => {
    const first = await fileId('own', 'br', 'first.png', png(256, 256));
    await brand('own', 'br', { logoFileId: first });
    const second = await fileId('own', 'br', 'second.png', png(256, 256));
    assert.equal((await brand('own', 'br', { logoFileId: second })).status, 200);
    assert.equal(await deleted(first), true, 'the replaced logo is removed');
    assert.equal(await deleted(second), false);
    assert.equal((await c.mem.get(`/api/files/${first}`)).status, 404);
    const { rows: [a] } = await q(`select context from audit_log where action = 'community.branding' and target_id = 'br' order by id desc limit 1`);
    assert.deepEqual(a.context.removedFiles, [first]);
    assert.equal((await brand('own', 'br', { logoFileId: null })).status, 200);
    assert.equal(await deleted(second), true, 'a cleared logo is removed too');
    assert.equal((await page('br')).community.logoUrl, null);
  });

  test('SET-03 two admins choosing different pictures at once keep both', async () => {
    const logo = await fileId('adm', 'br', 'adm-logo.png', png(256, 256));
    const cover = await fileId('own', 'br', 'own-cover.png', png(1600, 400));
    const before = await page('br');
    const [x, y] = await Promise.all([brand('adm', 'br', { logoFileId: logo }), brand('own', 'br', { coverFileId: cover })]);
    assert.deepEqual([x.status, y.status], [200, 200]);
    const after = await page('br');
    assert.equal(after.community.logoUrl, `/api/communities/br/logo?v=${logo}`);
    assert.equal(after.community.coverUrl, `/api/communities/br/cover?v=${cover}`);
    assert.equal(after.community.version, before.community.version + 2);
    // A settings form opened before the branding change is stale and gets a conflict, not an overwrite.
    const stale = await c.adm.patch('/api/communities/br', { version: before.community.version, description: 'Old form' });
    assert.equal(stale.body.error.code, 'STALE_VERSION');
  });
});

describe('E8 pinned posts', () => {
  const post = async (body) => (await c.own.post('/api/communities/pins/posts', { body })).body.post.id;
  const pin = (id, pinned = true) => c.adm.post(`/api/posts/${id}/pin`, { pinned });

  test('CNT-14 a community pins up to three; the fourth is refused with PIN_LIMIT', async () => {
    const ids = [await post('One'), await post('Two'), await post('Three'), await post('Four')];
    for (const id of ids.slice(0, 3)) assert.equal((await pin(id)).status, 200);
    const res = await pin(ids[3]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PIN_LIMIT');
    assert.equal(res.body.error.message, 'This community already has 3 pinned posts. Unpin one first.');
    assert.equal((await q(`select pinned from posts where id = $1`, [ids[3]])).rows[0].pinned, false);
    assert.equal((await pin(ids[0])).status, 200, 'pinning a post that is already pinned isn’t a new pin');
    assert.equal((await pin(ids[0], false)).status, 200);
    assert.equal((await pin(ids[3])).status, 200, 'after an unpin there is room again');
    // A post created already pinned counts against the same cap.
    const born = await c.own.post('/api/communities/pins/posts', { body: 'Pinned at birth', pinned: true });
    assert.equal(born.status, 409);
    assert.equal(born.body.error.code, 'PIN_LIMIT');
    assert.equal((await q(`select count(*)::int as n from posts where body = 'Pinned at birth'`)).rows[0].n, 0, 'nothing was written');
    for (const id of ids) await pin(id, false);
    const ok = await c.own.post('/api/communities/pins/posts', { body: 'Pinned at birth', pinned: true });
    assert.equal(ok.status, 201);
    await pin(ok.body.post.id, false);
  });

  test('CNT-14 a community already above three keeps its pins, and pins again only once it is under three', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push(await post(`Seeded ${i}`));
    await q(`update posts set pinned = true where id = any($1)`, [ids]); // as seeded announcements are
    const extra = await post('Extra');
    assert.equal((await pin(extra)).body.error.code, 'PIN_LIMIT');
    assert.equal((await q(`select count(*)::int as n from posts where community_id = 'pins' and pinned`)).rows[0].n, 5, 'nothing was unpinned');
    await pin(ids[0], false); await pin(ids[1], false);
    assert.equal((await pin(extra)).body.error.code, 'PIN_LIMIT', 'three is still the limit');
    await pin(ids[2], false);
    assert.equal((await pin(extra)).status, 200, 'under three, a new pin works');
  });

  test('CNT-14 deleted posts don’t count, and two pins at once can’t pass the limit', async () => {
    await q(`update posts set pinned = false where community_id = 'pins'`);
    const a = await post('A'); const b = await post('B'); const d = await post('D');
    await pin(a); await pin(b);
    assert.equal((await c.own.delete(`/api/posts/${b}`)).status, 200);
    const [x, y] = await Promise.all([pin(d), pin(await post('E'))]);
    assert.deepEqual([x.status, y.status].sort(), [200, 200], 'the deleted post freed its place');
    const [m, n] = await Promise.all([pin(await post('F')), pin(await post('G'))]);
    assert.deepEqual([m.status, n.status], [409, 409]);
    assert.equal((await q(`select count(*)::int as n from posts where community_id = 'pins' and pinned and deleted_at is null`)).rows[0].n, 3);
    assert.equal((await c.mem.post(`/api/posts/${a}/pin`, { pinned: false })).status, 403, 'members still can’t pin or unpin');
  });
});

describe('E1 section switches', () => {
  const set = async (sections) => {
    const { version } = (await page('sw')).community;
    const res = await c.own.patch('/api/communities/sw', { version, settings: { sections } });
    assert.equal(res.status, 200);
  };

  test('SET-02 switching a section off keeps its data; switching it on brings it back', async () => {
    await set(['discussions', 'events', 'resources', 'learning']);
    const p = (await c.mem.post('/api/communities/sw/posts', { body: 'Kept through the switch' })).body.post;
    const r = (await c.own.post('/api/communities/sw/resources', { title: 'Kept guide', url: 'https://example.org/g' })).body.resource;
    await set(['events', 'learning']);
    assert.deepEqual((await c.mem.get('/api/communities/sw')).body.sections, { discussions: false, events: true, resources: false, learning: true });
    assert.equal((await c.mem.get(`/api/posts/${p.id}`)).body.error.code, 'SECTION_OFF');
    assert.equal((await c.mem.get('/api/communities/sw/resources')).body.error.code, 'SECTION_OFF');
    assert.equal((await q(`select count(*)::int as n from posts where id = $1 and deleted_at is null`, [p.id])).rows[0].n, 1, 'the post is still stored');
    assert.equal((await q(`select count(*)::int as n from resources where id = $1 and deleted_at is null`, [r.id])).rows[0].n, 1, 'the resource too');
    await set(['discussions', 'events', 'resources', 'learning']);
    assert.equal((await c.mem.get(`/api/posts/${p.id}`)).body.post.body, 'Kept through the switch');
    assert.ok((await c.mem.get('/api/communities/sw/resources')).body.resources.some((x) => x.id === r.id));
  });

  test('SET-03 a section switch saved from a stale form is refused, not merged over', async () => {
    const { version } = (await page('sw')).community;
    await set(['discussions', 'events']);
    const stale = await c.adm.patch('/api/communities/sw', { version, settings: { sections: ['resources'] } });
    assert.equal(stale.body.error.code, 'STALE_VERSION');
    assert.deepEqual((await page('sw')).community.settings.sections, ['discussions', 'events']);
  });
});

describe('E2 conversion of old module lists', () => {
  const apps = (id, list) => q(`update communities set settings = jsonb_build_object('apps', $2::jsonb, 'guidelines', 'Be kind') where id = $1`, [id, JSON.stringify(list)]);

  test('converts each stored list once, logs every row, leaves no-list communities alone, and undo restores', async () => {
    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, 'public', 'own')`, [id, `Migrate ${id}`]);
    await apps('m1', ['dashboard', 'feed', 'forums', 'events', 'files', 'manuals', 'tasks', 'members']);
    await apps('m2', ['events', 'members']);
    await apps('m3', ['discussions', 'learning', 'webtabs']);
    // m4 has no list: every section stays on. m5 already has switches, which decide.
    await q(`update communities set settings = '{"sections": ["events"], "apps": ["feed"]}'::jsonb where id = 'm5'`);
    const shown = async (id) => (await q(`select settings from communities where id = $1`, [id])).rows[0].settings;
    const before = Object.fromEntries(await Promise.all(['m1', 'm2', 'm3', 'm4', 'm5', 'br'].map(async (id) => [id, await shown(id)])));
    const { rows: versions } = await q(`select id, version from communities where id = any($1)`, [['m1', 'm4']]);

    const summary = await convertSectionLists(env.db);
    assert.ok(summary.communities >= 3);
    assert.deepEqual((await shown('m1')), { guidelines: 'Be kind', sections: ['discussions', 'events', 'resources', 'learning'] },
      'feed/forums to Discussions, files/manuals to Resources; dashboard, members and parked apps dropped; Learning stays on as it showed');
    assert.deepEqual((await shown('m2')).sections, ['events'], 'a list with only Events kept Learning off before, and still does');
    assert.deepEqual((await shown('m3')).sections, ['discussions', 'learning']);
    assert.deepEqual(await shown('m4'), before.m4, 'no list: left alone');
    assert.deepEqual(await shown('m5'), before.m5, 'already has switches: left alone');
    const v = Object.fromEntries((await q(`select id, version from communities where id = any($1)`, [['m1', 'm4']])).rows.map((r) => [r.id, r.version]));
    assert.equal(v.m1, versions.find((r) => r.id === 'm1').version + 1, 'a converted row bumps its version, so open forms reload');
    assert.equal(v.m4, versions.find((r) => r.id === 'm4').version);
    // What members see doesn't change.
    assert.deepEqual((await c.own.get('/api/communities/br')).body.sections, { discussions: true, events: true, resources: true, learning: true });

    const { rows: log } = await q(`select row_key, before, after from migration_log where migration = $1 order by row_key->>'id'`, [E2]);
    assert.deepEqual(log.map((r) => r.row_key.id).filter((id) => id.startsWith('m')), ['m1', 'm2', 'm3']);
    assert.deepEqual(log.find((r) => r.row_key.id === 'm2').before, { apps: ['events', 'members'] });
    assert.deepEqual(log.find((r) => r.row_key.id === 'm2').after, { sections: ['events'] });
    const { rows: [audited] } = await q(`select context from audit_log where action = 'data_migration.apply' and target_id = $1`, [E2]);
    assert.equal(audited.context.communities, summary.communities);

    assert.equal(await convertSectionLists(env.db), null, 'runs once');
    // An Owner switches m3's sections after the conversion: undo leaves that one as they set it.
    await q(`update communities set settings = jsonb_set(settings, '{sections}', '["events"]') where id = 'm3'`);
    const undo = await undoDataMigration(env.db, E2);
    assert.equal(undo.skipped, 1);
    assert.deepEqual(await shown('m1'), before.m1, 'the old list is back');
    assert.deepEqual(await shown('m2'), before.m2);
    assert.deepEqual((await shown('m3')).sections, ['events'], 'a later change is kept');
    assert.equal(await convertSectionLists(env.db), null, 'an undone migration doesn’t run again by itself');
  });
});
