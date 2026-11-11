// Learning inside communities (redesign Stage 5a). LMS-* cases are referenced where handled.
//
// Who can do what (decision D1):
//   - manage a course (edit, publish, see learners): the community's Owners and Admins, and the
//     members assigned as Instructor for that course (and only that course, LMS-14). Instructor
//     rights need an active membership, so an instructor who leaves loses them at once (LMS-02).
//   - see the catalogue: anyone who can view the community. Enrol: active members (D3).
//   - open a lesson: an active enrolment while still a member, or a manager (LMS-08, D4).
import { audit } from '../lib/audit.js';
import { access } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { idempotent } from '../lib/session.js';

const STATUSES_LISTED = ['published'];
const isHttp = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const text = (v, max, field, { required = false } = {}) => {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw badRequest('INVALID_INPUT', `Fill in the ${field}.`, { field });
  if (s.length > max) throw badRequest('TOO_LONG', `The ${field} can be up to ${max} characters.`, { field });
  return s || null;
};

export default async function learningRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };

  /** A course and what the caller may do with it. Hidden from people who can't see it. */
  async function loadCourse(req, id) {
    const uid = signedIn(req);
    const { rows: [c] } = await db.query(`select * from courses where id = $1`, [id]);
    if (!c) throw notFound('That course doesn’t exist.');
    const a = await access(db, req, c.community_id);
    const { rows: [r] } = await db.query(`select
        exists (select 1 from course_instructors i where i.course_id = $1 and i.user_id = $2) as instructor,
        (select row_to_json(e) from enrollments e where e.course_id = $1 and e.user_id = $2) as enrollment`, [c.id, uid]);
    const instructor = r.instructor && a.state === 'active';
    const manage = a.canAdmin || instructor;
    const enrollment = r.enrollment;
    // Learners keep access while they're members of the community (D4, LMS-09).
    const learner = enrollment?.status === 'active' && (a.member || a.adminMode);
    const visible = manage || learner || (a.canView && c.status === 'published');
    if (!visible) throw notFound('That course doesn’t exist.');
    return { c, a, manage, instructor, learner, enrollment };
  }

  const outline = async (courseId) => {
    const [mods, lessons] = await Promise.all([
      db.query(`select id, title, position from course_modules where course_id = $1 order by position, id`, [courseId]),
      db.query(`select id, module_id, title, kind, duration_min, required, position, created_at from lessons where course_id = $1 order by position, id`, [courseId]),
    ]);
    return mods.rows.map((m) => ({ id: m.id, title: m.title,
      lessons: lessons.rows.filter((l) => l.module_id === m.id).map((l) => ({ id: l.id, title: l.title, kind: l.kind, durationMin: l.duration_min, required: l.required, createdAt: l.created_at })) }));
  };

  /** Lessons that count for this learner: required ones, except lessons added after they completed (D6, LMS-04). */
  const countedFor = (lessons, enr) => lessons.filter((l) => l.required && (!enr?.completed_at || new Date(l.createdAt) <= new Date(enr.completed_at)));

  async function progressOf(courseId, uid) {
    const { rows } = await db.query(`select lesson_id from lesson_progress where course_id = $1 and user_id = $2`, [courseId, uid]);
    return new Set(rows.map((r) => r.lesson_id));
  }

  async function present(req, c, { a, manage, instructor, enrollment }, { full = false } = {}) {
    const uid = req.user.id;
    const [mods, instructors, seats, done] = await Promise.all([
      outline(c.id),
      db.query(`select u.id, u.name from course_instructors i join users u on u.id = i.user_id where i.course_id = $1 and u.status = 'active' order by u.name`, [c.id]),
      db.query(`select count(*) filter (where status = 'active')::int as active, count(*) filter (where status = 'waitlist')::int as waiting,
          count(*) filter (where completed_at is not null)::int as completed from enrollments where course_id = $1`, [c.id]),
      progressOf(c.id, uid),
    ]);
    const lessons = mods.flatMap((m) => m.lessons);
    const counted = countedFor(lessons, enrollment);
    const s = seats.rows[0];
    const out = {
      id: c.id, communityId: c.community_id, title: c.title, description: c.description, objectives: c.objectives, requirements: c.requirements,
      category: c.category, status: c.status, visibility: c.visibility, capacity: c.capacity, version: c.version,
      instructors: instructors.rows, lessonCount: lessons.length, durationMin: lessons.reduce((n, l) => n + (l.durationMin || 0), 0),
      enrolledCount: s.active, waitlistCount: s.waiting, seatsLeft: c.capacity == null ? null : Math.max(0, c.capacity - s.active),
      enrollment: enrollment ? { status: enrollment.status, completedAt: enrollment.completed_at, enrolledAt: enrollment.enrolled_at } : null,
      progress: { done: counted.filter((l) => done.has(l.id)).length, total: counted.length },
      nextLessonId: (counted.find((l) => !done.has(l.id)) ?? lessons.find((l) => !done.has(l.id)))?.id ?? lessons[0]?.id ?? null,
      can: {
        manage, assignInstructors: !!a.canAdmin, instructor,
        enroll: c.status === 'published' && a.canParticipate && (!enrollment || enrollment.status === 'left'),
      },
    };
    if (full) {
      out.modules = mods.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, done: done.has(l.id),
        isNew: !!enrollment?.completed_at && new Date(l.createdAt) > new Date(enrollment.completed_at) })) }));
      if (manage) out.completedCount = s.completed;
    }
    return out;
  }

  // ---- Catalogue -----------------------------------------------------------------------------
  app.get('/communities/:id/courses', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canView) throw forbidden('Courses are for members.');
    const { rows } = await db.query(
      `select c.* from courses c
        where c.community_id = $1
          and ((c.status = any($3) and c.visibility = 'members')
               or exists (select 1 from enrollments e where e.course_id = c.id and e.user_id = $2 and e.status in ('active', 'waitlist'))
               or $4::boolean
               or exists (select 1 from course_instructors i where i.course_id = c.id and i.user_id = $2))
        order by c.status = 'published' desc, c.published_at desc nulls last, c.created_at desc`, [a.community.id, uid, STATUSES_LISTED, !!a.canAdmin]);
    const out = [];
    for (const c of rows) {
      const r = await loadCourse(req, c.id).catch(() => null);
      if (r) out.push(await present(req, c, r));
    }
    return { courses: out, canCreate: !!a.canAdmin && a.community.status === 'active' };
  });

  const COURSE_FIELDS = { title: { type: 'string' }, description: { type: ['string', 'null'] }, objectives: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    requirements: { type: ['string', 'null'] }, category: { type: ['string', 'null'] }, capacity: { type: ['integer', 'null'] }, visibility: { type: 'string', enum: ['members', 'hidden'] } };
  const courseValues = (b, prev = {}) => ({
    title: 'title' in b ? text(b.title, 160, 'title', { required: true }) : prev.title,
    description: 'description' in b ? text(b.description, 4000, 'description') : prev.description ?? null,
    objectives: 'objectives' in b ? JSON.stringify(b.objectives.map((o) => String(o).trim()).filter(Boolean).map((o) => o.slice(0, 200))) : JSON.stringify(prev.objectives ?? []),
    requirements: 'requirements' in b ? text(b.requirements, 1000, 'requirements') : prev.requirements ?? null,
    category: 'category' in b ? text(b.category, 40, 'category') : prev.category ?? null,
    capacity: 'capacity' in b ? (b.capacity == null ? null : (b.capacity > 0 ? b.capacity : (() => { throw badRequest('INVALID_INPUT', 'Places must be at least 1, or no limit.', { field: 'capacity' }); })())) : prev.capacity ?? null,
    visibility: b.visibility ?? prev.visibility ?? 'members',
  });

  app.post('/communities/:id/courses', { schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: COURSE_FIELDS } } }, async (req, reply) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only community Owners and Admins create courses.');
    return idempotent(db, req, reply, async () => {
      const v = courseValues(req.body);
      const id = newId('crs');
      await db.tx(async (t) => {
        await t.query(`insert into courses (id, community_id, title, description, objectives, requirements, category, capacity, visibility, created_by)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [id, a.community.id, v.title, v.description, v.objectives, v.requirements, v.category, v.capacity, v.visibility, uid]);
        await t.query(`insert into course_modules (id, course_id, title, position) values ($1, $2, 'Module 1', 0)`, [newId('mod'), id]);
      });
      await audit(db, { actorId: uid, action: 'course.create', targetType: 'course', targetId: id, context: { community: a.community.id }, ip: req.ip });
      reply.status(201);
      const r = await loadCourse(req, id);
      return { course: await present(req, r.c, r, { full: true }) };
    });
  });

  app.get('/courses/:id', async (req) => {
    const r = await loadCourse(req, req.params.id);
    return { course: await present(req, r.c, r, { full: true }) };
  });

  app.patch('/courses/:id', { schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: { ...COURSE_FIELDS, version: { type: 'integer' } } } } }, async (req) => {
    const r = await loadCourse(req, req.params.id);
    if (!r.manage) throw forbidden('Only this course’s Instructors and the community’s Admins can edit it.');
    const v = courseValues(req.body, r.c);
    const { rows } = await db.query(`update courses set title = $3, description = $4, objectives = $5, requirements = $6, category = $7, capacity = $8, visibility = $9,
        version = version + 1, updated_at = now() where id = $1 and version = $2 returning *`,
    [r.c.id, req.body.version, v.title, v.description, v.objectives, v.requirements, v.category, v.capacity, v.visibility]);
    if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed this course. Reload to see the latest.');
    await promote(r.c.id);
    const fresh = await loadCourse(req, r.c.id);
    return { course: await present(req, fresh.c, fresh, { full: true }) };
  });

  // Publish needs at least one lesson (LMS-15). Unpublish stops new enrolments only (D5, LMS-03).
  for (const [action, from, to] of [['publish', ['draft', 'unpublished'], 'published'], ['unpublish', ['published'], 'unpublished'], ['archive', ['draft', 'published', 'unpublished'], 'archived']]) {
    app.post(`/courses/:id/${action}`, async (req) => {
      const r = await loadCourse(req, req.params.id);
      if (!r.manage) throw forbidden('Only this course’s Instructors and the community’s Admins can do that.');
      if (!from.includes(r.c.status)) throw conflict('WRONG_STATE', `This course is ${r.c.status}, so it can’t be ${action === 'archive' ? 'archived' : `${action}ed`}.`);
      if (action === 'publish') {
        const { rows: [{ n }] } = await db.query(`select count(*)::int as n from lessons where course_id = $1`, [r.c.id]);
        if (!n) throw conflict('NO_LESSONS', 'Add at least one lesson before publishing.');
      }
      await db.query(`update courses set status = $2, version = version + 1, updated_at = now(), published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end where id = $1`, [r.c.id, to]);
      await audit(db, { actorId: req.user.id, action: `course.${action}`, targetType: 'course', targetId: r.c.id, ip: req.ip });
      const fresh = await loadCourse(req, r.c.id);
      return { course: await present(req, fresh.c, fresh, { full: true }) };
    });
  }

  // A course anyone has enrolled in can't be deleted, only archived (D5, LMS-01).
  app.delete('/courses/:id', async (req) => {
    const r = await loadCourse(req, req.params.id);
    if (!r.a.canAdmin) throw forbidden('Only the community’s Owners and Admins can delete a course.');
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from enrollments where course_id = $1`, [r.c.id]);
    if (n) throw conflict('HAS_LEARNERS', 'People have enrolled in this course, so it can’t be deleted. Archive it instead: they keep their progress.');
    await db.query(`delete from courses where id = $1`, [r.c.id]);
    await audit(db, { actorId: req.user.id, action: 'course.delete', targetType: 'course', targetId: r.c.id, ip: req.ip });
    return { ok: true };
  });

  // ---- Instructors (D1) ----------------------------------------------------------------------
  app.post('/courses/:id/instructors', { schema: { body: { type: 'object', required: ['userId'], additionalProperties: false, properties: { userId: { type: 'string' } } } } }, async (req) => {
    const r = await loadCourse(req, req.params.id);
    if (!r.a.canAdmin) throw forbidden('Only the community’s Owners and Admins assign Instructors.');
    const { rows } = await db.query(`select 1 from memberships m join users u on u.id = m.user_id where m.community_id = $1 and m.user_id = $2 and m.state = 'active' and u.status = 'active'`, [r.c.community_id, req.body.userId]);
    if (!rows.length) throw badRequest('NOT_A_MEMBER', 'Instructors must be active members of this community.');
    await db.query(`insert into course_instructors (course_id, user_id) values ($1, $2) on conflict do nothing`, [r.c.id, req.body.userId]);
    await audit(db, { actorId: req.user.id, action: 'course.instructor_add', targetType: 'course', targetId: r.c.id, context: { userId: req.body.userId }, ip: req.ip });
    const fresh = await loadCourse(req, r.c.id);
    return { course: await present(req, fresh.c, fresh, { full: true }) };
  });

  app.delete('/courses/:id/instructors/:userId', async (req) => {
    const r = await loadCourse(req, req.params.id);
    if (!r.a.canAdmin) throw forbidden('Only the community’s Owners and Admins remove Instructors.');
    await db.query(`delete from course_instructors where course_id = $1 and user_id = $2`, [r.c.id, req.params.userId]);
    await audit(db, { actorId: req.user.id, action: 'course.instructor_remove', targetType: 'course', targetId: r.c.id, context: { userId: req.params.userId }, ip: req.ip });
    const fresh = await loadCourse(req, r.c.id);
    return { course: await present(req, fresh.c, fresh, { full: true }) };
  });

  // ---- Modules and lessons (managers) -------------------------------------------------------
  const managed = async (req, courseId) => {
    const r = await loadCourse(req, courseId);
    if (!r.manage) throw forbidden('Only this course’s Instructors and the community’s Admins can change it.');
    if (r.c.status === 'archived') throw conflict('ARCHIVED', 'This course is archived and read-only.');
    return r;
  };
  const fresh = async (req, id) => { const r = await loadCourse(req, id); return { course: await present(req, r.c, r, { full: true }) }; };

  app.post('/courses/:id/modules', { schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: { type: 'string' } } } } }, async (req) => {
    const r = await managed(req, req.params.id);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from course_modules where course_id = $1`, [r.c.id]);
    if (n >= 30) throw badRequest('TOO_MANY', 'A course can have up to 30 modules.');
    await db.query(`insert into course_modules (id, course_id, title, position) values ($1, $2, $3, $4)`, [newId('mod'), r.c.id, text(req.body.title, 160, 'title', { required: true }), n]);
    return fresh(req, r.c.id);
  });

  app.patch('/modules/:id', { schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title: { type: 'string' } } } } }, async (req) => {
    const { rows: [m] } = await db.query(`select * from course_modules where id = $1`, [req.params.id]);
    if (!m) throw notFound('That module doesn’t exist.');
    await managed(req, m.course_id);
    await db.query(`update course_modules set title = $2 where id = $1`, [m.id, text(req.body.title, 160, 'title', { required: true })]);
    return fresh(req, m.course_id);
  });

  app.delete('/modules/:id', async (req) => {
    const { rows: [m] } = await db.query(`select * from course_modules where id = $1`, [req.params.id]);
    if (!m) throw notFound('That module doesn’t exist.');
    await managed(req, m.course_id);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from course_modules where course_id = $1`, [m.course_id]);
    if (n <= 1) throw conflict('LAST_MODULE', 'A course needs at least one module.');
    await db.query(`delete from course_modules where id = $1`, [m.id]);
    return fresh(req, m.course_id);
  });

  const LESSON = { title: { type: 'string' }, kind: { type: 'string', enum: ['text', 'file', 'link'] }, body: { type: ['string', 'null'] }, url: { type: ['string', 'null'] },
    fileIds: { type: 'array', items: { type: 'string' }, maxItems: 10 }, durationMin: { type: ['integer', 'null'] }, required: { type: 'boolean' } };
  async function lessonValues(b, prev, courseId, communityId, uid) {
    const v = {
      title: 'title' in b ? text(b.title, 160, 'title', { required: true }) : prev.title,
      kind: b.kind ?? prev.kind ?? 'text',
      body: 'body' in b ? text(b.body, 20000, 'lesson text') : prev.body ?? null,
      url: 'url' in b ? text(b.url, 2000, 'link') : prev.url ?? null,
      durationMin: 'durationMin' in b ? b.durationMin : prev.duration_min ?? null,
      required: b.required ?? prev.required ?? true,
      fileIds: prev.file_ids ?? [],
    };
    if (v.url && !isHttp(v.url)) throw badRequest('INVALID_URL', 'Use a link that starts with http:// or https://.', { field: 'url' });
    if (v.kind === 'link' && !v.url) throw badRequest('INVALID_INPUT', 'A link lesson needs a link.', { field: 'url' });
    if (v.durationMin != null && (v.durationMin < 1 || v.durationMin > 600)) throw badRequest('INVALID_INPUT', 'Duration is 1 to 600 minutes.', { field: 'durationMin' });
    if ('fileIds' in b) {
      const ids = [...new Set(b.fileIds)];
      // Files from this community's store: ones this person uploaded, or already on this lesson.
      const { rows } = await db.query(`select id from files where id = any($1) and community_id = $2 and deleted_at is null and (uploaded_by = $3 or id = any($4))`, [ids, communityId, uid, prev.file_ids ?? []]);
      if (rows.length !== ids.length) throw badRequest('INVALID_FILE', 'One of the files isn’t available. Upload it again.', { field: 'fileIds' });
      v.fileIds = ids;
    }
    if (v.kind === 'file' && !v.fileIds.length) throw badRequest('INVALID_INPUT', 'A file lesson needs at least one file.', { field: 'fileIds' });
    void courseId;
    return v;
  }

  app.post('/modules/:id/lessons', { schema: { body: { type: 'object', required: ['title'], additionalProperties: false, properties: LESSON } } }, async (req) => {
    const { rows: [m] } = await db.query(`select * from course_modules where id = $1`, [req.params.id]);
    if (!m) throw notFound('That module doesn’t exist.');
    const r = await managed(req, m.course_id);
    const v = await lessonValues(req.body, {}, m.course_id, r.c.community_id, req.user.id);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from lessons where module_id = $1`, [m.id]);
    const id = newId('les');
    await db.query(`insert into lessons (id, course_id, module_id, title, kind, body, url, file_ids, duration_min, required, position) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, m.course_id, m.id, v.title, v.kind, v.body, v.url, v.fileIds, v.durationMin, v.required, n]);
    return { lessonId: id, ...(await fresh(req, m.course_id)) };
  });

  app.patch('/lessons/:id', { schema: { body: { type: 'object', additionalProperties: false, properties: LESSON } } }, async (req) => {
    const { rows: [l] } = await db.query(`select * from lessons where id = $1`, [req.params.id]);
    if (!l) throw notFound('That lesson doesn’t exist.');
    const r = await managed(req, l.course_id);
    const v = await lessonValues(req.body, l, l.course_id, r.c.community_id, req.user.id);
    await db.query(`update lessons set title = $2, kind = $3, body = $4, url = $5, file_ids = $6, duration_min = $7, required = $8 where id = $1`,
      [l.id, v.title, v.kind, v.body, v.url, v.fileIds, v.durationMin, v.required]);
    return fresh(req, l.course_id);
  });

  app.delete('/lessons/:id', async (req) => {
    const { rows: [l] } = await db.query(`select * from lessons where id = $1`, [req.params.id]);
    if (!l) throw notFound('That lesson doesn’t exist.');
    await managed(req, l.course_id);
    await db.query(`delete from lessons where id = $1`, [l.id]);
    return fresh(req, l.course_id);
  });

  // The whole order at once: [{ id: moduleId, lessons: [lessonId, …] }, …]. Every module and
  // lesson of the course must be there exactly once, so a stale page can't drop one.
  app.put('/courses/:id/order', { schema: { body: { type: 'object', required: ['modules'], additionalProperties: false, properties: { modules: { type: 'array', items: { type: 'object', required: ['id', 'lessons'], properties: { id: { type: 'string' }, lessons: { type: 'array', items: { type: 'string' } } } } } } } } }, async (req) => {
    const r = await managed(req, req.params.id);
    const [mods, les] = await Promise.all([
      db.query(`select id from course_modules where course_id = $1`, [r.c.id]),
      db.query(`select id from lessons where course_id = $1`, [r.c.id]),
    ]);
    const given = req.body.modules;
    const gm = given.map((m) => m.id); const gl = given.flatMap((m) => m.lessons);
    const same = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
    if (!same(gm, mods.rows.map((x) => x.id)) || !same(gl, les.rows.map((x) => x.id))) throw conflict('STALE_ORDER', 'This course changed since you opened it. Reload and try again.');
    await db.tx(async (t) => {
      for (const [i, m] of given.entries()) {
        await t.query(`update course_modules set position = $2 where id = $1`, [m.id, i]);
        for (const [j, l] of m.lessons.entries()) await t.query(`update lessons set module_id = $2, position = $3 where id = $1`, [l, m.id, j]);
      }
    });
    return fresh(req, r.c.id);
  });

  // ---- Enrolment (D3) ---------------------------------------------------------------------------
  // One enrolment per person, so repeated clicks return the same state (LMS-06). Capacity is
  // checked with the course locked, so two people can't take the last place (LMS-07).
  app.post('/courses/:id/enroll', async (req) => {
    const uid = signedIn(req);
    // Permissions first, outside the transaction: PGlite has one connection, so a `db` query
    // inside `db.tx` waits forever. Inside, only `t`, and status/capacity are read again under the lock.
    const r = await loadCourse(req, req.params.id);
    if (!r.a.canParticipate) throw forbidden(r.a.member ? 'You can’t take part in this community right now.' : 'Join this community to enrol.', 'CANNOT_ENROL');
    const result = await db.tx(async (t) => {
      const { rows: [c] } = await t.query(`select id, community_id, status, capacity from courses where id = $1 for update`, [r.c.id]);
      if (!c) throw notFound('That course doesn’t exist.');
      const { rows: [mine] } = await t.query(`select status from enrollments where course_id = $1 and user_id = $2`, [c.id, uid]);
      if (mine && mine.status !== 'left') return mine.status;
      if (c.status !== 'published') throw conflict('NOT_OPEN', 'This course isn’t taking new enrolments.');
      let status = 'active';
      if (c.capacity != null) {
        const { rows: [{ n }] } = await t.query(`select count(*)::int as n from enrollments e join memberships m on m.community_id = $2 and m.user_id = e.user_id and m.state = 'active'
          where e.course_id = $1 and e.status = 'active'`, [c.id, c.community_id]);
        if (n >= c.capacity) status = req.body?.waitlist ? 'waitlist' : null;
        if (!status) throw conflict('COURSE_FULL', 'This course is full. Join the waitlist to get the next place that opens.', { waitlist: true });
      }
      await t.query(`insert into enrollments (course_id, user_id, status, enrolled_at, waitlisted_at) values ($1, $2, $3, case when $3 = 'active' then now() end, case when $3 = 'waitlist' then now() end)
        on conflict (course_id, user_id) do update set status = excluded.status, updated_at = now(),
          enrolled_at = coalesce(enrollments.enrolled_at, excluded.enrolled_at), waitlisted_at = excluded.waitlisted_at`, [c.id, uid, status]);
      return status;
    });
    await audit(db, { actorId: uid, action: result === 'waitlist' ? 'course.waitlist' : 'course.enroll', targetType: 'course', targetId: req.params.id, ip: req.ip });
    return fresh(req, req.params.id);
  });

  // Leave a course (or its waitlist). Progress stays; enrolling again picks it up.
  app.delete('/courses/:id/enroll', async (req) => {
    const uid = signedIn(req);
    await db.query(`update enrollments set status = 'left', waitlisted_at = null, updated_at = now() where course_id = $1 and user_id = $2 and status <> 'left'`, [req.params.id, uid]);
    await promote(req.params.id);
    return fresh(req, req.params.id).catch(() => ({ ok: true }));
  });

  // Free places go to the waitlist in order, to people who are still active members.
  async function promote(courseId) {
    await db.tx(async (t) => {
      const { rows: [c] } = await t.query(`select * from courses where id = $1 for update`, [courseId]);
      if (!c || c.status !== 'published') return;
      const { rows: [{ n }] } = await t.query(`select count(*)::int as n from enrollments where course_id = $1 and status = 'active'`, [courseId]);
      const free = c.capacity == null ? 10000 : c.capacity - n;
      if (free <= 0) return;
      const { rows } = await t.query(`select e.user_id from enrollments e join memberships m on m.community_id = $2 and m.user_id = e.user_id and m.state = 'active'
        where e.course_id = $1 and e.status = 'waitlist' order by e.waitlisted_at limit $3`, [courseId, c.community_id, free]);
      for (const r of rows) await t.query(`update enrollments set status = 'active', enrolled_at = coalesce(enrolled_at, now()), waitlisted_at = null, updated_at = now() where course_id = $1 and user_id = $2`, [courseId, r.user_id]);
    });
  }

  // ---- Lessons for learners --------------------------------------------------------------------
  // The lesson itself only for learners and managers, checked on the server (LMS-08).
  app.get('/lessons/:id', async (req) => {
    const { rows: [l] } = await db.query(`select * from lessons where id = $1`, [req.params.id]);
    if (!l) throw notFound('That lesson doesn’t exist.');
    const r = await loadCourse(req, l.course_id);
    if (!r.learner && !r.manage) throw forbidden('Enrol in this course to open its lessons.', 'NOT_ENROLLED');
    const course = await present(req, r.c, r, { full: true });
    const order = course.modules.flatMap((m) => m.lessons.map((x) => x.id));
    const i = order.indexOf(l.id);
    const { rows: files } = l.file_ids.length
      ? await db.query(`select id, name, mime, kind, size from files where id = any($1) and deleted_at is null`, [l.file_ids]) : { rows: [] };
    const { rows: [co] } = await db.query(`select id, slug, name, accent from communities where id = $1`, [r.c.community_id]);
    const kept = l.file_ids.map((id) => files.find((f) => f.id === id)).filter(Boolean);
    return {
      lesson: { id: l.id, moduleId: l.module_id, title: l.title, kind: l.kind, body: l.body, url: l.url, durationMin: l.duration_min, required: l.required,
        files: kept, missingFiles: l.file_ids.length - kept.length, // deleted from the store since (LMS-10)
        done: course.modules.some((m) => m.lessons.some((x) => x.id === l.id && x.done)),
        prevId: order[i - 1] ?? null, nextId: order[i + 1] ?? null },
      course,
      community: co,
    };
  });

  // Mark complete: one row however often it's sent, from any tab or device (LMS-05, LMS-11,
  // LMS-12). When every counted lesson is done the course is complete, once.
  app.post('/lessons/:id/complete', async (req) => {
    const uid = signedIn(req);
    const { rows: [l] } = await db.query(`select * from lessons where id = $1`, [req.params.id]);
    if (!l) throw notFound('That lesson doesn’t exist.');
    const r = await loadCourse(req, l.course_id);
    if (!r.learner) throw forbidden('Enrol in this course to track your progress.', 'NOT_ENROLLED');
    if (r.c.status === 'archived') throw conflict('ARCHIVED', 'This course is archived and read-only.');
    await db.query(`insert into lesson_progress (lesson_id, user_id, course_id) values ($1, $2, $3) on conflict do nothing`, [l.id, uid, l.course_id]);
    const mods = await outline(l.course_id);
    const counted = countedFor(mods.flatMap((m) => m.lessons), r.enrollment);
    const done = await progressOf(l.course_id, uid);
    if (counted.length && counted.every((x) => done.has(x.id))) {
      await db.query(`update enrollments set completed_at = now(), updated_at = now() where course_id = $1 and user_id = $2 and completed_at is null`, [l.course_id, uid]);
    }
    return fresh(req, l.course_id);
  });

  // ---- My Learning (cross-community, no admin tools) -------------------------------------------
  app.get('/me/learning', async (req) => {
    const uid = signedIn(req);
    const { rows } = await db.query(`select e.course_id from enrollments e join courses c on c.id = e.course_id join communities co on co.id = c.community_id
      where e.user_id = $1 and e.status in ('active', 'waitlist') and co.merged_into is null order by e.updated_at desc`, [uid]);
    const out = [];
    for (const { course_id: id } of rows) {
      const r = await loadCourse(req, id).catch(() => null);
      if (!r) continue;
      const course = await present(req, r.c, r);
      const { rows: [co] } = await db.query(`select id, slug, name, accent from communities where id = $1`, [r.c.community_id]);
      out.push({ ...course, community: co, access: r.learner || r.enrollment?.status === 'waitlist' });
    }
    return { courses: out };
  });
}
