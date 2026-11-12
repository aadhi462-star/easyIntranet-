// v2 workstream G (management and administration), server half: the retired membership rule and
// "Invite people who match" (G2), the visibility confirm (G4), community notification defaults
// (G5), the retired instant delete (G6, in communities.test.js) and Teaching with Teaching
// Assistants (G7). Edge-case ids in each name. Health additions (G9-G11) are in health.test.js.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { G2, retireMembershipRules, undoDataMigration } from '../lib/data-migrations.js';
import { notify } from '../lib/notify.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PW = 'correct-horse-battery';
const STAFF = ['own', 'adm', 'mod', 'ins', 'ta', 'oth', 'mem', 'mem2'];
const CANDIDATES = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];
const version = async (id = 'com') => (await q(`select version from communities where id = $1`, [id])).rows[0].version;
const settingsOf = async (id = 'com') => (await q(`select settings from communities where id = $1`, [id])).rows[0].settings;

before(async () => {
  env = await setup();
  for (const id of [...STAFF, ...CANDIDATES]) await makeUser(env.db, { id, email: `${id}@example.com`, name: `Person ${id}` });
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('com', 'com', 'Learn Club', 'private', 'own')`);
  const roles = { own: 'owner', adm: 'admin', mod: 'moderator', ins: 'member', ta: 'member', oth: 'member', mem: 'member', mem2: 'member' };
  for (const [u, role] of Object.entries(roles)) await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('com', $1, $2, 'active', now())`, [u, role]);
  for (const id of STAFF) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });

  // Profiles for matching: m1-m8 graduated in 2016 in Computer Science, m9 in 2017; m10 lives in Pune.
  await q(`insert into institutions (id, name) values ('ins1', 'Riverside College')`);
  await q(`insert into departments (id, institution_id, name) values ('dep_cs', 'ins1', 'Computer Science'), ('dep_me', 'ins1', 'Mechanical')`);
  for (const u of CANDIDATES) {
    await q(`insert into profiles (user_id, city, directory_visible) values ($1, $2, $3)`, [u, u === 'm10' ? 'Pune' : 'Bengaluru', u !== 'm2']);
    await q(`insert into education (user_id, institution_id, department_id, grad_year, is_primary) values ($1, 'ins1', $2, $3, true)`, [u, u === 'm10' ? 'dep_me' : 'dep_cs', u === 'm9' ? 2017 : 2016]);
  }
  await q(`insert into blocks (blocker_id, blocked_id) values ('m3', 'adm')`); // m3 blocked the inviter
  await q(`insert into memberships (community_id, user_id, role, state, joined_at) values
    ('com', 'm4', 'member', 'blocked', now()), ('com', 'm5', 'member', 'active', now()),
    ('com', 'm7', 'member', 'left', now()), ('com', 'm8', 'member', 'removed', now())`);
});
after(() => env?.close());

describe('G2 membership rules retire; Invite people who match', () => {
  test('G2 the data migration switches off every stored rule, once, logged and undoable; nobody is removed', async () => {
    await q(`insert into communities (id, slug, name, visibility, created_by, settings) values
      ('r1', 'r1', 'Rule One', 'public', 'own', '{"dynamicRule": {"field": "batch", "op": "eq", "value": "2016"}, "guidelines": "Be kind"}'),
      ('r2', 'r2', 'Rule Two', 'public', 'own', '{"dynamicRule": null}'),
      ('r3', 'r3', 'No Rule', 'public', 'own', '{}')`);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('r1', 'm1', 'member', 'active', now())`);
    const summary = await retireMembershipRules(env.db);
    assert.deepEqual(summary, { communities: 2, rules: 1 });
    assert.deepEqual(await settingsOf('r1'), { guidelines: 'Be kind' });
    assert.deepEqual(await settingsOf('r2'), {});
    assert.equal((await q(`select state from memberships where community_id = 'r1' and user_id = 'm1'`)).rows[0].state, 'active', 'nobody already added is removed');
    assert.equal(await retireMembershipRules(env.db), null, 'runs once');
    assert.equal((await q(`select count(*)::int as n from migration_log where migration = $1`, [G2])).rows[0].n, 2);
    assert.ok((await q(`select 1 from audit_log where action = 'data_migration.apply' and target_id = $1`, [G2])).rows.length);
    const undone = await undoDataMigration(env.db, G2);
    assert.deepEqual(undone, { restored: 2, skipped: 0 });
    assert.deepEqual((await settingsOf('r1')).dynamicRule, { field: 'batch', op: 'eq', value: '2016' });
    assert.equal(await retireMembershipRules(env.db), null, 'an undone migration doesn’t run again by itself');
  });

  test('G2 SET-08 the settings allow-list refuses a new rule; null takes an old one out', async () => {
    const res = await c.adm.patch('/api/communities/r1', { version: await version('r1'), settings: { dynamicRule: { field: 'city', op: 'eq', value: 'Pune' } } });
    assert.equal(res.status, 403, 'not an admin of r1');
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('r1', 'adm', 'admin', 'active', now())`);
    const refused = await c.adm.patch('/api/communities/r1', { version: await version('r1'), settings: { dynamicRule: { field: 'city', op: 'eq', value: 'Pune' } } });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, 'RULE_RETIRED');
    const cleared = await c.adm.patch('/api/communities/r1', { version: await version('r1'), settings: { dynamicRule: null, guidelines: 'Be kinder' } });
    assert.equal(cleared.status, 200);
    assert.deepEqual(await settingsOf('r1'), { guidelines: 'Be kinder' });
    assert.equal((await c.own.post('/api/communities', { name: 'New With Rule', visibility: 'public', settings: { dynamicRule: { field: 'batch', value: '1' } } })).body.error.code, 'RULE_RETIRED');
  });

  test('G2 MEM-05 invite-matching invites only visible, eligible matches and answers like the invitations route', async () => {
    const res = await c.adm.post('/api/communities/com/invite-matching', { batch: 2016, department: 'Computer Science' });
    assert.equal(res.status, 201);
    // m2 hides their profile from the directory, m3 blocked the inviter, m4 is blocked here, m5 is
    // a member, m7 left, m8 was removed, m9 is 2017, m10 is another department.
    assert.equal(res.body.matched, 2);
    assert.deepEqual(res.body.results.map((r) => [r.userId, r.status]), [['m1', 'invited'], ['m6', 'invited']]);
    assert.equal(res.body.results[0].invitation.role, 'member');
    assert.equal((await q(`select state from memberships where community_id = 'com' and user_id = 'm1'`)).rows.length, 0, 'nobody joins without accepting');
    const again = await c.adm.post('/api/communities/com/invite-matching', { batch: 2016, department: 'dep_cs' });
    assert.deepEqual(again.body.results.map((r) => r.status), ['open', 'open'], 'an open invitation is returned, not sent twice (MEM-12)');
    const city = await c.adm.post('/api/communities/com/invite-matching', { city: ' pune ' });
    assert.deepEqual(city.body.results.map((r) => r.userId), ['m10']);
    const { rows: audits } = await q(`select context from audit_log where action = 'community.invite_matching' and actor_id = 'adm' order by id`);
    assert.equal(audits.length, 3);
    assert.deepEqual(audits[0].context.criteria, { batch: 2016, department: 'computer science', city: null });
    assert.equal(audits[0].context.invited, 2);
    const { rows: [inv] } = await q(`select context from audit_log where action = 'community.invite' and context->>'userId' = 'm1'`);
    assert.equal(inv.context.source, 'matching');
  });

  test('G2 PER-02 only Owners and Admins; a criterion is required; the body is checked', async () => {
    for (const who of ['mod', 'mem']) assert.equal((await c[who].post('/api/communities/com/invite-matching', { batch: 2016 })).status, 403, who);
    assert.equal((await c.adm.post('/api/communities/com/invite-matching', {})).status, 400);
    assert.equal((await c.adm.post('/api/communities/com/invite-matching', { batch: 1900 })).status, 400);
    assert.equal((await c.adm.post('/api/communities/com/invite-matching', { batch: 2016, role: 'admin' })).status, 400, 'additionalProperties false');
  });
});

describe('G4 visibility impact', () => {
  test('VIS-13 Private → Public counts the requests let in; Closed drops them; content and invitations counted', async () => {
    await q(`insert into memberships (community_id, user_id, role, state) values ('com', 'm9', 'member', 'pending')`);
    await q(`insert into posts (id, community_id, author_id, body, status, published_at) values ('p1', 'com', 'own', 'Hello', 'published', now()), ('p2', 'com', 'own', 'Draft', 'pending', null)`);
    const pub = await c.adm.get('/api/communities/com/visibility-impact?to=public');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.from, 'private');
    assert.equal(pub.body.pendingRequests, 1);
    assert.deepEqual(pub.body.membersOnlyContent, { posts: 1, events: 0, resources: 0, courses: 0 });
    assert.equal(pub.body.openInvitations, 3, 'm1, m6 and m10');
    assert.deepEqual(pub.body.effects, ['requests_admitted', 'content_readable']);
    const closed = await c.own.get('/api/communities/com/visibility-impact?to=closed');
    assert.deepEqual(closed.body.effects, ['requests_dropped', 'hidden_from_discovery']);
    assert.deepEqual((await c.own.get('/api/communities/com/visibility-impact?to=private')).body.effects, []);
    assert.equal((await c.own.get('/api/communities/com/visibility-impact?to=secret')).status, 400);
    for (const who of ['mod', 'mem']) assert.equal((await c[who].get('/api/communities/com/visibility-impact?to=public')).status, 403, who);
    // Nothing changed by asking.
    assert.equal((await q(`select state from memberships where community_id = 'com' and user_id = 'm9'`)).rows[0].state, 'pending');
  });

  test('VIS-13 the change itself is audited with before and after and what happened to the requests', async () => {
    const res = await c.own.patch('/api/communities/com', { version: await version(), visibility: 'closed' });
    assert.equal(res.status, 200);
    const { rows: [a] } = await q(`select context from audit_log where action = 'community.update' and target_id = 'com' order by id desc limit 1`);
    assert.deepEqual(a.context.visibility, { before: 'private', after: 'closed' });
    assert.deepEqual(a.context.requests, { dropped: 1 });
    assert.equal((await q(`select state from memberships where community_id = 'com' and user_id = 'm9'`)).rows[0].state, 'left');
    const back = await c.own.get('/api/communities/com/visibility-impact?to=private');
    assert.deepEqual(back.body.effects, ['listed_in_discovery']);
    await c.own.patch('/api/communities/com', { version: await version(), visibility: 'private' });
  });
});

describe('G5 notification defaults', () => {
  test('SET-08 notifyDefaults: Owners and Admins only, known categories, booleans; saved per category', async () => {
    assert.equal((await c.mod.patch('/api/communities/com', { version: await version(), settings: { notifyDefaults: { replies: true } } })).status, 403);
    assert.equal((await c.adm.patch('/api/communities/com', { version: await version(), settings: { notifyDefaults: { moderation: false } } })).body.error.code, 'FIELD_NOT_ALLOWED');
    assert.equal((await c.adm.patch('/api/communities/com', { version: await version(), settings: { notifyDefaults: { replies: 'yes' } } })).status, 400);
    assert.equal((await c.adm.patch('/api/communities/com', { version: await version(), settings: { notifyDefaults: { replies: true, mentions: false } } })).status, 200);
    assert.equal((await c.adm.patch('/api/communities/com', { version: await version(), settings: { notifyDefaults: { events: false } } })).status, 200);
    assert.deepEqual((await settingsOf()).notifyDefaults, { replies: true, mentions: false, events: false }, 'a later save keeps the other categories');
    const { rows: [a] } = await q(`select context from audit_log where action = 'community.update' and target_id = 'com' order by id desc limit 1`);
    assert.deepEqual(a.context.fields, ['settings']);
  });

  test('NTF-01 a member’s own choice wins over the community default; the default wins over the category’s; notices about you always go', async () => {
    const sent = [];
    const ctx = { db: env.db, mailer: { send: async (to) => { sent.push(to); } } };
    const emailed = async (type, to, dedupe) => {
      sent.length = 0;
      await notify(ctx, null, { to: [to], type, actorId: 'own', communityId: 'com', targetType: 'community', targetId: 'com', dedupe });
      return sent.includes(`${to}@example.com`);
    };
    // Replies: off by default for the category, on for this community.
    assert.equal(await emailed('reply', 'mem', 'r1'), true, 'community default (on) beats the category default (off)');
    // Mentions: on for the category, off for this community.
    assert.equal(await emailed('mention', 'mem', 'm1'), false, 'community default (off) beats the category default (on)');
    // The member's own saved choice wins either way.
    await c.mem.put('/api/notification-prefs', { mentions: true, replies: false });
    assert.equal(await emailed('mention', 'mem', 'm2'), true, 'their own "on" beats the community’s "off"');
    assert.equal(await emailed('reply', 'mem', 'r2'), false, 'their own "off" beats the community’s "on"');
    // No community default for this category: the category default (on) applies.
    assert.equal(await emailed('submission_returned', 'mem2', 'l1'), true);
    // Moderation notices about you can’t be switched off, even by the person.
    await c.mem2.put('/api/notification-prefs', { moderation: false });
    assert.equal(await emailed('moderation_action', 'mem2', 'x1'), true);
    assert.equal(await emailed('report_new', 'mem2', 'x2'), false, 'other moderation emails follow the choice');
    // The in-app notification is kept whatever the email choice.
    assert.equal((await q(`select count(*)::int as n from notifications where user_id = 'mem' and kind = 'mention'`)).rows[0].n, 2);
  });
});

describe('G7 Teaching and Teaching Assistants', () => {
  let course; let other; let task;
  test('a course with an Instructor and a Teaching Assistant, and one in another course', async () => {
    course = (await c.own.post('/api/communities/com/courses', { title: 'Taught course' })).body.course;
    other = (await c.own.post('/api/communities/com/courses', { title: 'Other course' })).body.course;
    assert.equal((await c.own.post(`/api/courses/${course.id}/instructors`, { userId: 'ins' })).status, 200);
    const withTa = await c.adm.post(`/api/courses/${course.id}/instructors`, { userId: 'ta', role: 'teaching_assistant' });
    assert.deepEqual(withTa.body.course.instructors.map((x) => x.id), ['ins']);
    assert.deepEqual(withTa.body.course.teachingAssistants.map((x) => x.id), ['ta']);
    await c.own.post(`/api/courses/${other.id}/instructors`, { userId: 'oth' });
    assert.equal((await c.ins.post(`/api/courses/${course.id}/instructors`, { userId: 'mem', role: 'teaching_assistant' })).status, 403, 'Instructors don’t assign');
    assert.equal((await c.own.post(`/api/courses/${course.id}/instructors`, { userId: 'm1', role: 'teaching_assistant' })).body.error.code, 'NOT_A_MEMBER');
    const { rows: [a] } = await q(`select context from audit_log where action = 'course.assistant_add' order by id desc limit 1`);
    assert.deepEqual(a.context, { userId: 'ta', role: 'teaching_assistant', from: null });
    const mod = withTa.body.course.modules[0].id;
    await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Read this', body: 'Hello.' });
    await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Write it up', kind: 'assignment', body: 'Explain.', assignment: { points: 10, passPoints: 6 } });
    task = (await c.ins.get(`/api/courses/${course.id}`)).body.course.modules[0].lessons[1];
    assert.equal((await c.ins.post(`/api/courses/${course.id}/publish`)).body.course.status, 'published');
    for (const u of ['mem', 'mem2']) await c[u].post(`/api/courses/${course.id}/enroll`, {});
  });

  test('G7 a Teaching Assistant opens the course and its lessons but can’t edit it', async () => {
    const view = (await c.ta.get(`/api/courses/${course.id}`)).body.course;
    assert.deepEqual([view.can.manage, view.can.grade, view.can.teachingAssistant, view.can.seeLearners], [false, true, true, true]);
    assert.equal((await c.ta.patch(`/api/courses/${course.id}`, { version: view.version, title: 'Renamed' })).status, 403);
    assert.equal((await c.ta.post(`/api/courses/${course.id}/unpublish`)).status, 403);
    assert.equal((await c.ta.post(`/api/modules/${view.modules[0].id}/lessons`, { title: 'Extra' })).status, 403);
    assert.equal((await c.ta.get(`/api/lessons/${task.id}`)).status, 200);
  });

  test('ASM-07 a Teaching Assistant grades work in their course only; ASM-06 the grading lock holds for them too', async () => {
    await c.mem.put(`/api/lessons/${task.id}/submission`, { body: 'My plan.' });
    const queue = (await c.ta.get('/api/communities/com/grading')).body;
    assert.deepEqual(queue.courses.map((x) => x.id), [course.id]);
    const sub = queue.submissions[0];
    assert.equal((await c.oth.get(`/api/submissions/${sub.id}`)).status, 404, 'another course’s Instructor can’t see it');
    assert.equal((await c.ta.post(`/api/submissions/${sub.id}/claim`)).status, 200);
    assert.equal((await c.ins.post(`/api/submissions/${sub.id}/claim`)).body.error.code, 'LOCKED');
    const back = await c.ta.post(`/api/submissions/${sub.id}/return`, { grade: 8, feedback: 'Good.' });
    assert.equal(back.status, 200);
    assert.equal(back.body.submission.passed, true);
  });

  test('LMS-14 ANL-08 the learner list: Instructors, TAs, Owners and Admins of that course only; names, progress and the latest grade', async () => {
    const res = await c.ta.get(`/api/courses/${course.id}/learners`);
    assert.equal(res.status, 200);
    const [mem, mem2] = res.body.learners;
    assert.deepEqual(Object.keys(mem).sort(), ['lastActivityAt', 'latestGrade', 'lessonsDone', 'lessonsTotal', 'status', 'user']);
    assert.deepEqual(mem.user, { id: 'mem', name: 'Person mem' });
    assert.equal(mem.status, 'active');
    assert.deepEqual([mem.lessonsDone, mem.lessonsTotal], [1, 2], 'the passed assignment counts');
    assert.equal(mem.latestGrade.grade, 8);
    assert.equal(mem.latestGrade.passed, true);
    assert.ok(Date.parse(mem.lastActivityAt) > 0);
    assert.equal(mem2.latestGrade, null);
    assert.deepEqual([mem2.lessonsDone, mem2.lessonsTotal], [0, 2]);
    for (const who of ['ins', 'own', 'adm']) assert.equal((await c[who].get(`/api/courses/${course.id}/learners`)).status, 200, who);
    assert.equal((await c.oth.get(`/api/courses/${course.id}/learners`)).status, 403, 'an Instructor of another course (LMS-14)');
    assert.equal((await c.mem.get(`/api/courses/${course.id}/learners`)).status, 403, 'a learner never sees the others (ANL-08)');
    assert.equal((await c.mod.get(`/api/courses/${course.id}/learners`)).status, 403, 'Moderators don’t teach');
    // Finishing moves a learner to completed.
    await c.mem.post(`/api/lessons/${(await c.ins.get(`/api/courses/${course.id}`)).body.course.modules[0].lessons[0].id}/complete`);
    const done = (await c.ins.get(`/api/courses/${course.id}/learners`)).body.learners.find((l) => l.user.id === 'mem');
    assert.deepEqual([done.status, done.lessonsDone], ['completed', 2]);
  });

  test('G7 teaching: the courses you teach (all for Owners and Admins) with their numbers; nothing for others', async () => {
    await c.mem2.put(`/api/lessons/${task.id}/submission`, { body: 'Mine.' });
    const ta = (await c.ta.get('/api/communities/com/teaching')).body;
    assert.equal(ta.all, false);
    assert.deepEqual(ta.courses.map((x) => [x.id, x.role, x.canEdit]), [[course.id, 'teaching_assistant', false]]);
    assert.deepEqual(['status', 'enrolled', 'waitlist', 'completed', 'toGrade'].map((k) => ta.courses[0][k]), ['published', 2, 0, 1, 1]);
    assert.deepEqual((await c.ins.get('/api/communities/com/teaching')).body.courses.map((x) => [x.id, x.role, x.canEdit]), [[course.id, 'instructor', true]]);
    assert.deepEqual((await c.oth.get('/api/communities/com/teaching')).body.courses.map((x) => x.id), [other.id]);
    const own = (await c.own.get('/api/communities/com/teaching')).body;
    assert.equal(own.all, true);
    assert.deepEqual(own.courses.map((x) => x.role).sort(), ['owner', 'owner']);
    assert.equal(own.toGrade, 1);
    assert.deepEqual((await c.mem.get('/api/communities/com/teaching')).body.courses, []);
    // An Instructor or TA who leaves loses it at once (LMS-02).
    await c.ta.post('/api/communities/com/leave');
    assert.equal((await c.ta.get('/api/communities/com/teaching')).status, 403, 'a Private community: no longer a member');
    assert.equal((await c.ta.get(`/api/courses/${course.id}/learners`)).status, 404, 'the course is hidden from them now');
  });
});

describe('F6 origin in settings', () => {
  test('Owners and Admins see the template a community came from and who last changed it; members don’t', async () => {
    const env2 = await setup();
    await makeUser(env2.db, { id: 'o6', email: 'o6@example.com', name: 'Owner Six' });
    await makeUser(env2.db, { id: 'm6', email: 'm6@example.com', name: 'Member Six' });
    const own = await signIn(env2.app, { email: 'o6@example.com', password: 'correct-horse-battery' });
    const mem = await signIn(env2.app, { email: 'm6@example.com', password: 'correct-horse-battery' });
    const { config } = (await own.post('/api/templates/alumni/suggest', { answers: {} })).body;
    const made = await own.post('/api/communities', { ...config, name: 'Origin Check Alumni', visibility: 'public', description: 'Checks F6.' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const id = made.body.community.id;
    await own.patch(`/api/communities/${id}`, { version: made.body.community.version ?? 1, description: 'Checks F6 again.' });
    await mem.post(`/api/communities/${id}/join`, {});
    const asOwner = (await own.get(`/api/communities/${id}`)).body.community;
    assert.equal(asOwner.template.key, 'alumni');
    assert.equal(typeof asOwner.template.version, 'number');
    assert.equal(asOwner.lastChange.by, 'Owner Six');
    const asMember = (await mem.get(`/api/communities/${id}`)).body.community;
    assert.equal(asMember.template, undefined);
    assert.equal(asMember.lastChange, undefined);
    await env2.close();
  });
});
