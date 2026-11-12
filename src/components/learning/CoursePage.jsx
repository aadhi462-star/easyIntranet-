// A course inside its community (board S5Course, restyled to v2 board V2EModules): description,
// what you'll learn, the outline and requirements, with the enrolment box beside them. Enrolled learners and managers can open
// lessons from the outline; everyone else sees it closed until they enrol (LMS-08).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath, durationText, lessonPath, lessonsText, nextLesson, useCourse } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import JoinButton from '../groups/JoinButton.jsx';
import { Pill, Progress, STATUS_LABEL } from './bits.jsx';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

// Icons for lesson kinds in the outline (a lock until you can open it, LMS-08).
const KIND_ICON = { text: 'doc', file: 'paperclip', link: 'external', quiz: 'questions', assignment: 'pen' };
const KIND_LABEL = { text: 'Text', file: 'File', link: 'Link', quiz: 'Quiz', assignment: 'Assignment' };
const minutes = (ls) => ls.reduce((n, l) => n + (l.durationMin || 0), 0);

export default function CoursePage({ g, perms, id }) {
  const c = useCourse(id);
  if (c.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Loading course" className="flex flex-wrap gap-8">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4"><Skeleton lines={5} label="Loading" /></div>
        <div className="panel flex-[1_1_300px] p-5"><Skeleton lines={3} label="Loading" /></div>
      </div>
    );
  }
  if (c.status === 'missing') {
    return (
      <section className="panel flex flex-col items-start gap-2 p-6">
        <h2 className="t-h3">Course not found</h2>
        <p className="text-2 text-sm">It may have been deleted, or it’s a draft you can’t see.</p>
        <Link to={coursePath(g)} className="link text-sm">All courses</Link>
      </section>
    );
  }
  if (c.status === 'error') {
    return (
      <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
        <span><strong>Couldn’t load the course.</strong> {c.message}</span>
        <Button size="sm" onClick={c.reload}>Try again</Button>
      </div>
    );
  }
  const course = c.course;
  const open = course.can.manage || course.enrollment?.status === 'active';
  const lessonTotal = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const modules = course.modules.filter((m) => m.lessons.length);
  const facts = [
    course.instructors.length ? `${course.instructors.map((i) => i.name).join(', ')} · ${course.instructors.length === 1 ? 'Instructor' : 'Instructors'}` : null,
    `${course.modules.length} ${course.modules.length === 1 ? 'module' : 'modules'}`, lessonsText(lessonTotal),
    course.durationMin ? durationText(course.durationMin) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        <Link to={coursePath(g)} className="link inline-flex items-center gap-1.5 self-start text-sm"><Icon name="back" size={16} /> All courses</Link>
        <header className="flex flex-col gap-2">
          <span className="t-label">Course{course.category ? ` · ${course.category}` : ''}</span>
          <h2 className="t-h1 break-words">{course.title}</h2>
          {course.status !== 'published' && <span><Pill tone="outline">{STATUS_LABEL[course.status]}</Pill></span>}
          {course.description && <p className="t-body text-2 max-w-[640px] whitespace-pre-line break-words">{course.description}</p>}
          <p className="t-small">{facts}</p>
        </header>

        {course.objectives?.length > 0 && (
          <section aria-labelledby="wl-h" className="flex flex-col gap-2.5 border-t border-[var(--az-hairline)] pt-5">
            <h3 id="wl-h" className="t-h3">What you’ll learn</h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-x-6 gap-y-2.5">
              {course.objectives.map((o) => <li key={o} className="flex min-w-0 gap-2.5 text-[15px] leading-6"><span className="text-3 mt-1 shrink-0"><Icon name="check" size={16} /></span><span className="min-w-0 break-words">{o}</span></li>)}
            </ul>
          </section>
        )}

        <section aria-labelledby="ol-h" className="flex flex-col gap-2 border-t border-[var(--az-hairline)] pt-5">
          <h3 id="ol-h" className="t-h3">Outline</h3>
          {lessonTotal === 0 ? <p className="text-2 text-sm">No lessons yet.</p> : (
            <div className="panel overflow-hidden">
              <ul className="list-rows">
                {modules.map((m) => {
                  const mins = durationText(minutes(m.lessons));
                  return [
                    <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3">
                      <h4 className="min-w-0 flex-1 break-words font-semibold">{m.title}</h4>
                      <span className="t-small shrink-0">{lessonsText(m.lessons.length)}{mins ? ` · ${mins}` : ''}</span>
                    </li>,
                    ...m.lessons.map((l) => {
                      const meta = l.kind === 'link' ? 'Opens outside' : [durationText(l.durationMin), KIND_LABEL[l.kind] ?? 'Text'].filter(Boolean).join(' · ');
                      const row = (
                        <>
                          <span className="text-3 shrink-0"><Icon name={open ? (KIND_ICON[l.kind] ?? 'doc') : 'lock'} size={16} /></span>
                          <span className="min-w-0 flex-[1_1_140px] break-words">{l.title}</span>
                          <span className="flex flex-wrap items-center gap-2">
                            {l.isNew && <Pill tone="outline">New</Pill>}
                            {!l.required && <span className="t-small">Optional</span>}
                            {l.done ? <Badge tone="ok" icon="check">Done</Badge> : <span className="t-small">{meta}</span>}
                          </span>
                        </>
                      );
                      const cls = 'flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 pl-8 pr-4 text-sm';
                      return <li key={l.id}>{open ? <Link to={lessonPath(l.id)} className={`${cls} hover:bg-[var(--az-sunken)]`}>{row}</Link> : <span className={cls}>{row}</span>}</li>;
                    }),
                  ];
                })}
              </ul>
            </div>
          )}
          <p className="t-small">{open ? 'Lessons are text, files (PDF, slides, images) or links that open outside CommunityOne. Videos are links.' : 'Lessons open after enrolling.'}</p>
        </section>

        <section aria-labelledby="rq-h" className="flex flex-col gap-2.5 border-t border-[var(--az-hairline)] pt-5">
          <h3 id="rq-h" className="t-h3">Requirements</h3>
          <ul className="list-disc space-y-1 pl-5 text-[15px] leading-6">
            <li>Member of {g.name}</li>
            {course.requirements && course.requirements.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => <li key={r} className="break-words">{r}</li>)}
          </ul>
        </section>
      </div>
      <aside aria-label="Enrolment" className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
        <EnrolBox g={g} perms={perms} course={course} set={c.set} />
        {course.can.manage && (
          <section aria-labelledby="mg-h" className="panel flex flex-col gap-3 p-5">
            <h3 id="mg-h" className="t-h3">Manage</h3>
            <p className="text-2 text-sm">{course.enrolledCount} enrolled{course.waitlistCount ? ` · ${course.waitlistCount} waiting` : ''}{course.completedCount != null ? ` · ${course.completedCount} completed` : ''}</p>
            {/* No course builder on phones (Stage 5 rule). */}
            <Link to={coursePath(g, course.id, true)} className="btn btn-secondary hidden md:inline-flex">Edit course</Link>
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
        <h3 className="t-h3">{e.completedAt ? 'You completed this course' : 'You’re enrolled'}</h3>
        <div className="flex items-center gap-3"><Progress p={course.progress} className="flex-1" /><span className="t-small shrink-0">{course.progress.done} of {course.progress.total}</span></div>
        {next && !e.completedAt && <p className="t-small">Next: {next.title}</p>}
        {course.nextLessonId && <Link to={lessonPath(course.nextLessonId)} className="btn btn-primary w-full">{e.completedAt ? 'Review lessons' : course.progress.done ? 'Continue lesson' : 'Start the course'}</Link>}
        <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={leave}>Leave course</button>
      </>
    );
  } else if (e?.status === 'waitlist') {
    body = (
      <>
        <h3 className="t-h3">You’re on the waitlist</h3>
        <p className="text-2 text-sm">When a place frees up, the first person in line gets it and a notification.</p>
        <button type="button" className="btn btn-secondary w-full" disabled={busy} onClick={leave}>Leave waitlist</button>
      </>
    );
  } else if (course.status !== 'published') {
    body = <><h3 className="t-h3">Not open for enrolment</h3><p className="text-2 text-sm">{course.status === 'archived' ? 'This course is archived.' : 'This course isn’t taking new enrolments right now.'}</p></>;
  } else if (!perms.canParticipate) {
    body = (
      <>
        <h3 className="t-h3">Enrol in this course</h3>
        <p className="text-2 text-sm">Join {g.name} to enrol.</p>
        <JoinButton g={g} className="w-full" />
      </>
    );
  } else {
    const places = course.capacity == null ? null : `${course.seatsLeft} ${course.seatsLeft === 1 ? 'place' : 'places'} left`;
    body = full ? (
      <>
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => enrol(true)}>{busy ? 'Joining…' : 'Join waitlist'}</button>
        <span className="t-small">This course is full. You’d be {course.waitlistCount + 1} in line.</span>
      </>
    ) : (
      <>
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => enrol(false)}>{busy ? 'Enrolling…' : 'Enrol'}</button>
        <span className="t-small">{places ? `${places} · open to members of ${g.name}` : `Open to members of ${g.name}`}</span>
      </>
    );
  }
  return (
    <section className="raised flex flex-col gap-3 border border-[var(--az-hairline)] p-5">
      <span className="t-label">Enrolment</span>
      {body}
      {error && <p role="alert" className="notice notice-bad">{error}</p>}
      <ul className="list-rows mt-1 border-t border-[var(--az-hairline)]">
        <li className="flex items-start gap-2.5 py-2.5"><span className="text-3 mt-0.5 shrink-0"><Icon name="medal" size={16} /></span><span className="t-small">Certificate with a verification code on completion</span></li>
        <li className="flex items-start gap-2.5 py-2.5"><span className="text-3 mt-0.5 shrink-0"><Icon name="info" size={16} /></span><span className="t-small">Leaving the community ends access; your progress is kept</span></li>
      </ul>
    </section>
  );
}
