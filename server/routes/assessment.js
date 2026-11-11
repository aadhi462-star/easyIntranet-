// Assessment (redesign Stage 5b): quizzes, assignments, grading and certificates. ASM-* cases are
// referenced where handled. Registered from routes/learning.js, which passes its course helpers
// in, so who may see and manage a course is decided in one place.
//
// Quizzes and assignments are lessons. Their progress row is written only when they're passed,
// so "every required lesson done" already means every required quiz and assignment passed, and
// the certificate is issued in the same step that completes the course (D8, ASM-09).
//
// PGlite has one connection: inside db.tx only `t` is used; everything that reads through `db`
// (loadCourse, finish, notify) runs before or after the transaction.
import { randomInt } from 'node:crypto';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { notify } from '../lib/notify.js';

const LOCK_MINUTES = 30;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
const newCode = () => Array.from({ length: 8 }, (_, i) => (i === 4 ? '-' : '') + CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
const isPast = (at) => !!at && new Date(at) <= new Date();
const dateOrNull = (v, field) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest('INVALID_INPUT', 'That date isn’t valid.', { field });
  return d.toISOString();
};

export const ASSESSMENT_FIELDS = {
  quiz: { type: 'object', additionalProperties: false, properties: { passPercent: { type: 'integer' }, maxAttempts: { type: 'integer' }, dueAt: { type: ['string', 'null'] } } },
  assignment: { type: 'object', additionalProperties: false, properties: { points: { type: 'integer' }, passPoints: { type: 'integer' }, dueAt: { type: ['string', 'null'] } } },
};

export default function assessmentRoutes(app, { ctx, loadCourse, outline, countedFor, progressOf, fresh }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const lessonOf = async (id) => {
    const { rows: [l] } = await db.query(`select * from lessons where id = $1`, [id]);
    if (!l) throw notFound('That lesson doesn’t exist.');
    return l;
  };
  const manager = async (req, courseId) => {
    const r = await loadCourse(req, courseId);
    if (!r.manage) throw forbidden('Only this course’s Instructors and the community’s Admins can do that.');
    return r;
  };

  // ---- Completion and certificates (D8) -------------------------------------------------------
  /** Completes the course if every counted lesson is done, and issues its certificate, once. */
  async function finish(req, courseId, uid) {
    const { rows: [enr] } = await db.query(`select * from enrollments where course_id = $1 and user_id = $2`, [courseId, uid]);
    if (!enr || enr.status !== 'active') return false;
    const counted = countedFor((await outline(courseId)).flatMap((m) => m.lessons), enr);
    const done = await progressOf(courseId, uid);
    if (!counted.length || !counted.every((x) => done.has(x.id))) return false;
    const { rows } = await db.query(`update enrollments set completed_at = now(), updated_at = now() where course_id = $1 and user_id = $2 and completed_at is null returning 1`, [courseId, uid]);
    if (rows.length) await issueCertificate(req, courseId, uid);
    return true;
  }

  async function issueCertificate(req, courseId, uid) {
    for (let i = 0; i < 5; i++) {
      try {
        const { rows } = await db.query(
          `insert into certificates (id, code, user_id, course_id, community_id, name, course_title, community_name)
           select $1, $2, u.id, c.id, co.id, u.name, c.title, co.name from users u, courses c join communities co on co.id = c.community_id
            where u.id = $3 and c.id = $4
           on conflict (user_id, course_id) do nothing returning code, community_id`, [newId('cert'), newCode(), uid, courseId]);
        if (rows.length) {
          await notify(ctx, req, { to: [uid], type: 'certificate_issued', communityId: rows[0].community_id, targetType: 'certificate', targetId: rows[0].code, dedupe: `cert:${courseId}` });
        }
        return;
      } catch (err) {
        if (err.code !== '23505' || !String(err.detail ?? err.message).includes('code')) throw err; // retry only a clashing code
      }
    }
  }

  const passLesson = async (req, l, uid) => {
    await db.query(`insert into lesson_progress (lesson_id, user_id, course_id) values ($1, $2, $3) on conflict do nothing`, [l.id, uid, l.course_id]);
    await finish(req, l.course_id, uid);
  };

  // ---- Settings saved with the lesson (builder) ----------------------------------------------
  /** Creates or updates a quiz's or assignment's settings after its lesson row is written. */
  async function saveConfig(lessonId, kind, body, prevKind) {
    if (prevKind && prevKind !== kind && ['quiz', 'assignment'].includes(prevKind)) {
      const { rows: [{ n }] } = await db.query(prevKind === 'quiz'
        ? `select count(*)::int as n from quiz_attempts where lesson_id = $1` : `select count(*)::int as n from submissions where lesson_id = $1`, [lessonId]);
      if (n) throw conflict('KIND_LOCKED', `Learners have already ${prevKind === 'quiz' ? 'taken this quiz' : 'sent work for this assignment'}, so it can’t become another kind of lesson.`);
      await db.query(prevKind === 'quiz' ? `delete from quizzes where lesson_id = $1` : `delete from assignments where lesson_id = $1`, [lessonId]);
    }
    if (kind === 'quiz') {
      const q = body.quiz ?? {};
      const { rows: [prev] } = await db.query(`select * from quizzes where lesson_id = $1`, [lessonId]);
      const pass = q.passPercent ?? prev?.pass_percent ?? 70;
      const tries = q.maxAttempts ?? prev?.max_attempts ?? 3;
      if (pass < 1 || pass > 100) throw badRequest('INVALID_INPUT', 'The pass mark is 1 to 100%.', { field: 'passPercent' });
      if (tries < 1 || tries > 20) throw badRequest('INVALID_INPUT', 'Attempts are 1 to 20.', { field: 'maxAttempts' });
      const due = 'dueAt' in q ? dateOrNull(q.dueAt, 'dueAt') : prev?.due_at ?? null;
      await db.query(`insert into quizzes (lesson_id, pass_percent, max_attempts, due_at) values ($1, $2, $3, $4)
        on conflict (lesson_id) do update set pass_percent = $2, max_attempts = $3, due_at = $4`, [lessonId, pass, tries, due]);
    }
    if (kind === 'assignment') {
      const a = body.assignment ?? {};
      const { rows: [prev] } = await db.query(`select * from assignments where lesson_id = $1`, [lessonId]);
      const points = a.points ?? prev?.points ?? 10;
      const pass = a.passPoints ?? prev?.pass_points ?? Math.ceil(points * 0.6);
      if (points < 1 || points > 1000) throw badRequest('INVALID_INPUT', 'Points are 1 to 1000.', { field: 'points' });
      if (pass < 0 || pass > points) throw badRequest('INVALID_INPUT', 'The pass mark is between 0 and the points.', { field: 'passPoints' });
      const due = 'dueAt' in a ? dateOrNull(a.dueAt, 'dueAt') : prev?.due_at ?? null;
      await db.query(`insert into assignments (lesson_id, points, pass_points, due_at) values ($1, $2, $3, $4)
        on conflict (lesson_id) do update set points = $2, pass_points = $3, due_at = $4`, [lessonId, points, pass, due]);
    }
  }

  /** Publishing needs every quiz to have questions (LMS-15, ASM-13). */
  async function publishProblem(courseId) {
    const { rows } = await db.query(`select l.title from lessons l where l.course_id = $1 and l.kind = 'quiz'
      and not exists (select 1 from quiz_questions q where q.lesson_id = l.id)`, [courseId]);
    return rows.length ? conflict('QUIZ_EMPTY', `“${rows[0].title}” has no questions yet. Add some before publishing.`) : null;
  }

  const quizOut = (q, n) => ({ passPercent: q.pass_percent, maxAttempts: q.max_attempts, dueAt: q.due_at, closed: isPast(q.due_at), questionCount: n });
  const attemptSummary = (a) => ({ id: a.id, number: a.number, score: a.score, total: a.total, passed: a.passed, startedAt: a.started_at, submittedAt: a.submitted_at });

  /** What GET /lessons/:id adds for a quiz or an assignment: settings, and the learner's own state. */
  async function lessonExtras(req, l, r) {
    const uid = req.user.id;
    if (l.kind === 'quiz') {
      const [{ rows: [q] }, { rows: questions }, { rows: attempts }] = await Promise.all([
        db.query(`select * from quizzes where lesson_id = $1`, [l.id]),
        db.query(`select id, prompt, choices, answer from quiz_questions where lesson_id = $1 order by position`, [l.id]),
        db.query(`select * from quiz_attempts where lesson_id = $1 and user_id = $2 order by number`, [l.id, uid]),
      ]);
      if (!q) return {};
      const done = attempts.filter((a) => a.submitted_at);
      const best = done.reduce((b, a) => (!b || a.score * b.total > b.score * a.total ? a : b), null);
      return {
        quiz: {
          ...quizOut(q, questions.length),
          ...(r.manage ? { questions: questions.map((x) => ({ id: x.id, prompt: x.prompt, choices: x.choices, answer: x.answer })) } : {}),
          mine: { attemptsUsed: attempts.length, attemptsLeft: Math.max(0, q.max_attempts - attempts.length), openAttemptId: attempts.find((a) => !a.submitted_at)?.id ?? null,
            best: best ? { score: best.score, total: best.total } : null, passed: done.some((a) => a.passed), attempts: done.map(attemptSummary) },
        },
      };
    }
    if (l.kind === 'assignment') {
      const [{ rows: [a] }, { rows: [s] }] = await Promise.all([
        db.query(`select * from assignments where lesson_id = $1`, [l.id]),
        db.query(`select * from submissions where lesson_id = $1 and user_id = $2`, [l.id, uid]),
      ]);
      if (!a) return {};
      return { assignment: { points: a.points, passPoints: a.pass_points, dueAt: a.due_at, closed: isPast(a.due_at), mine: s ? await submissionOut(s, { own: true }) : null } };
    }
    return {};
  }

  // ---- Quiz questions (managers) --------------------------------------------------------------
  // The whole list at once, validated so no question can be saved without a valid answer (ASM-13).
  // Changing it moves the quiz to a new version; attempts already open keep their copy (ASM-04).
  app.put('/lessons/:id/questions', { schema: { body: { type: 'object', required: ['questions'], additionalProperties: false, properties: {
    questions: { type: 'array', maxItems: 50, items: { type: 'object', required: ['prompt', 'choices', 'answer'], additionalProperties: false, properties: {
      prompt: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } } } } } } } }, async (req) => {
    const l = await lessonOf(req.params.id);
    const r = await manager(req, l.course_id);
    if (r.c.status === 'archived') throw conflict('ARCHIVED', 'This course is archived and read-only.');
    if (l.kind !== 'quiz') throw badRequest('NOT_A_QUIZ', 'Only quiz lessons have questions.');
    const qs = req.body.questions.map((q, i) => {
      const prompt = q.prompt.trim();
      const choices = q.choices.map((c) => c.trim());
      const where = { field: `questions.${i}`, question: i + 1 };
      if (!prompt || prompt.length > 1000) throw badRequest('INVALID_QUESTION', `Question ${i + 1} needs its question text (up to 1000 characters).`, where);
      if (choices.length < 2 || choices.length > 6) throw badRequest('INVALID_QUESTION', `Question ${i + 1} needs 2 to 6 choices.`, where);
      if (choices.some((c) => !c || c.length > 300)) throw badRequest('INVALID_QUESTION', `Question ${i + 1} has an empty choice.`, where);
      if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) throw badRequest('INVALID_QUESTION', `Question ${i + 1} has the same choice twice.`, where);
      if (!(q.answer >= 0 && q.answer < choices.length)) throw badRequest('INVALID_QUESTION', `Pick the right answer for question ${i + 1}.`, where);
      return { prompt, choices, answer: q.answer };
    });
    await db.tx(async (t) => {
      await t.query(`delete from quiz_questions where lesson_id = $1`, [l.id]);
      for (const [i, q] of qs.entries()) {
        await t.query(`insert into quiz_questions (id, lesson_id, position, prompt, choices, answer) values ($1, $2, $3, $4, $5, $6)`, [newId('qq'), l.id, i, q.prompt, JSON.stringify(q.choices), q.answer]);
      }
      await t.query(`update quizzes set version = version + 1 where lesson_id = $1`, [l.id]);
    });
    return fresh(req, l.course_id);
  });

  // ---- Quiz attempts (learners, D7) -----------------------------------------------------------
  const attemptOut = (a) => ({ id: a.id, number: a.number, startedAt: a.started_at, submittedAt: a.submitted_at, answers: a.answers,
    questions: a.questions.map((q) => ({ id: q.id, prompt: q.prompt, choices: q.choices })) }); // never the answers while open

  async function learnerQuiz(req, lessonId) {
    const uid = signedIn(req);
    const l = await lessonOf(lessonId);
    if (l.kind !== 'quiz') throw badRequest('NOT_A_QUIZ', 'That lesson isn’t a quiz.');
    const r = await loadCourse(req, l.course_id);
    if (!r.learner) throw forbidden('Enrol in this course to take its quizzes.', 'NOT_ENROLLED');
    if (r.c.status === 'archived') throw conflict('ARCHIVED', 'This course is archived and read-only.');
    const { rows: [q] } = await db.query(`select * from quizzes where lesson_id = $1`, [l.id]);
    if (!q) throw notFound('That quiz doesn’t exist.');
    return { uid, l, r, q };
  }
  const closedError = (q) => conflict('QUIZ_CLOSED', `This quiz closed on ${new Date(q.due_at).toUTCString()}.`, { dueAt: q.due_at });

  // Start, or carry on with the attempt already open (ASM-02). The learner's enrolment row is
  // locked while counting, so two devices can't both start the last attempt (ASM-14).
  app.post('/lessons/:id/attempts', async (req, reply) => {
    const { uid, l, q } = await learnerQuiz(req, req.params.id);
    if (isPast(q.due_at)) throw closedError(q); // checked on the server, whatever the page's clock says (ASM-03)
    const attempt = await db.tx(async (t) => {
      await t.query(`select 1 from enrollments where course_id = $1 and user_id = $2 for update`, [l.course_id, uid]);
      const { rows: [open] } = await t.query(`select * from quiz_attempts where lesson_id = $1 and user_id = $2 and submitted_at is null`, [l.id, uid]);
      if (open) return open;
      const { rows: [{ n }] } = await t.query(`select count(*)::int as n from quiz_attempts where lesson_id = $1 and user_id = $2`, [l.id, uid]);
      if (n >= q.max_attempts) throw conflict('NO_ATTEMPTS_LEFT', 'You’ve used all your attempts. Your best score stands.');
      const { rows: [cur] } = await t.query(`select version from quizzes where lesson_id = $1`, [l.id]);
      const { rows: questions } = await t.query(`select id, prompt, choices, answer from quiz_questions where lesson_id = $1 order by position`, [l.id]);
      if (!questions.length) throw conflict('QUIZ_EMPTY', 'This quiz has no questions yet.');
      const { rows: [a] } = await t.query(`insert into quiz_attempts (id, lesson_id, user_id, number, quiz_version, questions) values ($1, $2, $3, $4, $5, $6) returning *`,
        [newId('att'), l.id, uid, n + 1, cur.version, JSON.stringify(questions)]);
      a.fresh = true;
      return a;
    });
    if (attempt.fresh) reply.status(201);
    return { attempt: attemptOut(attempt) };
  });

  const ownAttempt = async (req, id) => {
    const uid = signedIn(req);
    const { rows: [a] } = await db.query(`select * from quiz_attempts where id = $1`, [id]);
    if (!a || a.user_id !== uid) throw notFound('That attempt doesn’t exist.'); // nobody else's (ASM-12)
    return a;
  };
  const cleanAnswers = (a, answers) => {
    const out = {};
    for (const [qid, choice] of Object.entries(answers ?? {})) {
      const q = a.questions.find((x) => x.id === qid);
      if (q && Number.isInteger(choice) && choice >= 0 && choice < q.choices.length) out[qid] = choice;
    }
    return out;
  };

  // Answers are saved as you go: each change is merged in, so nothing typed is lost to a reload.
  app.patch('/attempts/:id', { schema: { body: { type: 'object', required: ['answers'], additionalProperties: false, properties: { answers: { type: 'object' } } } } }, async (req) => {
    const a = await ownAttempt(req, req.params.id);
    if (a.submitted_at) throw conflict('ALREADY_SUBMITTED', 'This attempt has been submitted.');
    const { q } = await learnerQuiz(req, a.lesson_id);
    if (isPast(q.due_at)) throw closedError(q);
    const { rows: [u] } = await db.query(`update quiz_attempts set answers = answers || $2::jsonb where id = $1 and submitted_at is null returning *`, [a.id, JSON.stringify(cleanAnswers(a, req.body.answers))]);
    if (!u) throw conflict('ALREADY_SUBMITTED', 'This attempt has been submitted.');
    return { attempt: attemptOut(u) };
  });

  // Submitting twice returns the first result (ASM-01). Marked against the attempt's own copy of
  // the questions (ASM-04). A pass completes the lesson; the best score is what's shown.
  app.post('/attempts/:id/submit', { schema: { body: { type: ['object', 'null'], additionalProperties: false, properties: { answers: { type: 'object' } } } } }, async (req) => {
    const a = await ownAttempt(req, req.params.id);
    if (!a.submitted_at) {
      const { l, q } = await learnerQuiz(req, a.lesson_id);
      if (isPast(q.due_at)) throw closedError(q);
      const done = await db.tx(async (t) => {
        const { rows: [cur] } = await t.query(`select * from quiz_attempts where id = $1 for update`, [a.id]);
        if (cur.submitted_at) return cur;
        const answers = { ...cur.answers, ...cleanAnswers(cur, req.body?.answers) };
        const score = cur.questions.filter((x) => answers[x.id] === x.answer).length;
        const total = cur.questions.length;
        const passed = score * 100 >= q.pass_percent * total;
        const { rows: [u] } = await t.query(`update quiz_attempts set answers = $2, submitted_at = now(), score = $3, total = $4, passed = $5 where id = $1 returning *`,
          [cur.id, JSON.stringify(answers), score, total, passed]);
        return u;
      });
      if (done.passed) await passLesson(req, l, a.user_id);
    }
    return result(req, a.id);
  });

  /** An attempt's result and review. Right answers show once you've passed or have no attempts left. */
  async function result(req, id) {
    const a = await ownAttempt(req, id);
    const { rows: [q] } = await db.query(`select * from quizzes where lesson_id = $1`, [a.lesson_id]);
    const { rows: all } = await db.query(`select * from quiz_attempts where lesson_id = $1 and user_id = $2`, [a.lesson_id, a.user_id]);
    const done = all.filter((x) => x.submitted_at);
    const best = done.reduce((b, x) => (!b || x.score * b.total > b.score * x.total ? x : b), null);
    const attemptsLeft = Math.max(0, q.max_attempts - all.length);
    const reveal = done.some((x) => x.passed) || attemptsLeft === 0;
    return {
      attempt: attemptSummary(a), passPercent: q.pass_percent, attemptsLeft, closed: isPast(q.due_at),
      best: best ? { score: best.score, total: best.total, passed: done.some((x) => x.passed) } : null,
      review: a.submitted_at ? a.questions.map((x) => {
        const yours = a.answers?.[x.id];
        return { id: x.id, prompt: x.prompt, choices: x.choices, yours: yours ?? null, correct: yours === x.answer, ...(reveal ? { answer: x.answer } : {}) };
      }) : null,
    };
  }
  app.get('/attempts/:id', async (req) => result(req, req.params.id));

  // ---- Assignments (learners) -----------------------------------------------------------------
  const fileRows = async (ids) => (ids.length ? (await db.query(`select id, name, mime, kind, size from files where id = any($1) and deleted_at is null`, [ids])).rows : []);
  async function submissionOut(s, { own = false, manage = false, me = null } = {}) {
    const files = await fileRows(s.file_ids);
    const locked = s.lock_by && s.status === 'submitted' && new Date(s.lock_at) > new Date(Date.now() - LOCK_MINUTES * 60e3);
    const { rows: [lockUser] } = locked ? await db.query(`select id, name from users where id = $1`, [s.lock_by]) : { rows: [] };
    return {
      id: s.id, lessonId: s.lesson_id, body: s.body, files: s.file_ids.map((id) => files.find((f) => f.id === id)).filter(Boolean),
      status: s.status, submittedAt: s.submitted_at, late: s.late, version: s.version,
      // Learners see their grade once it's returned; drafts stay with the instructors.
      ...(s.status === 'returned' ? { grade: s.grade, feedback: s.feedback, points: s.graded_points, passPoints: s.graded_pass, passed: s.passed, returnedAt: s.returned_at } : {}),
      ...(manage ? { draftGrade: s.draft_grade, draftFeedback: s.draft_feedback, lockedBy: locked ? { id: lockUser.id, name: lockUser.name, me: lockUser.id === me } : null } : {}),
      ...(own ? { beingGraded: !!locked } : {}),
    };
  }

  // Send (or send again) your work. Not while an instructor is grading it, and not once it's passed.
  app.put('/lessons/:id/submission', { schema: { body: { type: 'object', additionalProperties: false, properties: {
    body: { type: ['string', 'null'] }, fileIds: { type: 'array', items: { type: 'string' }, maxItems: 5 } } } } }, async (req) => {
    const uid = signedIn(req);
    const l = await lessonOf(req.params.id);
    if (l.kind !== 'assignment') throw badRequest('NOT_AN_ASSIGNMENT', 'That lesson isn’t an assignment.');
    const r = await loadCourse(req, l.course_id);
    if (!r.learner) throw forbidden('Enrol in this course to send work.', 'NOT_ENROLLED');
    if (r.c.status === 'archived') throw conflict('ARCHIVED', 'This course is archived and read-only.');
    const { rows: [a] } = await db.query(`select * from assignments where lesson_id = $1`, [l.id]);
    if (!a) throw notFound('That assignment doesn’t exist.');
    const body = (req.body.body ?? '').trim() || null;
    if (body && body.length > 20000) throw badRequest('TOO_LONG', 'Your answer can be up to 20,000 characters.', { field: 'body' });
    const ids = [...new Set(req.body.fileIds ?? [])];
    if (ids.length) {
      const { rows } = await db.query(`select id from files where id = any($1) and community_id = $2 and uploaded_by = $3 and deleted_at is null`, [ids, r.c.community_id, uid]);
      if (rows.length !== ids.length) throw badRequest('INVALID_FILE', 'One of the files isn’t available. Upload it again.', { field: 'fileIds' });
    }
    if (!body && !ids.length) throw badRequest('INVALID_INPUT', 'Write an answer or attach a file.', { field: 'body' });
    const s = await db.tx(async (t) => {
      const { rows: [prev] } = await t.query(`select * from submissions where lesson_id = $1 and user_id = $2 for update`, [l.id, uid]);
      if (prev?.passed) throw conflict('ALREADY_PASSED', 'This assignment has been graded as passed.');
      if (prev?.status === 'submitted' && prev.lock_by && new Date(prev.lock_at) > new Date(Date.now() - LOCK_MINUTES * 60e3)) {
        throw conflict('BEING_GRADED', 'An instructor is grading your work right now. Try again once it’s returned.');
      }
      const { rows: [out] } = await t.query(
        `insert into submissions (id, lesson_id, course_id, user_id, body, file_ids, late) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (lesson_id, user_id) do update set body = $5, file_ids = $6, late = $7, status = 'submitted', submitted_at = now(),
           draft_grade = null, draft_feedback = null, lock_by = null, lock_at = null, version = submissions.version + 1
         returning *`, [newId('sub'), l.id, l.course_id, uid, body, ids, isPast(a.due_at)]);
      return out;
    });
    return { submission: await submissionOut(s, { own: true }) };
  });

  // ---- Grading (managers, ASM-06/07) ----------------------------------------------------------
  /** Submissions in the courses this person manages in a community, oldest first. */
  app.get('/communities/:id/grading', async (req) => {
    const uid = signedIn(req);
    const status = ['to_grade', 'graded', 'all'].includes(req.query.status) ? req.query.status : 'to_grade';
    const { rows: courses } = await db.query(`select id from courses where community_id = (select id from communities where id = $1 or slug = $1 limit 1)`, [req.params.id]);
    const mine = [];
    for (const c of courses) { const r = await loadCourse(req, c.id).catch(() => null); if (r?.manage) mine.push(r.c); }
    if (!mine.length) throw forbidden('Only Instructors and Admins grade work.', 'NOT_A_GRADER');
    const ids = mine.map((c) => c.id).filter((id) => !req.query.course || id === req.query.course);
    const { rows } = await db.query(
      `select s.*, u.name as learner_name, l.title as lesson_title, c.title as course_title, lk.name as lock_name
         from submissions s join users u on u.id = s.user_id join lessons l on l.id = s.lesson_id join courses c on c.id = s.course_id
         left join users lk on lk.id = s.lock_by
        where s.course_id = any($1) and ($2 = 'all' or ($2 = 'to_grade' and s.status = 'submitted') or ($2 = 'graded' and s.status = 'returned'))
        order by s.submitted_at asc limit 200`, [ids, status]);
    const fresh = (s) => s.lock_by && s.status === 'submitted' && new Date(s.lock_at) > new Date(Date.now() - LOCK_MINUTES * 60e3);
    return {
      courses: mine.map((c) => ({ id: c.id, title: c.title })),
      submissions: rows.map((s) => ({ id: s.id, learner: { id: s.user_id, name: s.learner_name }, lesson: { id: s.lesson_id, title: s.lesson_title }, course: { id: s.course_id, title: s.course_title },
        status: s.status, submittedAt: s.submitted_at, late: s.late, grade: s.grade, passed: s.passed,
        lockedBy: fresh(s) ? { id: s.lock_by, name: s.lock_name, me: s.lock_by === uid } : null })),
    };
  });

  /** One submission: its learner or the course's managers only (ASM-12, ASM-07). */
  async function submissionFor(req, id) {
    const uid = signedIn(req);
    const { rows: [s] } = await db.query(`select * from submissions where id = $1`, [id]);
    if (!s) throw notFound('That submission doesn’t exist.');
    const r = await loadCourse(req, s.course_id).catch(() => null);
    if (s.user_id !== uid && !r?.manage) throw notFound('That submission doesn’t exist.');
    return { s, r, uid };
  }
  const gradingView = async (s, uid) => {
    const [{ rows: [a] }, { rows: [l] }, { rows: [u] }] = await Promise.all([
      db.query(`select * from assignments where lesson_id = $1`, [s.lesson_id]),
      db.query(`select id, title, body, course_id from lessons where id = $1`, [s.lesson_id]),
      db.query(`select id, name from users where id = $1`, [s.user_id]),
    ]);
    return { submission: { ...(await submissionOut(s, { manage: true, me: uid })), learner: u, lesson: { id: l.id, title: l.title, instructions: l.body },
      assignment: { points: a.points, passPoints: a.pass_points, dueAt: a.due_at } } };
  };
  app.get('/submissions/:id', async (req) => {
    const { s, r, uid } = await submissionFor(req, req.params.id);
    if (!r?.manage) return { submission: await submissionOut(s, { own: true }) };
    return gradingView(s, uid);
  });

  // Opening a submission to grade takes it: others can read it but not grade it until it's returned
  // or released, or the lock is older than 30 minutes (ASM-06).
  app.post('/submissions/:id/claim', async (req) => {
    const { s, r, uid } = await submissionFor(req, req.params.id);
    if (!r?.manage) throw forbidden('Only this course’s Instructors and the community’s Admins grade it.', 'NOT_A_GRADER');
    if (s.status !== 'submitted') throw conflict('ALREADY_RETURNED', 'This work has already been returned.');
    const claimed = await db.tx(async (t) => {
      const { rows: [cur] } = await t.query(`select s.*, u.name as lock_name from submissions s left join users u on u.id = s.lock_by where s.id = $1 for update of s`, [s.id]);
      const held = cur.lock_by && cur.lock_by !== uid && new Date(cur.lock_at) > new Date(Date.now() - LOCK_MINUTES * 60e3);
      if (held) throw conflict('LOCKED', `${cur.lock_name} is grading this.`, { by: cur.lock_name });
      const { rows: [u] } = await t.query(`update submissions set lock_by = $2, lock_at = now() where id = $1 returning *`, [s.id, uid]);
      return u;
    });
    return gradingView(claimed, uid);
  });
  app.delete('/submissions/:id/claim', async (req) => {
    const { s, uid } = await submissionFor(req, req.params.id);
    await db.query(`update submissions set lock_by = null, lock_at = null where id = $1 and lock_by = $2`, [s.id, uid]);
    return { ok: true };
  });

  const GRADE = { type: 'object', additionalProperties: false, properties: { grade: { type: ['integer', 'null'] }, feedback: { type: ['string', 'null'] } } };
  /** Changes that need the grading lock, held by the caller. */
  async function withLock(req, id, fn) {
    const { s, r, uid } = await submissionFor(req, id);
    if (!r?.manage) throw forbidden('Only this course’s Instructors and the community’s Admins grade it.', 'NOT_A_GRADER');
    const { rows: [a] } = await db.query(`select * from assignments where lesson_id = $1`, [s.lesson_id]);
    const out = await db.tx(async (t) => {
      const { rows: [cur] } = await t.query(`select * from submissions where id = $1 for update`, [s.id]);
      if (cur.status !== 'submitted') throw conflict('ALREADY_RETURNED', 'This work has already been returned.');
      if (cur.lock_by !== uid) throw conflict('NOT_LOCKED', 'Open this work to grade it first; someone else may be grading it.');
      return fn(t, cur, a, uid);
    });
    return { out, s, uid };
  }
  const checkGrade = (grade, a) => {
    if (grade != null && (grade < 0 || grade > a.points)) throw badRequest('INVALID_INPUT', `The grade is 0 to ${a.points}.`, { field: 'grade' });
  };

  app.patch('/submissions/:id/draft', { schema: { body: GRADE } }, async (req) => {
    const { out, uid } = await withLock(req, req.params.id, async (t, cur, a) => {
      checkGrade(req.body.grade, a);
      const { rows: [u] } = await t.query(`update submissions set draft_grade = $2, draft_feedback = $3, lock_at = now() where id = $1 returning *`,
        [cur.id, req.body.grade ?? null, (req.body.feedback ?? '').trim() || null]);
      return u;
    });
    return gradingView(out, uid);
  });

  // Return to the learner: the grade keeps the points and pass mark it was given against (ASM-05).
  app.post('/submissions/:id/return', { schema: { body: { ...GRADE, required: ['grade'] } } }, async (req) => {
    const { out, uid } = await withLock(req, req.params.id, async (t, cur, a, grader) => {
      if (req.body.grade == null) throw badRequest('INVALID_INPUT', 'Give a grade before returning the work.', { field: 'grade' });
      checkGrade(req.body.grade, a);
      const { rows: [u] } = await t.query(`update submissions set status = 'returned', grade = $2, feedback = $3, graded_points = $4, graded_pass = $5, passed = $6,
          graded_by = $7, returned_at = now(), draft_grade = null, draft_feedback = null, lock_by = null, lock_at = null where id = $1 returning *`,
      [cur.id, req.body.grade, (req.body.feedback ?? '').trim() || null, a.points, a.pass_points, req.body.grade >= a.pass_points, grader]);
      return u;
    });
    await audit(db, { actorId: uid, action: 'submission.return', targetType: 'submission', targetId: out.id, context: { grade: out.grade, passed: out.passed }, ip: req.ip });
    const { rows: [c] } = await db.query(`select community_id from courses where id = $1`, [out.course_id]);
    await notify(ctx, req, { to: [out.user_id], type: 'submission_returned', actorId: uid, communityId: c.community_id, targetType: 'lesson', targetId: out.lesson_id, dedupe: `returned:${out.id}:${out.version}` });
    if (out.passed) await passLesson(req, { id: out.lesson_id, course_id: out.course_id }, out.user_id);
    return gradingView(out, uid);
  });

  // ---- Certificates (D8) ----------------------------------------------------------------------
  const certOut = (c) => ({ code: c.code, name: c.name, course: c.course_title, community: c.community_name, issuedAt: c.issued_at, revoked: !!c.revoked_at });
  app.get('/me/certificates', async (req) => {
    const uid = signedIn(req);
    const { rows } = await db.query(`select c.*, co.slug as community_slug, co.accent as community_accent from certificates c left join communities co on co.id = c.community_id
      where c.user_id = $1 order by c.issued_at desc`, [uid]);
    return { certificates: rows.map((c) => ({ ...certOut(c), courseId: c.course_id, communityRef: c.community_id ? { id: c.community_id, slug: c.community_slug, name: c.community_name, accent: c.community_accent } : null })) };
  });

  // Public: anyone with the code can check it. Only name, course, community, date and code (D8).
  app.get('/certificates/:code', { config: { rateLimit: ctx.rateLimits ? { max: 30, timeWindow: '1 minute' } : false } }, async (req) => {
    const code = String(req.params.code).trim().toUpperCase();
    const { rows: [c] } = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? await db.query(`select * from certificates where code = $1`, [code]) : { rows: [] };
    if (!c) throw notFound('No certificate matches this code.');
    return { certificate: certOut(c) };
  });

  return { finish, saveConfig, lessonExtras, publishProblem };
}
