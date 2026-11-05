import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, timeAgo } from '../../lib/store.jsx';
import { Avatar, Empty, Field, Modal, Tabs } from '../ui.jsx';
import { Select } from './common.jsx';

export const IDEA_STATUSES = [
  { id: 'new', label: 'New', cls: '!bg-leaf-500/15 !text-leaf-200' },
  { id: 'under-review', label: 'Under Review', cls: '!bg-amber-400/15 !text-amber-200' },
  { id: 'planned', label: 'Planned', cls: '!bg-brand-500/20 !text-brand-200' },
  { id: 'in-progress', label: 'In Progress', cls: '!bg-brand-500/20 !text-brand-200' },
  { id: 'implemented', label: 'Implemented', cls: '!bg-emerald-500/15 !text-emerald-200' },
  { id: 'declined', label: 'Declined', cls: '!bg-rose-500/15 !text-rose-200' },
];
export const statusOf = (id) => IDEA_STATUSES.find((s) => s.id === id) ?? IDEA_STATUSES[0];
export const score = (idea) => Object.values(idea.votes || {}).reduce((n, v) => n + v, 0);

export function IdeaStatus({ status }) {
  const s = statusOf(status);
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function VoteBox({ idea }) {
  const { dispatch, me } = useStore();
  const mine = idea.votes?.[me.id] ?? 0;
  const vote = (v) => dispatch({ type: 'update', col: 'ideas', id: idea.id, patch: (x, uid) => {
    const votes = { ...x.votes };
    if (votes[uid] === v) delete votes[uid]; else votes[uid] = v;
    return { ...x, votes };
  } });
  return (
    <div className="flex w-12 shrink-0 flex-col items-center rounded-xl ring-1 ring-white/10">
      <button className={`h-9 w-full rounded-t-xl ${mine === 1 ? 'bg-brand-500/30 text-white' : 'hover:bg-white/5'}`} onClick={() => vote(1)} aria-pressed={mine === 1} aria-label="Upvote">▲</button>
      <span className="text-sm font-bold" aria-label={`Score ${score(idea)}`}>{score(idea)}</span>
      <button className={`h-9 w-full rounded-b-xl ${mine === -1 ? 'bg-rose-500/30 text-white' : 'hover:bg-white/5'}`} onClick={() => vote(-1)} aria-pressed={mine === -1} aria-label="Downvote">▼</button>
    </div>
  );
}

export function IdeaForm({ groupId, idea, onClose }) {
  const { state, dispatch } = useStore();
  const cats = state.ideaCategories ?? [];
  const [f, setF] = useState({ title: idea?.title ?? '', description: idea?.description ?? '', category: idea?.category ?? cats[0] ?? '', groupId: idea?.groupId ?? groupId ?? '' });
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const submit = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const data = { ...f, title: f.title.trim(), groupId: f.groupId || null };
    if (idea) dispatch({ type: 'update', col: 'ideas', id: idea.id, patch: data });
    else dispatch({ type: 'add', col: 'ideas', item: { ...data, status: 'new', votes: {}, comments: [] } });
    onClose();
  };
  return (
    <Modal title={idea ? 'Edit idea' : 'Share an idea'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className="input" value={f.title} onChange={set('title')} placeholder="A short, clear title" /></Field>
        <Field label="Description"><textarea className="input min-h-28" value={f.description} onChange={set('description')} placeholder="What problem does it solve? How would it work?" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category"><Select label="Category" value={f.category} onChange={set('category')} options={cats.map((c) => [c, c])} /></Field>
          <Field label="Group (optional)">
            <Select label="Group" value={f.groupId} onChange={set('groupId')} options={[['', 'Whole network'], ...state.groups.map((g) => [g.id, g.name])]} />
          </Field>
        </div>
        <button className="btn btn-primary w-full">{idea ? 'Save' : 'Submit idea'}</button>
      </form>
    </Modal>
  );
}

export function TopContributors({ ideas }) {
  const { user } = useStore();
  const tally = {};
  for (const i of ideas) {
    const t = (tally[i.authorId] ??= { ideas: 0, votes: 0, implemented: 0 });
    t.ideas += 1; t.votes += Math.max(0, score(i)); if (i.status === 'implemented') t.implemented += 1;
  }
  const top = Object.entries(tally).sort((a, b) => (b[1].implemented * 10 + b[1].votes + b[1].ideas) - (a[1].implemented * 10 + a[1].votes + a[1].ideas)).slice(0, 5);
  return (
    <aside className="glass h-fit p-4" aria-label="Top contributors">
      <h2 className="mb-3 font-semibold"><Glyph value="🏅" tile={false} size={16} /> Top Contributors</h2>
      {top.length ? (
        <ol className="space-y-3">
          {top.map(([uid, t], i) => (
            <li key={uid} className="flex items-center gap-3 text-sm">
              <span className="w-4 text-slate-500">{i + 1}</span>
              <Avatar user={user(uid)} size={32} />
              <div className="min-w-0 flex-1"><Link to={`/people/${uid}`} className="font-semibold hover:underline">{user(uid)?.name}</Link>
                <div className="text-xs text-slate-400">{t.ideas} ideas · {t.votes} votes{t.implemented ? ` · ${t.implemented} shipped` : ''}</div></div>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-slate-400">No ideas yet.</p>}
    </aside>
  );
}

export function IdeaCard({ idea }) {
  const { user } = useStore();
  return (
    <article className="glass flex gap-4 p-4">
      <VoteBox idea={idea} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><IdeaStatus status={idea.status} /><span className="chip !bg-white/10 !text-slate-300">{idea.category}</span></div>
        <Link to={`/ideas/${idea.id}`} className="mt-2 block font-semibold hover:underline">{idea.title}</Link>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{idea.description}</p>
        <div className="mt-2 text-xs text-slate-500">{user(idea.authorId)?.name} · {timeAgo(idea.createdAt)} · 💬 {idea.comments.length}</div>
      </div>
    </article>
  );
}

/** Ideas list with filters and sort. Embeddable in groups via `groupId`. */
export default function IdeaList({ groupId, showContributors = !groupId }) {
  const { state } = useStore();
  const [sort, setSort] = useState('trending');
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const all = (state.ideas ?? []).filter((i) => !groupId || i.groupId === groupId);
  const age = (i) => (Date.now() - i.createdAt) / 3600e3;
  const ideas = all
    .filter((i) => (status === 'all' || i.status === status) && (cat === 'all' || i.category === cat)
      && (!q || `${i.title} ${i.description}`.toLowerCase().includes(q.toLowerCase())))
    .sort(sort === 'top' ? (a, b) => score(b) - score(a)
      : sort === 'new' ? (a, b) => b.createdAt - a.createdAt
        : (a, b) => (score(b) + b.comments.length) / (age(b) + 2) ** 0.8 - (score(a) + a.comments.length) / (age(a) + 2) ** 0.8);

  return (
    <div className={showContributors ? 'grid gap-6 lg:grid-cols-[1fr_260px]' : ''}>
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tabs value={sort} onChange={setSort} tabs={[{ id: 'trending', label: '🔥 Trending' }, { id: 'top', label: 'Top' }, { id: 'new', label: 'New' }]} />
          <button className="btn btn-primary ml-auto" onClick={() => setCreating(true)}><Glyph value="💡" tile={false} size={16} /> Share idea</button>
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <input className="input" type="search" placeholder="Search ideas…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ideas" />
          <Select label="Status filter" value={status} onChange={setStatus} options={[['all', 'All statuses'], ...IDEA_STATUSES.map((s) => [s.id, s.label])]} />
          <Select label="Category filter" value={cat} onChange={setCat} options={[['all', 'All categories'], ...(state.ideaCategories ?? []).map((c) => [c, c])]} />
        </div>
        <div className="space-y-3">
          {ideas.length ? ideas.map((i) => <IdeaCard key={i.id} idea={i} />) : <Empty icon="💡" title="No ideas match">Be the first to share one.</Empty>}
        </div>
      </div>
      {showContributors && <TopContributors ideas={all} />}
      {creating && <IdeaForm groupId={groupId} onClose={() => setCreating(false)} />}
    </div>
  );
}
