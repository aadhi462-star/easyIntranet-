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

describe('creating and managing communities', () => {
  test('COM-05 create is idempotent; COM-01 near-duplicate names are refused; creator is owner', async () => {
    const h = { 'idempotency-key': 'create-1' };
    const a = await c.mem.post('/api/communities', { name: 'Pune Runners', visibility: 'public' }, h);
    const b = await c.mem.post('/api/communities', { name: 'Pune Runners', visibility: 'public' }, h);
    assert.equal(a.status, 201);
    assert.equal(a.body.community.id, b.body.community.id);
    assert.equal(a.body.community.membership.role, 'owner');
    const dup = await c.out.post('/api/communities', { name: 'pune  runners!', visibility: 'private' });
    assert.equal(dup.status, 409);
    assert.equal((await c.mem.post('/api/communities', { name: 'x', visibility: 'public' })).body.error.code, 'INVALID_NAME');
  });

  test('settings accept only known keys; edits are version-checked; only admins edit', async () => {
    const id = (await c.mem.get('/api/communities')).body.communities.find((x) => x.name === 'Pune Runners').id;
    const v = (await c.mem.get(`/api/communities/${id}`)).body.community.version;
    assert.equal((await c.mem.patch(`/api/communities/${id}`, { version: v, settings: { isAdmin: true } })).body.error.code, 'FIELD_NOT_ALLOWED');
    assert.equal((await c.mem.patch(`/api/communities/${id}`, { version: v, description: 'Weekend runs', settings: { guidelines: 'Be kind' } })).status, 200);
    assert.equal((await c.mem.patch(`/api/communities/${id}`, { version: v, description: 'stale' })).body.error.code, 'STALE_VERSION');
    await c.out.post(`/api/communities/${id}/join`);
    const v2 = (await c.out.get(`/api/communities/${id}`)).body.community.version;
    assert.equal((await c.out.patch(`/api/communities/${id}`, { version: v2, name: 'Taken over' })).status, 403);
  });

  test('F7 a Private community’s join question: the answer goes with the request and admins see it', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Asking Club', visibility: 'private', settings: { joinQuestion: 'Which batch are you from?' } })).body.community.id;
    assert.equal((await c.out.post(`/api/communities/${id}/join`, { answer: 'x'.repeat(501) })).body.error.code, 'TOO_LONG');
    assert.equal((await c.out.post(`/api/communities/${id}/join`, { answer: ' 2014, Civil ', message: 'Hello' })).body.membership.state, 'pending');
    const reqs = (await c.mem.get(`/api/communities/${id}/requests`)).body;
    assert.equal(reqs.joinQuestion, 'Which batch are you from?');
    assert.deepEqual(reqs.requests.map((r) => [r.id, r.answer, r.message]), [['out', '2014, Civil', 'Hello']]);
    // A Public community asks nothing: an answer sent anyway isn't kept.
    const pub = (await c.mem.post('/api/communities', { name: 'Open Asking Club', visibility: 'public', settings: { joinQuestion: 'Ignored?' } })).body.community.id;
    await c.out.post(`/api/communities/${pub}/join`, { answer: 'Something' });
    assert.equal((await env.db.query(`select join_answer from memberships where community_id = $1 and user_id = 'out'`, [pub])).rows[0].join_answer, null);
  });

  test('VIS-13 pending requests are re-evaluated when visibility changes', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Quiet Readers', visibility: 'private' })).body.community.id;
    await c.out.post(`/api/communities/${id}/join`);
    const v = (await c.mem.get(`/api/communities/${id}`)).body.community.version;
    await c.mem.patch(`/api/communities/${id}`, { version: v, visibility: 'closed' });
    const st = (await env.db.query(`select state from memberships where community_id = $1 and user_id = 'out'`, [id])).rows[0].state;
    assert.equal(st, 'left', 'closing the community drops the request rather than granting access');
    assert.equal((await c.out.get(`/api/communities/${id}`)).status, 404);
  });

  test('F10 MEM-05 adding people invites them; nobody joins until they accept; removed members are not silently restored', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Book Club', visibility: 'closed' })).body.community.id;
    const added = await c.mem.post(`/api/communities/${id}/members`, { userIds: ['out', 'res'] });
    assert.deepEqual(added.body.results.map((r) => [r.userId, r.status]).sort(), [['out', 'invited'], ['res', 'invited']]);
    const state = async (uid) => (await env.db.query(`select state from memberships where community_id = $1 and user_id = $2`, [id, uid])).rows[0]?.state ?? null;
    assert.equal(await state('out'), null, 'an invitation, not a membership');
    assert.equal((await c.out.get(`/api/communities/${id}`)).status, 404);
    const inv = added.body.results.find((r) => r.userId === 'out').invitation;
    assert.equal((await c.out.post(`/api/me/invitations/${inv.id}/accept`)).body.membership.state, 'active');
    await c.mem.post(`/api/communities/${id}/members/out`, { state: 'removed' });
    // Removed after the invitation: adding them again sends a new invitation; they stay removed until they accept it.
    assert.equal((await c.mem.post(`/api/communities/${id}/members`, { userIds: ['out'] })).body.results[0].status, 'invited');
    assert.equal(await state('out'), 'removed');
    assert.equal((await c.out.post(`/api/communities/${id}/members`, { userIds: ['adm'] })).status, 404, 'removed member sees nothing');
  });

  test('DEL-01 / TC-03 / G6 community admins can archive; nobody deletes at once (only through the deletion review)', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Temporary Group', visibility: 'public' })).body.community.id;
    const del = await c.mem.delete(`/api/communities/${id}`);
    assert.equal(del.status, 410);
    assert.equal(del.body.error.code, 'DELETE_RETIRED');
    assert.match(del.body.error.message, /request deletion/);
    assert.equal((await c.mem.post(`/api/communities/${id}/archive`, { archived: true })).status, 200);
    assert.equal((await post('mem', id)).status, 403, 'archived communities take no new posts');
    assert.ok(!(await c.out.get('/api/communities')).body.communities.some((x) => x.id === id), 'archived ones leave discovery (VIS-14)');
    const staff = await c.pa.delete(`/api/communities/${id}`);
    assert.equal(staff.status, 410, 'platform staff too: deletion goes through Administration with the 30-day restore');
    assert.equal((await env.db.query(`select status from communities where id = $1`, [id])).rows[0].status, 'archived', 'nothing was deleted');
    assert.ok(!(await env.db.query(`select 1 from audit_log where action = 'community.delete' and target_id = $1`, [id])).rows.length);
  });
});

describe('member lists and rules', () => {
  test('restricted members are listed (so they can be un-restricted); moderators also see removed', async () => {
    const list = (await c.mod.get('/api/communities/pri/members')).body.members;
    assert.equal(list.find((m) => m.id === 'res')?.state, 'restricted');
    const memberView = (await c.mem.get('/api/communities/pri/members')).body.members;
    assert.ok(memberView.every((m) => ['active', 'restricted'].includes(m.state)));
  });

  test('G2 rule-based adds are retired (source: rule is refused); an admin can still invite someone who left on purpose', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Rule Club', visibility: 'public' })).body.community.id;
    await c.out.post(`/api/communities/${id}/join`);
    await c.out.post(`/api/communities/${id}/leave`);
    assert.equal((await c.mem.post(`/api/communities/${id}/members`, { userIds: ['out'], source: 'rule' })).status, 400);
    assert.equal((await c.mem.post(`/api/communities/${id}/members`, { userIds: ['out'], source: 'admin' })).body.results[0].status, 'invited', 'an admin can still invite them on purpose');
    assert.equal((await env.db.query(`select state from memberships where community_id = $1 and user_id = 'out'`, [id])).rows[0].state, 'left');
  });

  test('directory filters: graduation year and department, only from education the member lets people see', async () => {
    const q = (s, p) => env.db.query(s, p);
    await q(`insert into institutions (id, name) values ('ins1', 'Riverside College')`);
    await q(`insert into departments (id, institution_id, name) values ('dep_cs', 'ins1', 'Computer Science'), ('dep_me', 'ins1', 'Mechanical')`);
    await q(`insert into profiles (user_id, directory_visible) values ('mem', true), ('mod', true), ('adm', false)`);
    await q(`insert into education (user_id, institution_id, department_id, grad_year, is_primary, position) values
      ('mem', 'ins1', 'dep_cs', 2015, true, 0), ('mem', 'ins1', 'dep_me', 2018, false, 1),
      ('mod', 'ins1', 'dep_me', 2015, true, 0), ('adm', 'ins1', 'dep_cs', 2015, true, 0)`);
    const list = async (who, qs = '') => (await c[who].get(`/api/communities/pub/members${qs}`)).body;
    const all = await list('out');
    const row = (b, id) => b.members.find((m) => m.id === id);
    assert.equal(row(all, 'mem').gradYear, 2015);
    assert.deepEqual(row(all, 'mem').department, { id: 'dep_cs', name: 'Computer Science' });
    // "Off: you won’t appear in Members tabs" (profile privacy): not listed at all (H-S4).
    assert.equal(row(all, 'adm'), undefined, 'a profile hidden from the directory isn’t listed');
    assert.equal(row(all, 'own').gradYear, null);
    assert.deepEqual(all.filters, { gradYears: [2018, 2015], departments: [{ id: 'dep_cs', name: 'Computer Science' }, { id: 'dep_me', name: 'Mechanical' }] });
    const ids = (b) => b.members.map((m) => m.id).sort();
    assert.deepEqual(ids(await list('out', '?gradYear=2015')), ['mem', 'mod']);
    assert.deepEqual(ids(await list('out', '?department=dep_cs')), ['mem']);
    assert.deepEqual(ids(await list('out', '?department=computer%20science')), ['mem'], 'by name too');
    assert.deepEqual(ids(await list('out', '?gradYear=2015&department=dep_me')), ['mod'], 'both match the same entry');
    assert.deepEqual(ids(await list('out', '?gradYear=2018&department=dep_me')), ['mem']);
    assert.deepEqual(ids(await list('out', '?gradYear=1990')), []);
    // Your own education always counts for you.
    assert.ok(ids(await list('adm', '?gradYear=2015')).includes('adm'));
    assert.equal((await c.out.get('/api/communities/pub/members?gradYear=abc')).body.error.code, 'INVALID_INPUT');
    // Private community: still members only.
    assert.equal((await c.out.get('/api/communities/pri/members?gradYear=2015')).status, 403);
  });

  test('archived communities stay listed for their members only', async () => {
    const id = (await c.mem.post('/api/communities', { name: 'Old Archive', visibility: 'public' })).body.community.id;
    await c.mem.post(`/api/communities/${id}/archive`, { archived: true });
    assert.ok((await c.mem.get('/api/communities')).body.communities.some((x) => x.id === id && x.status === 'archived'));
    assert.ok(!(await c.res.get('/api/communities')).body.communities.some((x) => x.id === id));
  });
});
