// The course builder (board S5Builder), for a course's Instructors and the community's Owners
// and Admins. Modules and lessons with Move up / Move down, the lesson editor, Instructors,
// settings, and publish / unpublish / archive. Every change goes to the server and the screen
// takes the course it sends back. Not offered on phones in 5a.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath, fromLocalInput, lessonsText, toLocalInput, useCourse } from '../../lib/learning.js';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Empty, Field } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { KindBadge, Pill, STATUS_LABEL } from './bits.jsx';

const MB = 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.md';
const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const orderOf = (course) => course.modules.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id) }));

export default function Builder({ g, id }) {
  const c = useCourse(id);
  const nav = useNavigate();
  const [selected, setSelected] = useState(null); // { lessonId } | { newIn: moduleId }
  const [busy, setBusy] = useState(false);

  // One write at a time; the course in the reply replaces the one on screen. A change someone
  // else made in the meantime (stale order or version) reloads, so nothing is overwritten blind.
  const write = async (fn, ok) => {
    setBusy(true);
    try { const d = await fn(); if (d?.course) c.set(d.course); if (ok) toast(ok); return d ?? true; } catch (err) {
      toast(errorText(err), 'error');
      if (['STALE_ORDER', 'STALE_VERSION'].includes(err.code)) c.reload();
      return null;
    } finally { setBusy(false); }
  };

  if (c.status === 'loading') return <div aria-busy="true" aria-label="Loading course builder" className="raised h-64 animate-pulse" />;
  if (c.status !== 'ready') return <Empty icon="search" title="Course not found">{c.message} <Link to={coursePath(g)} className="text-brand-300 underline">All courses</Link></Empty>;
  const course = c.course;
  if (!course.can.manage) return <Empty icon="lock" title="Only this course’s Instructors and the community’s Admins can edit it"><Link to={coursePath(g, course.id)} className="text-brand-300 underline">Back to the course</Link></Empty>;
  const archived = course.status === 'archived';
  const lessonCount = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const post = (path, ok) => write(() => api(`/courses/${course.id}/${path}`, { method: 'POST' }), ok);

  const move = (order) => write(() => api(`/courses/${course.id}/order`, { method: 'PUT', body: { modules: order } }));
  const moveLesson = (mi, li, dir) => {
    const o = orderOf(course);
    const [lesson] = o[mi].lessons.splice(li, 1);
    const to = li + dir;
    // Past the first or last lesson, it moves into the module before or after.
    if (to < 0) o[mi - 1].lessons.push(lesson);
    else if (to > o[mi].lessons.length) o[mi + 1].lessons.unshift(lesson);
    else o[mi].lessons.splice(to, 0, lesson);
    move(o);
  };
  const moveModule = (mi, dir) => { const o = orderOf(course); const [m] = o.splice(mi, 1); o.splice(mi + dir, 0, m); move(o); };

  return (
    <>
      <p className="glass p-5 text-sm text-slate-300 md:hidden">Build courses on a larger screen. <Link to={coursePath(g, course.id)} className="text-brand-300 underline">Back to the course</Link></p>
      <div className="hidden flex-col gap-6 md:flex">
        <header className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <span className="t-label">Course builder</span>
            <h2 className="t-h1 flex flex-wrap items-center gap-3 text-white">{course.title} <Pill tone="outline">{STATUS_LABEL[course.status]}</Pill></h2>
          </div>
          <Link to={coursePath(g, course.id)} className="btn btn-ghost">Preview as a member</Link>
          {course.status === 'published' ? <button className="btn btn-ghost" disabled={busy} onClick={() => post('unpublish', 'Unpublished. Enrolled learners keep access.')}>Unpublish</button>
            : !archived && (
              <span className="flex flex-col items-end gap-1">
                <button className="btn btn-primary" disabled={busy || !lessonCount} aria-describedby={lessonCount ? undefined : 'pub-why'} onClick={() => post('publish', 'Published')}>Publish</button>
                {!lessonCount && <span id="pub-why" className="t-small">Add at least one lesson to publish.</span>}
              </span>
            )}
        </header>
        {archived && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100">This course is archived. It’s read-only; learners keep reading it.</p>}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-labelledby="cc-h" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="cc-h" className="t-h2 text-white">Course content</h3>
                <span className="t-small">{lessonsText(lessonCount)}</span>
              </div>
              <p className="t-small -mt-1">Use the arrows to move lessons and modules. A lesson moved past the end of its module goes into the next one.</p>
              {course.modules.map((m, mi) => (
                <ModuleCard key={m.id} m={m} mi={mi} count={course.modules.length} busy={busy} archived={archived} selected={selected}
                  onSelect={setSelected} onMoveLesson={moveLesson} onMoveModule={moveModule} write={write} isLastModule={mi === course.modules.length - 1} />
              ))}
              {!archived && <AddModule courseId={course.id} write={write} busy={busy} />}
            </section>
            <Instructors g={g} course={course} write={write} busy={busy} />
          </div>
          <div className="flex min-w-0 flex-col gap-8 lg:sticky lg:top-24">
            {selected && !archived
              ? <LessonEditor key={selected.lessonId ?? `new-${selected.newIn}`} course={course} target={selected} write={write}
                  onCreated={(lessonId) => setSelected({ lessonId })} onClose={() => setSelected(null)} />
              : <section className="band p-5 text-sm text-slate-300">{archived ? 'Archived courses can’t be edited.' : 'Pick a lesson to edit it, or use Add lesson in a module.'}</section>}
            <Settings course={course} write={write} busy={busy} archived={archived} />
            <Lifecycle g={g} course={course} write={write} busy={busy} onDeleted={() => nav(coursePath(g))} />
          </div>
        </div>
      </div>
    </>
  );
}

function ModuleCard({ m, mi, count, busy, archived, selected, onSelect, onMoveLesson, onMoveModule, write, isLastModule }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(m.title);
  const rename = async (e) => {
    e.preventDefault();
    if (await write(() => api(`/modules/${m.id}`, { method: 'PATCH', body: { title } }))) setRenaming(false);
  };
  const remove = () => {
    if (m.lessons.length && !confirm(`Delete “${m.title}” and its ${lessonsText(m.lessons.length)}? Learners lose their progress on those lessons.`)) return;
    write(() => api(`/modules/${m.id}`, { method: 'DELETE' }), 'Module deleted');
  };
  return (
    <section aria-label={m.title} className="glass flex flex-col gap-1 p-3">
      <div className="flex min-h-11 items-center gap-1">
        {renaming ? (
          <form onSubmit={rename} className="flex flex-1 items-center gap-2">
            <input className="input flex-1" aria-label="Module title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <button className="btn btn-primary" disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setTitle(m.title); setRenaming(false); }}>Cancel</button>
          </form>
        ) : (
          <>
            <h4 className="min-w-0 flex-1 truncate px-2 text-[15px] font-semibold text-white">{m.title}</h4>
            {!archived && (
              <>
                <button className="btn btn-ghost min-h-10" onClick={() => setRenaming(true)}>Rename</button>
                <IconButton icon="up" label={`Move ${m.title} up`} disabled={busy || mi === 0} onClick={() => onMoveModule(mi, -1)} />
                <IconButton icon="down" label={`Move ${m.title} down`} disabled={busy || mi === count - 1} onClick={() => onMoveModule(mi, 1)} />
                {count > 1 && <IconButton icon="x" label={`Delete ${m.title}`} disabled={busy} onClick={remove} />}
              </>
            )}
          </>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {m.lessons.map((l, li) => {
          const on = selected?.lessonId === l.id;
          return (
            <li key={l.id} className={`flex items-center gap-1 rounded-lg pr-1 ${on ? 'bg-white/[.08]' : ''}`}>
              <button className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-white/[.04]" aria-current={on ? 'true' : undefined}
                disabled={archived} onClick={() => onSelect({ lessonId: l.id })}>
                <KindBadge kind={l.kind} className="!h-8 !w-8" />
                <span className={`min-w-0 flex-1 truncate ${on ? 'font-semibold text-white' : 'text-slate-200'}`}>{l.title}</span>
                {!l.required && <span className="t-small">Optional</span>}
              </button>
              {!archived && (
                <>
                  <IconButton icon="up" label={`Move ${l.title} up`} disabled={busy || (mi === 0 && li === 0)} onClick={() => onMoveLesson(mi, li, -1)} />
                  <IconButton icon="down" label={`Move ${l.title} down`} disabled={busy || (isLastModule && li === m.lessons.length - 1)} onClick={() => onMoveLesson(mi, li, 1)} />
                </>
              )}
            </li>
          );
        })}
      </ul>
      {m.lessons.length === 0 && <p className="t-small px-2 py-2">No lessons in this module yet.</p>}
      {!archived && <button className={`btn btn-ghost mt-1 self-start ${selected?.newIn === m.id ? 'bg-white/[.08]' : ''}`} onClick={() => onSelect({ newIn: m.id })}><Icon name="plus" size={16} />Add lesson</button>}
    </section>
  );
}

function IconButton({ icon, label, ...rest }) {
  return <button type="button" className="btn btn-ghost h-10 w-10 shrink-0 !p-0" aria-label={label} title={label} {...rest}><Icon name={icon} size={16} /></button>;
}

function AddModule({ courseId, write, busy }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const save = async (e) => {
    e.preventDefault();
    if (await write(() => api(`/courses/${courseId}/modules`, { method: 'POST', body: { title } }), 'Module added')) { setTitle(''); setOpen(false); }
  };
  if (!open) return <button className="btn btn-ghost self-start" onClick={() => setOpen(true)}><Icon name="plus" size={16} />Add module</button>;
  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input className="input flex-1" aria-label="New module title" placeholder="Module title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <button className="btn btn-primary" disabled={busy}>Add</button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

const KINDS = [['text', 'Text'], ['file', 'File'], ['link', 'Link'], ['quiz', 'Quiz'], ['assignment', 'Assignment']];
const BODY_LABEL = { text: 'Text', quiz: 'Introduction', assignment: 'Instructions' };

/** Edit a lesson (its text, link and files come from GET /lessons/:id), or write a new one. */
function LessonEditor({ course, target, write, onCreated, onClose }) {
  const isNew = !target.lessonId;
  const blank = { title: '', kind: 'text', body: '', url: '', durationMin: '', required: true, files: [],
    quiz: { passPercent: 70, maxAttempts: 3, dueAt: '' }, assignment: { points: 10, passPoints: 6, dueAt: '' } };
  const [v, setV] = useState(isNew ? blank : null);
  const [questions, setQuestions] = useState(null); // a quiz's questions, once it's saved
  const [savedKind, setSavedKind] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const picker = useRef(null);
  useEffect(() => {
    if (isNew) return;
    api(`/lessons/${target.lessonId}`)
      .then(({ lesson: l, quiz, assignment }) => {
        setV({ ...blank, title: l.title, kind: l.kind, body: l.body ?? '', url: l.url ?? '', durationMin: l.durationMin ?? '', required: l.required, files: l.files,
          ...(quiz ? { quiz: { passPercent: quiz.passPercent, maxAttempts: quiz.maxAttempts, dueAt: toLocalInput(quiz.dueAt) } } : {}),
          ...(assignment ? { assignment: { points: assignment.points, passPoints: assignment.passPoints, dueAt: toLocalInput(assignment.dueAt) } } : {}) });
        setSavedKind(l.kind);
        if (quiz) setQuestions(quiz.questions ?? []);
      })
      .catch((e) => setLoadError(errorText(e)));
  }, [isNew, target.lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <section role="alert" className="band p-5 text-sm text-rose-300">{loadError}</section>;
  if (!v) return <section aria-busy="true" aria-label="Loading lesson" className="band h-72 animate-pulse" />;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setIn = (group, k) => (e) => setV({ ...v, [group]: { ...v[group], [k]: e.target.value } });
  const moduleTitle = course.modules.find((m) => m.id === (target.newIn ?? course.modules.find((x) => x.lessons.some((l) => l.id === target.lessonId))?.id))?.title;

  const pick = async (e) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const file of list) {
      if (file.size > 10 * MB) { setError(`${file.name} is over 10 MB.`); continue; }
      setUploading(true); setError('');
      try { const f = await uploadFile(course.communityId, file); setV((p) => ({ ...p, files: [...p.files, f] })); } catch (err) { setError(errorText(err)); } finally { setUploading(false); }
    }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { title: v.title, kind: v.kind, body: v.body || null, url: v.kind === 'link' ? v.url : null,
      fileIds: v.kind === 'file' ? v.files.map((f) => f.id) : [], durationMin: v.durationMin === '' ? null : Number(v.durationMin), required: v.required,
      ...(v.kind === 'quiz' ? { quiz: { passPercent: Number(v.quiz.passPercent), maxAttempts: Number(v.quiz.maxAttempts), dueAt: fromLocalInput(v.quiz.dueAt) } } : {}),
      ...(v.kind === 'assignment' ? { assignment: { points: Number(v.assignment.points), passPoints: Number(v.assignment.passPoints), dueAt: fromLocalInput(v.assignment.dueAt) } } : {}) };
    try {
      const d = isNew ? await api(`/modules/${target.newIn}/lessons`, { method: 'POST', body }) : await api(`/lessons/${target.lessonId}`, { method: 'PATCH', body });
      await write(async () => d);
      setSavedAt(new Date());
      setSavedKind(v.kind);
      if (v.kind === 'quiz' && !questions) setQuestions([]);
      if (isNew) { toast(v.kind === 'quiz' ? 'Quiz added. Now add its questions.' : 'Lesson added'); onCreated(d.lessonId); }
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete “${v.title}”? Learners lose their progress on it.`)) return;
    if (await write(() => api(`/lessons/${target.lessonId}`, { method: 'DELETE' }), 'Lesson deleted')) onClose();
  };

  return (
    <section aria-labelledby="le-h" className="raised flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="le-h" className="t-h2 text-white">{isNew ? 'New lesson' : 'Edit lesson'}</h3>
        <span className="t-small" aria-live="polite">{savedAt ? `Saved ${savedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : moduleTitle}</span>
      </div>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <Field label="Title"><input className="input" required maxLength={160} value={v.title} onChange={set('title')} /></Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Type</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([k, label]) => (
              <label key={k} className={`flex min-h-11 min-w-[92px] flex-1 cursor-pointer px-3 items-center justify-center rounded-lg border text-sm ${v.kind === k ? 'border-brand-400 bg-brand-400/10 font-semibold text-white' : 'border-[var(--az-hairline)] text-slate-300'}`}>
                <input type="radio" name="kind" value={k} checked={v.kind === k} onChange={set('kind')} className="sr-only" />{label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={BODY_LABEL[v.kind] ?? 'Introduction'} hint="Leave a blank line between paragraphs. Start a line with ## for a heading, or - for a list. Links become clickable.">
          <textarea className="input min-h-40 font-[inherit]" maxLength={20000} required={v.kind === 'text'} value={v.body} onChange={set('body')} />
        </Field>
        {v.kind === 'link' && (
          <Field label="Link address" hint="Opens outside CommunityOne in a new tab. For a video, paste its link.">
            <input className="input" type="url" required placeholder="https://" value={v.url} onChange={set('url')} />
          </Field>
        )}
        {v.kind === 'file' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-300">Files</span>
            {v.files.length > 0 && (
              <ul className="sunken flex flex-col divide-y divide-[var(--az-divider)] text-sm">
                {v.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-white">{f.name}</span><span className="t-small shrink-0">{sizeText(f.size)}</span>
                    <IconButton icon="x" label={`Remove ${f.name}`} onClick={() => setV({ ...v, files: v.files.filter((x) => x.id !== f.id) })} />
                  </li>
                ))}
              </ul>
            )}
            <input ref={picker} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
            <button type="button" className="btn btn-ghost self-start" disabled={uploading} onClick={() => picker.current?.click()}>{uploading ? 'Uploading…' : 'Upload files'}</button>
            <span className="t-small">PDF, slides, documents or images, up to 10 MB each. Files aren’t scanned for viruses.</span>
          </div>
        )}
        {v.kind === 'quiz' && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Pass mark (%)"><input className="input !w-28" type="number" min={1} max={100} required value={v.quiz.passPercent} onChange={setIn('quiz', 'passPercent')} /></Field>
            <Field label="Attempts"><input className="input !w-24" type="number" min={1} max={20} required value={v.quiz.maxAttempts} onChange={setIn('quiz', 'maxAttempts')} /></Field>
            <Field label="Due (optional)"><input className="input" type="datetime-local" value={v.quiz.dueAt} onChange={setIn('quiz', 'dueAt')} /></Field>
          </div>
        )}
        {v.kind === 'assignment' && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Points"><input className="input !w-28" type="number" min={1} max={1000} required value={v.assignment.points} onChange={setIn('assignment', 'points')} /></Field>
            <Field label="Pass mark"><input className="input !w-28" type="number" min={0} max={v.assignment.points || 1000} required value={v.assignment.passPoints} onChange={setIn('assignment', 'passPoints')} /></Field>
            <Field label="Due (optional)" hint="Late work is still accepted, marked late."><input className="input" type="datetime-local" value={v.assignment.dueAt} onChange={setIn('assignment', 'dueAt')} /></Field>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Duration (minutes)"><input className="input !w-32" type="number" min={1} max={600} value={v.durationMin} onChange={set('durationMin')} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={v.required} onChange={set('required')} className="h-4 w-4 accent-[var(--color-brand-400)]" />Required to complete the course</label>
        </div>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy || uploading}>{busy ? 'Saving…' : isNew ? 'Add lesson' : 'Save lesson'}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          {!isNew && <button type="button" className="btn btn-ghost ml-auto text-rose-300" onClick={remove}>Delete lesson</button>}
        </div>
      </form>
      {!isNew && savedKind === 'quiz' && questions && <Questions lessonId={target.lessonId} initial={questions} write={write} />}
    </section>
  );
}

const emptyQuestion = () => ({ key: crypto.randomUUID(), prompt: '', choices: ['', ''], answer: null });

/**
 * A quiz's questions, saved together. The server checks each one (2–6 different choices and a
 * right answer, ASM-13); changing them doesn't affect attempts already started (ASM-04).
 */
function Questions({ lessonId, initial, write }) {
  const [list, setList] = useState(() => (initial.length ? initial.map((q) => ({ ...q, key: q.id })) : [emptyQuestion()]));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!initial.length);
  const change = (i, patch) => { setList(list.map((q, n) => (n === i ? { ...q, ...patch } : q))); setDirty(true); };
  const save = async () => {
    setError('');
    const missing = list.findIndex((q) => q.answer == null);
    if (missing >= 0) { setError(`Pick the right answer for question ${missing + 1}.`); return; }
    setBusy(true);
    try {
      const d = await api(`/lessons/${lessonId}/questions`, { method: 'PUT', body: { questions: list.map((q) => ({ prompt: q.prompt, choices: q.choices, answer: q.answer })) } });
      await write(async () => d, 'Questions saved');
      setDirty(false);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="qs-h" className="flex flex-col gap-4 border-t border-[var(--az-divider)] pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id="qs-h" className="t-h3 text-white">Questions</h4>
        <span className="t-small">{list.length} · multiple choice, one right answer</span>
      </div>
      <ol className="flex flex-col gap-4">
        {list.map((q, i) => (
          <li key={q.key} className="sunken flex flex-col gap-3 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1"><Field label={`Question ${i + 1}`}><textarea className="input min-h-16" maxLength={1000} value={q.prompt} onChange={(e) => change(i, { prompt: e.target.value })} /></Field></div>
              {list.length > 1 && <IconButton icon="x" label={`Remove question ${i + 1}`} onClick={() => { setList(list.filter((_, n) => n !== i)); setDirty(true); }} />}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs font-semibold text-slate-300">Choices · mark the right one</legend>
              {q.choices.map((ch, k) => (
                <div key={k} className="flex items-center gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-xs text-slate-300">
                    <input type="radio" name={`right-${q.key}`} checked={q.answer === k} onChange={() => change(i, { answer: k })} className="h-4 w-4 accent-[var(--color-brand-400)]" />
                    <span className="sr-only">Choice {k + 1} is the right answer</span>
                  </label>
                  <input className="input flex-1" aria-label={`Question ${i + 1}, choice ${k + 1}`} maxLength={300} value={ch}
                    onChange={(e) => change(i, { choices: q.choices.map((c, n) => (n === k ? e.target.value : c)) })} />
                  {q.choices.length > 2 && <IconButton icon="x" label={`Remove choice ${k + 1}`} onClick={() => change(i, {
                    choices: q.choices.filter((_, n) => n !== k), answer: q.answer === k ? null : q.answer > k ? q.answer - 1 : q.answer })} />}
                </div>
              ))}
              {q.choices.length < 6 && <button type="button" className="btn btn-ghost self-start" onClick={() => change(i, { choices: [...q.choices, ''] })}><Icon name="plus" size={16} />Add choice</button>}
            </fieldset>
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost" disabled={list.length >= 50} onClick={() => { setList([...list, emptyQuestion()]); setDirty(true); }}><Icon name="plus" size={16} />Add question</button>
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : dirty ? 'Save questions' : 'Questions saved'}</button>
      </div>
      <p className="t-small">Learners who already started an attempt keep the questions they started with.</p>
    </section>
  );
}

function Instructors({ g, course, write, busy }) {
  const { user } = useStore();
  const [pick, setPick] = useState('');
  const taken = new Set(course.instructors.map((i) => i.id));
  const options = g.members.filter((uid) => !taken.has(uid)).map((uid) => ({ id: uid, name: user(uid)?.name })).filter((o) => o.name).sort((a, b) => a.name.localeCompare(b.name));
  const can = course.can.assignInstructors;
  const add = async (e) => {
    e.preventDefault();
    if (pick && await write(() => api(`/courses/${course.id}/instructors`, { method: 'POST', body: { userId: pick } }), 'Instructor added')) setPick('');
  };
  return (
    <section aria-labelledby="in-h" className="flex flex-col gap-3">
      <h3 id="in-h" className="t-h2 text-white">Instructors</h3>
      {course.instructors.length === 0 ? <p className="t-small">No Instructors yet. The community’s Owners and Admins manage this course.</p> : (
        <ul className="list-rows border-t border-[var(--az-divider)]">
          {course.instructors.map((i) => (
            <li key={i.id} className="flex min-h-12 items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-white">{i.name} <span className="t-small">· Instructor</span></span>
              {can && <IconButton icon="x" label={`Remove ${i.name} as Instructor`} disabled={busy} onClick={() => write(() => api(`/courses/${course.id}/instructors/${i.id}`, { method: 'DELETE' }), 'Instructor removed')} />}
            </li>
          ))}
        </ul>
      )}
      {can && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <select className="input min-w-0 flex-1" aria-label={`Member of ${g.name}`} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a member…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={busy || !pick}>Add instructor</button>
        </form>
      )}
      <p className="t-small">An Instructor can edit and teach only this course. Only the community’s Owners and Admins assign them.</p>
    </section>
  );
}

function Settings({ course, write, busy, archived }) {
  const initial = () => ({ title: course.title, description: course.description ?? '', category: course.category ?? '', objectives: (course.objectives ?? []).join('\n'),
    requirements: course.requirements ?? '', visibility: course.visibility, limit: course.capacity != null, capacity: course.capacity ?? 20 });
  const [v, setV] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => { setV(initial()); }, [course.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setError('');
    const body = { version: course.version, title: v.title, description: v.description || null, category: v.category || null,
      objectives: v.objectives.split('\n').map((x) => x.trim()).filter(Boolean), requirements: v.requirements || null, visibility: v.visibility, capacity: v.limit ? Number(v.capacity) : null };
    if (body.objectives.length > 12) { setError('Up to 12 things people will learn.'); return; }
    await write(() => api(`/courses/${course.id}`, { method: 'PATCH', body }), 'Course saved');
  };
  return (
    <section aria-labelledby="cs-h" className="flex flex-col gap-3">
      <h3 id="cs-h" className="t-h2 text-white">Course settings</h3>
      <form className="flex flex-col gap-4" onSubmit={save}>
        <fieldset disabled={archived} className="flex flex-col gap-4">
          <Field label="Title"><input className="input" required maxLength={160} value={v.title} onChange={set('title')} /></Field>
          <Field label="Description"><textarea className="input min-h-24" maxLength={4000} value={v.description} onChange={set('description')} /></Field>
          <Field label="What you’ll learn" hint="One per line, up to 12."><textarea className="input min-h-24" value={v.objectives} onChange={set('objectives')} /></Field>
          <Field label="Requirements" hint="Optional, one per line. Membership of the community is always listed."><textarea className="input min-h-16" maxLength={1000} value={v.requirements} onChange={set('requirements')} /></Field>
          <Field label="Category" hint="Optional, for example Careers"><input className="input" maxLength={40} value={v.category} onChange={set('category')} /></Field>
          <Field label="Who can see it">
            <select className="input" value={v.visibility} onChange={set('visibility')}>
              <option value="members">Everyone who can see the community</option><option value="hidden">Hidden from the catalogue (link only)</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={v.limit} onChange={set('limit')} className="h-4 w-4 accent-[var(--color-brand-400)]" />Limit places</label>
            {v.limit && <Field label="Places"><input className="input !w-28" type="number" min={1} max={100000} required value={v.capacity} onChange={set('capacity')} /></Field>}
          </div>
          <p className="t-small">With a limit, a full course gets a waitlist, like events. Raising the limit lets the next people in.</p>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button className="btn btn-primary self-start" disabled={busy}>Save settings</button>
        </fieldset>
      </form>
    </section>
  );
}

function Lifecycle({ course, write, busy, onDeleted }) {
  const archived = course.status === 'archived';
  const archive = () => confirm('Archive this course? It becomes read-only and leaves the catalogue. Learners keep reading it and keep their progress.')
    && write(() => api(`/courses/${course.id}/archive`, { method: 'POST' }), 'Course archived');
  const remove = async () => {
    if (!confirm(`Delete “${course.title}”? This can’t be undone.`)) return;
    if (await write(() => api(`/courses/${course.id}`, { method: 'DELETE' }), 'Course deleted')) onDeleted();
  };
  if (archived) return null;
  return (
    <section aria-labelledby="lc-h" className="band flex flex-col gap-3 p-5">
      <h3 id="lc-h" className="t-h3 text-white">Unpublish or archive</h3>
      <p className="text-2 text-sm">Unpublish stops new enrolments; enrolled learners keep access and progress.</p>
      <p className="text-2 text-sm">A course people have enrolled in can’t be deleted, only archived.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={archive}>Archive</button>
        {course.can.assignInstructors && course.enrolledCount + course.waitlistCount === 0 && <button className="btn btn-ghost text-rose-300" disabled={busy} onClick={remove}>Delete course</button>}
      </div>
    </section>
  );
}
