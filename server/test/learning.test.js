// Redesign Stage 5a (learning): courses, lessons, enrolment and progress (LMS-* IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);

before(async () => {
  env = await setup();
  for (const id of ['own', 'ins', 'mem', 'mem2', 'out']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  for (const [id, vis] of [['com', 'private'], ['oth', 'public']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `Learn ${id}`, vis]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
    for (const u of ['ins', 'mem', 'mem2']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, $2, 'active', now())`, [id, u]);
  }
  for (const id of ['own', 'ins', 'mem', 'mem2', 'out']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
});
after(() => env?.close());

let course; let lessons = [];
const reload = async (who = 'own', id = course.id) => (await c[who].get(`/api/courses/${id}`)).body.course;

describe('building a course (D1)', () => {
  test('only Owners and Admins create courses; a new course is a draft with one module', async () => {
    assert.equal((await c.mem.post('/api/communities/com/courses', { title: 'Nope' })).status, 403);
    const r = await c.own.post('/api/communities/com/courses', { title: 'Career switching', description: 'For alumni changing fields', capacity: 2 });
    assert.equal(r.status, 201);
    course = r.body.course;
    assert.equal(course.status, 'draft');
    assert.equal(course.modules.length, 1);
    assert.ok(!(await c.mem.get('/api/communities/com/courses')).body.courses.some((x) => x.id === course.id), 'members don’t see drafts');
    assert.equal((await c.mem.get(`/api/courses/${course.id}`)).status, 404);
  });

  test('LMS-15 a course with no lessons can’t be published', async () => {
    assert.equal((await c.own.post(`/api/courses/${course.id}/publish`)).body.error.code, 'NO_LESSONS');
  });

  test('LMS-14 an Instructor manages only the course they’re assigned to; only active members can be assigned', async () => {
    assert.equal((await c.own.post(`/api/courses/${course.id}/instructors`, { userId: 'out' })).body.error.code, 'NOT_A_MEMBER');
    await c.own.post(`/api/courses/${course.id}/instructors`, { userId: 'ins' });
    const other = (await c.own.post('/api/communities/com/courses', { title: 'Other course' })).body.course;
    const mod = course.modules[0].id;
    const a = await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Why switch', body: 'Start here.', durationMin: 10 });
    assert.equal(a.status, 200);
    const b = await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Reading list', kind: 'link', url: 'https://example.org/list', durationMin: 5 });
    lessons = b.body.course.modules[0].lessons;
    assert.equal(lessons.length, 2);
    assert.equal((await c.ins.post(`/api/modules/${other.modules[0].id}/lessons`, { title: 'Not mine' })).status, 404, 'not on the other course (a draft, so it stays hidden)');
    assert.equal((await c.ins.post(`/api/courses/${course.id}/instructors`, { userId: 'mem' })).status, 403, 'instructors don’t assign instructors');
    assert.equal((await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Bad link', kind: 'link', url: 'javascript:alert(1)' })).body.error.code, 'INVALID_URL');
  });

  test('LMS-02 an Instructor who leaves the community loses their rights at once', async () => {
    await q(`update memberships set state = 'left' where community_id = 'com' and user_id = 'ins'`);
    try { assert.equal((await c.ins.patch(`/api/courses/${course.id}`, { version: (await reload()).version, title: 'Hijack' })).status, 404); }
    finally { await q(`update memberships set state = 'active' where community_id = 'com' and user_id = 'ins'`); }
  });

  test('reordering needs every module and lesson exactly once', async () => {
    const mod = course.modules[0].id;
    assert.equal((await c.own.put(`/api/courses/${course.id}/order`, { modules: [{ id: mod, lessons: [lessons[1].id] }] })).body.error.code, 'STALE_ORDER');
    const r = await c.own.put(`/api/courses/${course.id}/order`, { modules: [{ id: mod, lessons: [lessons[1].id, lessons[0].id] }] });
    assert.deepEqual(r.body.course.modules[0].lessons.map((l) => l.title), ['Reading list', 'Why switch']);
  });
});

describe('enrolment and progress', () => {
  test('LMS-08 lessons open only for learners and managers, even with the URL', async () => {
    assert.equal((await c.own.post(`/api/courses/${course.id}/publish`)).body.course.status, 'published');
    assert.equal((await c.mem.get(`/api/lessons/${lessons[0].id}`)).body.error.code, 'NOT_ENROLLED');
    assert.equal((await c.out.get(`/api/lessons/${lessons[0].id}`)).status, 404, 'an outsider learns nothing of a Private community’s course');
    assert.equal((await c.ins.get(`/api/lessons/${lessons[0].id}`)).status, 200);
  });

  test('LMS-06 enrolling twice keeps one enrolment; LMS-07 a full course offers the waitlist', async () => {
    await Promise.all([1, 2, 3].map(() => c.mem.post(`/api/courses/${course.id}/enroll`, {})));
    assert.equal((await q(`select count(*)::int as n from enrollments where course_id = $1 and user_id = 'mem'`, [course.id])).rows[0].n, 1);
    await c.ins.post(`/api/courses/${course.id}/enroll`, {});
    const full = await c.mem2.post(`/api/courses/${course.id}/enroll`, {});
    assert.equal(full.body.error.code, 'COURSE_FULL');
    assert.equal(full.body.error.waitlist, true);
    assert.equal((await c.mem2.post(`/api/courses/${course.id}/enroll`, { waitlist: true })).body.course.enrollment.status, 'waitlist');
    await c.ins.delete(`/api/courses/${course.id}/enroll`);
    assert.equal((await reload('mem2')).enrollment.status, 'active', 'the place went to the waitlist');
  });

  test('LMS-05 / LMS-12 marking a lesson twice, from two tabs, counts once; finishing every lesson completes the course', async () => {
    await Promise.all([c.mem.post(`/api/lessons/${lessons[0].id}/complete`), c.mem.post(`/api/lessons/${lessons[0].id}/complete`)]);
    let me = await reload('mem');
    assert.deepEqual(me.progress, { done: 1, total: 2 });
    assert.equal(me.enrollment.completedAt, null);
    me = (await c.mem.post(`/api/lessons/${lessons[1].id}/complete`)).body.course;
    assert.deepEqual(me.progress, { done: 2, total: 2 });
    assert.ok(me.enrollment.completedAt);
  });

  test('LMS-04 a lesson added after completion shows as New, isn’t required, and completion stays', async () => {
    const before = (await reload('mem')).enrollment.completedAt;
    const r = await c.own.post(`/api/modules/${course.modules[0].id}/lessons`, { title: 'Update for 2027' });
    const added = r.body.course.modules[0].lessons.at(-1).id;
    const me = await reload('mem');
    assert.equal(me.enrollment.completedAt, before);
    assert.deepEqual(me.progress, { done: 2, total: 2 });
    assert.equal(me.modules[0].lessons.find((l) => l.id === added).isNew, true);
    assert.deepEqual((await reload('mem2')).progress.total, 3, 'still required for someone who hadn’t finished');
  });

  test('LMS-03 unpublishing stops new enrolments; enrolled learners keep access', async () => {
    await c.own.post(`/api/courses/${course.id}/unpublish`);
    assert.equal((await c.mem.get(`/api/lessons/${lessons[0].id}`)).status, 200);
    assert.equal((await c.ins.post(`/api/courses/${course.id}/enroll`, {})).body.error.code, 'NOT_OPEN', 'instructors see it, but…');
    assert.equal((await q(`select status from enrollments where course_id = $1 and user_id = 'ins'`, [course.id])).rows[0].status, 'left', '…can’t re-enrol while unpublished');
    await c.own.post(`/api/courses/${course.id}/publish`);
  });

  test('LMS-09 leaving the community ends access; progress comes back on rejoining', async () => {
    await q(`update memberships set state = 'left' where community_id = 'com' and user_id = 'mem'`);
    assert.equal((await c.mem.get(`/api/lessons/${lessons[0].id}`)).status, 404);
    assert.ok(!(await c.mem.get('/api/me/learning')).body.courses.some((x) => x.id === course.id));
    await q(`update memberships set state = 'active' where community_id = 'com' and user_id = 'mem'`);
    assert.deepEqual((await reload('mem')).progress, { done: 2, total: 2 });
    assert.ok((await c.mem.get('/api/me/learning')).body.courses.some((x) => x.id === course.id), 'back in My Learning');
  });

  test('LMS-01 a course with learners can’t be deleted, only archived; archived is read-only', async () => {
    assert.equal((await c.own.delete(`/api/courses/${course.id}`)).body.error.code, 'HAS_LEARNERS');
    await c.own.post(`/api/courses/${course.id}/archive`);
    assert.equal((await c.mem.get(`/api/lessons/${lessons[0].id}`)).status, 200, 'learners keep reading');
    assert.equal((await c.own.post(`/api/modules/${course.modules[0].id}/lessons`, { title: 'x' })).body.error.code, 'ARCHIVED');
    const empty = (await c.own.post('/api/communities/oth/courses', { title: 'Never used' })).body.course;
    assert.equal((await c.own.delete(`/api/courses/${empty.id}`)).status, 200, 'an unused course can be deleted');
  });

  test('My Learning lists courses across communities with their community', async () => {
    const r = (await c.mem.get('/api/me/learning')).body.courses.find((x) => x.id === course.id);
    assert.equal(r.community.name, 'Learn com');
    assert.equal(r.progress.done, 2);
  });
});
