// A community's Learning tab (board S5LearningTab, restyled to v2 board V2EModules): "Continue where you left off", then the
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
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';

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

  if (cat.status === 'loading' && !cat.courses.length) {
    return (
      <div aria-busy="true" aria-label="Loading courses" className="flex flex-col gap-6">
        <div className="panel p-6"><Skeleton lines={3} label="Loading" /></div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="panel overflow-hidden"><span className="skeleton aspect-[16/7] rounded-none" /><Skeleton lines={2} label="Loading" className="p-4" /></div>)}
        </div>
      </div>
    );
  }
  if (cat.status === 'error') {
    return (
      <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
        <span><strong>Couldn’t load the courses.</strong> {cat.message}</span>
        <Button size="sm" onClick={cat.reload}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-6">
        {current && <ContinueCard g={g} id={current.id} />}
        {cat.courses.length === 0 ? (
          <section className="panel flex flex-col items-center gap-3 p-8 text-center">
            <span className="text-3"><Icon name="cap" size={28} /></span>
            <h2 className="t-h2">No courses yet</h2>
            {cat.canCreate && <p className="text-2 max-w-md">Create the first course for {g.name}: lessons can be text, files or links.</p>}
            {cat.canCreate && <Button variant="primary" icon="plus" className="hidden md:inline-flex" onClick={() => setCreating(true)}>New course</Button>}
            {cat.canCreate && <p className="t-small md:hidden">Build courses on a larger screen.</p>}
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="relative block min-w-0 flex-[1_1_260px]">
                <span className="sr-only">Search courses in {g.name}</span>
                <span aria-hidden="true" className="text-3 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><Icon name="search" size={16} /></span>
                <input type="search" className="input pl-9" placeholder={`Search courses in ${g.name}`} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              {categories.length > 0 && (
                <label className="text-2 flex items-center gap-2 text-sm">Category
                  <select className="input !w-auto max-w-[11rem]" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">All</option>{categories.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </label>
              )}
              <label className="text-2 flex items-center gap-2 text-sm">Sort
                <select className="input !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="az">A to Z</option></select>
              </label>
              {/* No course builder on phones (Stage 5 rule). */}
              {cat.canCreate && <Button icon="plus" className="hidden md:inline-flex" onClick={() => setCreating(true)}>New course</Button>}
            </div>
            <div role="group" aria-label="Status" className="no-scrollbar -mt-2 flex gap-2 overflow-x-auto">
              {FILTERS.map(([id, label]) => (
                <button key={id} type="button" className="filter-chip shrink-0" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
              ))}
            </div>
            <section aria-labelledby="cat-h" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="cat-h" className="t-h3">Courses in {g.name}</h2>
                <span className="t-small shrink-0">{shown.length} {shown.length === 1 ? 'course' : 'courses'}</span>
              </div>
              {shown.length === 0 ? (
                <div className="sunken flex flex-col items-start gap-2 p-5">
                  <p className="font-semibold">Nothing matches</p>
                  {filtered && <Button size="sm" onClick={() => { setText(''); setCategory(''); setFilter('all'); }}>Clear filters</Button>}
                </div>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-4">{shown.map((c) => <li key={c.id} className="flex min-w-0"><CourseCard g={g} c={c} /></li>)}</ul>
              )}
            </section>
            {cat.canCreate && <p className="t-small md:hidden">Build courses on a larger screen.</p>}
          </>
        )}
      </div>
      <aside className="flex min-w-0 flex-col gap-6">
        {cat.canGrade && (
          <Link to={gradingPath(g)} className="panel flex items-center gap-3 p-4 hover:bg-[var(--az-sunken)]">
            <span className="min-w-0 flex-1"><span className="t-h3 block">Work to grade</span><span className="t-small">{cat.toGrade ? `${cat.toGrade} waiting` : 'You’re all caught up'}</span></span>
            {cat.toGrade > 0 && <Badge tone="ok">{cat.toGrade}</Badge>}
          </Link>
        )}
        <section aria-labelledby="you-h" className="flex flex-col">
          <h2 id="you-h" className="t-h3 pb-2">Your learning here</h2>
          {[['Enrolled', count((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt)], ['Completed', count((c) => !!c.enrollment?.completedAt)], ['On a waitlist', count((c) => c.enrollment?.status === 'waitlist')]].map(([k, n]) => (
            <div key={k} className="flex min-h-11 items-center justify-between border-t border-[var(--az-divider)] text-sm"><span className="text-2">{k}</span><span className="tabular-nums">{n}</span></div>
          ))}
          <Link to="/learning" className="link pt-3 text-sm">All your courses in My Learning</Link>
        </section>
      </aside>
      {creating && <NewCourse g={g} onClose={() => setCreating(false)} />}
    </div>
  );
}

/** The featured item: next lesson of the course in progress. Needs the outline for the lesson's name. */
function ContinueCard({ g, id }) {
  const { course } = useCourse(id);
  if (!course) return <div aria-busy="true" aria-label="Loading" className="raised p-6"><Skeleton lines={3} label="Loading" /></div>;
  const next = nextLesson(course);
  return (
    <article aria-labelledby="cont-h" className="raised flex flex-wrap items-center gap-6 border border-[var(--az-hairline)] px-5 py-5 sm:px-6">
      {/* The community's accent as identity only (E3): the thumbnail and the label. */}
      <div aria-hidden="true" className="cm-cover hidden aspect-[16/10] w-48 shrink-0 rounded-xl border border-[var(--cm-line)] sm:block" />
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2">
        <span id="cont-h" className="t-label cm-ink">Continue where you left off</span>
        <h2 className="t-h2 break-words"><Link to={coursePath(g, course.id)} className="hover:underline">{course.title}</Link></h2>
        {next && <span className="t-small">Next: {[next.module.title, next.title, durationText(next.durationMin)].filter(Boolean).join(' · ')}</span>}
        <div className="flex items-center gap-3 pt-1"><Progress p={course.progress} label={`${course.title} progress`} className="flex-1" /><span className="t-small shrink-0">{course.progress.done} of {lessonsText(course.progress.total)}</span></div>
      </div>
      {course.nextLessonId && <Link to={lessonPath(course.nextLessonId)} className="btn btn-primary w-full sm:w-auto">Continue lesson</Link>}
    </article>
  );
}

const dateText = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Footer({ c }) {
  if (c.status !== 'published') return <span className="flex flex-wrap items-center gap-2"><Pill tone="outline">{STATUS_LABEL[c.status]}</Pill><span className="t-small">Only admins and its instructors see this</span></span>;
  if (c.enrollment?.completedAt) return <span className="flex flex-wrap items-center gap-2"><Badge tone="ok" icon="check">Completed</Badge><span className="t-small">{dateText(c.enrollment.completedAt)}</span></span>;
  if (c.enrollment?.status === 'active') return <span className="flex flex-col gap-1.5"><span className="t-small">{standing(c)}</span><Progress p={c.progress} label={`${c.title} progress`} /></span>;
  if (c.enrollment?.status === 'waitlist') return <Badge tone="warn">On the waitlist</Badge>;
  if (c.seatsLeft === 0) return <span className="flex flex-wrap items-center gap-2"><Badge>Full</Badge><span className="t-small">Join the waitlist</span></span>;
  return <span className="flex flex-wrap items-center gap-2"><Badge>Open</Badge><span className="t-small">{c.seatsLeft == null ? 'No limit' : `${c.seatsLeft} ${c.seatsLeft === 1 ? 'place' : 'places'} left`}</span></span>;
}

const byline = (c) => [c.instructors.length ? `By ${c.instructors.map((i) => i.name).join(', ')}` : null, lessonsText(c.lessonCount), durationText(c.durationMin)].filter(Boolean).join(' · ');

function CourseCard({ g, c }) {
  const draft = c.status !== 'published';
  return (
    <article className={`panel relative flex w-full min-w-0 flex-col overflow-hidden hover:shadow-[var(--az-shadow)] ${draft ? '!border-dashed !border-[var(--az-control)]' : ''}`}>
      <div aria-hidden="true" className="cm-cover flex aspect-[16/7] items-end p-3">{c.category && <span className="t-label cm-ink">{c.category}</span>}</div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="t-h3 break-words"><Link to={coursePath(g, c.id)} className="after:absolute after:inset-0 hover:underline">{c.title}</Link></h3>
        <span className="t-small">{byline(c)}</span>
        {c.visibility === 'hidden' && <span className="t-small">Hidden from the catalogue (link only)</span>}
        <span className="flex-1" />
        <div className="pt-2"><Footer c={c} /></div>
      </div>
    </article>
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
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create and add lessons'}</button>
        </div>
      </form>
    </Modal>
  );
}
