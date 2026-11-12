import { useState } from 'react';
import { useStore, timeAgo } from '../../lib/store.jsx';
import { Empty, Tabs } from '../ui.jsx';
import { ForumCard, ForumEditor } from './forum.jsx';
import { canSeeGroupItem } from './common.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

/**
 * Forum posts list. Embeddable in a group (`groupId`) or used by the Forums page with a
 * `categoryId` / `view` ('all' | 'following' | 'drafts').
 */
export default function ForumList({ groupId, categoryId, view = 'all', showComposer = true }) {
  const { state, dispatch, me } = useStore();
  const [sort, setSort] = useState('recent');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const follows = state.forumFollows?.[me.id] ?? [];
  const autoFollowed = state.forumCategories.filter((c) => c.autoFollow).map((c) => c.id);

  if (view === 'drafts') {
    const drafts = state.forumPosts.filter((f) => f.status === 'draft' && f.authorId === me.id);
    return (
      <div className="space-y-3">
        {!drafts.length && <Empty icon="drafts" title="No drafts">Closing the editor without publishing saves a draft here.</Empty>}
        {drafts.map((d) => (
          <div key={d.id} className="glass flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><div className="font-semibold">{d.title}</div><div className="text-xs text-slate-500">Saved {timeAgo(d.createdAt)}</div></div>
            <button className="btn btn-ghost" onClick={() => setEditing(d)}>Edit</button>
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'forum/save', post: { id: d.id, status: 'published', createdAt: Date.now() } })}>Publish</button>
            <button className="btn btn-ghost text-rose-300" onClick={async () => (await confirmAction('Delete this draft?')) && dispatch({ type: 'forum/delete', id: d.id })}>Delete</button>
          </div>
        ))}
        {editing && <ForumEditor post={editing} onClose={() => setEditing(null)} />}
      </div>
    );
  }

  let posts = state.forumPosts.filter((f) => f.status !== 'draft' && canSeeGroupItem(state, me, f));
  if (groupId) posts = posts.filter((f) => f.groupId === groupId);
  if (categoryId) posts = posts.filter((f) => f.categories.includes(categoryId));
  if (view === 'following') posts = posts.filter((f) => f.categories.some((c) => follows.includes(c) || autoFollowed.includes(c)));
  if (view === 'unanswered') posts = posts.filter((f) => !f.replies.length);
  posts = [...posts].sort(sort === 'top' ? (a, b) => b.upvotes.length - a.upvotes.length
    : sort === 'active' ? (a, b) => (b.replies.at(-1)?.createdAt ?? b.createdAt) - (a.replies.at(-1)?.createdAt ?? a.createdAt)
      : (a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={sort} onChange={setSort} tabs={[{ id: 'recent', label: 'Recent' }, { id: 'active', label: 'Active' }, { id: 'top', label: 'Top' }]} />
        {showComposer && <button className="btn btn-primary" onClick={() => setCreating(true)} aria-label="New forum post">＋ New post</button>}
      </div>
      <div className="space-y-3">
        {posts.length ? posts.map((p) => <ForumCard key={p.id} post={p} />) : <Empty icon="forums" title="No discussions yet">Start one with ＋ New post.</Empty>}
      </div>
      {creating && <ForumEditor groupId={groupId} defaultCategory={categoryId} onClose={() => setCreating(false)} />}
    </div>
  );
}
