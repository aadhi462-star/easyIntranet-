// My Learning (board S5MyLearning; v2 tokens, workstream D): every course this person is enrolled
// in or waiting for, across their communities. No admin tools here: courses are built in a
// community's Learning tab. Each course carries its community's tile and colour; progress bars
// stay in CommunityOne's accent. Leaving a community hides its courses; progress comes back on
// rejoining (LMS-09, server side).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { accentOf, errorText } from '../lib/communities.js';
import { coursePath, durationText, lessonPath, lessonsText, nextLesson, useCourse, useMyLearning } from '../lib/learning.js';
import { toast } from '../lib/toast.js';
import { CommunityTile } from '../components/public/CommunityCards.jsx';
import { Icon } from '../components/icons.jsx';
import { Progress } from '../components/learning/bits.jsx';
import { Badge, Button, Skeleton } from '../components/ui/Controls.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';

const dateText = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function MyLearning() {
  const my = useMyLearning();
  const certs = useCertificates();
  const [community, setCommunity] = useState('');
  useEffect(() => { document.title = 'My Learning · CommunityOne'; }, []);
  const communities = [...new Map(my.courses.map((c) => [c.community.id, c.community])).values()];
  const list = my.courses.filter((c) => !community || c.community.id === community);
  const inProgress = list.filter((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt);
  const completed = list.filter((c) => c.enrollment?.completedAt);
  const waiting = list.filter((c) => c.enrollment?.status === 'waitlist');
  const [first, ...more] = inProgress;

  const leave = async (c) => {
    if (!(await confirmAction(`Leave the waitlist for “${c.title}”?`))) return;
    try { await api(`/courses/${c.id}/enroll`, { method: 'DELETE' }); toast('You left the waitlist'); my.reload(); } catch (err) { toast(errorText(err), 'error'); }
  };

  return (
    <div className="mx-auto max-w-[1080px]">
      <header className="mb-8">
        <h1 className="t-h1 text-[var(--az-text)]">My Learning</h1>
        <p className="text-2 mt-1 text-[15px]">Courses from all your communities, in one place</p>
      </header>
      {my.status === 'loading' && !my.courses.length ? (
        <div className="panel flex flex-col gap-6 p-6">
          <Skeleton lines={3} label="Loading your courses" />
          <Skeleton lines={2} label="Loading" />
        </div>
      ) : my.status === 'error' ? (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <p><strong>Couldn’t load your courses.</strong> {my.message}</p>
          <Button variant="secondary" size="sm" onClick={my.reload}>Try again</Button>
        </div>
      ) : my.courses.length === 0 && !certs.list.length ? (
        <section className="panel flex flex-col items-center gap-3 p-8 text-center">
          <Icon name="cap" size={28} className="text-2" />
          <h2 className="t-h2 text-[var(--az-text)]">No courses yet</h2>
          <p className="text-2 max-w-md">You haven’t enrolled in a course. Find one in your communities’ Learning tabs.</p>
          <Link to="/groups" className="btn btn-secondary">My Communities</Link>
        </section>
      ) : (
        <div className={`grid gap-10 ${communities.length > 1 || waiting.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[auto_1fr]' : ''}`}>
          {communities.length > 1 && (
            <section aria-labelledby="show-h" className="lg:col-start-2 lg:row-start-1">
              <h2 id="show-h" className="t-h3 mb-2 text-[var(--az-text)]">Show</h2>
              <label className="block">
                <span className="text-2 mb-1.5 block text-sm">Community</span>
                <select className="input" value={community} onChange={(e) => setCommunity(e.target.value)}>
                  <option value="">All communities</option>{communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            </section>
          )}

          <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {first && <PickUp c={first} />}
            <Section title="In progress" n={inProgress.length} empty="Nothing in progress.">
              {more.map((c) => <Row key={c.id} c={c} action={c.nextLessonId && <Link to={lessonPath(c.nextLessonId)} className="btn btn-secondary btn-sm">Continue</Link>} />)}
              {first && !more.length && <li className="text-2 py-3 text-sm">Only the course above.</li>}
            </Section>
            <Section title="Completed" n={completed.length} empty="No completed courses yet.">
              {completed.map((c) => <Row key={c.id} c={c} done action={<Badge tone="ok" icon="check">Completed</Badge>} />)}
            </Section>
            {certs.list.length > 0 && <Certificates list={certs.list.filter((x) => !community || x.communityRef?.id === community)} />}
            <p className="t-small">To build or edit a course, go to that community’s Learning tab.</p>
          </div>

          {waiting.length > 0 && (
            <section aria-labelledby="wait-h" className="self-start lg:col-start-2 lg:row-start-2">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h2 id="wait-h" className="t-h3 text-[var(--az-text)]">On a waitlist</h2>
                <span className="t-small">{waiting.length} {waiting.length === 1 ? 'course' : 'courses'}</span>
              </div>
              <ul className="list-rows border-t border-[var(--az-divider)]">
                {waiting.map((c) => (
                  <li key={c.id} className={`cm-${accentOf(c.community)} flex items-center gap-3 py-3`}>
                    <CommunityTile c={c.community} size={32} />
                    <span className="min-w-0 flex-1">
                      <Link to={coursePath(c.community, c.id)} className="block truncate text-sm font-semibold text-[var(--az-text)] hit hover:underline">{c.title}</Link>
                      <span className="t-small block truncate">{c.community.name} · On the waitlist</span>
                    </span>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => leave(c)} aria-label={`Leave the waitlist for ${c.title}`}>Leave</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Certificates stay listed after leaving a community or a course being removed (ASM-11). */
function useCertificates() {
  const [list, setList] = useState([]);
  const load = useCallback(() => api('/me/certificates').then((d) => setList(d.certificates)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

function Certificates({ list }) {
  const copy = async (code) => {
    try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/verify/${code}`); toast('Verification link copied'); } catch { toast('Couldn’t copy the link.', 'error'); }
  };
  const cols = 'sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px_auto] sm:items-center sm:gap-4';
  return (
    <section aria-labelledby="cert-h">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="cert-h" className="t-h2 text-[var(--az-text)]">Certificates</h2>
        <Badge>{list.length}</Badge>
      </div>
      <div className="panel overflow-hidden">
        <div aria-hidden="true" className={`t-label hidden border-b border-[var(--az-hairline)] bg-[var(--az-band)] px-4 py-2.5 ${cols}`}>
          <span>Course</span><span>Community</span><span>Issued</span><span className="sr-only">Actions</span>
        </div>
        <ul className="list-rows">
          {list.map((x) => (
            <li key={x.code} className={`cm-${accentOf(x.communityRef ?? { id: x.community })} flex flex-col gap-2 px-4 py-3 ${cols}`}>
              <span className="flex min-w-0 items-center gap-3">
                <CommunityTile c={x.communityRef ?? { id: x.community, name: x.community }} size={28} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--az-text)]">{x.course}</span>
                  <span className="t-small block font-mono">{x.code}</span>
                </span>
              </span>
              <span className="text-2 truncate text-sm"><span className="sm:hidden">Community: </span>{x.community}</span>
              <span className="text-2 text-sm"><span className="sm:hidden">Issued </span>{dateText(x.issuedAt)}</span>
              <span className="flex gap-2">
                <Link to={`/verify/${x.code}`} className="btn btn-ghost btn-sm" aria-label={`View certificate for ${x.course}`}>View</Link>
                <Button variant="ghost" size="sm" onClick={() => copy(x.code)}>Copy link</Button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The featured item: the next lesson of the most recently touched course in progress. */
function PickUp({ c }) {
  const { course } = useCourse(c.id);
  const next = course && nextLesson(course);
  return (
    <article aria-labelledby="pick-h" style={{ borderLeftColor: 'var(--cm)' }}
      className={`cm-${accentOf(c.community)} panel flex flex-wrap items-center gap-5 border-l-4 p-5 sm:p-6`}>
      <CommunityTile c={c.community} size={56} />
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <span id="pick-h" className="t-label cm-ink">Pick up where you left off · {c.community.name}</span>
        <h2 className="t-h2 break-words text-[var(--az-text)]"><Link to={coursePath(c.community, c.id)} className="hover:underline">{c.title}</Link></h2>
        {next && <span className="t-small">Next: {[next.module.title, next.title, durationText(next.durationMin)].filter(Boolean).join(' · ')}</span>}
        <div className="flex items-center gap-3 pt-1"><Progress p={c.progress} className="flex-1" /><span className="t-small shrink-0">{c.progress.done} of {lessonsText(c.progress.total)}</span></div>
      </div>
      {c.nextLessonId && <Link to={lessonPath(c.nextLessonId)} className="btn btn-primary">Continue lesson</Link>}
    </article>
  );
}

function Section({ title, n, empty, children }) {
  const id = `${title.replace(/\s+/g, '-').toLowerCase()}-h`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id={id} className="t-h2 text-[var(--az-text)]">{title}</h2>
        <span className="t-small">{n} {n === 1 ? 'course' : 'courses'}</span>
      </div>
      {n === 0 ? <p className="text-2 border-t border-[var(--az-divider)] py-3 text-sm">{empty}</p> : <ul className="list-rows border-t border-[var(--az-divider)]">{children}</ul>}
    </section>
  );
}

function Row({ c, action, done = false }) {
  const detail = done ? `Completed ${dateText(c.enrollment.completedAt)}` : `${c.progress.done} of ${lessonsText(c.progress.total)}`;
  return (
    <li className={`cm-${accentOf(c.community)} flex flex-wrap items-center gap-3 py-3`}>
      <CommunityTile c={c.community} size={40} />
      <span className="min-w-0 flex-[1_1_200px]">
        <Link to={coursePath(c.community, c.id)} className="block truncate font-semibold text-[var(--az-text)] hit hover:underline">{c.title}</Link>
        <span className="t-small">{c.community.name} · {detail}</span>
        {!done && <Progress p={c.progress} label={`${c.title} progress`} className="mt-2 max-w-[240px]" />}
      </span>
      {action}
    </li>
  );
}
