// Redesign Stage 5b (assessment): quizzes, assignments, grading and certificates (ASM-* IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PEOPLE = ['own', 'ins', 'ins2', 'oth', 'mem', 'mem2'];

before(async () => {
  env = await setup();
  for (const id of PEOPLE) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('com', 'com', 'Learn com', 'private', 'own')`);
  await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('com', 'own', 'owner', 'active', now())`);
  for (const u of PEOPLE.slice(1)) await q(`insert into memberships (community_id, user_id, state, joined_at) values ('com', $1, 'active', now())`, [u]);
  for (const id of PEOPLE) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  c.memPhone = await signIn(env.app, { email: 'mem@example.com', password: 'correct-horse-battery' }); // a second device
});
after(() => env?.close());

let course; let text; let quiz; let task; let other;
const QS = [
  { prompt: 'Two plus two?', choices: ['3', '4'], answer: 1 },
  { prompt: 'Capital of France?', choices: ['Paris', 'Rome', 'Oslo'], answer: 0 },
];
const lessons = async () => (await c.own.get(`/api/courses/${course.id}`)).body.course.modules[0].lessons;

describe('building quizzes and assignments', () => {
  test('a course with a text lesson, a quiz and an assignment; Instructors per course', async () => {
    course = (await c.own.post('/api/communities/com/courses', { title: 'Assessed course' })).body.course;
    other = (await c.own.post('/api/communities/com/courses', { title: 'Another course' })).body.course;
    for (const u of ['ins', 'ins2']) await c.own.post(`/api/courses/${course.id}/instructors`, { userId: u });
    await c.own.post(`/api/courses/${other.id}/instructors`, { userId: 'oth' });
    const mod = course.modules[0].id;
    await c.own.post(`/api/modules/${mod}/lessons`, { title: 'Read this', body: 'Hello.' });
    const qz = await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Check yourself', kind: 'quiz', quiz: { passPercent: 50, maxAttempts: 2 } });
    assert.equal(qz.status, 200);
    await c.ins.post(`/api/modules/${mod}/lessons`, { title: 'Write it up', kind: 'assignment', body: 'Explain your plan.', assignment: { points: 10, passPoints: 6 } });
    [text, quiz, task] = await lessons();
    assert.deepEqual([text.kind, quiz.kind, task.kind], ['text', 'quiz', 'assignment']);
    assert.equal((await c.own.post(`/api/modules/${mod}/lessons`, { title: 'Bad', kind: 'assignment', assignment: { points: 5, passPoints: 9 } })).body.error.code, 'INVALID_INPUT');
    assert.equal((await lessons()).length, 3, 'a lesson whose settings are refused isn’t kept');
  });

  test('ASM-13 questions are checked on save, and a quiz without questions blocks publishing', async () => {
    assert.equal((await c.own.post(`/api/courses/${course.id}/publish`)).body.error.code, 'QUIZ_EMPTY');
    const bad = [
      [{ prompt: 'Q', choices: ['only one'], answer: 0 }],
      [{ prompt: 'Q', choices: ['a', 'b'], answer: 2 }],
      [{ prompt: 'Q', choices: ['a', ''], answer: 0 }],
      [{ prompt: 'Q', choices: ['a', 'A'], answer: 0 }],
      [{ prompt: ' ', choices: ['a', 'b'], answer: 0 }],
    ];
    for (const questions of bad) assert.equal((await c.ins.put(`/api/lessons/${quiz.id}/questions`, { questions })).body.error.code, 'INVALID_QUESTION');
    assert.equal((await c.ins.put(`/api/lessons/${quiz.id}/questions`, { questions: QS })).status, 200);
    assert.equal((await c.oth.put(`/api/lessons/${quiz.id}/questions`, { questions: QS })).status, 404, 'not an Instructor of this course');
    assert.equal((await c.own.post(`/api/courses/${course.id}/publish`)).body.course.status, 'published');
    for (const u of ['mem', 'mem2']) await c[u].post(`/api/courses/${course.id}/enroll`, {});
  });

  test('learners see the quiz settings, never the answers', async () => {
    const r = (await c.mem.get(`/api/lessons/${quiz.id}`)).body;
    assert.equal(r.quiz.questionCount, 2);
    assert.equal(r.quiz.questions, undefined);
    assert.equal((await c.ins.get(`/api/lessons/${quiz.id}`)).body.quiz.questions[0].answer, 1);
  });
});

describe('quiz attempts (D7)', () => {
  let first;
  test('ASM-09 a quiz can’t be marked complete by hand', async () => {
    assert.equal((await c.mem.post(`/api/lessons/${quiz.id}/complete`)).body.error.code, 'NEEDS_PASS');
    assert.equal((await c.mem.post(`/api/lessons/${task.id}/complete`)).body.error.code, 'NEEDS_PASS');
  });

  test('ASM-02 / ASM-14 starting from two devices opens one attempt; answers are saved as you go', async () => {
    const [a, b] = await Promise.all([c.mem.post(`/api/lessons/${quiz.id}/attempts`), c.memPhone.post(`/api/lessons/${quiz.id}/attempts`)]);
    assert.equal(a.body.attempt.id, b.body.attempt.id);
    first = a.body.attempt;
    assert.equal(first.questions[0].answer, undefined, 'no answers in an open attempt');
    await c.mem.patch(`/api/attempts/${first.id}`, { answers: { [first.questions[0].id]: 0, nonsense: 3 } });
    const resumed = (await c.memPhone.post(`/api/lessons/${quiz.id}/attempts`)).body.attempt;
    assert.deepEqual(resumed.answers, { [first.questions[0].id]: 0 }, 'the other device carries on with the saved answers');
  });

  test('ASM-04 changing the questions doesn’t change an attempt already started', async () => {
    await c.ins.put(`/api/lessons/${quiz.id}/questions`, { questions: [...QS, { prompt: 'Blue is a colour?', choices: ['Yes', 'No'], answer: 0 }] });
    const again = (await c.mem.post(`/api/lessons/${quiz.id}/attempts`)).body.attempt;
    assert.equal(again.questions.length, 2);
  });

  test('ASM-01 submitting twice at once gives one result; a fail leaves the lesson open', async () => {
    const [x, y] = await Promise.all([c.mem.post(`/api/attempts/${first.id}/submit`, {}), c.memPhone.post(`/api/attempts/${first.id}/submit`, {})]);
    assert.deepEqual(x.body.attempt, y.body.attempt);
    assert.equal(x.body.attempt.score, 0);
    assert.equal(x.body.attempt.passed, false);
    assert.equal(x.body.attemptsLeft, 1);
    assert.equal(x.body.review[0].answer, undefined, 'right answers stay hidden while attempts remain');
    assert.equal((await q(`select count(*)::int as n from quiz_attempts where user_id = 'mem' and submitted_at is not null`)).rows[0].n, 1);
    assert.equal((await c.mem.patch(`/api/attempts/${first.id}`, { answers: {} })).body.error.code, 'ALREADY_SUBMITTED');
    assert.equal((await c.mem.get(`/api/courses/${course.id}`)).body.course.modules[0].lessons[1].done, false);
  });

  test('ASM-12 nobody else can open someone’s attempt', async () => {
    assert.equal((await c.mem2.get(`/api/attempts/${first.id}`)).status, 404);
    assert.equal((await c.ins.get(`/api/attempts/${first.id}`)).status, 404);
  });

  test('a pass completes the lesson; the best score counts; ASM-14 the limit holds across devices', async () => {
    const a = (await c.memPhone.post(`/api/lessons/${quiz.id}/attempts`)).body.attempt;
    assert.equal(a.questions.length, 3, 'a new attempt gets the current questions');
    const right = { [a.questions[0].id]: 1, [a.questions[1].id]: 0, [a.questions[2].id]: 1 };
    const res = (await c.memPhone.post(`/api/attempts/${a.id}/submit`, { answers: right })).body;
    assert.equal(res.attempt.score, 2);
    assert.equal(res.attempt.passed, true);
    assert.deepEqual(res.best, { score: 2, total: 3, passed: true });
    assert.equal(res.review[2].answer, 0, 'right answers show once passed');
    assert.equal((await c.mem.get(`/api/courses/${course.id}`)).body.course.modules[0].lessons[1].done, true);
    assert.equal((await c.mem.post(`/api/lessons/${quiz.id}/attempts`)).body.error.code, 'NO_ATTEMPTS_LEFT');
    const mine = (await c.mem.get(`/api/lessons/${quiz.id}`)).body.quiz.mine;
    assert.equal(mine.attemptsUsed, 2);
    assert.equal(mine.passed, true);
  });

  test('ASM-03 the deadline is the server’s: no start and no submit after it', async () => {
    await c.mem2.post(`/api/lessons/${quiz.id}/attempts`);
    const open = (await c.mem2.post(`/api/lessons/${quiz.id}/attempts`)).body.attempt;
    await c.ins.patch(`/api/lessons/${quiz.id}`, { quiz: { dueAt: new Date(Date.now() - 60e3).toISOString() } });
    assert.equal((await c.mem2.post(`/api/attempts/${open.id}/submit`, {})).body.error.code, 'QUIZ_CLOSED');
    assert.equal((await c.mem2.patch(`/api/attempts/${open.id}`, { answers: {} })).body.error.code, 'QUIZ_CLOSED');
    assert.equal((await c.mem2.get(`/api/lessons/${quiz.id}`)).body.quiz.closed, true);
    await c.ins.patch(`/api/lessons/${quiz.id}`, { quiz: { dueAt: null } });
  });

  test('a quiz with attempts can’t become another kind of lesson', async () => {
    assert.equal((await c.ins.patch(`/api/lessons/${quiz.id}`, { kind: 'text', body: 'x' })).body.error.code, 'KIND_LOCKED');
  });
});

describe('assignments and grading', () => {
  let sub;
  test('ASM-12 a learner sends work; only they and the course’s graders can open it', async () => {
    assert.equal((await c.mem.put(`/api/lessons/${task.id}/submission`, {})).body.error.code, 'INVALID_INPUT');
    sub = (await c.mem.put(`/api/lessons/${task.id}/submission`, { body: 'My plan is…' })).body.submission;
    assert.equal(sub.status, 'submitted');
    assert.equal((await c.mem2.get(`/api/submissions/${sub.id}`)).status, 404);
    assert.equal((await c.mem2.get('/api/communities/com/grading')).status, 403);
    assert.equal((await c.mem.get(`/api/lessons/${task.id}`)).body.assignment.mine.body, 'My plan is…');
  });

  test('ASM-07 an Instructor of another course can’t see or grade it', async () => {
    assert.equal((await c.oth.get(`/api/submissions/${sub.id}`)).status, 404);
    assert.equal((await c.oth.post(`/api/submissions/${sub.id}/claim`)).status, 404);
    assert.equal((await c.oth.get('/api/communities/com/grading')).body.submissions.length, 0);
    assert.equal((await c.ins.get('/api/communities/com/grading')).body.submissions.length, 1);
  });

  test('ASM-06 one grader at a time', async () => {
    assert.equal((await c.ins.post(`/api/submissions/${sub.id}/claim`)).body.submission.lockedBy.me, true);
    const taken = await c.ins2.post(`/api/submissions/${sub.id}/claim`);
    assert.equal(taken.body.error.code, 'LOCKED');
    assert.equal(taken.body.error.by, 'ins person');
    assert.equal((await c.ins2.post(`/api/submissions/${sub.id}/return`, { grade: 9 })).body.error.code, 'NOT_LOCKED');
    assert.equal((await c.ins2.get('/api/communities/com/grading')).body.submissions[0].lockedBy.name, 'ins person');
    assert.equal((await c.mem.put(`/api/lessons/${task.id}/submission`, { body: 'changed' })).body.error.code, 'BEING_GRADED');
    const draft = (await c.ins.patch(`/api/submissions/${sub.id}/draft`, { grade: 4, feedback: 'Thin.' })).body.submission;
    assert.equal(draft.draftGrade, 4);
    assert.equal((await c.mem.get(`/api/submissions/${sub.id}`)).body.submission.draftGrade, undefined, 'drafts stay with the instructors');
  });

  test('a returned fail can be sent again; a pass completes the lesson and notifies the learner', async () => {
    assert.equal((await c.ins.post(`/api/submissions/${sub.id}/return`, { grade: 11 })).body.error.code, 'INVALID_INPUT');
    const back = (await c.ins.post(`/api/submissions/${sub.id}/return`, { grade: 4, feedback: 'Add detail.' })).body.submission;
    assert.equal(back.status, 'returned');
    assert.equal(back.passed, false);
    const mine = (await c.mem.get(`/api/lessons/${task.id}`)).body.assignment.mine;
    assert.deepEqual([mine.grade, mine.feedback, mine.passed], [4, 'Add detail.', false]);
    const n = (await c.mem.get('/api/notifications')).body.notifications.find((x) => x.kind === 'submission_returned');
    assert.equal(n.href, `/lessons/${task.id}`);
    await c.mem.put(`/api/lessons/${task.id}/submission`, { body: 'A fuller plan.' });
    await c.ins2.post(`/api/submissions/${sub.id}/claim`);
    assert.equal((await c.ins2.post(`/api/submissions/${sub.id}/return`, { grade: 8 })).body.submission.passed, true);
    assert.equal((await c.mem.put(`/api/lessons/${task.id}/submission`, { body: 'again' })).body.error.code, 'ALREADY_PASSED');
  });

  test('ASM-05 changing the points later doesn’t change a grade already given', async () => {
    await c.ins.patch(`/api/lessons/${task.id}`, { assignment: { points: 20, passPoints: 15 } });
    const mine = (await c.mem.get(`/api/lessons/${task.id}`)).body.assignment.mine;
    assert.deepEqual([mine.grade, mine.points, mine.passPoints, mine.passed], [8, 10, 6, true]);
  });
});

describe('certificates (D8)', () => {
  let code;
  test('ASM-09 issued only when every required lesson, quiz and assignment is passed, and only once', async () => {
    assert.equal((await c.mem.get('/api/me/certificates')).body.certificates.length, 0, 'the text lesson is still open');
    await Promise.all([c.mem.post(`/api/lessons/${text.id}/complete`), c.memPhone.post(`/api/lessons/${text.id}/complete`)]);
    const certs = (await c.mem.get('/api/me/certificates')).body.certificates;
    assert.equal(certs.length, 1);
    code = certs[0].code;
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal((await q(`select count(*)::int as n from certificates where user_id = 'mem'`)).rows[0].n, 1);
    assert.ok((await c.mem.get('/api/notifications')).body.notifications.some((x) => x.kind === 'certificate_issued' && x.href === `/verify/${code}`));
    assert.equal((await c.mem2.get('/api/me/certificates')).body.certificates.length, 0);
  });

  test('anyone can verify a code, and sees only name, course, community, date and code', async () => {
    const r = await client(env.app).get(`/api/certificates/${code.toLowerCase()}`);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body.certificate).sort(), ['code', 'community', 'course', 'issuedAt', 'name', 'revoked']);
    assert.equal(r.body.certificate.name, 'mem person');
    assert.equal((await client(env.app).get('/api/certificates/ZZZZ-ZZZZ')).status, 404);
    assert.equal((await client(env.app).get('/api/certificates/<script>')).status, 404);
  });

  test('ASM-10 / ASM-11 a certificate keeps verifying after the course is renamed or deleted', async () => {
    const v = (await c.own.get(`/api/courses/${course.id}`)).body.course.version;
    await c.own.patch(`/api/courses/${course.id}`, { version: v, title: 'Renamed course' });
    assert.equal((await client(env.app).get(`/api/certificates/${code}`)).body.certificate.course, 'Assessed course');
    await q(`delete from courses where id = $1`, [course.id]);
    assert.equal((await client(env.app).get(`/api/certificates/${code}`)).body.certificate.course, 'Assessed course');
    assert.equal((await c.mem.get('/api/me/certificates')).body.certificates.length, 1);
  });
});

describe('leaving', () => {
  test('ASM-08 a learner who leaves the community can’t send work; what they sent stays', async () => {
    const crs = (await c.own.post('/api/communities/com/courses', { title: 'Second course' })).body.course;
    await c.own.post(`/api/modules/${crs.modules[0].id}/lessons`, { title: 'Task', kind: 'assignment', body: 'Do it.' });
    const [t2] = (await c.own.get(`/api/courses/${crs.id}`)).body.course.modules[0].lessons;
    await c.own.post(`/api/courses/${crs.id}/publish`);
    await c.mem2.post(`/api/courses/${crs.id}/enroll`, {});
    await c.mem2.put(`/api/lessons/${t2.id}/submission`, { body: 'Done.' });
    await q(`update memberships set state = 'left' where community_id = 'com' and user_id = 'mem2'`);
    assert.equal((await c.mem2.put(`/api/lessons/${t2.id}/submission`, { body: 'More.' })).status, 404);
    assert.equal((await c.own.get('/api/communities/com/grading')).body.submissions.filter((s) => s.learner.id === 'mem2').length, 1);
  });
});
