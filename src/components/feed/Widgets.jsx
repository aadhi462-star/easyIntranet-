import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Avatar, Field, Modal } from '../ui.jsx';
import { CompletenessCard } from '../people/Completeness.jsx';
import { canSeeContact } from '../people/shared.jsx';
import { upcomingCelebrations, whenLabel } from '../../lib/celebrations.js';
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

// Feed.jsx renders MandatoryPending at the top of its sidebar and CommunityMood at the
// bottom, so the profile-completeness and celebrations cards ride along with them.
// Both are also exported for pages that want to place them explicitly.
export { CompletenessCard };

export function MandatoryPending() {
  return <MandatoryPendingCard />;
}

function MandatoryPendingCard() {
  const { state, me } = useStore();
  if (!me) return null;
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

const firstName = (u) => (u?.name || '').split(' ')[0] || 'friend';
const defaultWish = (c) => (c.kind === 'birthday'
  ? `Happy birthday, ${firstName(c.user)}! 🎂 Wishing you a wonderful year ahead.`
  : `Happy ${c.years}-year community anniversary, ${firstName(c.user)}! 🎉 Thanks for being part of the network.`);

/** Today's and the next 7 days' birthdays and community anniversaries, with "Send wishes". */
export function CelebrateClassmates() {
  const { state, me } = useStore();
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  if (!me) return null;
  const blocked = new Set((state.blocks || []).filter((b) => b.authorId === me.id).map((b) => b.targetId));
  // Birthdays follow the member's contact privacy; join dates are public on profiles anyway.
  const list = upcomingCelebrations(state.users, me.id, 7)
    .filter((c) => !blocked.has(c.user.id) && (c.kind !== 'birthday' || canSeeContact(state, me.id, c.user)));
  const wished = (c) => (state.wishes || []).some((w) => w.fromId === me.id && w.toId === c.user.id && w.kind === c.kind && w.year === c.year);
  const shown = showAll ? list : list.slice(0, 5);
  return (
    <>
    <section className="glass p-4" aria-labelledby="celebrate-h">
      <h2 id="celebrate-h" className="text-sm font-bold"><Glyph value="🎉" tile={false} size={16} /> Celebrate classmates</h2>
      {!list.length ? <p className="mt-2 text-xs text-slate-400">No birthdays or community anniversaries in the next week.</p> : (
        <>
          <ul className="mt-2 space-y-1">
            {shown.map((c) => {
              const done = wished(c);
              const what = c.kind === 'birthday' ? 'Birthday' : `${c.years}-year anniversary`;
              return (
                <li key={`${c.kind}:${c.user.id}`} className="flex items-center gap-2 py-1">
                  <Link to={`/people/${c.user.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg hover:bg-white/5">
                    <Avatar user={c.user} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.user.name}</span>
                      <span className="block truncate text-xs text-slate-400"><span aria-hidden="true">{c.kind === 'birthday' ? '🎂' : '🎉'} </span>{what} · {whenLabel(c.inDays, c.date)}</span>
                    </span>
                  </Link>
                  {done
                    ? <span className="shrink-0 text-xs font-semibold text-brand-400" role="status" aria-label={`You wished ${c.user.name}`}>Wished ✓</span>
                    : <button type="button" className="btn btn-ghost min-h-11 shrink-0 !px-3 text-xs" onClick={() => setOpen(c)} aria-label={`Send ${c.kind === 'birthday' ? 'birthday' : 'anniversary'} wishes to ${c.user.name}`}>Send wishes</button>}
                </li>
              );
            })}
          </ul>
          {list.length > 5 && <button type="button" className="mt-1 min-h-9 text-xs text-brand-400 hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${list.length}`}</button>}
        </>
      )}
    </section>
    {/* Outside the glass pane: its backdrop-filter would trap the fixed overlay. */}
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
        <p className="text-sm text-slate-400">{c.kind === 'birthday' ? '🎂 Birthday' : `🎉 ${c.years}-year community anniversary`} · {whenLabel(c.inDays, c.date)}. {firstName(c.user)} gets this as a notification from you.</p>
        <Field label="Your message">
          <textarea className="input min-h-24" value={text} maxLength={280} onChange={(e) => { setText(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby="wish-count" />
          <span id="wish-count" className="mt-1 block text-right text-xs text-slate-500">{text.length}/280</span>
          {error && <span role="alert" className="mt-1 block text-xs text-rose-300">{error}</span>}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost min-h-11" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary min-h-11" disabled={sending}>Send wishes</button>
        </div>
      </form>
    </Modal>
  );
}
