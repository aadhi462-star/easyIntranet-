// v2 workstream H: the permissions and security review. Each test pins one finding that was
// confirmed against the code and fixed (the QA report numbers them H-S1 to H-S10).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PW = 'correct-horse-battery';
const state = async (uid, cid = 'com') => (await q(`select state from memberships where community_id = $1 and user_id = $2`, [cid, uid])).rows[0]?.state;

before(async () => {
  env = await setup();
  const people = { own: [], adm: [], mod: [], mem: [], hid: [], blk: [], gone: [], req: [], pa: ['platform_admin'], ts: ['trust_safety'], plain: [], deac: [] };
  for (const [id, roles] of Object.entries(people)) await makeUser(env.db, { id, email: `${id}@example.com`, name: `Person ${id}`, roles });
  await q(`update users set status = 'deactivated' where id = 'deac'`);
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('com', 'com', 'Book Club', 'private', 'own')`);
  const ms = { own: ['owner', 'active'], adm: ['admin', 'active'], mod: ['moderator', 'active'], mem: ['member', 'active'], hid: ['member', 'active'],
    blk: ['member', 'active'], gone: ['member', 'left'], req: ['member', 'pending'] };
  for (const [u, [role, st]] of Object.entries(ms)) await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('com', $1, $2, $3, now())`, [u, role, st]);
  await q(`insert into profiles (user_id, directory_visible) values ('hid', false)`);
  await q(`insert into blocks (blocker_id, blocked_id) values ('blk', 'mem')`);
  for (const id of ['own', 'adm', 'mod', 'mem', 'pa', 'ts', 'plain']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });
});
after(() => env?.close());

describe('H security review', () => {
  test('H-S1 a Moderator can restrict, but can’t bring back someone who left, approve a request, or remove and block', async () => {
    assert.equal((await c.mod.post('/api/communities/com/members/gone', { state: 'active' })).status, 404);
    assert.equal(await state('gone'), 'left', 'nobody is added without choosing');
    assert.equal((await c.mod.post('/api/communities/com/members/req', { state: 'active' })).status, 404);
    assert.equal(await state('req'), 'pending');
    assert.equal((await c.mod.post('/api/communities/com/members/mem', { state: 'blocked' })).status, 403);
    assert.equal((await c.mod.post('/api/communities/com/members/mem', { state: 'removed' })).status, 403);
    assert.equal((await c.mod.post('/api/communities/com/members/mem', { state: 'restricted' })).status, 200);
    assert.equal((await c.mod.post('/api/communities/com/members/mem', { state: 'active' })).status, 200);
    // An Admin's removal is undone only through /lift, not by setting the state back.
    assert.equal((await c.adm.post('/api/communities/com/members/blk', { state: 'removed' })).status, 200);
    assert.equal((await c.adm.post('/api/communities/com/members/blk', { state: 'active' })).status, 404);
    assert.equal(await state('blk'), 'removed');
    await q(`update memberships set state = 'active' where community_id = 'com' and user_id = 'blk'`);
  });

  test('H-S2 a spoofed X-Forwarded-For entry doesn’t reset the sign-in limit (one trusted proxy hop)', async () => {
    const limited = await setup({ rateLimits: true });
    try {
      const codes = [];
      const anon = client(limited.app);
      for (let i = 0; i < 12; i++) {
        // The proxy appends the real address last; whatever the client put before it is ignored.
        const res = await anon.post('/api/auth/login', { email: 'nobody@example.com', password: 'x' }, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` });
        codes.push(res.status);
      }
      assert.ok(codes.includes(429), `limited after ten: ${codes}`);
    } finally { await limited.close(); }
  });

  test('H-S3 Trust & Safety can suspend a member but not a Platform Admin, nor sign them out', async () => {
    assert.equal((await c.ts.post('/api/admin/users/pa/suspend', { reason: 'test' })).status, 403);
    assert.equal((await c.ts.post('/api/admin/users/pa/sessions/revoke')).status, 403);
    assert.equal((await q(`select status from users where id = 'pa'`)).rows[0].status, 'active');
    assert.equal((await c.ts.post('/api/admin/users/plain/suspend', { reason: 'spam' })).status, 200);
    await q(`update users set status = 'active' where id = 'plain'`);
  });

  test('H-S4 Members leaves out people who turned off the directory listing, and blocked pairs; moderators still see everyone', async () => {
    const ids = (res) => (res.body.members ?? res.body.people ?? []).map((m) => m.id);
    const seen = ids(await c.mem.get('/api/communities/com/members'));
    assert.ok(seen.includes('own'));
    assert.ok(!seen.includes('hid'), 'directory listing off');
    assert.ok(!seen.includes('blk'), 'blocked pair');
    const staff = ids(await c.mod.get('/api/communities/com/members'));
    assert.ok(staff.includes('hid') && staff.includes('blk'));
  });

  test('H-S5 the connection check answers 404 for someone who blocked you, and never says blockedMe', async () => {
    const blk = await signIn(env.app, { email: 'blk@example.com', password: PW });
    assert.equal((await c.mem.get('/api/connections/blk')).status, 404);
    const mine = await blk.get('/api/connections/mem');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.relation.blockedByMe, true);
    assert.equal('blockedMe' in mine.body.relation, false);
  });

  test('H-S6 a suspended community can’t be changed by its own staff', async () => {
    await q(`update communities set status = 'suspended' where id = 'com'`);
    try {
      const v = (await q(`select version from communities where id = 'com'`)).rows[0].version;
      assert.equal((await c.own.patch('/api/communities/com', { version: v, visibility: 'public' })).body.error.code, 'SUSPENDED');
      assert.equal((await c.adm.post('/api/communities/com/members/mem', { role: 'moderator' })).body.error.code, 'SUSPENDED');
      assert.equal((await c.own.post('/api/communities/com/transfer', { toUserId: 'adm' })).body.error.code, 'SUSPENDED');
    } finally { await q(`update communities set status = 'active' where id = 'com'`); }
  });

  test('H-S7 reactivation counts wrong passwords toward the lockout', async () => {
    const anon = client(env.app);
    for (let i = 0; i < 12; i++) await anon.post('/api/auth/reactivate', { email: 'deac@example.com', password: 'wrong' });
    assert.equal((await anon.post('/api/auth/reactivate', { email: 'deac@example.com', password: PW })).status, 429, 'locked, even with the right password');
    await q(`update users set locked_until = null, failed_login_count = 0 where id = 'deac'`);
    assert.equal((await anon.post('/api/auth/reactivate', { email: 'deac@example.com', password: PW })).status, 200);
  });

  test('H-S8 an old link to a merged community doesn’t reveal a Closed new home to outsiders', async () => {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ('tgt', 'secret-home', 'Secret Home', 'closed', 'own'), ('src', 'old-club', 'Old Club', 'public', 'own')`);
    await q(`update communities set merged_into = 'tgt' where id = 'src'`);
    c.plain = await signIn(env.app, { email: 'plain@example.com', password: PW }); // H-S3 ended their sessions
    const out = await c.plain.get('/api/communities/src');
    assert.equal(out.status, 404);
    assert.ok(!JSON.stringify(out.body).includes('secret-home'));
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('tgt', 'mem', 'member', 'active', now())`);
    const inside = await c.mem.get('/api/communities/src');
    assert.equal(inside.body.error.code, 'MERGED');
    assert.equal(inside.body.error.mergedInto?.slug ?? inside.body.error.details?.mergedInto?.slug, 'secret-home');
  });

  test('H-S10 re-entering the password is rate limited', async () => {
    const limited = await setup({ rateLimits: true });
    try {
      await makeUser(limited.db, { id: 'x', email: 'x@example.com' });
      const x = await signIn(limited.app, { email: 'x@example.com', password: PW });
      const codes = [];
      for (let i = 0; i < 7; i++) codes.push((await x.post('/api/admin/confirm-password', { password: 'wrong' })).status);
      assert.ok(codes.includes(429), String(codes));
    } finally { await limited.close(); }
  });
});

describe('H-S9 a file is readable by whoever can see what it’s attached to', () => {
  const f = {};
  const status = async (who, id) => (await f[who].get(`/api/files/${id}`)).status;
  before(async () => {
    // A fresh Public community, so "can view the community" alone would let everyone in.
    for (const id of ['h9own', 'h9lrn', 'h9ta', 'h9mem', 'h9out']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `Person ${id}` });
    await q(`insert into communities (id, slug, name, visibility, created_by) values ('h9', 'h9', 'File Club', 'public', 'h9own')`);
    for (const [u, role] of [['h9own', 'owner'], ['h9lrn', 'member'], ['h9ta', 'member'], ['h9mem', 'member']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('h9', $1, $2, 'active', now())`, [u, role]);
    }
    const file = (id, by) => q(`insert into files (id, community_id, uploaded_by, name, mime, kind, size, sha256, data) values ($1, 'h9', $2, $1 || '.txt', 'text/plain', 'text', 2, 'x', 'hi')`, [id, by]);
    for (const [id, by] of [['fres', 'h9own'], ['fpub', 'h9mem'], ['fdraft', 'h9mem'], ['flesson', 'h9own'], ['fsub', 'h9lrn'], ['floose', 'h9mem']]) await file(id, by);
    await q(`insert into resources (id, community_id, kind, title, file_id, added_by) values ('r9', 'h9', 'file', 'Guide', 'fres', 'h9own')`);
    await q(`insert into posts (id, community_id, author_id, body, status) values ('p9a', 'h9', 'h9mem', 'Hello', 'published'), ('p9b', 'h9', 'h9mem', 'Draft', 'draft')`);
    await q(`insert into post_attachments (post_id, file_id) values ('p9a', 'fpub'), ('p9b', 'fdraft')`);
    await q(`insert into courses (id, community_id, title, status) values ('co9', 'h9', 'Course', 'published')`);
    await q(`insert into course_modules (id, course_id, title) values ('m9', 'co9', 'Module')`);
    await q(`insert into lessons (id, course_id, module_id, title, kind, file_ids) values ('l9', 'co9', 'm9', 'Files', 'file', '{flesson}'), ('l9a', 'co9', 'm9', 'Essay', 'text', '{}')`);
    await q(`insert into assignments (lesson_id) values ('l9a')`);
    await q(`insert into enrollments (course_id, user_id, status) values ('co9', 'h9lrn', 'active')`);
    await q(`insert into course_instructors (course_id, user_id, role) values ('co9', 'h9ta', 'teaching_assistant')`);
    await q(`insert into submissions (id, lesson_id, course_id, user_id, file_ids) values ('s9', 'l9a', 'co9', 'h9lrn', '{fsub}')`);
    for (const id of ['h9own', 'h9lrn', 'h9ta', 'h9mem', 'h9out']) f[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });
  });

  test('a library resource is readable by anyone who can view the community', async () => {
    assert.equal(await status('h9out', 'fres'), 200);
  });

  test('a published post’s attachment is readable; a draft’s only by its author', async () => {
    assert.equal(await status('h9out', 'fpub'), 200);
    assert.equal(await status('h9lrn', 'fdraft'), 404);
    assert.equal(await status('h9own', 'fdraft'), 404, 'not even the Owner: drafts are private to their author');
    assert.equal(await status('h9mem', 'fdraft'), 200);
  });

  test('a lesson file: enrolled learners and course staff, not other members', async () => {
    assert.equal(await status('h9lrn', 'flesson'), 200);
    assert.equal(await status('h9ta', 'flesson'), 200);
    assert.equal(await status('h9own', 'flesson'), 200);
    assert.equal(await status('h9mem', 'flesson'), 404);
    assert.equal(await status('h9out', 'flesson'), 404);
  });

  test('a submission: the learner and the graders, not other learners or members', async () => {
    assert.equal(await status('h9lrn', 'fsub'), 200);
    assert.equal(await status('h9ta', 'fsub'), 200);
    assert.equal(await status('h9own', 'fsub'), 200);
    assert.equal(await status('h9mem', 'fsub'), 404);
  });

  test('a file attached nowhere is the uploader’s alone', async () => {
    assert.equal(await status('h9mem', 'floose'), 200);
    assert.equal(await status('h9own', 'floose'), 404);
  });
});
