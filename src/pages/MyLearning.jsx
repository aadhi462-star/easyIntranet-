// My Learning (board S5MyLearning): every course this person is enrolled in or waiting for,
// across their communities. No admin tools here: courses are built in a community's Learning tab.
// Each course carries its community's tile and colour; progress bars stay lime (CommunityOne's).
// Leaving a community hides its courses; progress comes back on rejoining (LMS-09, server side).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { accentOf, errorText } from '../lib/communities.js';
import { coursePath, durationText, lessonPath, lessonsText, nextLesson, useCourse, useMyLearning } from '../lib/learning.js';
import { toast } from '../lib/toast.js';
import { PageHeader } from '../components/ui.jsx';
import { CommunityTile } from '../components/public/CommunityCards.jsx';
import { Icon } from '../components/icons.jsx';
import { Pill, Progress } from '../components/learning/bits.jsx';

export default function MyLearning() {
  const my = useMyLearning();
  const [community, setCommunity] = useState('');
  useEffect(() => { document.title = 'My Learning · CommunityOne'; }, []);
  const communities = [...new Map(my.courses.map((c) => [c.community.id, c.community])).values()];
  const list = my.courses.filter((c) => !community || c.community.id === community);
  const inProgress = list.filter((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt);
  const completed = list.filter((c) => c.enrollment?.completedAt);
  const waiting = list.filter((c) => c.enrollment?.status === 'waitlist');
  const [first, ...more] = inProgress;

  const leave = async (c) => {
    if (!confirm(`Leave the waitlist for “${c.title}”?`)) return;
    try { await api(`/courses/${c.id}/enroll`, { method: 'DELETE' }); toast('You left the waitlist'); my.reload(); } catch (err) { toast(errorText(err), 'error'); }
  };

  return (
    <div className="mx-auto max-w-[1080px]">
      <PageHeader title="My Learning" subtitle="Courses from all your communities, in one place"
        actions={communities.length > 1 && (
          <label className="text-3 flex items-center gap-2 text-sm">Community
            <select className="input !w-52" value={community} onChange={(e) => setCommunity(e.target.value)}>
              <option value="">All communities</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )} />
      {my.status === 'loading' && !my.courses.length ? <div aria-busy="true" aria-label="Loading your courses" className="raised h-48 animate-pulse" />
        : my.status === 'error' ? <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{my.message}</p><button className="btn btn-ghost mt-3" onClick={my.reload}>Try again</button></div>
          : my.courses.length === 0 ? (
            <section className="raised flex flex-col items-center gap-3 p-8 text-center">
              <Icon name="cap" size={28} />
              <h2 className="t-h2 text-white">No courses yet</h2>
              <p className="text-2 max-w-md">You haven’t enrolled in a course. Find one in your communities’ Learning tabs.</p>
              <Link to="/groups" className="btn btn-ghost">My Communities</Link>
            </section>
          ) : (
            <div className="flex flex-col gap-10">
              {first && <PickUp c={first} />}
              <Section title="In progress" n={inProgress.length} empty="Nothing in progress.">
                {more.map((c) => <Row key={c.id} c={c} action={c.nextLessonId && <Link to={lessonPath(c.nextLessonId)} className="btn btn-ghost">Continue</Link>} />)}
                {first && !more.length && <li className="text-3 py-3 text-sm">Only the course above.</li>}
              </Section>
              <Section title="Completed" n={completed.length} empty="No completed courses yet.">
                {completed.map((c) => <Row key={c.id} c={c} done action={<Pill tone="done"><Icon name="check" size={14} className="mr-1" />Completed</Pill>} />)}
              </Section>
              {waiting.length > 0 && (
                <Section title="On a waitlist" n={waiting.length}>
                  {waiting.map((c) => <Row key={c.id} c={c} waiting action={<button className="btn btn-ghost" onClick={() => leave(c)}>Leave</button>} />)}
                </Section>
              )}
              <p className="t-small">To build or edit a course, go to that community’s Learning tab.</p>
            </div>
          )}
    </div>
  );
}

/** The featured item: the next lesson of the most recently touched course in progress. */
function PickUp({ c }) {
  const { course } = useCourse(c.id);
  const next = course && nextLesson(course);
  return (
    <article aria-labelledby="pick-h" className={`cm-${accentOf(c.community)} raised flex flex-wrap items-center gap-5 p-5 sm:p-6`}>
      <CommunityTile c={c.community} size={56} />
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        <span id="pick-h" className="t-label cm-ink">Pick up where you left off · {c.community.name}</span>
        <h2 className="t-h2 text-white"><Link to={coursePath(c.community, c.id)} className="hover:underline">{c.title}</Link></h2>
        {next && <span className="t-small">Next: {[next.module.title, next.title, durationText(next.durationMin)].filter(Boolean).join(' · ')}</span>}
        <div className="flex items-center gap-3 pt-1"><Progress p={c.progress} className="flex-1" /><span className="t-small shrink-0">{c.progress.done} of {lessonsText(c.progress.total)}</span></div>
      </div>
      {c.nextLessonId && <Link to={lessonPath(c.nextLessonId)} className="btn btn-primary">Continue lesson</Link>}
    </article>
  );
}

function Section({ title, n, empty, children }) {
  return (
    <section aria-labelledby={`${title}-h`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id={`${title}-h`} className="t-h2 text-white">{title}</h2>
        <span className="t-small">{n} {n === 1 ? 'course' : 'courses'}</span>
      </div>
      {n === 0 ? <p className="text-3 border-t border-[var(--az-divider)] py-3 text-sm">{empty}</p> : <ul className="list-rows border-t border-[var(--az-divider)]">{children}</ul>}
    </section>
  );
}

function Row({ c, action, done = false, waiting = false }) {
  const detail = done ? `Completed ${new Date(c.enrollment.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : waiting ? 'On the waitlist' : `${c.progress.done} of ${lessonsText(c.progress.total)}`;
  return (
    <li className={`cm-${accentOf(c.community)} flex flex-wrap items-center gap-3 py-3`}>
      <CommunityTile c={c.community} size={40} />
      <span className="min-w-0 flex-[1_1_200px]">
        <Link to={coursePath(c.community, c.id)} className="block truncate font-semibold text-white hover:underline">{c.title}</Link>
        <span className="t-small">{c.community.name} · {detail}</span>
        {!done && !waiting && <Progress p={c.progress} label={`${c.title} progress`} className="mt-2 max-w-[240px]" />}
      </span>
      {action}
    </li>
  );
}
