import { Glyph } from '../components/icons.jsx';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, useParams, useSearchParams } from 'react-router-dom';
import { communityPath } from '../lib/communities.js';
import { bookmarksOf, useStore } from '../lib/store.jsx';
import { Avatar, Empty, UserLink } from '../components/ui.jsx';
import Composer from '../components/feed/Composer.jsx';
import PostCard from '../components/feed/PostCard.jsx';
import { CelebrateClassmates, CommunityMood, CompletenessCard, MandatoryPending, TrendingTags } from '../components/feed/Widgets.jsx';
import { followingIds, tagsOf, VIEWS } from '../components/feed/utils.js';
import { errorText, fetchMyCommunities, fetchPost, isCommunityModerator, NETWORK_ID, onFeedEvent, useLivePost, useServerFeed } from '../lib/feed.js';

const COMPOSER_VIEWS = ['my', 'wall', 'questions', 'announcements'];
const EMPTY = {
  following: 'Follow members from a post’s ⋯ menu to see their updates here.',
  bookmarks: 'Bookmark posts from the ⋯ menu to read them later.',
  drafts: 'Posts you save as drafts appear here.',
  scheduled: 'Use ⏰ in the composer to schedule a post.',
  mandatory: 'No mandatory reads right now.',
  pending: 'Nothing is waiting for review.',
  pinned: 'No pinned posts among the latest posts.',
};

/**
 * Each view → the server query behind it. `keep` says whether a post that changed still belongs
 * (a published draft leaves My Drafts); `match` filters client-side where the server has no view.
 */
const SERVER = {
  my: { view: 'all' },
  wall: { view: 'all', community: NETWORK_ID },
  announcements: { view: 'announcements', keep: (p) => p.type === 'announcement' },
  mandatory: { view: 'mandatory', keep: (p) => !!p.mandatory },
  questions: { view: 'questions', keep: (p) => p.type === 'question' },
  following: { view: 'all', match: (p, ids) => ids.includes(p.author?.id) },
  pinned: { view: 'all', match: (p) => p.pinned, keep: (p) => p.pinned },
  drafts: { view: 'drafts', keep: (p) => p.status === 'draft' },
  scheduled: { view: 'scheduled', keep: (p) => p.status === 'scheduled' },
  pending: { view: 'pending', keep: (p) => p.status === 'pending' },
};

export default function Feed() {
  const { id, view = 'my' } = useParams();
  // AlumniZone's wall became its community page (Stage 3).
  if (view === 'wall') return <Navigate to={communityPath(NETWORK_ID, 'discussions')} replace />;
  // Bookmarks became Saved, kept on the account (Stage 4).
  if (view === 'bookmarks') return <Navigate to="/saved" replace />;
  // Keyed by view so paging ("Load more") starts over on each view.
  return id ? <PostDetail key={id} id={id} /> : <FeedView key={view} view={view} />;
}

function Loading() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading posts">{[0, 1].map((i) => <div key={i} className="glass h-40 animate-pulse" />)}</div>;
}

function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="glass p-6 text-center text-sm">
      <p className="text-rose-300">{message}</p>
      <button className="btn btn-ghost mt-3" onClick={onRetry}>Try again</button>
    </div>
  );
}

function PostDetail({ id }) {
  const [state, setState] = useState({ status: 'loading' });
  const load = () => {
    setState({ status: 'loading' });
    fetchPost(id).then((post) => setState({ status: post ? 'ready' : 'missing', post }), (e) => setState({ status: 'error', error: errorText(e) }));
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = useLivePost(state.post);
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/feed" className="mb-4 inline-block text-sm text-brand-400 hover:underline">← Back to feed</Link>
      {state.status === 'loading' ? <Loading />
        : state.status === 'error' ? <LoadError message={state.error} onRetry={load} />
          : post ? <PostCard post={post} expanded />
            : <Empty icon="search" title="Post not found">It may have been deleted or you don’t have access.</Empty>}
    </div>
  );
}

/** Bookmarks are kept locally by post id; each one is read from the server (404s are skipped). */
function useBookmarkedPosts(ids, enabled) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', posts: [] });
  const key = ids.join(',');
  const load = () => {
    if (!enabled) return;
    setState((s) => ({ ...s, status: s.status === 'ready' ? 'ready' : 'loading' }));
    Promise.allSettled(ids.map(fetchPost)).then((rs) => {
      const failed = rs.filter((r) => r.status === 'rejected');
      if (ids.length && failed.length === ids.length) { setState({ status: 'error', posts: [], error: errorText(failed[0].reason) }); return; }
      const posts = rs.filter((r) => r.status === 'fulfilled' && r.value && r.value.status === 'published').map((r) => r.value)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setState({ status: 'ready', posts });
    });
  };
  useEffect(load, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onFeedEvent((e) => {
    if (e.type === 'post') setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === e.post.id ? { ...p, ...e.post } : p)) }));
    if (e.type === 'removed') setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== e.id) }));
  }), []);
  return { ...state, reload: load };
}

function FeedView({ view }) {
  const { state, me, user } = useStore();
  const [sp, setSp] = useSearchParams();
  const tag = sp.get('tag');
  const [moderates, setModerates] = useState(!!me?.admin);
  useEffect(() => {
    fetchMyCommunities().then((cs) => setModerates(!!me?.admin || cs.some(isCommunityModerator)), () => {});
  }, [me?.admin]);
  const views = VIEWS.filter((x) => x.id !== 'pending' || moderates);
  const v = VIEWS.find((x) => x.id === view) ?? VIEWS[0];
  const q = SERVER[v.id] ?? SERVER.my;
  const isBookmarks = v.id === 'bookmarks';
  const feed = useServerFeed({ view: q.view, community: q.community, keep: q.keep, enabled: !isBookmarks });
  const bookmarkIds = bookmarksOf(state, me.id);
  const marks = useBookmarkedPosts(bookmarkIds, isBookmarks);
  const followIds = followingIds(state, me);

  const source = isBookmarks ? marks : feed;
  const posts = useMemo(() => {
    let list = source.posts;
    // view=all also returns your own drafts and scheduled posts; they live in their own views.
    if (!['drafts', 'scheduled'].includes(v.id)) list = list.filter((p) => !['draft', 'scheduled'].includes(p.status));
    if (q.match) list = list.filter((p) => q.match(p, followIds));
    if (tag) list = list.filter((p) => tagsOf(p.body).includes(tag));
    return list;
  }, [source.posts, q, followIds.join(','), tag]); // eslint-disable-line react-hooks/exhaustive-deps
  const following = (state.follows || []).filter((f) => f.authorId === me.id);
  const filtered = !!q.match || !!tag;

  return (
    <div className="ext-grid ext-grid-feed grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_250px]">
      <nav aria-label="Feed views" className="ext-menu -mx-3 flex gap-1 overflow-x-auto px-3 pb-1 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0">
        {views.map((x) => (
          <NavLink key={x.id} to={x.id === 'my' ? '/feed' : `/feed/${x.id}`} end
            className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm ${isActive ? 'bg-[var(--az-surface)] font-semibold text-white shadow-[inset_3px_0_0_var(--color-brand-400)]' : 'text-2 font-medium hover:bg-white/5 hover:text-white'}`}>
            <Glyph value={x.icon} tile={false} size={18} />{x.label}
            {x.id === 'bookmarks' && bookmarkIds.length > 0 && <span className="ml-auto text-xs text-3">{bookmarkIds.length}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 space-y-4">
        <h1 className="t-h1 text-white">{v.label}</h1>
        {tag && (
          <div className="flex items-center gap-2 text-sm">Showing <span className="chip">#{tag}</span>
            <button className="text-brand-400 hover:underline" onClick={() => { sp.delete('tag'); setSp(sp); }}>Clear</button></div>
        )}
        {v.id === 'following' && following.length > 0 && (
          <div className="glass flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="text-3">Following</span>
            {following.map((f) => <span key={f.id} className="flex items-center gap-1.5"><Avatar user={user(f.targetId)} size={24} /><UserLink id={f.targetId} /></span>)}
          </div>
        )}
        {COMPOSER_VIEWS.includes(v.id) && <Composer compact communityId={v.id === 'wall' ? NETWORK_ID : undefined}
          defaultType={v.id === 'questions' ? 'question' : v.id === 'announcements' ? 'announcement' : undefined} />}
        {/* Below xl the sidebar is hidden, so the personal cards sit above the posts instead. */}
        {v.id === 'my' && <div className="space-y-4 xl:hidden"><CompletenessCard /><CelebrateClassmates /></div>}
        {source.status === 'loading' ? <Loading />
          : source.status === 'error' ? <LoadError message={source.error} onRetry={source.reload} />
            : posts.length === 0 ? (
              <Empty icon={v.icon} title="Nothing here yet">
                {EMPTY[v.id] ?? 'Posts will show up here.'}
                {filtered && feed.nextBefore && <span className="mt-1 block">Older posts may match: use “Load more”.</span>}
              </Empty>
            ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
        {!isBookmarks && source.status === 'ready' && feed.error && <p role="alert" className="text-center text-sm text-rose-300">{feed.error}</p>}
        {!isBookmarks && source.status === 'ready' && feed.nextBefore && (
          <button className="btn btn-ghost w-full" onClick={feed.loadMore} disabled={feed.loadingMore}>{feed.loadingMore ? 'Loading…' : 'Load more'}</button>
        )}
      </div>

      <aside className="hidden space-y-4 xl:block">
        <MandatoryPending />
        <CompletenessCard />
        <CelebrateClassmates />
        <TrendingTags />
        <CommunityMood />
      </aside>
    </div>
  );
}
