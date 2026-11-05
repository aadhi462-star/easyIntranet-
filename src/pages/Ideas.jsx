import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, timeAgo, uid } from '../lib/store.jsx';
import { Avatar, PageHeader, UserLink } from '../components/ui.jsx';
import IdeaList, { IDEA_STATUSES, IdeaForm, IdeaStatus, VoteBox, statusOf } from '../components/collab/IdeaList.jsx';
import { Menu, ScopeBadge, canSeeGroupItem } from '../components/collab/common.jsx';

export default function Ideas() {
  const { id } = useParams();
  const { state, me } = useStore();
  if (!id) {
    const ideas = (state.ideas ?? []).filter((i) => canSeeGroupItem(state, me, i));
    return (
      <>
        <PageHeader title="Ideas" subtitle="Share, vote on and track ideas from suggestion to implementation." />
        <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {IDEA_STATUSES.map((s) => (
            <div key={s.id} className="glass p-3 text-center">
              <div className="text-xl font-bold">{ideas.filter((i) => i.status === s.id).length}</div>
              <div className="text-[11px] text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
        <IdeaList />
      </>
    );
  }
  const idea = (state.ideas ?? []).find((i) => i.id === id && canSeeGroupItem(state, me, i));
  if (!idea) return <div className="glass p-8">Idea not found. <Link to="/ideas" className="text-brand-400 underline">Back to ideas</Link></div>;
  return <IdeaDetail idea={idea} />;
}

function IdeaDetail({ idea }) {
  const { dispatch, me, user, can } = useStore();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const mine = idea.authorId === me.id;
  const moderator = can('idea.moderate');
  const up = Object.values(idea.votes).filter((v) => v > 0).length;
  const down = Object.values(idea.votes).filter((v) => v < 0).length;

  const setStatus = (status) => {
    dispatch({ type: 'update', col: 'ideas', id: idea.id, patch: (x) => ({ ...x, status, history: [...(x.history ?? []), { status, at: Date.now(), by: me.id }] }) });
    if (idea.authorId !== me.id) {
      dispatch({ type: 'notify', notification: { userId: idea.authorId, kind: 'idea', text: `Your idea “${idea.title}” is now ${statusOf(status).label}`, link: `/ideas/${idea.id}` } });
    }
  };

  return (
    <div className="space-y-4">
      <Link to="/ideas" className="text-sm text-brand-400 hover:underline">← All ideas</Link>
      <article className="glass flex gap-4 p-5 sm:p-7">
        <VoteBox idea={idea} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <IdeaStatus status={idea.status} /><span className="chip !bg-white/10 !text-slate-300">{idea.category}</span><ScopeBadge groupId={idea.groupId} />
            <div className="ml-auto">
              <Menu items={[
                { label: 'Edit', onClick: () => setEdit(true), hidden: !mine && !moderator },
                { label: 'Delete', danger: true, hidden: !mine && !moderator, onClick: () => { if (confirm('Delete this idea?')) { dispatch({ type: 'remove', col: 'ideas', id: idea.id }); nav('/ideas'); } } },
              ]} />
            </div>
          </div>
          <h1 className="mt-3 text-2xl font-bold">{idea.title}</h1>
          <div className="mt-1 text-sm text-slate-400"><UserLink id={idea.authorId} /> · {timeAgo(idea.createdAt)} · {up} up, {down} down</div>
          <p className="mt-4 whitespace-pre-wrap text-slate-200">{idea.description}</p>

          {moderator && (
            <div className="mt-6 rounded-xl bg-white/5 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Moderate · change status</div>
              <div className="flex flex-wrap gap-2">
                {IDEA_STATUSES.map((s) => (
                  <button key={s.id} className={`btn ${idea.status === s.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatus(s.id)} aria-pressed={idea.status === s.id}>{s.label}</button>
                ))}
              </div>
            </div>
          )}
          {!!idea.history?.length && (
            <ol className="mt-4 space-y-1 text-xs text-slate-400">
              {idea.history.map((h) => <li key={h.at}>→ {statusOf(h.status).label} by {user(h.by)?.name} · {timeAgo(h.at)}</li>)}
            </ol>
          )}
        </div>
      </article>

      <section className="space-y-3" aria-label="Comments">
        <h2 className="font-semibold">{idea.comments.length} comments</h2>
        {idea.comments.map((c) => (
          <div key={c.id} className="glass flex gap-3 p-4">
            <Avatar user={user(c.authorId)} size={32} />
            <div><div className="text-sm"><UserLink id={c.authorId} /> <span className="text-slate-500">· {timeAgo(c.createdAt)}</span></div><p className="mt-1 text-sm text-slate-200">{c.text}</p></div>
          </div>
        ))}
        <form className="glass flex gap-2 p-3" onSubmit={(e) => {
          e.preventDefault(); if (!text.trim()) return;
          dispatch({ type: 'update', col: 'ideas', id: idea.id, patch: (x, u) => ({ ...x, comments: [...x.comments, { id: uid('ic'), authorId: u, text: text.trim(), createdAt: Date.now() }] }) });
          setText('');
        }}>
          <input className="input" placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Comment" />
          <button className="btn btn-primary">Post</button>
        </form>
      </section>
      {edit && <IdeaForm idea={idea} onClose={() => setEdit(false)} />}
    </div>
  );
}
