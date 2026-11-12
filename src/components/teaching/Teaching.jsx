// Teaching (v2 workstream G7, board V2GDashboards "Instructor: Teaching"), at
// /c/<community>/learning/teaching: the courses this person teaches (every course for Owners and
// Admins) with status, enrolled, waitlist, completed and waiting to be graded; the work to grade;
// and, per course, who is where (lessons done, last activity, latest grade). The learner list is a
// working list for the people who teach, so it shows names; reports keep the under-5 rule.
// Courses come from GET /communities/:id/teaching, learners from GET /courses/:id/learners; the
// server decides who sees which course.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath, gradingPath } from '../../lib/learning.js';
import { timeAgo } from '../../lib/store.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { Progress, STATUS_LABEL } from '../learning/bits.jsx';
import LearningNav from './LearningNav.jsx';

const enc = encodeURIComponent;
const num = (...v) => v.find((x) => typeof x === 'number') ?? 0;
const dateText = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const DENIED = ['NOT_TEACHING', 'NOT_A_TEACHER', 'NOT_A_GRADER', 'NOT_AN_INSTRUCTOR', 'FORBIDDEN'];

/** One row of /teaching in the words the screen uses, whatever the server calls the counts. */
const courseRow = (c) => ({
  id: c.id, title: c.title, status: c.status ?? 'draft', capacity: c.capacity ?? null,
  enrolled: num(c.enrolled, c.enrolledCount), waitlist: num(c.waitlist, c.waitlistCount, c.waiting),
  completed: num(c.completed, c.completedCount), toGrade: num(c.toGrade, c.waitingToGrade, c.toGradeCount, c.ungraded),
  // A Teaching Assistant grades and sees learners but doesn't edit the course.
  canEdit: c.canEdit ?? c.can?.edit ?? c.can?.manage ?? (c.role ? c.role !== 'teaching_assistant' : true),
});

export default function Teaching({ g, perms }) {
  const [s, setS] = useState({ state: 'loading', courses: [], all: false });
  const [params, setParams] = useSearchParams();
  const learnersRef = useRef(null);
  const load = useCallback(() => api(`/communities/${enc(g.id)}/teaching`)
    .then((d) => setS({ state: 'ready', courses: (d.courses ?? []).map(courseRow), all: !!d.all }))
    .catch((e) => setS({ state: e.status === 403 || DENIED.includes(e.code) ? 'denied' : 'error', courses: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = `Teaching · ${g.name} · CommunityOne`; }, [g.name]);

  const all = s.all || !!(perms?.canAdmin || g.adminMode);
  const toGrade = s.courses.reduce((n, c) => n + c.toGrade, 0);
  const chosen = s.courses.find((c) => c.id === params.get('course'))
    ?? s.courses.find((c) => c.enrolled + c.waitlist + c.completed > 0) ?? s.courses[0];
  const showLearners = (id) => {
    setParams({ course: id }, { replace: true });
    requestAnimationFrame(() => { learnersRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); learnersRef.current?.focus({ preventScroll: true }); });
  };

  if (s.state === 'denied') {
    return (
      <div className="flex flex-col gap-6">
        <section className="panel flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-[var(--az-text-3)]"><Icon name="lock" size={28} /></span>
          <h2 className="t-h3">Teaching is for the people who teach here</h2>
          <p className="text-2 max-w-md text-sm">Instructors and Teaching Assistants see their courses here; Owners and Admins see every course.</p>
          <Link to={coursePath(g)} className="link text-sm">All courses</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <LearningNav g={g} current="teaching" toGrade={toGrade || undefined} />
      <header className="flex flex-col gap-1">
        <span className="t-label">Teaching</span>
        <h2 className="t-h2">Your courses and who needs help</h2>
        <p className="text-2 text-sm">{all ? `Every course in ${g.name}. Instructors see only the courses they teach.` : 'Only the courses you teach. Owners and Admins see every course here.'}</p>
      </header>

      {s.state === 'loading' ? <div className="panel p-5"><Skeleton lines={4} label="Loading your courses" /></div>
        : s.state === 'error' ? (
          <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
            <span><strong>Couldn’t load your courses.</strong> {s.message}</span>
            <Button size="sm" onClick={load}>Try again</Button>
          </div>
        ) : s.courses.length === 0 ? (
          <section className="panel flex flex-col items-center gap-2 p-8 text-center">
            <span className="text-[var(--az-text-3)]"><Icon name="cap" size={28} /></span>
            <h3 className="t-h3">{all ? 'No courses yet' : 'You don’t teach a course here yet'}</h3>
            <p className="text-2 max-w-md text-sm">{all ? `Courses in ${g.name} show here once one is created.` : 'An Owner or Admin adds you to a course as its Instructor or Teaching Assistant.'}</p>
            <Link to={coursePath(g)} className="link text-sm">All courses</Link>
          </section>
        ) : <Courses g={g} courses={s.courses} onLearners={showLearners} />}

      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
        <WorkToGrade g={g} />
        {chosen && (
          <section ref={learnersRef} tabIndex={-1} aria-labelledby="ln-h" className="panel flex min-w-0 scroll-mt-24 flex-col gap-3.5 p-5 outline-none">
            <Learners key={chosen.id} course={chosen} courses={s.courses} onCourse={(id) => setParams({ course: id }, { replace: true })} />
          </section>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  return <Badge tone={status === 'published' ? 'ok' : 'neutral'}>{STATUS_LABEL[status] ?? status}</Badge>;
}
const enrolledText = (c) => (c.capacity != null ? `${c.enrolled} of ${c.capacity}` : String(c.enrolled));

/** The courses: a table on wide screens, stacked cards on phones (G12). */
function Courses({ g, courses, onLearners }) {
  const learners = (c) => <Button variant="ghost" size="sm" onClick={() => onLearners(c.id)} aria-label={`Learners in ${c.title}`}>Learners</Button>;
  // The course builder is desktop-only (Stage 5a), so Edit shows from md up.
  const edit = (c) => c.canEdit && <Link to={coursePath(g, c.id, true)} className="btn btn-ghost btn-sm hidden md:inline-flex" aria-label={`Edit ${c.title}`}>Edit</Link>;
  const toGrade = (c) => (c.toGrade ? <Badge tone="warn">{c.toGrade}</Badge> : 0);
  return (
    <>
      <div className="panel hidden overflow-hidden sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Courses you teach</caption>
          <thead>
            <tr className="border-b border-[var(--az-hairline)] text-left">
              <th scope="col" className="t-label px-4 py-3">Course</th>
              <th scope="col" className="t-label px-3 py-3">Status</th>
              <th scope="col" className="t-label px-3 py-3 text-right">Enrolled</th>
              <th scope="col" className="t-label px-3 py-3 text-right">Waitlist</th>
              <th scope="col" className="t-label px-3 py-3 text-right">Completed</th>
              <th scope="col" className="t-label px-3 py-3 text-right">To grade</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} className="border-b border-[var(--az-divider)] last:border-0">
                <td className="px-4 py-2.5"><Link to={coursePath(g, c.id)} className="link break-words">{c.title}</Link></td>
                <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{enrolledText(c)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.waitlist}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.completed}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{toGrade(c)}</td>
                <td className="px-4 py-2.5 text-right"><span className="inline-flex gap-1">{c.enrolled + c.waitlist + c.completed > 0 && learners(c)}{edit(c)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label="Courses you teach" className="flex flex-col gap-3 sm:hidden">
        {courses.map((c) => (
          <li key={c.id} className="panel flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={coursePath(g, c.id)} className="link min-w-0 flex-1 break-words text-[15px]">{c.title}</Link>
              <StatusBadge status={c.status} />
            </div>
            <dl className="grid grid-cols-4 gap-2 text-sm">
              {[['Enrolled', enrolledText(c)], ['Waitlist', c.waitlist], ['Completed', c.completed], ['To grade', toGrade(c)]].map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="t-small">{k}</dt><dd className="tabular-nums">{v}</dd></div>
              ))}
            </dl>
            {c.enrolled + c.waitlist + c.completed > 0 && <div className="flex gap-2">{learners(c)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Oldest work waiting to be graded; grading itself happens in Grading (it takes the work for 30 minutes). */
function WorkToGrade({ g }) {
  const [s, setS] = useState({ state: 'loading', list: [] });
  const load = useCallback(() => api(`/communities/${enc(g.id)}/grading?status=to_grade`)
    .then((d) => setS({ state: 'ready', list: d.submissions ?? [] }))
    .catch((e) => setS({ state: e.code === 'NOT_A_GRADER' || e.status === 403 ? 'none' : 'error', list: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load]);
  const shown = s.list.slice(0, 5);
  return (
    <section aria-labelledby="tg-h" className="panel flex min-w-0 flex-col gap-1 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
        <h3 id="tg-h" className="t-h3">Work to grade</h3>
        <Link to={gradingPath(g)} className="link text-sm">Open Grading</Link>
      </div>
      {s.state === 'loading' ? <Skeleton lines={3} label="Loading work to grade" />
        : s.state === 'error' ? <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3"><span>{s.message}</span><Button size="sm" onClick={load}>Try again</Button></div>
          : s.state === 'none' || !shown.length ? <p className="t-small py-2">Nothing to grade. Submissions show here when learners send them.</p>
            : (
              <>
                <ul className="list-rows">
                  {shown.map((x) => {
                    const other = x.lockedBy && !x.lockedBy.me;
                    return (
                      <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--az-sunken)] text-xs font-bold">{initials(x.learner?.name)}</span>
                        <span className="flex min-w-0 flex-[1_1_180px] flex-col">
                          <span className="text-[15px] font-semibold break-words">{x.learner?.name ?? 'A learner'}</span>
                          <span className="t-small break-words">{[x.lesson?.title, x.course?.title].filter(Boolean).join(' · ')} · sent {timeAgo(Date.parse(x.submittedAt))}{x.late ? ' · late' : ''}</span>
                          {other && <span className="text-[13px] font-medium text-[var(--az-warning)]">{x.lockedBy.name} is grading it</span>}
                        </span>
                        <Link to={`${gradingPath(g)}?open=${enc(x.id)}`} className={`btn btn-sm ${other ? 'btn-secondary' : 'btn-primary'}`}
                          aria-label={`${other ? 'Read' : 'Grade'} ${x.learner?.name ?? 'the learner'}’s ${x.lesson?.title ?? 'work'}`}>{other ? 'Read' : 'Grade'}</Link>
                      </li>
                    );
                  })}
                </ul>
                <p className="t-small pt-2">Oldest first.{s.list.length > shown.length ? ` ${s.list.length - shown.length} more in Grading.` : ''}</p>
              </>
            )}
    </section>
  );
}

const FILTERS = [
  ['all', 'All', () => true],
  ['new', 'Not started', (l) => l.status !== 'completed' && !l.lessonsDone],
  ['done', 'Completed', (l) => l.status === 'completed'],
];

function gradeText(gr) {
  if (gr == null) return null;
  if (typeof gr !== 'object') return String(gr);
  const passed = gr.passed == null ? null : gr.passed ? 'Passed' : 'Not passed';
  const score = gr.grade != null ? `${gr.grade}${gr.points != null ? ` of ${gr.points}` : ''}` : null;
  return [passed, score].filter(Boolean).join(' · ') || null;
}

/** One course's learners: lessons done, last activity and latest grade (G7). */
function Learners({ course, courses, onCourse }) {
  const [s, setS] = useState({ state: 'loading', list: [] });
  const [filter, setFilter] = useState('all');
  const load = useCallback(() => api(`/courses/${enc(course.id)}/learners`)
    .then((d) => setS({ state: 'ready', list: Array.isArray(d) ? d : d.learners ?? [] }))
    .catch((e) => setS({ state: e.status === 403 || DENIED.includes(e.code) ? 'denied' : 'error', list: [], message: errorText(e) })), [course.id]);
  useEffect(() => { load(); }, [load]);
  const test = FILTERS.find(([id]) => id === filter)[2];
  const shown = s.list.filter(test);
  const progress = (l) => {
    if (l.status === 'completed') return <Badge tone="ok" icon="check">Completed</Badge>;
    if (l.status === 'waitlist') return <Badge>Waitlist</Badge>;
    return (
      <span className="flex items-center gap-2">
        <Progress p={{ done: l.lessonsDone ?? 0, total: l.lessonsTotal ?? 0 }} label={`${l.user?.name ?? 'Learner'}’s progress`} className="w-20 shrink-0" />
        <span className="t-small whitespace-nowrap">{l.lessonsDone ?? 0} of {l.lessonsTotal ?? 0} lessons</span>
      </span>
    );
  };
  const last = (l) => (l.lastActivityAt ? dateText(l.lastActivityAt) : 'Not started');
  const grade = (l) => gradeText(l.latestGrade) ?? <span className="text-2">None yet</span>;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="ln-h" className="t-h3 min-w-0 break-words">Learners · {course.title}</h3>
        {courses.length > 1 && (
          <span className="flex items-center gap-2">
            <label htmlFor="ln-course" className="text-2 text-sm">Course</label>
            <select id="ln-course" className="input !w-auto max-w-[12rem]" value={course.id} onChange={(e) => onCourse(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </span>
        )}
      </div>
      {s.state === 'loading' ? <Skeleton lines={4} label="Loading learners" />
        : s.state === 'denied' ? <p className="notice notice-info">You see learners only in the courses you teach.</p>
          : s.state === 'error' ? <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3"><span><strong>Couldn’t load learners.</strong> {s.message}</span><Button size="sm" onClick={load}>Try again</Button></div>
            : !s.list.length ? <p className="t-small">Nobody has enrolled yet. Learners show here once they enrol or join the waitlist.</p>
              : (
                <>
                  <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                    {FILTERS.map(([id, label, fn]) => (
                      <button key={id} type="button" className="filter-chip shrink-0" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} · {s.list.filter(fn).length}</button>
                    ))}
                  </div>
                  {!shown.length ? <p className="t-small">Nobody here.</p> : (
                    <>
                      <table className="hidden w-full text-sm sm:table">
                        <caption className="sr-only">Learner progress in {course.title}</caption>
                        <thead><tr className="border-b border-[var(--az-hairline)] text-left">
                          {['Learner', 'Progress', 'Last active', 'Latest grade'].map((h) => <th key={h} scope="col" className="t-label py-2 pr-3">{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {shown.map((l) => (
                            <tr key={l.user?.id} className="border-b border-[var(--az-divider)] last:border-0">
                              <td className="py-2.5 pr-3 break-words">{l.user?.id ? <Link to={`/people/${enc(l.user.id)}`} className="hit hover:underline">{l.user.name}</Link> : 'A learner'}</td>
                              <td className="py-2.5 pr-3">{progress(l)}</td>
                              <td className="text-2 py-2.5 pr-3 whitespace-nowrap">{last(l)}</td>
                              <td className="py-2.5">{grade(l)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <ul aria-label={`Learner progress in ${course.title}`} className="list-rows sm:hidden">
                        {shown.map((l) => (
                          <li key={l.user?.id} className="flex flex-col gap-1.5 py-3">
                            <span className="font-semibold break-words">{l.user?.name ?? 'A learner'}</span>
                            {progress(l)}
                            <span className="t-small">Last active: {last(l)} · Latest grade: {gradeText(l.latestGrade) ?? 'None yet'}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
      <p className="t-small">Leaving the community hides a learner here; their progress comes back if they rejoin.</p>
    </>
  );
}
