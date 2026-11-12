// Work to grade (board S5Grading; restyled in v2 G, with the Learning row Courses · Teaching · Grading): submissions in the courses this person teaches in a
// community, oldest first. Opening one to grade takes it, so only one instructor grades it at a
// time (ASM-06); others see who has it and can read but not grade. An Instructor only sees their
// own courses (ASM-07, decided by the server).
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Pill } from './bits.jsx';
import { sizeText } from './Assignment.jsx';
import { whenText } from './Quiz.jsx';
import { Button, Skeleton } from '../ui/Controls.jsx';
import LearningNav from '../teaching/LearningNav.jsx';

const FILTERS = [['to_grade', 'To grade'], ['graded', 'Graded'], ['all', 'All']];
const shortDate = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function Grading({ g }) {
  const [status, setStatus] = useState('to_grade');
  const [course, setCourse] = useState('');
  const [s, setS] = useState({ state: 'loading', submissions: [], courses: [] });
  // ?open=<id> (from Teaching's Grade and Read) opens that submission straight away.
  const [params] = useSearchParams();
  const [open, setOpen] = useState(() => params.get('open')); // submission id
  const load = useCallback(() => {
    const p = new URLSearchParams({ status, ...(course ? { course } : {}) });
    return api(`/communities/${encodeURIComponent(g.id)}/grading?${p}`)
      .then((d) => setS({ state: 'ready', ...d }))
      .catch((e) => setS((x) => ({ ...x, state: e.code === 'NOT_A_GRADER' ? 'denied' : 'error', message: errorText(e) })));
  }, [g.id, status, course]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = `Grading · ${g.name} · CommunityOne`; }, [g.name]);

  if (s.state === 'denied') {
    return (
      <section className="panel flex flex-col items-center gap-2 p-8 text-center">
        <span className="text-[var(--az-text-3)]"><Icon name="lock" size={28} /></span>
        <h2 className="t-h3">Grading is for Instructors, Teaching Assistants and Admins</h2>
        <p className="text-2 max-w-md text-sm">{s.message}</p>
        <Link to={coursePath(g)} className="link text-sm">All courses</Link>
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <LearningNav g={g} current="grading" toGrade={status === 'to_grade' && s.state === 'ready' && !course ? s.submissions.length || undefined : undefined} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_240px]">
          <h2 className="t-h1">Work to grade</h2>
          <p className="t-small">{s.state === 'ready' ? `${s.submissions.length} ${status === 'to_grade' ? 'to grade' : 'shown'} · oldest first` : ' '}</p>
        </div>
        {s.courses.length > 1 && (
          <label className="text-2 flex items-center gap-2 text-sm">Course
            <select className="input !w-auto max-w-[14rem]" value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">All your courses</option>{s.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" className="filter-chip" aria-pressed={status === id} onClick={() => { setStatus(id); setOpen(null); }}>{label}</button>
        ))}
      </div>

      {s.state === 'loading' ? <div className="panel p-5"><Skeleton lines={4} label="Loading work to grade" /></div>
        : s.state === 'error' ? <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3"><span><strong>Couldn’t load work to grade.</strong> {s.message}</span><Button size="sm" onClick={load}>Try again</Button></div>
          : s.submissions.length === 0 ? <section className="panel flex flex-col items-center gap-2 p-8 text-center"><h3 className="t-h3">{status === 'to_grade' ? 'Nothing to grade' : 'Nothing here yet'}</h3><p className="text-2 text-sm">{status === 'to_grade' ? 'Submissions show here when learners send them.' : 'Returned work shows up here.'}</p></section>
            : (
              <ul className="panel list-rows overflow-hidden">
                {s.submissions.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}
                      className={`flex min-h-14 w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-[var(--az-sunken)] ${open === x.id ? 'bg-[var(--az-sunken)]' : ''}`}>
                      <span className="min-w-0 flex-[1_1_160px] font-semibold">{x.learner.name}</span>
                      <span className="text-2 min-w-0 flex-[2_1_220px] truncate">{x.lesson.title} · {x.course.title}</span>
                      <span className="t-small w-16 shrink-0">{shortDate(x.submittedAt)}</span>
                      <span className="shrink-0"><Status x={x} /></span>
                    </button>
                    {open === x.id && <Grade key={x.id} id={x.id} onDone={() => { setOpen(null); load(); }} onLockChanged={load} />}
                  </li>
                ))}
              </ul>
            )}
      <p className="t-small">Opening work to grade takes it for 30 minutes, so two people don’t grade it at once. Close it to let someone else take it.</p>
    </div>
  );
}

function Status({ x }) {
  if (x.status === 'returned') return <Pill tone={x.passed ? 'done' : 'warn'}>{x.grade} · {x.passed ? 'Passed' : 'Not passed'}</Pill>;
  if (x.lockedBy?.me) return <Pill tone="outline">You’re grading</Pill>;
  if (x.lockedBy) return <Pill tone="warn"><Icon name="lock" size={12} className="mr-1" />{x.lockedBy.name} is grading this</Pill>;
  return <Pill>{x.late ? 'To grade · late' : 'To grade'}</Pill>;
}

/** One submission, opened to grade (claimed) when it's waiting, or read-only otherwise. */
function Grade({ id, onDone, onLockChanged }) {
  const [s, setS] = useState({ state: 'loading' });
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      let d;
      try { d = await api(`/submissions/${id}/claim`, { method: 'POST' }); onLockChanged(); } catch (err) {
        // Someone else has it, or it's already returned: read it without grading.
        try { d = await api(`/submissions/${id}`); } catch (e2) { if (live) setS({ state: 'error', message: errorText(e2) }); return; }
        if (err.code === 'LOCKED' && live) setError(err.message);
      }
      if (!live) return;
      setS({ state: 'ready', sub: d.submission });
      setGrade(d.submission.draftGrade ?? d.submission.grade ?? '');
      setFeedback(d.submission.draftFeedback ?? d.submission.feedback ?? '');
    })();
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (s.state === 'loading') return <div className="p-4"><Skeleton lines={4} label="Opening the work" /></div>;
  if (s.state === 'error') return <p role="alert" className="notice notice-bad m-3">{s.message}</p>;
  const sub = s.sub;
  const mine = sub.lockedBy?.me && sub.status === 'submitted';
  const act = async (path, method, body, ok) => {
    setBusy(true); setError('');
    try { const d = await api(`/submissions/${id}/${path}`, { method, body }); toast(ok); return d; } catch (err) { setError(errorText(err)); return null; } finally { setBusy(false); }
  };
  const payload = () => ({ grade: grade === '' ? null : Number(grade), feedback: feedback || null });
  const close = async () => { if (mine) await api(`/submissions/${id}/claim`, { method: 'DELETE' }).catch(() => {}); onDone(); };

  return (
    <section aria-label={`${sub.learner.name}’s work`} className="m-3 flex flex-col gap-4 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-raised)] p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="t-h3 break-words">{sub.learner.name} · {sub.lesson.title}</h3>
          <span className="t-small">Sent {whenText(sub.submittedAt)}{sub.late ? ' · late' : ''}</span>
        </div>
        {mine && <Pill tone="outline">You’re grading</Pill>}
      </div>
      {sub.lesson.instructions && <details className="text-sm"><summary className="t-small cursor-pointer">The instructions</summary><p className="text-2 mt-2 whitespace-pre-line">{sub.lesson.instructions}</p></details>}
      <div className="flex flex-col gap-2">
        <span className="t-label">Their answer</span>
        {sub.body ? <p className="t-body whitespace-pre-line break-words">{sub.body}</p> : <p className="t-small">No written answer.</p>}
        {sub.files.map((f) => <a key={f.id} href={`/api/files/${f.id}`} download className="link flex items-center gap-2 text-sm"><Icon name="paperclip" size={16} />{f.name} · {sizeText(f.size)}</a>)}
      </div>
      {error && <p role="alert" className="notice notice-warn">{error}</p>}
      {sub.status === 'returned' ? (
        <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--az-sunken)] p-4 text-sm">
          <span className="font-semibold">Returned: {sub.grade} of {sub.points} · {sub.passed ? 'Passed' : 'Not passed'}</span>
          {sub.feedback && <p className="text-2 whitespace-pre-line">{sub.feedback}</p>}
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={async (e) => { e.preventDefault(); if (await act('return', 'POST', payload(), 'Returned to the learner')) onDone(); }}>
          <fieldset disabled={!mine || busy} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Feedback for {sub.learner.name}</span><textarea className="input min-h-28" maxLength={5000} placeholder="What went well, what to improve" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5"><span className="text-sm font-medium">Grade (out of {sub.assignment.points})</span><input className="input !w-32" type="number" min={0} max={sub.assignment.points} required value={grade} onChange={(e) => setGrade(e.target.value)} /></label>
              <span className="t-small pb-3">Pass mark {sub.assignment.passPoints}</span>
              <span className="flex-1" />
              <button type="button" className="btn btn-secondary" onClick={() => act('draft', 'PATCH', payload(), 'Draft saved')}>Save draft</button>
              <button className="btn btn-primary">Return to learner</button>
            </div>
          </fieldset>
          <p className="t-small">The learner gets a notification with the grade and feedback. Drafts are seen only by the course’s instructors.</p>
        </form>
      )}
      <button type="button" className="btn btn-ghost self-start" onClick={close}>Close</button>
    </section>
  );
}
