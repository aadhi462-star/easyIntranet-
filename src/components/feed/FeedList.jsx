import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { fetchMyCommunities, isCommunityAdmin, useServerFeed } from '../../lib/feed.js';
import { Empty } from '../ui.jsx';
import Composer from './Composer.jsx';
import PostCard from './PostCard.jsx';

/**
 * A wall for one scope, from the server: {type:'network'} (the Company Wall community) |
 * {type:'group', id} (that community) | {type:'user', id} (a member's posts). The server has no
 * per-author feed yet, so a member's wall shows their posts from communities you share
 * (your own: every post of yours). `readOnly` keeps the composer for community admins only.
 */
export default function FeedList({ scope, composer = true, readOnly = false, groupId }) {
  const { me } = useStore();
  const s = scope ?? (groupId ? { type: 'group', id: groupId } : { type: 'network' });
  const community = s.type === 'group' ? s.id : undefined;
  const own = s.type === 'user' && s.id === me?.id;
  const view = own ? 'mine' : 'all';
  const feed = useServerFeed({ view, community, enabled: !!me, keep: (p) => !['draft', 'scheduled'].includes(p.status) });
  const [membership, setMembership] = useState(undefined); // undefined while loading, null if not a member

  useEffect(() => {
    if (!me || !community) return;
    fetchMyCommunities().then((cs) => setMembership(cs.find((c) => c.id === community) ?? null), () => setMembership(null));
  }, [me?.id, community]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) {
    return <Empty icon="inbox" title="Sign in to see posts"><Link to="/login" className="text-brand-400 hover:underline">Sign in</Link> to read and join the conversation.</Empty>;
  }

  const isAdmin = isCommunityAdmin(membership);
  const showComposer = composer && (s.type === 'user' ? own : !!membership && (!readOnly || isAdmin));
  const posts = s.type === 'user' && !own
    ? feed.posts.filter((p) => p.author?.id === s.id && p.status === 'published')
    : feed.posts.filter((p) => ['published', 'pending', 'removed'].includes(p.status));

  return (
    <div className="space-y-4">
      {showComposer && <Composer communityId={community} compact />}
      {readOnly && membership && !isAdmin && <p className="text-xs text-3">Only admins can post here.</p>}
      {feed.status === 'loading' ? <div className="glass h-40 animate-pulse" aria-busy="true" aria-label="Loading posts" />
        : feed.status === 'error' ? (
          <div role="alert" className="glass p-6 text-center text-sm"><p className="text-rose-300">{feed.error}</p>
            <button className="btn btn-ghost mt-3" onClick={feed.reload}>Try again</button></div>
        ) : posts.length === 0 ? (
          <Empty icon="inbox" title="No posts yet">{showComposer ? 'Be the first to share something.' : feed.nextBefore ? 'Older posts may appear with “Load more”.' : ''}</Empty>
        ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
      {feed.status === 'ready' && feed.error && <p role="alert" className="text-center text-sm text-rose-300">{feed.error}</p>}
      {feed.status === 'ready' && feed.nextBefore && (
        <button className="btn btn-ghost w-full" onClick={feed.loadMore} disabled={feed.loadingMore}>{feed.loadingMore ? 'Loading…' : 'Load more'}</button>
      )}
    </div>
  );
}
