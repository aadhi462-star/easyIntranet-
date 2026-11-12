import { Glyph, Icon } from '../icons.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Avatar, Field, Modal } from '../ui.jsx';
import { CompletenessCard } from '../people/Completeness.jsx';
import { canSeeContact } from '../people/shared.jsx';
import { upcomingCelebrations, whenLabel } from '../../lib/celebrations.js';
import { SentimentMeter } from './PostModals.jsx';
import { fetchFeed, onFeedEvent } from '../../lib/feed.js';
import { canSee, isLive, sentimentCounts, trendingTags } from './utils.js';

export function TrendingTags() {
  const { state, me } = useStore();
  const tags = trendingTags(state, me);
  return (
    <section className="panel p-4" aria-labelledby="trending-h">
      <h2 id="trending-h" className="text-sm font-bold"><Glyph value="sparkle" tile={false} size={16} /> Trending tags</h2>
      {tags.length === 0 ? <p className="t-small mt-2">No tags yet. Add #tags to your posts.</p> : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map(({ tag }) => <li key={tag}><Link to={`/feed?tag=${tag}`} className="badge badge-neutral min-h-8 hover:underline">#{tag}</Link></li>)}
        </ul>
      )}
    </section>
  );
}

// Feed.jsx renders MandatoryPending at the top of its sidebar and CommunityMood at the
// bottom, so the profile-completeness and celebrations cards ride along with them.
// Both are also exported for pages that want to place them explicitly.
export { CompletenessCard };

export function MandatoryPending() {
  return <MandatoryPendingCard />;
}

/** Server Mandatory Reads you haven't acknowledged yet (GET /feed?view=mandatory). */
function MandatoryPendingCard() {
  const { me } = useStore();
  const meId = me?.id;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!meId) return undefined;
    let live = true;
    const load = () => fetchFeed({ view: 'mandatory', limit: 50 })
      .then(({ posts }) => live && setCount(posts.filter((p) => p.status === 'published' && p.mandatory && !p.mandatory.acked && p.author?.id !== meId).length))
      .catch(() => { /* offline: keep the last count */ });
    load();
    const off = onFeedEvent((e) => { if (e.type !== 'post' || e.post.mandatory) load(); });
    return () => { live = false; off(); };
  }, [meId]);
  if (!me || !count) return null;
  return (
    <Link to="/feed/mandatory" className="notice notice-warn block p-4 hover:underline">
      <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--az-warning)]"><Icon name="mandatory" size={16} /> {count} mandatory read{count > 1 ? 's' : ''} pending</div>
      <p className="t-small mt-1">Open and acknowledge them before the deadline.</p>
    </Link>
  );
}

export function CommunityMood() {
  const { state, me } = useStore();
  const since = Date.now() - 14 * 864e5;
  const posts = state.posts.filter((p) => isLive(p) && p.createdAt > since && canSee(state, me, p));
  return <section className="panel p-4"><SentimentMeter counts={sentimentCounts(posts)} label="Community mood · 14 days" /></section>;
}

const firstName = (u) => (u?.name || '').split(' ')[0] || 'friend';
const defaultWish = (c) => (c.kind === 'birthday'
  ? `Happy birthday, ${firstName(c.user)}! Wishing you a wonderful year ahead.`
  : `Happy ${c.years}-year community anniversary, ${firstName(c.user)}! Thanks for being part of the network.`);

/** Today's and the next 7 days' birthdays and community anniversaries, with "Send wishes". */
export function CelebrateClassmates() {
  const { state, me } = useStore();
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  if (!me) return null;
  // Blocks work both ways, as in Channels: neither side sees or wishes the other.
  const blocked = new Set((state.blocks || []).filter((b) => b.authorId === me.id || b.targetId === me.id)
    .map((b) => (b.authorId === me.id ? b.targetId : b.authorId)));
  // Birthdays follow the member's contact privacy; join dates are public on profiles anyway.
  const list = upcomingCelebrations(state.users, me.id, 7)
    .filter((c) => !blocked.has(c.user.id) && (c.kind !== 'birthday' || canSeeContact(state, me.id, c.user)));
  const wished = (c) => (state.wishes || []).some((w) => w.fromId === me.id && w.toId === c.user.id && w.kind === c.kind && w.year === c.year);
  const shown = showAll ? list : list.slice(0, 5);
  return (
    <>
    <section className="panel p-4" aria-labelledby="celebrate-h">
      <h2 id="celebrate-h" className="text-sm font-bold"><Glyph value="party" tile={false} size={16} /> Celebrate classmates</h2>
      {!list.length ? <p className="t-small mt-2">No birthdays or community anniversaries in the next week.</p> : (
        <>
          <ul className="mt-2 space-y-1">
            {shown.map((c) => {
              const done = wished(c);
              const what = c.kind === 'birthday' ? 'Birthday' : `${c.years}-year anniversary`;
              return (
                <li key={`${c.kind}:${c.user.id}`} className="flex items-center gap-2 py-1">
                  <Link to={`/people/${c.user.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg hover:bg-[var(--az-sunken)]">
                    <Avatar user={c.user} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.user.name}</span>
                      <span className="t-small block truncate"><Icon name={c.kind === 'birthday' ? 'cake' : 'party'} size={12} className="mr-1 inline align-[-1px]" />{what} · {whenLabel(c.inDays, c.date)}</span>
                    </span>
                  </Link>
                  {done
                    ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--az-link)]" role="status" aria-label={`You wished ${c.user.name}`}>Wished <Icon name="check" size={14} /></span>
                    : <button type="button" className="btn btn-ghost min-h-11 shrink-0 !px-3 text-xs" onClick={() => setOpen(c)} aria-label={`Send ${c.kind === 'birthday' ? 'birthday' : 'anniversary'} wishes to ${c.user.name}`}>Send wishes</button>}
                </li>
              );
            })}
          </ul>
          {list.length > 5 && <button type="button" className="link mt-1 min-h-9 text-xs" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${list.length}`}</button>}
        </>
      )}
    </section>
    {/* Outside the panel, so the fixed overlay isn't trapped by it. */}
    {open && <WishModal celebration={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function WishModal({ celebration: c, onClose }) {
  const { state, me, dispatch } = useStore();
  const [text, setText] = useState(() => defaultWish(c));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const send = (e) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) { setError('Write a short message first.'); return; }
    if (sending) return;
    // Once per person, kind and year: re-check the store in case another tab already sent it.
    const dup = (state.wishes || []).some((w) => w.fromId === me.id && w.toId === c.user.id && w.kind === c.kind && w.year === c.year);
    setSending(true);
    if (!dup) {
      dispatch({ type: 'add', col: 'wishes', silent: true, item: { fromId: me.id, toId: c.user.id, kind: c.kind, year: c.year } });
      dispatch({ type: 'notify', notification: { userId: c.user.id, kind: c.kind, text: `${me.name}: ${msg}`, link: `/people/${me.id}` } });
      toast(`Wishes sent to ${firstName(c.user)}`);
    }
    onClose();
  };
  return (
    <Modal title={`Wish ${c.user.name}`} onClose={onClose}>
      <form onSubmit={send} className="space-y-4">
        <p className="text-sm text-[var(--az-text-2)]">{c.kind === 'birthday' ? 'Birthday' : `${c.years}-year community anniversary`} · {whenLabel(c.inDays, c.date)}. {firstName(c.user)} gets this as a notification from you.</p>
        <Field label="Your message">
          <textarea className="input min-h-24" value={text} maxLength={280} onChange={(e) => { setText(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby="wish-count" />
          <span id="wish-count" className="t-small mt-1 block text-right">{text.length}/280</span>
          {error && <span role="alert" className="field-error block">{error}</span>}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary min-h-11" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary min-h-11" disabled={sending}>Send wishes</button>
        </div>
      </form>
    </Modal>
  );
}
