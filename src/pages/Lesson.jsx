// The lesson viewer (boards S5Lesson, S5Mobile): the course outline beside the lesson on wide
// screens, a bottom-sheet outline on phones, and "Mark complete and continue". On phones the
// lesson is in focus mode: the bottom bar is hidden (Layout.jsx) and the actions are pinned.
// Files that fail to load say so, with Try again; nothing is marked complete on its own (LMS-10).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { accentOf, communityPath, errorText } from '../lib/communities.js';
import { coursePath, durationText, lessonPath } from '../lib/learning.js';
import { toast } from '../lib/toast.js';
import { Empty, Modal } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { KindBadge, LessonText, Progress } from '../components/learning/bits.jsx';
import Quiz from '../components/learning/Quiz.jsx';
import Assignment from '../components/learning/Assignment.jsx';

const MB = 1024 * 1024;
const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const FILE_BADGE = { pdf: 'PDF', image: 'IMG', office: 'DOC', text: 'TXT' };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function useLesson(id) {
  const [s, setS] = useState({ status: 'loading' });
  const load = useCallback(() => api(`/lessons/${encodeURIComponent(id)}`)
    .then((d) => setS({ status: 'ready', ...d }))
    .catch((e) => setS({ status: e.status === 404 ? 'missing' : e.code === 'NOT_ENROLLED' ? 'locked' : 'error', message: errorText(e) })), [id]);
  useEffect(() => { setS({ status: 'loading' }); load(); }, [load]);
  return { ...s, reload: load, setCourse: (course) => setS((p) => ({ ...p, course })) };
}

export default function Lesson() {
  const { id } = useParams();
  const nav = useNavigate();
  const l = useLesson(id);
  const [outline, setOutline] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (l.lesson) document.title = `${l.lesson.title} · CommunityOne`; }, [l.lesson]);

  if (l.status === 'loading') return <div aria-busy="true" aria-label="Loading lesson" className="mx-auto max-w-[760px] space-y-4"><div className="glass h-12 animate-pulse" /><div className="glass h-80 animate-pulse" /></div>;
  if (l.status === 'missing') return <Empty icon="search" title="Lesson not found">It may have been removed from its course. <Link to="/learning" className="text-brand-300 underline">My Learning</Link></Empty>;
  if (l.status === 'locked') return <Empty icon="lock" title="Enrol to open this lesson">{l.message} <button className="text-brand-300 underline" onClick={() => nav(-1)}>Go back</button></Empty>;
  if (l.status === 'error') return <div role="alert" className="glass p-6 text-center text-sm"><p className="text-rose-300">{l.message}</p><button className="btn btn-ghost mt-3" onClick={l.reload}>Try again</button></div>;

  const { lesson, course, community } = l;
  const flat = course.modules.flatMap((m) => m.lessons.map((x) => ({ ...x, module: m })));
  const index = flat.findIndex((x) => x.id === lesson.id);
  const mod = course.modules.find((m) => m.id === lesson.moduleId);
  const learner = course.enrollment?.status === 'active';
  const done = flat[index]?.done;
  const back = coursePath(community, course.id);
  // Quizzes and assignments complete when they're passed, never by hand (Stage 5b).
  const assessed = lesson.kind === 'quiz' || lesson.kind === 'assignment';

  // Marks this lesson (one row however often it's sent, LMS-05) and moves on.
  const complete = async () => {
    setBusy(true);
    try {
      const { course: fresh } = await api(`/lessons/${lesson.id}/complete`, { method: 'POST' });
      l.setCourse(fresh);
      if (fresh.enrollment?.completedAt && !course.enrollment?.completedAt) { toast(`Course complete: ${course.title}`); nav(back); }
      else if (lesson.nextId) nav(lessonPath(lesson.nextId));
      else nav(back);
    } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const primary = learner && !done && !assessed && course.status !== 'archived'
    ? <button className="btn btn-primary flex-1 sm:flex-none" disabled={busy} onClick={complete}>{busy ? 'Saving…' : lesson.nextId ? 'Mark complete and continue' : 'Mark complete'}</button>
    // An open quiz or assignment keeps the one main action in its own panel; moving on is secondary.
    : lesson.nextId ? <Link to={lessonPath(lesson.nextId)} className={`btn ${assessed && !done ? 'btn-ghost' : 'btn-primary'} flex-1 sm:flex-none`}>Next lesson</Link>
      : <Link to={back} className="btn btn-primary flex-1 sm:flex-none">Back to the course</Link>;

  return (
    <div className={`cm-${accentOf(community)} mx-auto grid max-w-[1180px] gap-8 pb-24 sm:pb-0 lg:grid-cols-[280px_minmax(0,1fr)]`}>
      <aside aria-label="Course outline" className="hidden lg:block">
        <div className="sticky top-24 flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto pr-1 scroll-thin">
          <Link to={back} className="text-sm text-brand-300 hover:underline">← {course.title}</Link>
          {learner && <div className="flex items-center gap-3"><Progress p={course.progress} className="flex-1" /><span className="t-small shrink-0">{course.progress.done} of {course.progress.total}</span></div>}
          <Outline course={course} current={lesson.id} />
        </div>
      </aside>

      <article className="flex min-w-0 max-w-[720px] flex-col gap-6">
        <nav aria-label="Breadcrumb" className="t-small flex flex-wrap items-center gap-2">
          <Link to={communityPath(community)} className="hover:text-white">{community.name}</Link><span aria-hidden="true">/</span>
          <Link to={back} className="hover:text-white">{course.title}</Link>
          <button className="btn btn-ghost ml-auto min-h-10 lg:hidden" onClick={() => setOutline(true)}><Icon name="list" size={18} />Outline</button>
        </nav>
        <header className="flex flex-col gap-2">
          <span className="t-label cm-ink">{mod?.title} · Lesson {index + 1} of {flat.length}</span>
          <h1 className="t-h1 text-white">{lesson.title}</h1>
          <p className="t-small">{[course.instructors.length ? `By ${course.instructors.map((i) => i.name).join(', ')}` : null, durationText(lesson.durationMin), !lesson.required && 'Optional'].filter(Boolean).join(' · ')}</p>
        </header>

        {lesson.body && <LessonText text={lesson.body} />}

        {(lesson.files.length > 0 || lesson.missingFiles > 0 || lesson.url) && (
          <section aria-labelledby="files-h" className="flex flex-col gap-2">
            <h2 id="files-h" className="t-h3 text-white">Lesson files and links</h2>
            <ul className="list-rows border-t border-[var(--az-divider)]">
              {lesson.files.map((f) => <FileRow key={f.id} f={f} />)}
              {lesson.missingFiles > 0 && (
                <li className="flex items-center gap-3 py-3 text-sm">
                  <KindBadge kind="file" />
                  <span className="text-amber-200">{lesson.missingFiles === 1 ? 'A file' : `${lesson.missingFiles} files`} in this lesson {lesson.missingFiles === 1 ? 'isn’t' : 'aren’t'} available any more. Ask the course’s instructors.</span>
                </li>
              )}
              {lesson.url && (
                <li>
                  <a href={lesson.url} target="_blank" rel="noopener noreferrer nofollow" className="flex min-h-14 items-center gap-3 py-3 text-sm hover:bg-white/[.02]">
                    <KindBadge kind="link" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{host(lesson.url)}</span><span className="t-small">Opens in a new tab, outside CommunityOne</span></span>
                    <span className="btn btn-ghost pointer-events-none">Open</span>
                  </a>
                </li>
              )}
            </ul>
            {lesson.files.length > 0 && learner && <p className="t-small">A lesson isn’t marked complete on its own. Mark it yourself when you’re done, even if a file didn’t load.</p>}
          </section>
        )}

        {lesson.kind === 'quiz' && l.quiz && <Quiz key={lesson.id} lesson={lesson} quiz={l.quiz} nextId={lesson.nextId} onChanged={l.reload} />}
        {lesson.kind === 'assignment' && l.assignment && (
          <Assignment key={lesson.id} lesson={lesson} assignment={l.assignment} communityId={community.id} learner={learner} nextId={lesson.nextId} onChanged={l.reload} />
        )}

        {!learner && <p className="band p-4 text-sm text-slate-300">You’re viewing this lesson as one of the course’s managers, so your progress isn’t tracked.</p>}

        {/* Actions: inline on wide screens, pinned within thumb reach on phones (S5Mobile). */}
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-[var(--az-hairline)] bg-[var(--az-sidebar)] p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:pt-4">
          {lesson.prevId ? <Link to={lessonPath(lesson.prevId)} className="btn btn-ghost" aria-label="Previous lesson"><span aria-hidden="true">‹</span><span className="hidden sm:inline">Previous</span></Link> : <span className="hidden sm:block sm:flex-1" />}
          <span className="hidden sm:block sm:flex-1" />
          {primary}
        </div>
      </article>

      {outline && (
        <Modal title="Outline" onClose={() => setOutline(false)}>
          <Outline course={course} current={lesson.id} onPick={() => setOutline(false)} />
        </Modal>
      )}
    </div>
  );
}

function Outline({ course, current, onPick }) {
  return (
    <div className="flex flex-col gap-4">
      {course.modules.filter((m) => m.lessons.length).map((m) => (
        <div key={m.id} className="flex flex-col gap-1">
          <span className="t-label px-3">{m.title}</span>
          <ul className="flex flex-col gap-0.5">
            {m.lessons.map((x) => (
              <li key={x.id}>
                <Link to={lessonPath(x.id)} onClick={onPick} aria-current={x.id === current ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${x.id === current ? 'bg-white/[.08] font-semibold text-white' : 'text-slate-300 hover:bg-white/[.04] hover:text-white'}`}>
                  <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${x.done ? 'bg-brand-400 text-ink-950' : x.id === current ? 'border-2 border-slate-400' : 'border-2 border-[var(--az-hairline)]'}`}>{x.done && <Icon name="check" size={12} />}</span>
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  {x.isNew && <span className="t-small">New</span>}
                  <span className="sr-only">{x.done ? '(done)' : ''}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * One lesson file. Download goes through fetch so a failure shows here, with Try again, instead
 * of a broken download (LMS-10). Images also show a preview, with the same failure state.
 */
function FileRow({ f }) {
  const [state, setState] = useState('idle'); // idle | busy | failed
  const [attempt, setAttempt] = useState(0);
  const download = async () => {
    setState('busy');
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(f.id)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState('idle');
    } catch { setState('failed'); }
  };
  const retry = () => { setAttempt((n) => n + 1); setState('idle'); };
  return (
    <li className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--az-sunken)] text-[10px] font-bold text-white">{FILE_BADGE[f.kind] ?? 'FILE'}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{f.name}</span>
          {state === 'failed' ? <span role="alert" className="text-xs text-rose-300">This file didn’t load.</span> : <span className="t-small">{sizeText(f.size)}</span>}
        </span>
        {state === 'failed'
          ? <button className="btn btn-ghost" onClick={retry}>Try again</button>
          : <button className="btn btn-ghost" disabled={state === 'busy'} onClick={download} aria-label={`Download ${f.name}`}><Icon name="download" size={16} />{state === 'busy' ? 'Downloading…' : 'Download'}</button>}
      </div>
      {f.kind === 'image' && state !== 'failed' && (
        <img key={attempt} src={`/api/files/${encodeURIComponent(f.id)}?inline=1${attempt ? `&try=${attempt}` : ''}`} alt={f.name} loading="lazy"
          onError={() => setState('failed')} className="max-h-[420px] w-auto max-w-full rounded-xl border border-[var(--az-hairline)] object-contain" />
      )}
    </li>
  );
}
