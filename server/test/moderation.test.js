// Redesign Stage 6 (community management): reporting, moderation, appeals, sanctions, deletion
// requests and analytics (MOD-*, MEM-*, DEL-*, ANL-* IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';
import { liftExpiredRestrictions } from '../routes/moderation.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PEOPLE = { own: 'owner', adm: 'admin', mod: 'moderator', mod2: 'moderator', mem: 'member', mem2: 'member', mem3: 'member' };

before(async () => {
  env = await setup();
  for (const id of [...Object.keys(PEOPLE), 'out']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('pub', 'pub', 'Mod Club', 'public', 'own')`);
  for (const [u, role] of Object.entries(PEOPLE)) await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('pub', $1, $2, 'active', now())`, [u, role]);
  for (const id of [...Object.keys(PEOPLE), 'out']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
});
after(() => env?.close());

const post = async (who, body) => (await c[who].post('/api/communities/pub/posts', { body })).body.post;
const report = (who, targetType, targetId, reason = 'harassment', note = null) => c[who].post('/api/reports', { targetType, targetId, reason, note, communityId: 'pub' });
const queue = async (who, status) => (await c[who].get(`/api/communities/pub/cases${status ? `?status=${status}` : ''}`)).body.cases;

describe('reporting', () => {
  let p; let caseId;
  test('MOD-02 reports on one item join one case; reporting twice updates your report', async () => {
    p = await post('mem', 'Something rude');
    assert.equal((await report('mem', 'post', p.id)).body.error.code, 'OWN_CONTENT');
    caseId = (await report('mem2', 'post', p.id, 'spam')).body.caseId;
    assert.equal((await report('mem3', 'post', p.id)).body.caseId, caseId);
    await report('mem2', 'post', p.id, 'harassment', 'changed my mind');
    const [cs] = await queue('mod');
    assert.equal(cs.id, caseId);
    assert.equal(cs.reportCount, 2);
    assert.deepEqual(cs.reasons, { harassment: 2 });
    assert.equal((await report('mem2', 'post', p.id, 'other')).body.error.code, 'NOTE_REQUIRED');
    assert.ok((await c.mod.get('/api/notifications')).body.notifications.some((n) => n.kind === 'report_new' && n.href.includes(caseId)));
  });

  test('MOD-11 the case keeps the item as first reported, and shows it as it is now', async () => {
    await q(`update posts set body = 'Edited to be nicer' where id = $1`, [p.id]);
    const d = (await c.mod.get(`/api/cases/${caseId}`)).body.case;
    assert.equal(d.snapshot.body, 'Something rude');
    assert.equal(d.now.body, 'Edited to be nicer');
    assert.deepEqual(d.reports.map((r) => r.n), [1, 2]);
    assert.equal(d.reports[0].reporter, undefined, 'reporters are numbered, not named (D2)');
  });

  test('MOD-01 something already deleted can’t be reported; deleted after reporting stays open and says so', async () => {
    const gone = await post('mem', 'bye');
    await c.mem.delete(`/api/posts/${gone.id}`);
    assert.equal((await report('mem2', 'post', gone.id)).status, 404);
    const later = await post('mem', 'reported then deleted');
    const id = (await report('mem2', 'post', later.id)).body.caseId;
    await c.mem.delete(`/api/posts/${later.id}`);
    const d = (await c.mod.get(`/api/cases/${id}`)).body.case;
    assert.equal(d.status, 'open');
    assert.equal(d.now.gone, true);
    await c.mod.post(`/api/cases/${id}/decide`, { action: 'dismiss' });
  });

  test('MOD-08 a burst of reports from one person is slowed down', async () => {
    // 20 reports in an hour is the limit; the 21st is refused.
    const posts = []; for (let i = 0; i < 21; i++) posts.push(await post('mem3', `p${i}`));
    for (const x of posts.slice(0, 20)) assert.equal((await report('out', 'post', x.id, 'spam')).status, 200);
    const r = await report('out', 'post', posts[20].id, 'spam');
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'TOO_MANY_REPORTS');
    await q(`delete from moderation_cases where id in (select case_id from reports where reporter_id = 'out')`);
  });

  describe('D1 who reviews', () => {
    test('a report about a Moderator goes to Owners only; about an Owner, to Platform Admins', async () => {
      const mp = await post('mod', 'mod post');
      const id = (await report('mem', 'post', mp.id)).body.caseId;
      assert.ok(!(await queue('mod')).some((x) => x.id === id), 'not to its subject');
      assert.ok(!(await queue('mod2')).some((x) => x.id === id), 'not to other Moderators');
      assert.ok(!(await queue('adm')).some((x) => x.id === id), 'not to Admins');
      assert.ok((await queue('own')).some((x) => x.id === id));
      assert.equal((await c.mod2.get(`/api/cases/${id}`)).status, 404);
      const op = await post('own', 'owner post');
      const oid = (await report('mem', 'post', op.id)).body.caseId;
      assert.ok(!(await queue('own')).some((x) => x.id === oid));
      assert.ok(!(await queue('adm')).some((x) => x.id === oid));
      assert.equal((await c.mem.get('/api/communities/pub/cases')).status, 403);
      await c.own.post(`/api/cases/${id}/decide`, { action: 'dismiss' });
    });
  });
});

describe('deciding (D3)', () => {
  let p; let caseId;
  before(async () => {
    p = await post('mem', 'Breaks the rules');
    caseId = (await report('mem2', 'post', p.id)).body.caseId;
    await report('mem3', 'post', p.id);
  });

  test('MOD-04 one reviewer at a time; a decision is applied once', async () => {
    assert.equal((await c.mod.post(`/api/cases/${caseId}/claim`)).body.case.lockedBy.me, true);
    const taken = await c.adm.post(`/api/cases/${caseId}/claim`);
    assert.equal(taken.body.error.code, 'LOCKED');
    assert.equal((await c.adm.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' })).body.error.code, 'LOCKED');
    assert.equal((await c.mod.post(`/api/cases/${caseId}/decide`, { action: 'remove' })).body.error.code, 'REASON_REQUIRED');
    const d = (await c.mod.post(`/api/cases/${caseId}/decide`, { action: 'remove', reason: 'Guideline 2: be kind', alsoWarn: true })).body.case;
    assert.equal(d.status, 'actioned');
    assert.equal((await c.mod.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' })).body.error.code, 'ALREADY_DECIDED');
    assert.equal((await q(`select status from posts where id = $1`, [p.id])).rows[0].status, 'removed');
    assert.equal((await q(`select count(*)::int as n from sanctions where case_id = $1 and kind = 'warn'`, [caseId])).rows[0].n, 1);
    assert.ok((await c.mem.get('/api/notifications')).body.notifications.some((n) => n.kind === 'moderation_action' && n.href === `/notices/${caseId}`));
    assert.ok((await c.mem3.get('/api/notifications')).body.notifications.some((n) => n.kind === 'report_actioned'));
  });

  test('the person affected sees the decision and reason, never the reports', async () => {
    const d = (await c.mem.get(`/api/cases/${caseId}`)).body.case;
    assert.equal(d.decisionReason, 'Guideline 2: be kind');
    assert.equal(d.reports, undefined);
    assert.equal(d.canAppeal, true);
    assert.equal((await c.mem2.get(`/api/cases/${caseId}`)).status, 404);
  });

  test('MOD-05 removed content can be restored, once, and the history says so', async () => {
    assert.equal((await c.mod.post(`/api/cases/${caseId}/restore`, {})).body.case.restoredAt != null, true);
    assert.equal((await q(`select status from posts where id = $1`, [p.id])).rows[0].status, 'published');
    assert.equal((await c.mod.post(`/api/cases/${caseId}/restore`, {})).body.error.code, 'CANT_RESTORE');
    const h = (await c.mod.get(`/api/cases/${caseId}`)).body.case.history.map((x) => x.action);
    assert.deepEqual(h, ['reported', 'reported', 'remove', 'restored']);
  });

  test('restricting from a case: read-only until it lifts on its own', async () => {
    const pp = await post('mem2', 'a reply-worthy post');
    const cm = (await c.mem3.post(`/api/posts/${pp.id}/comments`, { body: 'nasty reply' })).body.comment;
    const id = (await report('mem', 'comment', cm.id)).body.caseId;
    await c.mod.post(`/api/cases/${id}/decide`, { action: 'restrict', days: 7, reason: 'Cool off' });
    assert.equal((await q(`select state from memberships where community_id = 'pub' and user_id = 'mem3'`)).rows[0].state, 'restricted');
    assert.equal((await c.mem3.post('/api/communities/pub/posts', { body: 'can I?' })).status, 403);
    const listed = (await c.mod.get('/api/communities/pub/members')).body.members.find((m) => m.id === 'mem3');
    assert.ok(listed.restricted_until);
    await q(`update sanctions set until = now() - interval '1 minute' where case_id = $1`, [id]);
    assert.equal(await liftExpiredRestrictions(env.db), 1);
    assert.equal((await q(`select state from memberships where community_id = 'pub' and user_id = 'mem3'`)).rows[0].state, 'active');
  });

  test('MOD-09 a Moderator who loses the role loses the queue, and their hold on a case', async () => {
    const pp = await post('mem', 'another');
    const id = (await report('mem2', 'post', pp.id)).body.caseId;
    await c.mod2.post(`/api/cases/${id}/claim`);
    await q(`update memberships set role = 'member' where community_id = 'pub' and user_id = 'mod2'`);
    assert.equal((await c.mod2.get('/api/communities/pub/cases')).status, 403);
    assert.equal((await c.adm.post(`/api/cases/${id}/claim`)).body.case.lockedBy.me, true);
    await q(`update memberships set role = 'moderator' where community_id = 'pub' and user_id = 'mod2'`);
    await c.adm.post(`/api/cases/${id}/decide`, { action: 'dismiss' });
  });
});

describe('appeals (D4)', () => {
  test('MOD-06 one appeal, decided by someone who didn’t take the action; overturning undoes it', async () => {
    const pp = await post('mem2', 'appeal me');
    const id = (await report('mem', 'post', pp.id)).body.caseId;
    await c.mod.post(`/api/cases/${id}/decide`, { action: 'remove', reason: 'Off-topic' });
    assert.equal((await c.mem2.post(`/api/cases/${id}/appeal`, { body: '' })).body.error.code, 'INVALID_INPUT');
    assert.ok((await c.mem2.post(`/api/cases/${id}/appeal`, { body: 'It was on topic.' })).body.case.appeal);
    assert.equal((await c.mem2.post(`/api/cases/${id}/appeal`, { body: 'again' })).body.error.code, 'CANT_APPEAL');
    const [ap] = (await c.adm.get('/api/communities/pub/appeals')).body.appeals;
    assert.equal(ap.caseId, id);
    assert.equal((await c.mod.get('/api/communities/pub/appeals')).status, 403);
    assert.equal((await c.adm.post(`/api/appeals/${ap.id}/decide`, { outcome: 'overturned', note: 'It fits the topic.' })).body.outcome, 'overturned');
    assert.equal((await q(`select status from posts where id = $1`, [pp.id])).rows[0].status, 'published');
    assert.equal((await c.own.post(`/api/appeals/${ap.id}/decide`, { outcome: 'upheld', note: 'x' })).body.error.code, 'ALREADY_DECIDED');
    assert.equal((await c.mem2.get(`/api/cases/${id}`)).body.case.appeal.status, 'overturned');
  });

  test('the person who decided can’t decide the appeal', async () => {
    const pp = await post('mem3', 'x');
    const id = (await report('mem', 'post', pp.id)).body.caseId;
    await c.adm.post(`/api/cases/${id}/decide`, { action: 'remove', reason: 'Spam' });
    await c.mem3.post(`/api/cases/${id}/appeal`, { body: 'Not spam' });
    assert.equal((await c.adm.get('/api/communities/pub/appeals')).body.appeals.length, 0);
    const [ap] = (await c.own.get('/api/communities/pub/appeals')).body.appeals;
    await q(`update memberships set role = 'admin' where community_id = 'pub' and user_id = 'mod'`);
    assert.equal((await c.adm.post(`/api/appeals/${ap.id}/decide`, { outcome: 'upheld', note: 'x' })).body.error.code, 'CONFLICTED');
    await q(`update memberships set role = 'moderator' where community_id = 'pub' and user_id = 'mod'`);
    assert.equal((await c.own.post(`/api/appeals/${ap.id}/decide`, { outcome: 'upheld', note: 'Was spam.' })).body.outcome, 'upheld');
  });
});

describe('members management', () => {
  test('rank rules: Moderators warn and restrict members, only Admins remove; nobody acts upward', async () => {
    assert.equal((await c.mod.post('/api/communities/pub/members/adm/sanction', { kind: 'restrict', reason: 'x' })).body.error.code, 'RANK');
    assert.equal((await c.mod.post('/api/communities/pub/members/mem/sanction', { kind: 'remove', reason: 'x' })).status, 403);
    assert.equal((await c.adm.post('/api/communities/pub/members/own/sanction', { kind: 'warn', reason: 'x' })).body.error.code, 'OWNER_PROTECTED');
    assert.equal((await c.mod.post('/api/communities/pub/members/mem/sanction', { kind: 'restrict', reason: 'Spamming', days: 1 })).body.sanction.kind, 'restrict');
    assert.equal((await c.mod.post('/api/communities/pub/members/mem/lift')).body.ok, true);
    assert.equal((await q(`select state from memberships where community_id = 'pub' and user_id = 'mem'`)).rows[0].state, 'active');
    assert.equal((await c.mod.get('/api/communities/pub/members/mem/sanctions')).body.sanctions.length >= 1, true);
  });

  test('MEM-07 a removed member can ask again after 7 days, and is told when', async () => {
    await c.adm.post('/api/communities/pub/members/mem3/sanction', { kind: 'remove', reason: 'Repeated harassment' });
    const early = await c.mem3.post('/api/communities/pub/join');
    assert.equal(early.body.error.code, 'REMOVED');
    assert.ok(early.body.error.again);
    await q(`update memberships set updated_at = now() - interval '8 days' where community_id = 'pub' and user_id = 'mem3'`);
    assert.equal((await c.mem3.post('/api/communities/pub/join')).body.membership.state, 'active');
  });

  test('MEM-05 blocked beats a new request', async () => {
    await c.adm.post('/api/communities/pub/members/mem3/sanction', { kind: 'block', reason: 'Threats' });
    assert.equal((await c.mem3.post('/api/communities/pub/join')).status, 404);
  });
});

describe('deletion requests (D6)', () => {
  test('DEL-01 / DEL-02 / DEL-05 Owners only, name typed, one open at a time, withdraw', async () => {
    assert.equal((await c.adm.post('/api/communities/pub/deletion-request', { reason: 'r', confirmName: 'Mod Club' })).body.error.code, 'OWNER_ONLY');
    assert.equal((await c.own.post('/api/communities/pub/deletion-request', { reason: 'r', confirmName: 'mod club' })).body.error.code, 'NAME_MISMATCH');
    assert.equal((await c.own.post('/api/communities/pub/deletion-request', { reason: 'We merged with another group.', confirmName: 'Mod Club' })).body.request.status, 'open');
    assert.equal((await c.own.post('/api/communities/pub/deletion-request', { reason: 'again', confirmName: 'Mod Club' })).body.error.code, 'ALREADY_REQUESTED');
    assert.equal((await c.adm.get('/api/communities/pub/deletion-request')).body.request.status, 'open');
    assert.equal((await c.own.get('/api/communities/pub')).status, 200, 'the community keeps working while it waits');
    assert.equal((await c.own.delete('/api/communities/pub/deletion-request')).body.request.status, 'withdrawn');
    assert.equal((await c.own.delete('/api/communities/pub/deletion-request')).body.error.code, 'NOT_OPEN');
    assert.equal((await c.own.post('/api/communities/pub/deletion-request', { reason: 'Now for real.', confirmName: 'Mod Club' })).body.request.status, 'open');
    await c.own.delete('/api/communities/pub/deletion-request');
  });
});

describe('analytics (D7)', () => {
  test('ANL-06 Owners and Admins only', async () => {
    assert.equal((await c.mod.get('/api/communities/pub/analytics')).status, 404);
    assert.equal((await c.mem.get('/api/communities/pub/analytics.csv')).status, 404);
    assert.equal((await c.adm.get('/api/communities/pub/analytics')).status, 200);
  });

  test('ANL-01 / ANL-04 complete days only; quiet weeks are zeros, not gaps', async () => {
    const fresh = await post('mem', 'today only');
    void fresh;
    const r = (await c.own.get('/api/communities/pub/analytics?days=30')).body;
    assert.equal(r.days, 30);
    assert.equal(r.timeZone, 'Asia/Kolkata');
    assert.equal(r.totals.posts, 0, 'everything so far happened today, which isn’t finished');
    assert.equal(r.weekly.length, 5);
    assert.ok(r.weekly.every((w) => w.active === 0));
    await q(`update posts set published_at = now() - interval '3 days' where community_id = 'pub' and status = 'published'`);
    const r2 = (await c.own.get('/api/communities/pub/analytics?days=7')).body;
    assert.ok(r2.totals.posts > 0);
    assert.ok(r2.totals.active > 0);
    assert.ok(r2.totals.active <= r2.totals.members, 'people, not posts (ANL-02)');
  });

  test('ANL-08 / ANL-09 / ANL-10 small groups fold; CSV is safe and names its dates; exports are logged', async () => {
    await q(`insert into courses (id, community_id, title, status) values ('crs1', 'pub', '=HYPERLINK("http://x")', 'published')`);
    await q(`insert into enrollments (course_id, user_id, status, enrolled_at, completed_at) values ('crs1', 'mem', 'active', now(), now())`);
    const r = (await c.own.get('/api/communities/pub/analytics')).body;
    assert.deepEqual(r.learning[0], { id: 'crs1', title: '=HYPERLINK("http://x")', enrolled: null, completed: null });
    const csv = await c.own.get('/api/communities/pub/analytics.csv?days=7');
    assert.match(csv.headers['content-disposition'], /pub-analytics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv/);
    const text = csv.raw.toString();
    assert.ok(text.includes(`"'=HYPERLINK(""http://x"")"`), 'formula kept as text');
    assert.ok(text.includes('fewer than 5'));
    assert.equal((await q(`select count(*)::int as n from audit_log where action = 'analytics.export' and actor_id = 'own'`)).rows[0].n, 1);
  });

  test('a brand-new community shows zeros', async () => {
    const id = (await c.out.post('/api/communities', { name: 'Empty Place', visibility: 'public' })).body.community.id;
    const r = (await c.out.get(`/api/communities/${id}/analytics`)).body;
    assert.deepEqual(r.totals, { members: 1, joined: 0, left: 0, active: 0, posts: 0, replies: 0, rsvps: 0 });
    void client;
  });
});
