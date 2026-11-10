import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';
import PostCard from './PostCard.jsx';
import { isLive, isPublicPost, sortPosts } from './utils.js';

// NOTE: there is no signed-out (public) feed endpoint on the server yet, so the Explore page
// still reads the browser's local demo posts. When one exists (e.g. GET /public/feed returning
// the same post shape as GET /feed), fetch it here and drop the local mapping below.

/** Local demo post → the server post shape PostCard renders (read-only). */
function asServerPost(state, p) {
  const u = state.users.find((x) => x.id === p.authorId);
  const g = p.scope?.type === 'group' ? state.groups.find((x) => x.id === p.scope.id) : null;
  const moods = { happy: 0, neutral: 0, sad: 0 };
  for (const m of Object.values(p.reactions || {})) moods[m === 'unhappy' ? 'sad' : m] = (moods[m === 'unhappy' ? 'sad' : m] || 0) + 1;
  return {
    id: p.id, communityId: g ? g.id : 'alumnizone', community: g ? { id: g.id, name: g.name, emoji: g.emoji } : null,
    author: u ? { id: u.id, name: u.name } : { id: p.authorId, name: 'Deleted member', deleted: true },
    type: p.type === 'advocacy' ? 'post' : p.type, body: p.text || '', status: 'published', pinned: !!p.pinned, mentions: p.mentions || [],
    createdAt: p.createdAt, editedAt: p.editedAt ?? null,
    poll: p.poll ? { options: p.poll.options.map((o) => ({ id: o.id, label: o.text, votes: o.votes.length })), myVote: null } : null,
    mandatory: null, reactions: { like: p.likes?.length || 0, liked: false, moods, myMood: null },
    commentCount: p.comments?.length || 0, can: {},
  };
}

/** Read-only feed of published network-wall and public-group posts. Works signed out. */
export default function PublicFeed({ limit = 10 }) {
  const { state } = useStore();
  const posts = sortPosts(state.posts.filter((p) => isLive(p) && !p.repostOf && isPublicPost(state, p))).slice(0, limit);
  if (!posts.length) return <Empty icon="📭" title="No public posts yet" />;
  return <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={asServerPost(state, p)} readOnly />)}</div>;
}
