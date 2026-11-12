// A community's Discussions tab (Stage 4, board S4Discussions): filter by kind and topic, search
// inside the community, newest or most active first. Topics (decision S4-2) are kept by admins.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { onFeedEvent, useServerFeed } from '../../lib/feed.js';
import { toast } from '../../lib/toast.js';
import { Empty, Modal } from '../ui.jsx';
import Composer from '../feed/Composer.jsx';
import PostCard from '../feed/PostCard.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const KINDS = [['all', 'All'], ['announcements', 'Announcements'], ['questions', 'Questions'], ['polls', 'Polls']];
const KEEP = { all: () => true, announcements: (p) => p.type === 'announcement', questions: (p) => p.type === 'question', polls: (p) => p.type === 'poll' };

function useTopics(g) {
  const [topics, setTopics] = useState([]);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/topics`).then((r) => setTopics(r.topics), () => setTopics([])), [g.id]);
  useEffect(() => { load(); }, [load]);
  // A new post may change a topic's count.
  useEffect(() => onFeedEvent((e) => { if (e.type === 'created') load(); }), [load]);
  return [topics, setTopics, load];
}

export default function Discussions({ g, perms }) {
  const [kind, setKind] = useState('all');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [editing, setEditing] = useState(false);
  const [topics, setTopics] = useTopics(g);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const feed = useServerFeed({ view: kind, community: g.id, filters: { topic, q, sort },
    keep: (p) => ['published', 'pending', 'removed'].includes(p.status) && KEEP[kind](p) && (!topic || p.topic?.id === topic) });
  const posts = feed.posts.filter((p) => ['published', 'pending', 'removed'].includes(p.status));
  const canPost = perms.canParticipate && (!g.announceOnly || perms.canAdmin);
  const filtered = kind !== 'all' || topic || q;
  const chip = (on) => `min-h-10 shrink-0 rounded-full px-4 text-sm ${on ? 'bg-[var(--cm-tint)] font-semibold text-white shadow-[inset_0_0_0_1px_var(--cm-line)]' : 'text-2 border border-[var(--az-hairline)] hover:text-white'}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-4">
        {canPost && <Composer compact communityId={g.id} />}
        {g.announceOnly && !perms.canAdmin && perms.canView && <p className="text-3 text-xs">Only admins post here; members can read, react and reply.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Kind of post" className="no-scrollbar flex gap-2 overflow-x-auto">
            {KINDS.map(([id, label]) => <button key={id} type="button" aria-pressed={kind === id} onClick={() => setKind(id)} className={chip(kind === id)}>{label}</button>)}
          </div>
          <span className="flex-1" />
          <input type="search" className="input !w-full sm:!w-56" placeholder={`Search ${g.name}`} aria-label={`Search posts in ${g.name}`} value={text} onChange={(e) => setText(e.target.value)} />
          <select className="input !w-40" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="active">Most active</option>
          </select>
        </div>
        {topics.length > 0 && (
          <div role="group" aria-label="Topic" className="no-scrollbar flex gap-2 overflow-x-auto lg:hidden">
            {[{ id: '', name: 'All topics' }, ...topics].map((t) => <button key={t.id || 'all'} type="button" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)} className={chip(topic === t.id)}>{t.name}</button>)}
          </div>
        )}
        {feed.status === 'loading' && !posts.length ? <div className="glass h-40 animate-pulse" aria-busy="true" aria-label="Loading posts" />
          : feed.status === 'error' ? (
            <div role="alert" className="glass p-6 text-center text-sm"><p className="text-rose-300">{feed.error}</p><button className="btn btn-ghost mt-3" onClick={feed.reload}>Try again</button></div>
          ) : posts.length === 0 ? (
            <Empty icon="inbox" title={filtered ? 'Nothing matches' : 'No discussions yet'}>{filtered ? 'Try another filter or other words.' : canPost ? 'Start one above.' : ''}</Empty>
          ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
        {feed.status === 'ready' && feed.nextBefore && (
          <button className="btn btn-ghost w-full" onClick={feed.loadMore} disabled={feed.loadingMore}>{feed.loadingMore ? 'Loading…' : 'Load more'}</button>
        )}
      </div>
      <aside className="hidden flex-col gap-3 lg:flex">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="t-h3 text-white">Topics</h2>
          {perms.canAdmin && <button className="text-sm text-brand-300 hover:underline" onClick={() => setEditing(true)}>{topics.length ? 'Edit' : 'Add topics'}</button>}
        </div>
        {topics.length === 0 ? <p className="text-3 text-sm">{perms.canAdmin ? 'Topics help members find posts, for example Careers or Introductions.' : 'No topics yet.'}</p> : (
          <ul className="list-rows">
            {[{ id: '', name: 'All topics' }, ...topics].map((t) => (
              <li key={t.id || 'all'}>
                <button type="button" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}
                  className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${topic === t.id ? 'bg-[var(--az-surface)] font-semibold text-white shadow-[inset_3px_0_0_var(--cm)]' : 'text-2 hover:text-white'}`}>
                  <span>{t.name}</span>{t.id && <span className="text-3 tabular-nums">{t.posts}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {editing && <TopicEditor g={g} topics={topics} onChange={setTopics} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Admins: add, rename and delete topics (up to 12). Deleting leaves its posts untagged. */
function TopicEditor({ g, topics, onChange, onClose }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn, ok) => {
    setBusy(true); setError('');
    try { onChange((await fn()).topics); if (ok) toast(ok); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => api(`/communities/${encodeURIComponent(g.id)}/topics`, { method: 'POST', body: { name } }), 'Topic added')) setName('');
  };
  return (
    <Modal title="Topics" onClose={onClose}>
      <div className="space-y-4">
        <ul className="list-rows">
          {topics.map((t) => <TopicRow key={t.id} t={t} busy={busy} run={run} />)}
        </ul>
        {topics.length < 12 ? (
          <form className="flex gap-2" onSubmit={add}>
            <input className="input" maxLength={40} placeholder="New topic" aria-label="New topic name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !name.trim()}>Add</button>
          </form>
        ) : <p className="text-3 text-sm">A community can have up to 12 topics.</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
    </Modal>
  );
}

function TopicRow({ t, busy, run }) {
  const [v, setV] = useState(t.name);
  return (
    <li className="flex items-center gap-2 py-2">
      <input className="input" maxLength={40} aria-label={`Rename ${t.name}`} value={v} onChange={(e) => setV(e.target.value)} />
      <span className="text-3 w-16 shrink-0 text-right text-xs tabular-nums">{t.posts} {t.posts === 1 ? 'post' : 'posts'}</span>
      {v.trim() && v.trim() !== t.name && <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => api(`/topics/${t.id}`, { method: 'PATCH', body: { name: v } }), 'Topic renamed')}>Save</button>}
      <button className="btn btn-ghost text-rose-200" disabled={busy} aria-label={`Delete ${t.name}`}
        onClick={async () => (await confirmAction(`Delete “${t.name}”? Its posts stay, without a topic.`)) && run(() => api(`/topics/${t.id}`, { method: 'DELETE' }), 'Topic deleted')}>Delete</button>
    </li>
  );
}
