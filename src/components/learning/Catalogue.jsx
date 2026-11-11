// A community's Learning tab (board S5LearningTab): "Continue where you left off", then the
// catalogue with search, category, sort and a status filter. Admins also see drafts and New
// course; Instructors see drafts of their own courses only (the server decides, LMS-14).
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { coursePath, durationText, gradingPath, lessonPath, lessonsText, nextLesson, standing, useCatalogue, useCourse } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Pill, Progress, STATUS_LABEL } from './bits.jsx';

const FILTERS = [['all', 'All'], ['enrolled', 'Enrolled'], ['new', 'Not started'], ['done', 'Completed']];
const enrolled = (c) => c.enrollment && c.enrollment.status !== 'left';
const FILTER_TEST = {
  all: () => true,
  enrolled: (c) => enrolled(c) && !c.enrollment.completedAt,
  new: (c) => !enrolled(c) || (c.enrollment.status === 'active' && c.progress.done === 0 && !c.enrollment.completedAt),
  done: (c) => !!c.enrollment?.completedAt,
};

export default function Catalogue({ g }) {
  const cat = useCatalogue(g.id);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const categories = useMemo(() => [...new Set(cat.courses.map((c) => c.category).filter(Boolean))].sort(), [cat.courses]);
  const q = text.trim().toLowerCase();
  const shown = cat.courses
    .filter((c) => (!q || `${c.title} ${c.description ?? ''}`.toLowerCase().includes(q)) && (!category || c.category === category) && FILTER_TEST[filter](c))
    .sort(sort === 'az' ? (a, b) => a.title.localeCompare(b.title) : () => 0);
  const filtered = !!(q || category || filter !== 'all');
  // The one featured item: the course in progress that was touched last (catalogue order is newest first).
  const current = cat.courses.find((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt);
  const count = (fn) => cat.courses.filter(fn).length;

  if (cat.status === 'loading' && !cat.courses.length) return <div aria-busy="true" aria-label="Loading courses" className="raised h-48 animate-pulse" />;
  if (cat.status === 'error') return <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{cat.message}</p><button className="btn btn-ghost mt-3" onClick={cat.reload}>Try again</button></div>;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-6">
        {current && <ContinueCard g={g} id={current.id} />}
        {cat.courses.length === 0 ? (
          <section className="raised flex flex-col items-center gap-3 p-8 text-center">
            <Icon name="cap" size={28} />
            <h2 className="t-h2 text-white">No courses yet</h2>
            {cat.canCreate && <p className="text-2 max-w-md">Create the first course for {g.name}: lessons can be text, files or links.</p>}
            {cat.canCreate && <button className="btn btn-primary hidden md:inline-flex" onClick={() => setCreating(true)}>New course</button>}
            {cat.canCreate && <p className="t-small md:hidden">Build courses on a larger screen.</p>}
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input type="search" className="input min-w-0 flex-[1_1_240px]" placeholder={`Search courses in ${g.name}`} aria-label={`Search courses in ${g.name}`} value={text} onChange={(e) => setText(e.target.value)} />
              {categories.length > 0 && (
                <label className="text-3 flex items-center gap-2 text-sm">Category
                  <select className="input !w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">All categories</option>{categories.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
              )}
              <label className="text-3 flex items-center gap-2 text-sm">Sort
                <select className="input !w-32" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="az">A to Z</option></select>
              </label>
              {cat.canCreate && <button className="btn btn-ghost hidden md:inline-flex" onClick={() => setCreating(true)}>New course</button>}
            </div>
            <div role="group" aria-label="Show" className="no-scrollbar -mt-2 flex gap-2 overflow-x-auto">
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${filter === id ? 'bg-[var(--cm-tint)] font-semibold text-white shadow-[inset_0_0_0_1px_var(--cm-line)]' : 'text-2 border border-[var(--az-hairline)] hover:text-white'}`}>{label}</button>
              ))}
            </div>
            <section aria-labelledby="cat-h" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="cat-h" className="t-h3 text-white">Courses in {g.name}</h2>
                <span className="t-small">{shown.length} {shown.length === 1 ? 'course' : 'courses'}</span>
              </div>
              {shown.length === 0 ? (
                <p className="text-3 border-t border-[var(--az-divider)] py-4 text-sm">Nothing matches. {filtered && <button className="text-brand-300 underline" onClick={() => { setText(''); setCategory(''); setFilter('all'); }}>Clear filters</button>}</p>
              ) : (
                <>
                  <ul className="hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-3">{shown.map((c) => <li key={c.id} className="flex"><CourseCard g={g} c={c} /></li>)}</ul>
                  <ul className="list-rows sm:hidden">{shown.map((c) => <li key={c.id}><CourseRow g={g} c={c} /></li>)}</ul>
                </>
              )}
            </section>
            {cat.canCreate && <p className="t-small md:hidden">Build courses on a larger screen.</p>}
          </>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-6">
        {cat.canGrade && (
          <Link to={gradingPath(g)} className="band flex items-center gap-3 p-4 hover:bg-white/[.03]">
            <span className="min-w-0 flex-1"><span className="t-h3 block text-white">Work to grade</span><span className="t-small">{cat.toGrade ? `${cat.toGrade} waiting` : 'You’re all caught up'}</span></span>
            {cat.toGrade > 0 && <span className="rounded-full bg-brand-400 px-2 text-xs font-bold text-ink-950">{cat.toGrade}</span>}
          </Link>
        )}
        <section aria-labelledby="you-h" className="flex flex-col">
          <h2 id="you-h" className="t-h3 pb-2 text-white">Your learning here</h2>
          {[['Enrolled', count((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt)], ['Completed', count((c) => !!c.enrollment?.completedAt)], ['On a waitlist', count((c) => c.enrollment?.status === 'waitlist')]].map(([k, n]) => (
            <div key={k} className="flex min-h-11 items-center justify-between border-t border-[var(--az-divider)] text-sm"><span className="text-2">{k}</span><span className="tabular-nums text-white">{n}</span></div>
          ))}
          <Link to="/learning" className="pt-3 text-sm text-brand-300 hover:underline">All your courses in My Learning</Link>
        </section>
      </aside>
      {creating && <NewCourse g={g} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** The featured item: next lesson of the course in progress. Needs the outline for the lesson's name. */
function ContinueCard({ g, id }) {
  const { course } = useCourse(id);
  if (!course) return <div aria-hidden="true" className="raised h-40 animate-pulse" />;
  const next = nextLesson(course);
  return (
    <article aria-labelledby="cont-h" className="raised flex flex-wrap items-center gap-6 p-5 sm:p-6">
      <div aria-hidden="true" className="cm-cover hidden aspect-[16/10] w-48 shrink-0 rounded-xl sm:block" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
        <span id="cont-h" className="t-label cm-ink">Continue where you left off</span>
        <h2 className="t-h2 text-white"><Link to={coursePath(g, course.id)} className="hover:underline">{course.title}</Link></h2>
        {next && <span className="t-small">Next: {[next.module.title, next.title, durationText(next.durationMin)].filter(Boolean).join(' · ')}</span>}
        <div className="flex items-center gap-3 pt-1.5"><Progress p={course.progress} className="flex-1" /><span className="t-small shrink-0">{course.progress.done} of {lessonsText(course.progress.total)}</span></div>
      </div>
      {course.nextLessonId && <Link to={lessonPath(course.nextLessonId)} className="btn btn-primary">Continue lesson</Link>}
    </article>
  );
}

function Footer({ c }) {
  if (c.status !== 'published') return <span className="flex flex-wrap items-center gap-2"><Pill tone="outline">{STATUS_LABEL[c.status]}</Pill><span className="t-small">Only admins and its instructors see this</span></span>;
  if (c.enrollment?.completedAt) return <span className="flex items-center gap-2"><Pill tone="done"><Icon name="check" size={14} className="mr-1" />Completed</Pill><span className="t-small">{new Date(c.enrollment.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>;
  if (c.enrollment?.status === 'active') return <span className="flex flex-col gap-1.5"><span className="text-sm text-slate-200">{standing(c)}</span><Progress p={c.progress} label={`${c.title} progress`} /></span>;
  if (c.enrollment?.status === 'waitlist') return <Pill tone="warn">On the waitlist</Pill>;
  if (c.seatsLeft === 0) return <span className="flex items-center gap-2"><Pill>Full</Pill><span className="t-small">Join the waitlist</span></span>;
  return <span className="flex items-center gap-2"><Pill>Open</Pill><span className="t-small">{c.seatsLeft == null ? 'No limit' : `${c.seatsLeft} ${c.seatsLeft === 1 ? 'place' : 'places'} left`}</span></span>;
}

const byline = (c) => [c.instructors.length ? `By ${c.instructors.map((i) => i.name).join(', ')}` : null, lessonsText(c.lessonCount), durationText(c.durationMin)].filter(Boolean).join(' · ');

function CourseCard({ g, c }) {
  return (
    <article className={`relative flex w-full flex-col overflow-hidden rounded-xl border ${c.status === 'published' ? 'glass border-[var(--az-hairline)]' : 'border-dashed border-[var(--az-hairline)]'}`}>
      <div aria-hidden="true" className="cm-cover flex aspect-[16/7] items-end p-3">{c.category && <span className="t-label rounded bg-black/30 px-2 py-0.5 text-white">{c.category}</span>}</div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="t-h3 text-white"><Link to={coursePath(g, c.id)} className="after:absolute after:inset-0 hover:underline">{c.title}</Link></h3>
        <span className="t-small">{byline(c)}</span>
        {c.visibility === 'hidden' && <span className="t-small">Hidden from the catalogue (link only)</span>}
        <span className="flex-1" />
        <div className="pt-2"><Footer c={c} /></div>
      </div>
    </article>
  );
}

/** Phones: one course per row, so Continue stays the only raised item (S5Mobile). */
function CourseRow({ g, c }) {
  const state = c.status !== 'published' ? STATUS_LABEL[c.status] : c.enrollment?.completedAt ? 'Completed'
    : c.enrollment?.status === 'active' ? `${c.progress.done} of ${c.progress.total} done` : c.enrollment?.status === 'waitlist' ? 'On the waitlist' : c.seatsLeft === 0 ? 'Full · waitlist' : 'Open';
  return (
    <Link to={coursePath(g, c.id)} className="flex min-h-14 items-center gap-3 py-3">
      <span aria-hidden="true" className="cm-tile grid h-11 w-11 shrink-0 place-items-center rounded-lg"><Icon name="cap" size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{c.title}</span><span className="t-small">{lessonsText(c.lessonCount)} · {state}</span></span>
    </Link>
  );
}

function NewCourse({ g, onClose }) {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { course } = await api(`/communities/${encodeURIComponent(g.id)}/courses`, { method: 'POST', idempotencyKey: key.current, body: { title, description: description || null } });
      toast('Course created as a draft');
      nav(coursePath(g, course.id, true));
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title="New course" onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <Field label="Title"><input className="input" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Description" hint="Optional. Who it’s for and what it covers."><textarea className="input min-h-24" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <p className="t-small">It starts as a draft with one module. Only admins and its instructors see it until you publish.</p>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create and add lessons'}</button>
        </div>
      </form>
    </Modal>
  );
}
