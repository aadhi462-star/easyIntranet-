// A community's Discussions tab (v2 board V2EDiscussions): filter by kind and topic, search inside
// the community, newest or most active first; pinned posts lead (E8). Topics (S4-2) are kept by
// admins. On phones the composer folds to "Write a post" and topics become a chip row.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { onFeedEvent, useServerFeed } from '../../lib/feed.js';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import Composer from '../feed/Composer.jsx';
import PostCard from '../feed/PostCard.jsx';
import { FeedEmpty, FeedError, FeedSkeleton } from '../feed/States.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const KINDS = [['all', 'All'], ['announcements', 'Announcements'], ['questions', 'Questions'], ['polls', 'Polls']];
const KEEP = { all: () => true, announcements: (p) => p.type === 'announcement', questions: (p) => p.type === 'question', polls: (p) => p.type === 'poll' };
const SHOWN = ['published', 'pending', 'removed'];
const PHONE = '(max-width: 639px)';

function useTopics(g) {
  const [topics, setTopics] = useState([]);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/topics`).then((r) => setTopics(r.topics), () => setTopics([])), [g.id]);
  useEffect(() => { load(); }, [load]);
  // A new post may change a topic's count.
  useEffect(() => onFeedEvent((e) => { if (e.type === 'created') load(); }), [load]);
  return [topics, setTopics, load];
}

function usePhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(PHONE);
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function Discussions({ g, perms }) {
  const [kind, setKind] = useState('all');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [editing, setEditing] = useState(false);
  const [topics, setTopics] = useTopics(g);
  const phone = usePhone();
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const feed = useServerFeed({ view: kind, community: g.id, filters: { topic, q, sort },
    keep: (p) => SHOWN.includes(p.status) && KEEP[kind](p) && (!topic || p.topic?.id === topic) });
  // The server sends pinned posts first; keep them first after a pin or unpin changes the cache.
  const posts = feed.posts.filter((p) => SHOWN.includes(p.status)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const canPost = perms.canParticipate && (!g.announceOnly || perms.canAdmin);
  const filtered = kind !== 'all' || !!topic || !!q;
  const clear = () => { setKind('all'); setTopic(''); setText(''); setQ(''); };
  const allTopics = [{ id: '', name: 'All topics' }, ...topics];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex min-w-0 flex-col gap-5">
        {canPost && <Composer compact={phone} prompt="Write a post" communityId={g.id} />}
        {g.announceOnly && !perms.canAdmin && perms.canView && (
          <p className="notice notice-info flex items-start gap-2"><Icon name="info" size={18} className="mt-0.5 text-[var(--az-info)]" /><span>Only admins post here; members can read, react and reply.</span></p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative order-first flex w-full items-center sm:order-2 sm:w-auto sm:min-w-[200px] sm:flex-[0_1_260px]">
            <span className="sr-only">Search posts in {g.name}</span>
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 text-[var(--az-text-3)]" />
            <input type="search" className="input min-h-11 pl-10" placeholder={`Search ${g.name}`} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div role="group" aria-label="Kind of post" className="no-scrollbar flex min-w-0 max-w-full flex-1 gap-2 overflow-x-auto sm:order-1 sm:flex-none">
            {KINDS.map(([id, label]) => <button key={id} type="button" className="filter-chip shrink-0" aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</button>)}
          </div>
          <span className="hidden flex-1 sm:order-1 sm:block" aria-hidden="true" />
          <label className="flex shrink-0 items-center gap-2 text-sm text-[var(--az-text-2)] sm:order-3">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select className="input min-h-11 !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest">Newest</option><option value="active">Most active</option>
            </select>
          </label>
        </div>

        {topics.length > 0 && (
          <div role="group" aria-label="Topic" className="no-scrollbar flex gap-2 overflow-x-auto lg:hidden">
            {allTopics.map((t) => <button key={t.id || 'all'} type="button" className="filter-chip shrink-0" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}>{t.name}</button>)}
          </div>
        )}

        {feed.status === 'loading' && !posts.length ? <FeedSkeleton />
          : feed.status === 'error' ? <FeedError message={feed.error} onRetry={feed.reload} />
            : posts.length === 0 ? (
              filtered
                ? <FeedEmpty icon="search" title="Nothing matches" action={<button type="button" className="btn btn-secondary btn-sm mt-1" onClick={clear}>Clear filters</button>}>Try another filter or other words.</FeedEmpty>
                : <FeedEmpty title="No discussions yet">{canPost ? `Start one above.${topics.some((t) => /intro/i.test(t.name)) ? ' Introductions are a good first post.' : ''}` : 'Posts from this community appear here.'}</FeedEmpty>
            ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
        {feed.status === 'ready' && feed.error && posts.length > 0 && <FeedError message={feed.error} />}
        {feed.status === 'ready' && feed.nextBefore && (
          <button type="button" className="btn btn-secondary w-full" onClick={feed.loadMore} disabled={feed.loadingMore} aria-busy={feed.loadingMore || undefined}>{feed.loadingMore ? 'Loading…' : 'Load more'}</button>
        )}
      </div>

      <aside aria-label="Topics" className="hidden flex-col gap-7 lg:flex">
        <section aria-labelledby="d-topics-h" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="d-topics-h" className="t-h3 text-[var(--az-text)]">Topics</h2>
            {perms.canAdmin && <button type="button" className="link min-h-9 text-sm" onClick={() => setEditing(true)}>{topics.length ? 'Edit topics' : 'Add topics'}</button>}
          </div>
          {topics.length === 0 ? <p className="text-sm text-[var(--az-text-2)]">{perms.canAdmin ? 'Topics help members find posts, for example Careers or Introductions.' : 'No topics yet.'}</p> : (
            <ul role="group" aria-label="Topic" className="flex flex-col">
              {allTopics.map((t) => (
                <li key={t.id || 'all'}>
                  {/* The inset bar is the community's accent, like the section underline (E3); the button itself is platform style. */}
                  <button type="button" aria-pressed={topic === t.id} onClick={() => setTopic(t.id)}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm ${topic === t.id ? 'bg-[var(--az-surface)] font-semibold text-[var(--az-text)] shadow-[inset_3px_0_0_var(--cm-ink,var(--az-text))]' : 'font-medium text-[var(--az-text-2)] hover:bg-[var(--az-sunken)] hover:text-[var(--az-text)]'}`}>
                    <span className="min-w-0 truncate">{t.name}</span>{t.id && <span className="tabular-nums">{t.posts}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {perms.canAdmin && <p className="t-small">Set by Owners and Admins, up to 12. Deleting one leaves its posts untagged.</p>}
        </section>
        <section aria-labelledby="d-rules-h" className="sunken flex flex-col gap-2 !border-0 px-[18px] py-4">
          <h2 id="d-rules-h" className="text-[15px] font-semibold text-[var(--az-text)]">Posting here</h2>
          <p className="text-sm text-[var(--az-text-2)]">
            {g.announceOnly ? 'Owners and Admins post here. Members can read, react and reply.' : 'Members can post, comment and react. Owners and Admins post announcements, pin posts and ask for a Mandatory Read.'}
          </p>
          <Link to={communityPath(g, 'about')} className="link self-start text-sm">Community guidelines</Link>
        </section>
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
      <div className="flex flex-col gap-4">
        {topics.length > 0 && <ul className="list-rows">{topics.map((t) => <TopicRow key={t.id} t={t} busy={busy} run={run} />)}</ul>}
        {topics.length < 12 ? (
          <form className="flex gap-2" onSubmit={add}>
            <input className="input min-w-0" maxLength={40} placeholder="New topic" aria-label="New topic name" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !name.trim()}>Add</button>
          </form>
        ) : <p className="t-small">A community can have up to 12 topics.</p>}
        <p className="t-small">Deleting a topic leaves its posts untagged.</p>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
      </div>
    </Modal>
  );
}

function TopicRow({ t, busy, run }) {
  const [v, setV] = useState(t.name);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input className="input min-w-0 flex-[1_1_160px]" maxLength={40} aria-label={`Rename ${t.name}`} value={v} onChange={(e) => setV(e.target.value)} />
      <span className="t-small w-16 shrink-0 text-right tabular-nums">{t.posts} {t.posts === 1 ? 'post' : 'posts'}</span>
      {v.trim() && v.trim() !== t.name && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api(`/topics/${t.id}`, { method: 'PATCH', body: { name: v } }), 'Topic renamed')}>Save</button>}
      <button type="button" className="btn btn-secondary btn-sm text-[var(--az-danger)]" disabled={busy} aria-label={`Delete ${t.name}`}
        onClick={async () => (await confirmAction({ title: `Delete “${t.name}”?`, body: 'Its posts stay, without a topic.', confirm: 'Delete', danger: true })) && run(() => api(`/topics/${t.id}`, { method: 'DELETE' }), 'Topic deleted')}>Delete</button>
    </li>
  );
}
