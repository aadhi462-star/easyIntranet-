// A course inside its community (board S5Course): description, what you'll learn, the outline
// and requirements, with the enrolment box beside them. Enrolled learners and managers can open
// lessons from the outline; everyone else sees it closed until they enrol (LMS-08).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath, durationText, lessonPath, lessonsText, nextLesson, useCourse } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Empty } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import JoinButton from '../groups/JoinButton.jsx';
import { KindBadge, Pill, Progress, STATUS_LABEL } from './bits.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

export default function CoursePage({ g, perms, id }) {
  const c = useCourse(id);
  if (c.status === 'loading') return <div aria-busy="true" aria-label="Loading course" className="raised h-64 animate-pulse" />;
  if (c.status === 'missing') return <Empty icon="search" title="Course not found">It may have been deleted, or it’s a draft you can’t see. <Link to={coursePath(g)} className="text-brand-300 underline">All courses</Link></Empty>;
  if (c.status === 'error') return <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{c.message}</p><button className="btn btn-ghost mt-3" onClick={c.reload}>Try again</button></div>;
  const course = c.course;
  const open = course.can.manage || course.enrollment?.status === 'active';
  const lessonTotal = course.modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2.5">
          <Link to={coursePath(g)} className="text-sm text-brand-300 hover:underline">← All courses</Link>
          <span className="t-label">Course{course.category ? ` · ${course.category}` : ''}</span>
          <h2 className="t-h1 text-white">{course.title}</h2>
          {course.status !== 'published' && <span><Pill tone="outline">{STATUS_LABEL[course.status]}</Pill></span>}
          {course.description && <p className="t-body text-2 max-w-[640px] whitespace-pre-line">{course.description}</p>}
          <p className="t-small flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {course.instructors.length > 0 && <span><span className="text-slate-200">{course.instructors.map((i) => i.name).join(', ')}</span> · {course.instructors.length === 1 ? 'Instructor' : 'Instructors'}</span>}
            <span>{course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'} · {lessonsText(lessonTotal)}{course.durationMin ? ` · ${durationText(course.durationMin)}` : ''}</span>
          </p>
        </header>

        {course.objectives?.length > 0 && (
          <section aria-labelledby="wl-h" className="flex flex-col gap-3 border-t border-[var(--az-divider)] pt-6">
            <h3 id="wl-h" className="t-h3 text-white">What you’ll learn</h3>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {course.objectives.map((o) => <li key={o} className="flex gap-2.5 text-[15px] leading-6 text-slate-200"><Icon name="check" size={16} className="cm-ink mt-1 shrink-0" />{o}</li>)}
            </ul>
          </section>
        )}

        <section aria-labelledby="ol-h" className="flex flex-col border-t border-[var(--az-divider)] pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="ol-h" className="t-h3 text-white">Course outline</h3>
            {!open && <span className="t-small">Open after you enrol</span>}
          </div>
          {lessonTotal === 0 && <p className="text-3 py-4 text-sm">No lessons yet.</p>}
          {course.modules.filter((m) => m.lessons.length).map((m) => (
            <div key={m.id} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3 px-1 pb-2 pt-4">
                <h4 className="text-[15px] font-semibold text-white">{m.title}</h4>
                <span className="t-small shrink-0">{lessonsText(m.lessons.length)}{durationText(m.lessons.reduce((n, l) => n + (l.durationMin || 0), 0)) ? ` · ${durationText(m.lessons.reduce((n, l) => n + (l.durationMin || 0), 0))}` : ''}</span>
              </div>
              <ul className="list-rows border-t border-[var(--az-divider)]">
                {m.lessons.map((l) => {
                  const row = (
                    <>
                      <KindBadge kind={l.kind} />
                      <span className={`min-w-0 flex-1 truncate ${open ? 'text-white' : 'text-slate-300'}`}>{l.title}</span>
                      {l.isNew && <Pill tone="outline">New</Pill>}
                      {!l.required && <span className="t-small">Optional</span>}
                      {l.done ? <span className="flex items-center gap-1 text-xs font-semibold text-brand-300"><Icon name="check" size={14} />Done</span>
                        : <span className="t-small shrink-0">{l.kind === 'link' ? 'Opens outside' : durationText(l.durationMin)}</span>}
                    </>
                  );
                  return <li key={l.id}>{open ? <Link to={lessonPath(l.id)} className="flex min-h-12 items-center gap-3 px-1 py-1.5 text-sm hover:bg-white/[.02]">{row}</Link> : <span className="flex min-h-12 items-center gap-3 px-1 py-1.5 text-sm">{row}</span>}</li>;
                })}
              </ul>
            </div>
          ))}
          <p className="t-small mt-3">Lessons are text, files (PDF, slides, images) or links that open outside CommunityOne. Videos are links.</p>
        </section>

        <section aria-labelledby="rq-h" className="flex flex-col gap-2.5 border-t border-[var(--az-divider)] pt-6">
          <h3 id="rq-h" className="t-h3 text-white">Requirements</h3>
          <ul className="list-disc space-y-1 pl-5 text-[15px] leading-6 text-slate-200">
            <li>Member of {g.name}</li>
            {course.requirements && course.requirements.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => <li key={r}>{r}</li>)}
          </ul>
        </section>
      </div>
      <aside className="flex min-w-0 flex-col gap-6 lg:order-none">
        <EnrolBox g={g} perms={perms} course={course} set={c.set} />
        {course.can.manage && (
          <section aria-labelledby="mg-h" className="band flex flex-col gap-3 p-5">
            <h3 id="mg-h" className="t-h3 text-white">Manage</h3>
            <p className="text-2 text-sm">{course.enrolledCount} enrolled{course.waitlistCount ? ` · ${course.waitlistCount} waiting` : ''}{course.completedCount != null ? ` · ${course.completedCount} completed` : ''}</p>
            <Link to={coursePath(g, course.id, true)} className="btn btn-ghost hidden md:inline-flex">Edit course</Link>
            <p className="t-small md:hidden">Build and edit courses on a larger screen.</p>
          </section>
        )}
      </aside>
    </div>
  );
}

function EnrolBox({ g, perms, course, set }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const e = course.enrollment;
  const full = course.seatsLeft === 0;
  const act = async (fn, ok) => {
    setBusy(true); setError('');
    try { const d = await fn(); set(d.course); if (ok) toast(ok); } catch (err) {
      // Filled up since the page loaded (LMS-07): show the waitlist option instead.
      if (err.code === 'COURSE_FULL') set({ ...course, seatsLeft: 0 });
      setError(errorText(err));
    } finally { setBusy(false); }
  };
  const enrol = (waitlist) => act(() => api(`/courses/${course.id}/enroll`, { method: 'POST', body: waitlist ? { waitlist: true } : {} }), waitlist ? 'You’re on the waitlist' : 'You’re enrolled');
  const leave = async () => {
    const msg = e.status === 'waitlist' ? 'Leave the waitlist for this course?' : 'Leave this course? Your progress is kept, and comes back if you enrol again.';
    if ((await confirmAction(msg))) act(() => api(`/courses/${course.id}/enroll`, { method: 'DELETE' }), e.status === 'waitlist' ? 'You left the waitlist' : 'You left the course');
  };

  let body;
  if (e?.status === 'active') {
    const next = nextLesson(course);
    body = (
      <>
        <h3 className="t-h3 text-white">{e.completedAt ? 'You completed this course' : 'You’re enrolled'}</h3>
        <div className="flex items-center gap-3"><Progress p={course.progress} className="flex-1" /><span className="t-small shrink-0">{course.progress.done} of {course.progress.total}</span></div>
        {next && !e.completedAt && <p className="t-small">Next: {next.title}</p>}
        {course.nextLessonId && <Link to={lessonPath(course.nextLessonId)} className="btn btn-primary w-full">{e.completedAt ? 'Review lessons' : course.progress.done ? 'Continue lesson' : 'Start the course'}</Link>}
        <button className="btn btn-ghost w-full" disabled={busy} onClick={leave}>Leave course</button>
      </>
    );
  } else if (e?.status === 'waitlist') {
    body = (
      <>
        <h3 className="t-h3 text-white">You’re on the waitlist</h3>
        <p className="text-2 text-sm">When a place frees up, the first person in line gets it and a notification.</p>
        <button className="btn btn-ghost w-full" disabled={busy} onClick={leave}>Leave waitlist</button>
      </>
    );
  } else if (course.status !== 'published') {
    body = <><h3 className="t-h3 text-white">Not open for enrolment</h3><p className="text-2 text-sm">{course.status === 'archived' ? 'This course is archived.' : 'This course isn’t taking new enrolments right now.'}</p></>;
  } else if (!perms.canParticipate) {
    body = (
      <>
        <h3 className="t-h3 text-white">Enrol in this course</h3>
        <p className="text-2 text-sm">Join {g.name} to enrol.</p>
        <JoinButton g={g} className="w-full" />
      </>
    );
  } else {
    body = (
      <>
        <h3 className="t-h3 text-white">Enrol in this course</h3>
        <p className="text-2 text-sm">Free for {g.name} members. Your progress is saved on your account.</p>
        {course.capacity != null && (
          <div className="flex flex-col gap-1.5">
            <div className="t-small flex justify-between"><span>Places</span><span>{course.enrolledCount} of {course.capacity} taken</span></div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--az-sunken)]"><span className="block h-full rounded-full bg-slate-400" style={{ width: `${Math.min(100, (course.enrolledCount / course.capacity) * 100)}%` }} /></div>
          </div>
        )}
        {full ? (
          <>
            <button className="btn btn-primary w-full" disabled={busy} onClick={() => enrol(true)}>{busy ? 'Joining…' : 'Join waitlist'}</button>
            <p className="t-small">This course is full. You’d be {course.waitlistCount + 1} in line.</p>
          </>
        ) : <button className="btn btn-primary w-full" disabled={busy} onClick={() => enrol(false)}>{busy ? 'Enrolling…' : 'Enrol'}</button>}
        <p className="t-small">You can leave the course at any time.</p>
      </>
    );
  }
  return (
    <section aria-label="Enrolment" className="raised flex flex-col gap-3.5 p-5 sm:p-6">
      {body}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
