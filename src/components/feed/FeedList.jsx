import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';
import Composer from './Composer.jsx';
import PostCard from './PostCard.jsx';
import { canSee, GUEST, matchesScope, sortPosts, statusOf } from './utils.js';

const PAGE = 15;

/**
 * A wall for one scope: {type:'network'} | {type:'group', id} | {type:'user', id}.
 * `readOnly` hides the composer for everyone except admins of that group (admin-only groups).
 */
export default function FeedList({ scope, composer = true, readOnly = false, groupId }) {
  const { state, me: signedIn } = useStore();
  const me = signedIn ?? GUEST;
  const [limit, setLimit] = useState(PAGE);
  const s = scope ?? (groupId ? { type: 'group', id: groupId } : { type: 'network' });
  const group = s.type === 'group' ? state.groups.find((g) => g.id === s.id) : null;
  const isGroupAdmin = me.admin || !!group?.admins.includes(me.id);
  const isMember = !group || group.members.includes(me.id) || me.admin;
  const showComposer = !!signedIn && composer && isMember && (!readOnly || isGroupAdmin) && (s.type !== 'user' || s.id === me.id);

  const posts = sortPosts(state.posts.filter((p) =>
    matchesScope(p, s) && canSee(state, me, p) && ['published', 'pending'].includes(statusOf(p))));

  return (
    <div className="space-y-4">
      {showComposer && <Composer scope={s.type === 'user' ? { type: 'user', id: me.id } : s} compact />}
      {signedIn && readOnly && !isGroupAdmin && <p className="text-xs text-slate-400">Only admins can post here.</p>}
      {posts.length === 0 ? <Empty icon="📭" title="No posts yet">{showComposer ? 'Be the first to share something.' : ''}</Empty>
        : posts.slice(0, limit).map((p) => <PostCard key={p.id} post={p} />)}
      {posts.length > limit && <button className="btn btn-ghost w-full" onClick={() => setLimit(limit + PAGE)}>Load more</button>}
    </div>
  );
}
