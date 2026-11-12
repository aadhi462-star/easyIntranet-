// v2 workstream E: community branding (logo, cover, accent) and enabled sections enforced on the
// server (EDGE_CASE_REGISTER.md IDs in each name where the register has one).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5ff0000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const upload = async (who, cid, name, buf) => c[who].post(`/api/communities/${cid}/files`, buf,
  { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) });
const image = async (who, cid, name = 'logo.png') => (await upload(who, cid, name, PNG)).body.file.id;
const brand = (who, cid, body) => c[who].patch(`/api/communities/${cid}/branding`, body);
const apps = async (cid, list) => q(`update communities set settings = settings || jsonb_build_object('apps', $2::jsonb) where id = $1`, [cid, JSON.stringify(list)]);
const sections = async (cid, list) => q(`update communities set settings = settings || jsonb_build_object('sections', $2::jsonb) where id = $1`, [cid, JSON.stringify(list)]);
const allOn = async (cid) => q(`update communities set settings = settings - 'apps' - 'sections' where id = $1`, [cid]);
const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const event = (who, cid, title = 'Meetup') => c[who].post(`/api/communities/${cid}/events`, { title, start: soon(48), end: soon(50) });

before(async () => {
  env = await setup();
  for (const id of ['own', 'adm', 'mod', 'mem', 'out']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  await makeUser(env.db, { id: 'pa', email: 'pa@example.com', name: 'pa person', roles: ['platform_admin'] });
  for (const [id, vis] of [['pub', 'public'], ['pri', 'private'], ['clo', 'closed'], ['oth', 'public'], ['sus', 'public'], ['del', 'public']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `Brand ${id}`, vis]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
    for (const [u, role] of [['adm', 'admin'], ['mod', 'moderator'], ['mem', 'member']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now())`, [id, u, role]);
    }
  }
  for (const id of ['own', 'adm', 'mod', 'mem', 'out', 'pa']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  c.anon = client(env.app);
});
after(() => env?.close());

describe('logo and cover', () => {
  test('COM-04 owners upload an image, then set it as the logo and cover; null clears; audited', async () => {
    const logo = await image('own', 'pub');
    const cover = await image('own', 'pub', 'cover.png');
    const set = await brand('own', 'pub', { logoFileId: logo, coverFileId: cover });
    assert.equal(set.status, 200);
    assert.equal(set.body.community.logoUrl, `/api/communities/pub/logo?v=${logo}`);
    assert.equal(set.body.community.coverUrl, `/api/communities/pub/cover?v=${cover}`);
    const got = await c.mem.get(set.body.community.logoUrl);
    assert.equal(got.status, 200);
    assert.ok(got.raw.equals(PNG));
    assert.equal(got.headers['content-type'], 'image/png');
    assert.equal(got.headers['x-content-type-options'], 'nosniff');
    assert.match(got.headers['cache-control'], /^private, max-age=\d+$/);
    assert.equal((await c.mem.get('/api/communities/pub')).body.community.logoUrl, set.body.community.logoUrl, 'the community page carries it');
    assert.equal((await c.mem.get('/api/communities')).body.communities.find((x) => x.id === 'pub').coverUrl, set.body.community.coverUrl, 'and the communities list');
    assert.ok((await c.mem.get('/api/dashboard')).body.communities.find((x) => x.id === 'pub').logoUrl, 'and Home');
    const cleared = await brand('adm', 'pub', { coverFileId: null });
    assert.equal(cleared.body.community.coverUrl, null);
    assert.equal(cleared.body.community.logoUrl, set.body.community.logoUrl, 'the logo is left alone');
    assert.equal((await c.mem.get('/api/communities/pub/cover')).status, 404);
    const { rows } = await q(`select actor_id, context from audit_log where action = 'community.branding' and target_id = 'pub' order by id`);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1].context.cover, { from: cover, to: null });
  });

  test('COM-04 a refused upload or a non-image file changes nothing: the previous logo stays', async () => {
    const before = (await c.own.get('/api/communities/pub')).body.community.logoUrl;
    const exe = await upload('own', 'pub', 'logo.png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]));
    assert.equal(exe.body.error.code, 'FILE_TYPE', 'an executable named .png is refused at upload');
    const pdf = (await upload('own', 'pub', 'logo.pdf', PDF)).body.file.id;
    const res = await brand('own', 'pub', { logoFileId: pdf });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'NOT_AN_IMAGE');
    assert.equal((await c.own.get('/api/communities/pub')).body.community.logoUrl, before);
  });

  test('only images from this community’s own store; not one already used as a resource', async () => {
    const theirs = await image('own', 'oth');
    assert.equal((await brand('own', 'pub', { logoFileId: theirs })).body.error.code, 'INVALID_FILE', 'another community’s file');
    assert.equal((await brand('own', 'pub', { logoFileId: 'fil_nope' })).body.error.code, 'INVALID_FILE');
    const used = await image('own', 'pub', 'photo.png');
    await c.own.post('/api/communities/pub/resources', { title: 'Photo', fileId: used });
    assert.equal((await brand('own', 'pub', { logoFileId: used })).body.error.code, 'INVALID_FILE', 'a resource’s file');
    assert.equal((await brand('own', 'pub', { extra: 1 })).status, 400, 'unknown fields are refused');
    assert.equal((await brand('own', 'pub', {})).status, 400, 'an empty change is refused');
  });

  test('COM-04 the logo and cover can’t be reused as a resource or an attachment, so deleting those never takes them', async () => {
    const logo = await image('own', 'oth', 'kept.png');
    const cover = await image('own', 'oth', 'kept-cover.png');
    assert.equal((await brand('own', 'oth', { logoFileId: logo, coverFileId: cover })).status, 200);
    for (const fileId of [logo, cover]) {
      assert.equal((await c.own.post('/api/communities/oth/resources', { title: 'Logo', fileId })).body.error.code, 'INVALID_FILE', 'as a resource');
      assert.equal((await c.own.post('/api/communities/oth/posts', { body: 'Look', attachments: [fileId] })).body.error.code, 'INVALID_FILE', 'as an attachment');
    }
    const r = (await c.own.post('/api/communities/oth/resources', { title: 'Other', fileId: await image('own', 'oth', 'other.png') })).body.resource;
    assert.equal((await c.own.patch(`/api/resources/${r.id}`, { version: r.version, fileId: logo })).body.error.code, 'INVALID_FILE', 'nor as a replacement file');
    assert.equal((await c.anon.get('/api/communities/oth/logo')).status, 200, 'the logo still serves');
    assert.equal((await c.anon.get('/api/communities/oth/cover')).status, 200);
  });

  test('VIS-04 an admin can only choose an image they uploaded, never a member’s', async () => {
    const theirs = await image('mem', 'pub', 'member-photo.png');
    assert.equal((await brand('own', 'pub', { logoFileId: theirs })).body.error.code, 'INVALID_FILE');
    assert.equal((await brand('adm', 'pub', { coverFileId: theirs })).body.error.code, 'INVALID_FILE');
  });

  test('SET-03 two admins saving different fields keep both; a save that changes nothing bumps nothing', async () => {
    const logo = await image('adm', 'pri', 'both.png');
    const before = (await c.own.get('/api/communities/pri')).body.community;
    await Promise.all([brand('adm', 'pri', { logoFileId: logo }), brand('own', 'pri', { accent: 'amber' })]);
    const after = (await c.own.get('/api/communities/pri')).body.community;
    assert.equal(after.logoUrl, `/api/communities/pri/logo?v=${logo}`);
    assert.equal(after.accent, 'amber');
    assert.equal(after.version, before.version + 2);
    const { rows: [{ n }] } = await q(`select count(*)::int as n from audit_log where action = 'community.branding' and target_id = 'pri'`);
    const same = await brand('own', 'pri', { accent: 'amber', logoFileId: logo });
    assert.equal(same.status, 200);
    assert.equal(same.body.community.version, after.version, 'no version bump');
    assert.equal((await c.adm.patch('/api/communities/pri', { version: after.version, description: 'Still fresh' })).status, 200, 'another admin’s open form isn’t stale');
    const { rows: [{ n: n2 }] } = await q(`select count(*)::int as n from audit_log where action = 'community.branding' and target_id = 'pri'`);
    assert.equal(n2, n, 'and no audit row');
  });

  test('members and moderators can’t change branding; outsiders can’t see Closed ones at all', async () => {
    const f = await image('mem', 'pub', 'mine.png');
    assert.equal((await brand('mem', 'pub', { logoFileId: f })).status, 403);
    assert.equal((await brand('mod', 'pub', { accent: 'rose' })).status, 403);
    assert.equal((await brand('out', 'pub', { accent: 'rose' })).status, 403);
    assert.equal((await brand('out', 'clo', { accent: 'rose' })).status, 404);
  });

  test('VIS-04 a Closed community’s logo is for members only; Private and Public ones show to anyone who sees the card', async () => {
    for (const id of ['clo', 'pri']) assert.equal((await brand('own', id, { logoFileId: await image('own', id) })).status, 200);
    assert.equal((await c.mem.get('/api/communities/clo/logo')).status, 200, 'members see it');
    assert.equal((await c.out.get('/api/communities/clo/logo')).status, 404, 'a signed-in outsider doesn’t');
    assert.equal((await c.anon.get('/api/communities/clo/logo')).status, 404, 'nor a visitor');
    assert.equal((await c.out.get('/api/communities/pri/logo')).status, 200, 'a Private card shows its logo');
    assert.equal((await c.anon.get('/api/communities/pri/logo')).status, 200);
    await q(`update memberships set state = 'left' where community_id = 'clo' and user_id = 'mem'`);
    assert.equal((await c.mem.get('/api/communities/clo/logo')).status, 404, 'someone who left loses it');
    await q(`update memberships set state = 'active' where community_id = 'clo' and user_id = 'mem'`);
  });

  test('VIS-04 signed-out visitors see Public logos on public discovery; Closed communities aren’t listed', async () => {
    const list = await c.anon.get('/api/public/communities');
    assert.equal(list.status, 200);
    const card = list.body.communities.find((x) => x.id === 'pub');
    assert.ok(card.logoUrl);
    assert.equal(list.body.communities.some((x) => x.id === 'clo'), false);
    const got = await c.anon.get(card.logoUrl);
    assert.equal(got.status, 200);
    assert.ok(got.raw.equals(PNG));
  });

  test('suspended communities show their logo only to their own staff; deleted ones to nobody', async () => {
    for (const id of ['sus', 'del']) await brand('own', id, { logoFileId: await image('own', id) });
    await q(`update communities set status = 'suspended' where id = 'sus'`);
    await q(`update communities set status = 'deleted' where id = 'del'`);
    assert.equal((await c.own.get('/api/communities/sus/logo')).status, 200, 'its owner');
    assert.equal((await c.mem.get('/api/communities/sus/logo')).status, 404, 'a member');
    assert.equal((await c.anon.get('/api/communities/sus/logo')).status, 404, 'a visitor');
    assert.equal((await brand('own', 'sus', { accent: 'rose' })).body.error.code, 'SUSPENDED', 'and it can’t be changed');
    for (const who of ['own', 'mem', 'anon', 'pa']) assert.equal((await c[who].get('/api/communities/del/logo')).status, 404);
  });

  test('platform staff see the pictures on their lists without admin mode; deleted communities list none', async () => {
    const list = (await c.pa.get('/api/admin/communities')).body.communities;
    const sus = list.find((x) => x.id === 'sus');
    assert.ok(sus.logoUrl);
    assert.equal((await c.pa.get(sus.logoUrl)).status, 200, 'a suspended community’s logo');
    assert.equal((await c.pa.get('/api/communities/clo/logo')).status, 200, 'a Closed community’s logo');
    const del = (await c.pa.get('/api/admin/communities?show=deleted')).body.communities.find((x) => x.id === 'del');
    assert.equal(del.logoUrl, null, 'a deleted community lists no logo: nobody can fetch it');
    const analytics = (await c.pa.get('/api/admin/analytics')).body.communities.find((x) => x.id === 'pub');
    assert.ok('logoUrl' in analytics && 'coverUrl' in analytics, 'the analytics list carries them');
    assert.equal((await c.pa.get('/api/admin/communities/pub')).body.community.logoUrl, (await c.own.get('/api/communities/pub')).body.community.logoUrl, 'and the community panel');
  });

  test('a deleted file clears the picture: the community falls back to its tile', async () => {
    const f = await image('own', 'oth');
    await brand('own', 'oth', { logoFileId: f });
    await q(`update files set deleted_at = now() where id = $1`, [f]);
    assert.equal((await c.mem.get('/api/communities/oth/logo')).status, 404, 'soft-deleted files are never served');
    await q(`delete from files where id = $1`, [f]);
    assert.equal((await c.mem.get('/api/communities/oth')).body.community.logoUrl, null, 'a removed file sets the logo to null');
  });
});

describe('accent', () => {
  test('Owners and Admins choose one of the six community accents; anything else is refused; audited', async () => {
    for (const bad of ['lime', 'red', '#168C70', '']) {
      const res = await brand('own', 'pub', { accent: bad });
      assert.equal(res.body.error.code, 'INVALID_ACCENT', bad);
    }
    const res = await brand('adm', 'pub', { accent: 'teal' });
    assert.equal(res.status, 200);
    assert.equal(res.body.community.accent, 'teal');
    assert.equal((await c.anon.get('/api/public/communities')).body.communities.find((x) => x.id === 'pub').accent, 'teal');
    const { rows: [a] } = await q(`select actor_id, context from audit_log where action = 'community.branding' and target_id = 'pub' order by id desc limit 1`);
    assert.equal(a.actor_id, 'adm');
    assert.equal(a.context.accent.to, 'teal');
  });

  test('a branding change bumps the version, so a stale settings form gets a conflict, not an overwrite', async () => {
    const { version } = (await c.own.get('/api/communities/pub')).body.community;
    await brand('own', 'pub', { accent: 'violet' });
    assert.equal((await c.own.patch('/api/communities/pub', { version, description: 'Old form' })).body.error.code, 'STALE_VERSION');
  });
});

describe('enabled sections', () => {
  test('no stored list means every section is on (AlumniZone and older communities)', async () => {
    await allOn('pub');
    const page = (await c.mem.get('/api/communities/pub')).body;
    assert.deepEqual(page.sections, { discussions: true, events: true, resources: true, learning: true });
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'Hello' })).status, 201);
    assert.equal((await event('mem', 'pub')).status, 201);
    assert.equal((await c.mem.get('/api/communities/pub/resources')).status, 200);
    assert.equal((await c.mem.get('/api/communities/pub/courses')).status, 200);
  });

  test('Events off: members can’t list, open, create or answer events; staff still read them but can’t add', async () => {
    await allOn('pub');
    const e = (await event('own', 'pub', 'Kept')).body.event;
    await apps('pub', ['discussions', 'resources', 'members', 'learning']);
    assert.equal((await c.mem.get('/api/communities/pub')).body.sections.events, false);
    for (const res of [await c.mem.get('/api/events?community=pub'), await c.mem.get(`/api/events/${e.id}`), await event('mem', 'pub'),
      await c.mem.put(`/api/events/${e.id}/rsvp`, { status: 'going' })]) {
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'SECTION_OFF');
    }
    assert.equal((await c.mem.get('/api/events')).body.events.some((x) => x.communityId === 'pub'), false, 'the calendar leaves it out');
    assert.equal((await c.mod.get('/api/events?community=pub')).body.events.length >= 1, true, 'a moderator still sees them');
    assert.equal((await c.own.get(`/api/events/${e.id}`)).status, 200);
    const add = await event('own', 'pub');
    assert.equal(add.status, 409);
    assert.equal(add.body.error.code, 'SECTION_OFF');
    assert.equal((await c.own.post(`/api/events/${e.id}/cancel`, { reason: 'x' })).status, 409);
    assert.equal((await c.anon.get('/api/public/communities')).body.communities.find((x) => x.id === 'pub').upcomingEvents.length, 0, 'public cards list none');
    await allOn('pub');
    assert.equal((await c.mem.get(`/api/events/${e.id}`)).status, 200, 'switched back on, the event is still there');
  });

  test('Discussions off: no new posts, replies or reactions; the list is gone for members, kept for staff', async () => {
    await allOn('pub');
    const p = (await c.mem.post('/api/communities/pub/posts', { body: 'Before the switch' })).body.post;
    assert.ok('logoUrl' in p.community && 'coverUrl' in p.community, 'post cards carry the community’s pictures');
    await apps('pub', ['events', 'resources', 'members', 'learning']);
    for (const res of [await c.mem.post('/api/communities/pub/posts', { body: 'After' }), await c.mem.get('/api/feed?community=pub'),
      await c.mem.get(`/api/posts/${p.id}`), await c.mem.post(`/api/posts/${p.id}/comments`, { body: 'Reply' }), await c.mem.put(`/api/posts/${p.id}/reactions/like`)]) {
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'SECTION_OFF');
    }
    assert.equal((await c.mem.get('/api/feed')).body.posts.some((x) => x.communityId === 'pub'), false, 'Home leaves it out');
    assert.equal((await c.mem.get('/api/search?q=before%20the%20switch')).body.results.posts.length, 0, 'search too');
    assert.equal((await c.mod.get('/api/feed?community=pub')).status, 200, 'moderators still read');
    assert.equal((await c.own.post('/api/communities/pub/posts', { body: 'Staff' })).body.error.code, 'SECTION_OFF');
    assert.equal((await c.mod.post(`/api/posts/${p.id}/remove`, { reason: 'Off topic' })).status, 200, 'moderators can still remove what’s there');
    await allOn('pub');
  });

  test('Resources off: the library is gone for members; nobody adds or edits; staff can still read and delete', async () => {
    await allOn('pub');
    const r = (await c.own.post('/api/communities/pub/resources', { title: 'Guide', url: 'https://example.org/guide' })).body.resource;
    await apps('pub', ['discussions', 'events', 'members', 'learning']);
    const list = await c.mem.get('/api/communities/pub/resources');
    assert.equal(list.status, 404);
    assert.equal(list.body.error.code, 'SECTION_OFF');
    const staff = await c.own.get('/api/communities/pub/resources');
    assert.equal(staff.status, 200);
    assert.equal(staff.body.canAdd, false);
    assert.equal((await c.own.post('/api/communities/pub/resources', { title: 'New', url: 'https://example.org/new' })).body.error.code, 'SECTION_OFF');
    assert.equal((await c.own.patch(`/api/resources/${r.id}`, { version: r.version, title: 'Edited' })).body.error.code, 'SECTION_OFF');
    assert.equal((await c.own.delete(`/api/resources/${r.id}`)).status, 200);
    await allOn('pub');
  });

  test('Learning off: the catalogue and courses are gone for members; staff read them but can’t create, enrol or edit', async () => {
    await allOn('pub');
    const course = (await c.own.post('/api/communities/pub/courses', { title: 'Kept course' })).body.course;
    await q(`update courses set status = 'published', published_at = now() where id = $1`, [course.id]); // members see it while Learning is on
    await apps('pub', ['discussions', 'events', 'resources', 'members']);
    for (const res of [await c.mem.get('/api/communities/pub/courses'), await c.mem.get(`/api/courses/${course.id}`), await c.mem.post(`/api/courses/${course.id}/enroll`)]) {
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'SECTION_OFF');
    }
    const staff = await c.own.get('/api/communities/pub/courses');
    assert.equal(staff.status, 200);
    assert.equal(staff.body.canCreate, false);
    assert.equal((await c.own.get(`/api/courses/${course.id}`)).status, 200);
    assert.equal((await c.own.post('/api/communities/pub/courses', { title: 'New' })).body.error.code, 'SECTION_OFF');
    assert.equal((await c.own.patch(`/api/courses/${course.id}`, { version: course.version, title: 'Edited' })).body.error.code, 'SECTION_OFF');
    await allOn('pub');
    assert.equal((await c.own.get(`/api/courses/${course.id}`)).body.course.title, 'Kept course', 'nothing was lost');
  });

  test('a list saved by the older settings screens maps onto sections and leaves Learning on', async () => {
    await apps('pub', ['dashboard', 'feed', 'events', 'members']);
    assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, { discussions: true, events: true, resources: false, learning: true });
    assert.equal((await c.mem.get('/api/communities/pub/courses')).status, 200);
    assert.equal((await c.mem.get('/api/communities/pub/resources')).body.error.code, 'SECTION_OFF');
    await apps('pub', ['forums', 'files', 'members']);
    assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, { discussions: true, events: false, resources: true, learning: true });
    await allOn('pub');
  });

  test('an empty list, or one with only Events (and Members), switches Learning off too', async () => {
    const off = { discussions: false, events: false, resources: false, learning: false };
    await apps('pub', []);
    assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, off);
    assert.equal((await c.mem.get('/api/communities/pub/courses')).body.error.code, 'SECTION_OFF');
    for (const list of [['events'], ['events', 'members']]) {
      await apps('pub', list);
      assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, { ...off, events: true }, list.join(','));
    }
    await allOn('pub');
  });

  test('the section switches (settings.sections) decide over an older list; unknown names are refused', async () => {
    let { version } = (await c.own.get('/api/communities/pub')).body.community;
    const bad = await c.own.patch('/api/communities/pub', { version, settings: { sections: ['events', 'tasks'] } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.field, 'sections');
    await apps('pub', ['dashboard', 'feed', 'files', 'members']);
    ({ version } = (await c.own.get('/api/communities/pub')).body.community);
    assert.equal((await c.own.patch('/api/communities/pub', { version, settings: { sections: ['events'] } })).status, 200);
    assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, { discussions: false, events: true, resources: false, learning: false });
    await sections('pub', []);
    assert.deepEqual((await c.mem.get('/api/communities/pub')).body.sections, { discussions: false, events: false, resources: false, learning: false }, 'everything off');
    await allOn('pub');
  });

  test('VIS-02 outsiders get the same not-found for a Private community’s course whether Learning is on or off', async () => {
    await allOn('pri');
    const course = (await c.own.post('/api/communities/pri/courses', { title: 'Members only' })).body.course;
    const on = await c.out.get(`/api/courses/${course.id}`);
    await sections('pri', ['discussions', 'events', 'resources']);
    const off = await c.out.get(`/api/courses/${course.id}`);
    assert.equal(on.status, 404);
    assert.deepEqual([off.status, off.body.error.code], [on.status, on.body.error.code]);
    await allOn('pri');
  });

  test('one rule while a section is off: no approving or pinning; authors and staff can still delete', async () => {
    await allOn('pub');
    let { version } = (await c.own.get('/api/communities/pub')).body.community;
    await c.own.patch('/api/communities/pub', { version, settings: { requireApproval: true } });
    const pending = (await c.mem.post('/api/communities/pub/posts', { body: 'Waiting' })).body.post;
    const mine = (await c.own.post('/api/communities/pub/posts', { body: 'Published' })).body.post;
    const theirs = (await c.mod.post('/api/communities/pub/posts', { body: 'Not yours' })).body.post;
    const comment = (await c.mem.post(`/api/posts/${mine.id}/comments`, { body: 'My comment' })).body.comment;
    const course = (await c.own.post('/api/communities/pub/courses', { title: 'To delete' })).body.course;
    await sections('pub', ['events', 'resources']);
    assert.equal((await c.mod.post(`/api/posts/${pending.id}/approve`)).body.error.code, 'SECTION_OFF', 'approving waits');
    assert.equal((await c.own.post(`/api/posts/${mine.id}/pin`, { pinned: true })).body.error.code, 'SECTION_OFF', 'pinning waits');
    assert.equal((await c.mem.delete(`/api/posts/${theirs.id}`)).body.error.code, 'SECTION_OFF', 'a member can’t reach someone else’s post');
    assert.equal((await c.mem.delete(`/api/comments/${comment.id}`)).status, 200, 'authors delete their own comments');
    assert.equal((await c.mem.delete(`/api/posts/${pending.id}`)).status, 200, 'and their own posts');
    assert.equal((await c.own.delete(`/api/courses/${course.id}`)).status, 200, 'admins delete a course, as they delete resources');
    await allOn('pub');
    ({ version } = (await c.own.get('/api/communities/pub')).body.community);
    await c.own.patch('/api/communities/pub', { version, settings: { requireApproval: false } });
  });

  test('notifications about a switched-off section show as unavailable to members, as everywhere else', async () => {
    await allOn('pub');
    const p = (await c.own.post('/api/communities/pub/posts', { body: 'Notified' })).body.post;
    for (const u of ['mem', 'mod']) {
      await q(`insert into notifications (id, user_id, kind, actor_id, community_id, target_type, target_id, dedupe_key) values ($1, $2, 'mention', 'own', 'pub', 'post', $3, $1)`, [`ntf_off_${u}`, u, p.id]);
    }
    const mine = async (u) => (await c[u].get('/api/notifications')).body.notifications.find((n) => n.id === `ntf_off_${u}`);
    assert.equal((await mine('mem')).available, true);
    await sections('pub', ['events', 'resources', 'learning']);
    assert.equal((await mine('mem')).available, false, 'no excerpt or link for a member');
    assert.equal((await mine('mod')).available, true, 'staff still see it');
    await allOn('pub');
  });

  test('admins switch sections through the community settings, and Manage still shows them', async () => {
    const { version } = (await c.own.get('/api/communities/pub')).body.community;
    const res = await c.own.patch('/api/communities/pub', { version, settings: { apps: ['discussions', 'members'] } });
    assert.equal(res.status, 200);
    const page = (await c.own.get('/api/communities/pub')).body;
    assert.deepEqual(page.sections, { discussions: true, events: false, resources: false, learning: false });
    assert.deepEqual(page.community.settings.apps, ['discussions', 'members'], 'staff still see the stored list');
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'Still on' })).status, 201);
    assert.equal((await event('mem', 'pub')).body.error.code, 'SECTION_OFF');
    await allOn('pub');
  });

  test('topics follow the Discussions switch', async () => {
    await sections('pub', ['events']);
    assert.equal((await c.mem.get('/api/communities/pub/topics')).body.error.code, 'SECTION_OFF');
    const add = await c.own.post('/api/communities/pub/topics', { name: 'While off' });
    assert.equal(add.status, 409);
    assert.equal(add.body.error.code, 'SECTION_OFF');
    await allOn('pub');
    assert.equal((await c.mem.get('/api/communities/pub/topics')).status, 200);
    assert.equal((await c.own.post('/api/communities/pub/topics', { name: 'Back on' })).status, 201);
  });
});
