import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';
import PostCard from './PostCard.jsx';
import { isLive, isPublicPost, sortPosts } from './utils.js';

/** Read-only feed of published network-wall and public-group posts. Works signed out. */
export default function PublicFeed({ limit = 10 }) {
  const { state } = useStore();
  // Reposts embed their original only if it's public too (PostCard checks that for guests).
  const posts = sortPosts(state.posts.filter((p) => isLive(p) && isPublicPost(state, p))).slice(0, limit);
  if (!posts.length) return <Empty icon="📭" title="No public posts yet" />;
  return <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} readOnly />)}</div>;
}
