import { Glyph } from '../icons.jsx';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { SentimentMeter } from './PostModals.jsx';
import { audienceOf, canSee, isLive, sentimentCounts, trendingTags } from './utils.js';

export function TrendingTags() {
  const { state, me } = useStore();
  const tags = trendingTags(state, me);
  return (
    <section className="glass p-4" aria-labelledby="trending-h">
      <h2 id="trending-h" className="text-sm font-bold"><Glyph value="🔥" tile={false} size={16} /> Trending tags</h2>
      {tags.length === 0 ? <p className="mt-2 text-xs text-slate-400">No tags yet. Add #tags to your posts.</p> : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map(({ tag }) => <li key={tag}><Link to={`/feed?tag=${tag}`} className="chip !py-1.5 hover:!bg-brand-500/30">#{tag}</Link></li>)}
        </ul>
      )}
    </section>
  );
}

export function MandatoryPending() {
  const { state, me } = useStore();
  const pending = state.posts.filter((p) => isLive(p) && p.mandatory && p.authorId !== me.id && !p.mandatory.acks.includes(me.id) && canSee(state, me, p)
    && audienceOf(state, p).includes(me.id));
  if (!pending.length) return null;
  return (
    <Link to="/feed/mandatory" className="glass block p-4 ring-1 ring-amber-300/30 hover:ring-amber-300/60">
      <div className="text-sm font-bold text-amber-200"><Glyph value="mandatory" tile={false} size={16} /> {pending.length} mandatory read{pending.length > 1 ? 's' : ''} pending</div>
      <p className="mt-1 text-xs text-slate-400">Open and acknowledge them before the deadline.</p>
    </Link>
  );
}

export function CommunityMood() {
  const { state, me } = useStore();
  const since = Date.now() - 14 * 864e5;
  const posts = state.posts.filter((p) => isLive(p) && p.createdAt > since && canSee(state, me, p));
  return <section className="glass p-4"><SentimentMeter counts={sentimentCounts(posts)} label="Community mood · 14 days" /></section>;
}
