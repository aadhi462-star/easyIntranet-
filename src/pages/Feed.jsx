import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Avatar, Empty, UserLink } from '../components/ui.jsx';
import Composer from '../components/feed/Composer.jsx';
import PostCard from '../components/feed/PostCard.jsx';
import { CommunityMood, MandatoryPending, TrendingTags } from '../components/feed/Widgets.jsx';
import { canSee, postsForView, tagsOf, VIEWS } from '../components/feed/utils.js';

const PAGE = 15;
const COMPOSER_VIEWS = ['my', 'wall', 'questions', 'announcements'];
const EMPTY = {
  following: 'Follow members from a post’s ⋯ menu to see their updates here.',
  bookmarks: 'Bookmark posts from the ⋯ menu to read them later.',
  drafts: 'Posts you save as drafts appear here.',
  scheduled: 'Use ⏰ in the composer to schedule a post.',
  mandatory: 'No mandatory reads right now.',
};

export default function Feed() {
  const { id, view = 'my' } = useParams();
  // Keyed by view so paging ("Load more") starts over on each view.
  return id ? <PostDetail id={id} /> : <FeedView key={view} view={view} />;
}

function PostDetail({ id }) {
  const { state, me } = useStore();
  const post = state.posts.find((p) => p.id === id);
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/feed" className="mb-4 inline-block text-sm text-brand-400 hover:underline">← Back to feed</Link>
      {post && canSee(state, me, post) ? <PostCard post={post} expanded /> : <Empty icon="search" title="Post not found">It may have been deleted or you don’t have access.</Empty>}
    </div>
  );
}

function FeedView({ view }) {
  const { state, me, user } = useStore();
  const [sp, setSp] = useSearchParams();
  const tag = sp.get('tag');
  const [limit, setLimit] = useState(PAGE);
  const v = VIEWS.find((x) => x.id === view) ?? VIEWS[0];
  let posts = postsForView(state, me, v.id);
  if (tag) posts = posts.filter((p) => tagsOf(p.text).includes(tag));
  const following = (state.follows || []).filter((f) => f.authorId === me.id);
  const count = (id) => postsForView(state, me, id).length;

  return (
    <div className="ext-grid ext-grid-feed grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_250px]">
      <nav aria-label="Feed views" className="ext-menu -mx-3 flex gap-1 overflow-x-auto px-3 pb-1 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
        {VIEWS.map((x) => (
          <NavLink key={x.id} to={x.id === 'my' ? '/feed' : `/feed/${x.id}`} end
            className={({ isActive }) => `flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium ${isActive ? 'bg-brand-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
            <Glyph value={x.icon} size={26} />{x.label}
            {['drafts', 'scheduled', 'bookmarks'].includes(x.id) && count(x.id) > 0 && <span className="ml-auto text-xs text-slate-500">{count(x.id)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 space-y-4">
        <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight"><Glyph value={v.icon} size={38} />{v.label}</h1>
        {tag && (
          <div className="flex items-center gap-2 text-sm">Showing <span className="chip">#{tag}</span>
            <button className="text-brand-400 hover:underline" onClick={() => { sp.delete('tag'); setSp(sp); }}>Clear</button></div>
        )}
        {v.id === 'following' && following.length > 0 && (
          <div className="glass flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="text-slate-400">Following</span>
            {following.map((f) => <span key={f.id} className="flex items-center gap-1.5"><Avatar user={user(f.targetId)} size={24} /><UserLink id={f.targetId} /></span>)}
          </div>
        )}
        {COMPOSER_VIEWS.includes(v.id) && <Composer compact />}
        {posts.length === 0 ? <Empty icon={v.icon} title="Nothing here yet">{EMPTY[v.id] ?? 'Posts will show up here.'}</Empty>
          : posts.slice(0, limit).map((p) => <PostCard key={p.id} post={p} />)}
        {posts.length > limit && <button className="btn btn-ghost w-full" onClick={() => setLimit(limit + PAGE)}>Load more</button>}
      </div>

      <aside className="hidden space-y-4 xl:block">
        <MandatoryPending />
        <TrendingTags />
        <CommunityMood />
      </aside>
    </div>
  );
}
