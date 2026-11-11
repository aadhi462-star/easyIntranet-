// Redesign Stage 4 (engagement): files, Resources, topics, attachments, notifications, Saved and
// the event waitlist (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5ff0000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const upload = (who, cid, name, buf, headers = {}) => c[who].post(`/api/communities/${cid}/files`, buf,
  { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name), ...headers });

before(async () => {
  env = await setup();
  for (const id of ['own', 'mem', 'out', 'ex']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  for (const [id, vis] of [['pub', 'public'], ['pri', 'private']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `Files ${id}`, vis]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
    for (const u of ['mem', 'ex']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, $2, 'active', now())`, [id, u]);
  }
  for (const id of ['own', 'mem', 'out', 'ex']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
});
after(() => env?.close());

describe('files', () => {
  test('FIL-01 the type comes from the bytes: renamed executables, HTML, SVG and spoofed types are refused', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    assert.equal((await upload('mem', 'pri', 'report.pdf', exe)).body.error.code, 'FILE_TYPE', 'an executable named .pdf');
    assert.equal((await upload('mem', 'pri', 'page.txt', Buffer.from('<html><script>alert(1)</script></html>'))).status, 201, 'text stays text: it is only ever downloaded');
    assert.equal((await upload('mem', 'pri', 'logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'))).body.error.code, 'FILE_TYPE');
    assert.equal((await upload('mem', 'pri', 'photo.png', PDF)).body.file.kind, 'pdf', 'a PDF named .png is stored as what it is');
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
    assert.equal((await upload('mem', 'pri', 'notes.docx', zip)).body.error.code, 'FILE_TYPE', 'a ZIP that isn’t an Office document');
    assert.equal((await upload('mem', 'pri', 'bin.txt', Buffer.from([0x61, 0x00, 0x62]))).body.error.code, 'FILE_TYPE', 'binary named .txt');
  });

  test('FIL-02 files over 10 MB are refused with the limit; empty files too', async () => {
    const big = await upload('mem', 'pri', 'big.pdf', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    assert.equal(big.status, 413);
    assert.equal((await upload('mem', 'pri', 'empty.pdf', Buffer.alloc(0))).status >= 400, true);
  });

  test('FIL-03 a retried upload with the same key stores one file', async () => {
    const h = { 'idempotency-key': 'up-1' };
    const a = await upload('mem', 'pri', 'retry.pdf', PDF, h);
    const b = await upload('mem', 'pri', 'retry.pdf', PDF, h);
    assert.equal(a.body.file.id, b.body.file.id);
    assert.equal((await q(`select count(*)::int as n from files where name = 'retry.pdf'`)).rows[0].n, 1);
  });

  test('FIL-05 a file opens only for people who can open its community; served as a download, never a page', async () => {
    const f = (await upload('mem', 'pri', 'private.pdf', PDF)).body.file;
    const ok = await c.mem.get(`/api/files/${f.id}`);
    assert.equal(ok.status, 200);
    assert.ok(ok.raw.equals(PDF));
    assert.match(ok.headers['content-disposition'], /^attachment/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.match(ok.headers['content-security-policy'], /sandbox/);
    assert.equal((await c.out.get(`/api/files/${f.id}`)).status, 404, 'an outsider with the link gets nothing');
    await q(`update memberships set state = 'left' where community_id = 'pri' and user_id = 'ex'`);
    assert.equal((await c.ex.get(`/api/files/${f.id}`)).status, 404, 'nor someone who has left');
    await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'ex'`);
    assert.equal((await c.out.post(`/api/communities/pri/files`, PDF, { 'content-type': 'application/octet-stream' })).status, 403, 'outsiders can’t upload');
  });

  test('FIL-08 two files with the same name are two files', async () => {
    const a = (await upload('mem', 'pub', 'agenda.pdf', PDF)).body.file;
    const b = (await upload('own', 'pub', 'agenda.pdf', PDF)).body.file;
    assert.notEqual(a.id, b.id);
    assert.equal(a.name, b.name);
  });
});

describe('resources', () => {
  test('admins add links and files; members only when the community allows it; links must be http(s)', async () => {
    assert.equal((await c.mem.post('/api/communities/pub/resources', { title: 'Guide', url: 'https://example.org/guide' })).status, 403);
    assert.equal((await c.own.post('/api/communities/pub/resources', { title: 'Bad', url: 'javascript:alert(1)' })).body.error.code, 'INVALID_URL');
    const link = await c.own.post('/api/communities/pub/resources', { title: 'Alumni handbook', url: 'https://example.org/handbook', category: 'Guides' });
    assert.equal(link.status, 201);
    await q(`update communities set settings = settings || '{"membersAddResources": true}'::jsonb where id = 'pub'`);
    const f = (await upload('mem', 'pub', 'slides.pdf', PDF)).body.file;
    const file = await c.mem.post('/api/communities/pub/resources', { title: 'Meet-up slides', fileId: f.id, category: 'Slides' });
    assert.equal(file.status, 201);
    assert.equal(file.body.resource.file.name, 'slides.pdf');
    assert.equal((await c.mem.post('/api/communities/pub/resources', { title: 'Again', fileId: f.id })).body.error.code, 'INVALID_FILE', 'a file is used once');
    const list = await c.out.get('/api/communities/pub/resources?category=Slides');
    assert.deepEqual(list.body.resources.map((r) => r.title), ['Meet-up slides'], 'a Public community’s library is readable');
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources?q=handbook')).body.resources.map((r) => r.title), ['Alumni handbook']);
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources?q=%25')).body.resources, [], 'wildcards are literal');
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources')).body.categories, ['Guides', 'Slides']);
  });

  test('FIL-06 a resource stays when the person who added it is deleted, credited to a former member', async () => {
    const f = (await upload('ex', 'pub', 'ex.pdf', PDF)).body.file;
    const r = (await c.ex.post('/api/communities/pub/resources', { title: 'From ex', fileId: f.id })).body.resource;
    await q(`update users set status = 'deleted' where id = 'ex'`);
    try {
      const got = (await c.own.get('/api/communities/pub/resources')).body.resources.find((x) => x.id === r.id);
      assert.equal(got.addedBy.name, 'Former member');
      assert.equal((await c.own.get(`/api/files/${f.id}`)).status, 200);
    } finally { await q(`update users set status = 'active' where id = 'ex'`); }
  });

  test('FIL-09 replacing a file keeps the resource and its link; the old file stops downloading; edits are version-checked', async () => {
    const f1 = (await upload('own', 'pub', 'v1.pdf', PDF)).body.file;
    const r = (await c.own.post('/api/communities/pub/resources', { title: 'Programme', fileId: f1.id })).body.resource;
    const f2 = (await upload('own', 'pub', 'v2.pdf', PDF)).body.file;
    const up = await c.own.patch(`/api/resources/${r.id}`, { fileId: f2.id, version: r.version });
    assert.equal(up.status, 200);
    assert.equal(up.body.resource.id, r.id);
    assert.equal(up.body.resource.file.id, f2.id);
    assert.equal((await c.own.get(`/api/files/${f1.id}`)).status, 404);
    assert.equal((await c.own.patch(`/api/resources/${r.id}`, { title: 'Stale', version: r.version })).body.error.code, 'STALE_VERSION');
    assert.equal((await c.mem.patch(`/api/resources/${r.id}`, { title: 'Not mine', version: up.body.resource.version })).status, 403, 'a member can’t edit someone else’s');
  });

  test('FIL-07 a deleted resource and its file stop opening at once', async () => {
    const f = (await upload('own', 'pub', 'gone.pdf', PDF)).body.file;
    const r = (await c.own.post('/api/communities/pub/resources', { title: 'Gone soon', fileId: f.id })).body.resource;
    assert.equal((await c.own.delete(`/api/resources/${r.id}`)).status, 200);
    assert.equal((await c.own.get(`/api/files/${f.id}`)).status, 404);
    assert.ok(!(await c.own.get('/api/communities/pub/resources')).body.resources.some((x) => x.id === r.id));
  });

  test('a Private community’s library is members only', async () => {
    assert.equal((await c.out.get('/api/communities/pri/resources')).status, 403);
    assert.equal((await c.mem.get('/api/communities/pri/resources')).status, 200);
  });
});
