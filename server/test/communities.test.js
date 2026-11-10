// Communities, memberships and community content (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { publishDuePosts } from '../routes/posts.js';

let env; const c = {};
const PEOPLE = ['own', 'adm', 'mod', 'mem', 'out', 'res', 'pa'];
before(async () => {
  env = await setup();
  for (const id of PEOPLE) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase(), roles: id === 'pa' ? ['platform_admin'] : [] });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
  const q = (s, p) => env.db.query(s, p);
  for (const [id, vis] of [['pub', 'public'], ['pri', 'private'], ['clo', 'closed']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `${vis} community`, vis]);
    for (const [uid, role, state] of [['own', 'owner', 'active'], ['adm', 'admin', 'active'], ['mod', 'moderator', 'active'], ['mem', 'member', 'active'], ['res', 'member', 'restricted']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, $4, now())`, [id, uid, role, state]);
    }
  }
});
after(async () => { await env.close(); });

const post = (who, cid, body = {}) => c[who].post(`/api/communities/${cid}/posts`, { body: 'Hello community', ...body });

describe('visibility and discovery', () => {
  test('VIS-04 closed communities never appear for outsiders; private and public do', async () => {
    const ids = (await c.out.get('/api/communities')).body.communities.map((x) => x.id);
    assert.ok(ids.includes('pub') && ids.includes('pri'));
    assert.ok(!ids.includes('clo'));
    assert.ok((await c.mem.get('/api/communities')).body.communities.some((x) => x.id === 'clo'), 'members see their closed community');
  });

  test('VIS-01/02 a private community shows its card to outsiders, never its content', async () => {
    const meta = await c.out.get('/api/communities/pri');
    assert.equal(meta.status, 200);
    assert.equal(meta.body.permissions.canView, false);
    const p = await post('mem', 'pri', { body: 'members only secret' });
    assert.equal((await c.out.get(`/api/feed?community=pri`)).body.error.code, 'MEMBERS_ONLY');
    const direct = await c.out.get(`/api/posts/${p.body.post.id}`);
    assert.ok([403, 404].includes(direct.status));
    assert.ok(!JSON.stringify(direct.body).includes('members only secret'));
  });

  test('VIS-03 a closed community is “not found” for outsiders, even by direct URL', async () => {
    assert.equal((await c.out.get('/api/communities/clo')).status, 404);
    const p = await post('mem', 'clo', { body: 'closed secret' });
    const res = await c.out.get(`/api/posts/${p.body.post.id}`);
    assert.equal(res.status, 404);
    assert.ok(!JSON.stringify(res.body).includes('closed secret'));
  });

  test('VIS-05 switching Public → Private protects existing posts on the next request', async () => {
    const p = await post('mem', 'pub', { body: 'was public' });
    assert.equal((await c.out.get(`/api/posts/${p.body.post.id}`)).status, 200);
    await env.db.query(`update communities set visibility = 'private' where id = 'pub'`);
    assert.notEqual((await c.out.get(`/api/posts/${p.body.post.id}`)).status, 200);
    await env.db.query(`update communities set visibility = 'public' where id = 'pub'`);
  });
});

describe('membership', () => {
  test('MEM-01 repeated joins leave one membership; Public joins instantly', async () => {
    const r = await Promise.all([1, 2, 3].map(() => c.out.post('/api/communities/pub/join')));
    assert.ok(r.every((x) => x.body.membership.state === 'active'));
    assert.equal((await env.db.query(`select count(*)::int n from memberships where community_id = 'pub' and user_id = 'out'`)).rows[0].n, 1);
  });

  test('Private join is a request; Closed needs an invitation', async () => {
    assert.equal((await c.out.post('/api/communities/pri/join', { message: 'Class of 2016' })).body.membership.state, 'pending');
    assert.equal((await c.out.post('/api/communities/clo/join')).status, 404, 'closed is not even found');
  });

  test('MEM-02/03 a withdrawn request can’t be approved afterwards', async () => {
    assert.equal((await c.out.post('/api/communities/pri/leave')).status, 200);
    const late = await c.adm.post('/api/communities/pri/requests/out/approve');
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'NOT_PENDING');
  });

  test('MEM-04 two admins deciding at once produce one outcome', async () => {
    await c.out.post('/api/communities/pri/join');
    const [a, b] = await Promise.all([c.adm.post('/api/communities/pri/requests/out/approve'), c.own.post('/api/communities/pri/requests/out/decline')]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const state = (await env.db.query(`select state from memberships where community_id = 'pri' and user_id = 'out'`)).rows[0].state;
    assert.ok(['active', 'left'].includes(state));
    await env.db.query(`update memberships set state = 'left' where community_id = 'pri' and user_id = 'out'`);
  });

  test('MEM-09 the owner can’t leave without transferring; MEM-10 nor can the last admin', async () => {
    assert.equal((await c.own.post('/api/communities/pub/leave')).body.error.code, 'OWNER_MUST_TRANSFER');
    await env.db.query(`insert into communities (id, slug, name, visibility) values ('solo', 'solo', 'solo community', 'public')`);
    await env.db.query(`insert into memberships (community_id, user_id, role, state) values ('solo', 'adm', 'admin', 'active')`);
    assert.equal((await c.adm.post('/api/communities/solo/leave')).body.error.code, 'LAST_ADMIN');
  });

  // Note: after this test 'out' is an admin of "pub" (the old owner becomes admin on transfer).
  test('PER-03 ownership transfer swaps roles atomically; the owner role is protected', async () => {
    assert.equal((await c.adm.post('/api/communities/pub/members/own', { role: 'member' })).body.error.code, 'OWNER_PROTECTED');
    assert.equal((await c.own.post('/api/communities/pub/transfer', { toUserId: 'out' })).status, 200);
    const roles = (await env.db.query(`select user_id, role from memberships where community_id = 'pub' and role in ('owner') `)).rows;
    assert.deepEqual(roles, [{ user_id: 'out', role: 'owner' }]);
    assert.equal((await env.db.query(`select role from memberships where community_id = 'pub' and user_id = 'own'`)).rows[0].role, 'admin');
    assert.equal((await c.out.post('/api/communities/pub/transfer', { toUserId: 'own' })).status, 200);
  });

  test('PER-02 / PER-01 a moderator can’t promote anyone; roles are per community', async () => {
    assert.equal((await c.mod.post('/api/communities/pub/members/mem', { role: 'admin' })).status, 403);
    assert.equal((await c.mod.post('/api/communities/pub/members/mod', { role: 'admin' })).status, 403);
    assert.equal((await c.adm.post('/api/communities/pub/members/mem', { role: 'admin' })).status, 403, 'admins can’t create peers');
    // Owner in "pub" means nothing in "solo".
    assert.equal((await c.own.get('/api/communities/solo/requests')).status, 403);
  });

  test('MEM-16 restricted members can read but not post or comment', async () => {
    assert.equal((await c.res.get('/api/feed?community=pri')).status, 200);
    assert.equal((await post('res', 'pri')).body.error.code, 'CANNOT_POST');
  });

  test('MEM-08 / VIS-12 removal takes effect on the very next request', async () => {
    assert.equal((await c.mem.get('/api/feed?community=clo')).status, 200);
    await c.adm.post('/api/communities/clo/members/mem', { state: 'removed' });
    assert.equal((await c.mem.get('/api/feed?community=clo')).status, 404);
    assert.equal((await c.mem.get('/api/feed?community=pub')).status, 200, 'other memberships unaffected (USR-07)');
    assert.equal((await c.mem.post('/api/communities/clo/join')).status, 404);
    await env.db.query(`update memberships set state = 'active' where community_id = 'clo' and user_id = 'mem'`);
  });
});

describe('Platform Admin administrative mode', () => {
  test('PER-08/10/15 opens a Closed community without joining; counts unchanged; audited', async () => {
    const before = (await c.pa.get('/api/communities/clo')).status;
    assert.equal(before, 404, 'normal mode follows normal rules (PER-09)');
    const res = await c.pa.get('/api/communities/clo', { 'x-admin-mode': '1' });
    assert.equal(res.status, 200);
    assert.equal(res.body.adminMode, true);
    assert.equal(res.body.membership, null, 'no membership created');
    const n = (await env.db.query(`select count(*)::int n from memberships where community_id = 'clo' and user_id = 'pa'`)).rows[0].n;
    assert.equal(n, 0);
    assert.equal(res.body.community.memberCount, 5, 'admin visit not counted (4 active + 1 restricted)');
    const logged = (await env.db.query(`select 1 from audit_log where action = 'admin_mode.access' and actor_id = 'pa' and target_id = 'clo'`)).rows.length;
    assert.ok(logged >= 1);
  });

  test('admin mode is only for staff with community authority', async () => {
    assert.equal((await c.out.get('/api/communities/clo', { 'x-admin-mode': '1' })).status, 404);
  });
});

describe('posts', () => {
  test('CNT-01 empty posts and comments are rejected', async () => {
    assert.equal((await post('mem', 'pub', { body: '   ' })).status, 400);
  });

  test('CNT-02 a retried publish with the same key creates one post', async () => {
    const h = { 'idempotency-key': 'pub-retry-1' };
    const a = await c.mem.post('/api/communities/pub/posts', { body: 'retry me' }, h);
    const b = await c.mem.post('/api/communities/pub/posts', { body: 'retry me' }, h);
    assert.equal(a.body.post.id, b.body.post.id);
    assert.equal((await env.db.query(`select count(*)::int n from posts where body = 'retry me'`)).rows[0].n, 1);
  });

  test('announcements, pins and Mandatory Read need a community admin (CNT-14)', async () => {
    assert.equal((await post('mem', 'pub', { type: 'announcement' })).status, 403);
    const p = await post('adm', 'pub', { type: 'announcement', mandatory: { message: 'Read the code of conduct' } });
    assert.equal(p.status, 201);
    assert.equal((await c.mem.post(`/api/posts/${p.body.post.id}/pin`, { pinned: true })).status, 403);
    assert.equal((await c.adm.post(`/api/posts/${p.body.post.id}/pin`, { pinned: true })).status, 200);
  });

  test('CNT-09 only the author edits; moderators can remove (with a reason) but not edit', async () => {
    const p = (await post('mem', 'pub', { body: 'my words' })).body.post;
    assert.equal((await c.mod.patch(`/api/posts/${p.id}`, { version: p.version, body: 'changed' })).status, 403);
    assert.equal((await c.res.delete(`/api/posts/${p.id}`)).status, 403, 'a non-moderator can’t delete others’ posts');
    assert.equal((await c.mod.post(`/api/posts/${p.id}/remove`, {})).body.error.code, 'REASON_REQUIRED');
  });

  test('CNT-03 a stale edit can’t bring back a post a moderator removed', async () => {
    const p = (await post('mem', 'pub', { body: 'to be removed' })).body.post;
    await c.mod.post(`/api/posts/${p.id}/remove`, { reason: 'Off-topic' });
    const edit = await c.mem.patch(`/api/posts/${p.id}`, { version: p.version, body: 'sneaky edit' });
    assert.equal(edit.status, 409);
    assert.equal(edit.body.error.code, 'REMOVED');
  });

  test('CNT-16 one like and one mood per member; choosing a mood replaces the old one', async () => {
    const p = (await post('mem', 'pub')).body.post;
    await Promise.all([c.out.put(`/api/posts/${p.id}/reactions/like`), c.out.put(`/api/posts/${p.id}/reactions/like`)]);
    await c.out.put(`/api/posts/${p.id}/reactions/happy`);
    const r = (await c.out.put(`/api/posts/${p.id}/reactions/sad`)).body.post.reactions;
    assert.equal(r.like, 1);
    assert.equal(r.myMood, 'sad');
    assert.equal(r.moods.happy, 0);
  });

  test('polls: 2–10 distinct options; one vote per member that can be changed', async () => {
    assert.equal((await post('mem', 'pub', { type: 'poll', poll: { options: ['Yes', 'yes'] } })).body.error.code, 'INVALID_POLL');
    const p = (await post('mem', 'pub', { type: 'poll', body: 'Lunch?', poll: { options: ['Pizza', 'Dosa'] } })).body.post;
    const [o1, o2] = p.poll.options.map((o) => o.id);
    await c.out.put(`/api/posts/${p.id}/vote`, { optionId: o1 });
    const after = (await c.out.put(`/api/posts/${p.id}/vote`, { optionId: o2 })).body.post.poll;
    assert.deepEqual(after.options.map((o) => o.votes), [0, 1]);
    assert.equal(after.myVote, o2);
  });

  test('CNT-07 replying to a deleted comment is refused; deleted comments stay as placeholders (CNT-05)', async () => {
    const p = (await post('mem', 'pub')).body.post;
    const cm = (await c.out.post(`/api/posts/${p.id}/comments`, { body: 'first!' })).body.comment;
    assert.equal((await c.mem.delete(`/api/comments/${cm.id}`)).status, 403, 'not your comment, not a moderator');
    await c.out.delete(`/api/comments/${cm.id}`);
    assert.equal((await c.mem.post(`/api/posts/${p.id}/comments`, { body: 'reply', parentId: cm.id })).body.error.code, 'PARENT_GONE');
    const full = (await c.mem.get(`/api/posts/${p.id}`)).body.post;
    assert.deepEqual(full.comments.map((x) => x.deleted), [true]);
  });

  test('review: communities that require approval hold members’ posts; moderators approve once', async () => {
    await env.db.query(`update communities set settings = '{"requireApproval": true}' where id = 'pub'`);
    const p = (await post('mem', 'pub', { body: 'please review' })).body.post;
    assert.equal(p.status, 'pending');
    assert.ok(!(await c.res.get('/api/feed?community=pub')).body.posts.some((x) => x.id === p.id), 'hidden from ordinary members');
    assert.ok((await c.mod.get('/api/feed?community=pub&view=pending')).body.posts.some((x) => x.id === p.id));
    assert.equal((await c.mod.post(`/api/posts/${p.id}/approve`)).status, 200);
    assert.equal((await c.adm.post(`/api/posts/${p.id}/approve`)).status, 409);
    await env.db.query(`update communities set settings = '{}' where id = 'pub'`);
  });

  test('SYS-04 scheduled posts publish once, even if the job runs twice', async () => {
    const p = (await post('mem', 'pub', { body: 'later', status: 'scheduled', publishAt: new Date(Date.now() + 60e3).toISOString() })).body.post;
    await env.db.query(`update posts set publish_at = now() - interval '1 second' where id = $1`, [p.id]);
    const [a, b] = await Promise.all([publishDuePosts(env.db), publishDuePosts(env.db)]);
    assert.equal(a.length + b.length, 1);
    assert.equal((await c.out.get(`/api/posts/${p.id}`)).body.post.status, 'published');
  });

  test('Mandatory Read acknowledgements are for members and count once', async () => {
    const p = (await post('adm', 'pub', { type: 'announcement', mandatory: { message: 'ok?' } })).body.post;
    await c.mem.post(`/api/posts/${p.id}/ack`);
    await c.mem.post(`/api/posts/${p.id}/ack`);
    assert.equal((await c.adm.get(`/api/posts/${p.id}`)).body.post.mandatory.ackCount, 1);
    await env.db.query(`update memberships set state = 'left' where community_id = 'pub' and user_id = 'out'`);
    assert.equal((await c.out.post(`/api/posts/${p.id}/ack`)).status, 403, 'non-members of a public community can read but not acknowledge');
  });
});

describe('home feed', () => {
  test('shows only communities you belong to, never others’ drafts, and hides blocked authors', async () => {
    const draft = (await post('mem', 'pub', { body: 'my draft', status: 'draft' })).body.post;
    const others = (await c.adm.get('/api/feed')).body.posts.map((p) => p.id);
    assert.ok(!others.includes(draft.id), 'drafts are private to the author');
    assert.ok((await c.mem.get('/api/feed?view=drafts')).body.posts.some((p) => p.id === draft.id));
    const outFeed = (await c.out.get('/api/feed')).body.posts;
    assert.ok(outFeed.every((p) => !['pri', 'clo'].includes(p.communityId)), 'no private/closed content for outsiders');
    await c.adm.post('/api/blocks/mem');
    assert.ok(!(await c.adm.get('/api/feed')).body.posts.some((p) => p.author.id === 'mem'));
    await c.adm.delete('/api/blocks/mem');
  });

  test('pagination returns a cursor and no duplicates', async () => {
    for (let i = 0; i < 4; i += 1) await post('mem', 'pri', { body: `page ${i}` });
    const first = (await c.mem.get('/api/feed?community=pri&limit=2')).body;
    const second = (await c.mem.get(`/api/feed?community=pri&limit=2&before=${encodeURIComponent(first.nextBefore)}`)).body;
    const ids = [...first.posts, ...second.posts].map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('account deletion', () => {
  test('REG-15 / COM-09 an owner must transfer their communities before deleting their account', async () => {
    const res = await c.own.post('/api/account/delete', { password: 'correct-horse-battery' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HANDOVER_REQUIRED');
    assert.match(res.body.error.message, /Transfer ownership/);
  });
});
