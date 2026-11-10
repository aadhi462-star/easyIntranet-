import UserLabels from '../UserLabels.jsx';
import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { communityPath } from '../../lib/communities.js';
import { Link } from 'react-router-dom';
import { bookmarksOf, fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import {
  acknowledge, approvePost, authorUser, deletePost, errorText, MOODS, NETWORK_ID, pinPost, publishPost, removePost, setReaction, vote,
} from '../../lib/feed.js';
import { Avatar, Modal } from '../ui.jsx';
import Comments from './Comments.jsx';
import Composer from './Composer.jsx';
import { AckBox } from './Mandatory.jsx';
import RichText from './RichText.jsx';
import { followingIds, GUEST } from './utils.js';

/** The author's name: a profile link, or plain "Deleted member". */
export function AuthorName({ author, className = '' }) {
  if (!author || author.deleted) return <span className={`font-semibold text-slate-400 ${className}`}>Deleted member</span>;
  return <Link to={`/people/${author.id}`} className={`font-semibold text-white hover:underline ${className}`}>{author.name || 'Member'}</Link>;
}

/**
 * One server post (see src/lib/feed.js). Every action goes to the API and the card re-renders
 * from the post the server returns. Controls follow `post.can.*`. `readOnly` (or no signed-in
 * user) renders a guest view without any interaction.
 */
export default function PostCard({ post, expanded = false, embedded = false, readOnly = false }) {
  const { state, dispatch, me: signedIn, user } = useStore();
  const guest = readOnly || !signedIn;
  const me = signedIn ?? GUEST;
  const [showComments, setShowComments] = useState(expanded);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = post.status || 'published';
  const author = post.author ?? {};
  const mine = !!me.id && author.id === me.id;
  const can = post.can ?? {};
  const follows = followingIds(state, me).includes(author.id);
  const r = post.reactions ?? { like: 0, liked: false, moods: {}, myMood: null };

  // Runs one API call; the shared feed cache updates every list showing this post.
  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); if (ok) toast(ok); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const like = () => run(() => setReaction(post.id, 'like', !r.liked));
  const react = (k) => run(() => setReaction(post.id, k, r.myMood !== k));
  const toggleFollow = () => {
    const f = (state.follows || []).find((x) => x.authorId === me.id && x.targetId === author.id);
    if (f) dispatch({ type: 'remove', col: 'follows', id: f.id });
    else dispatch({ type: 'add', col: 'follows', item: { targetId: author.id } });
  };
  const remove = () => {
    const reason = prompt('Why are you removing this post? The reason is kept in the moderation log.');
    if (reason == null) return;
    if (!reason.trim()) { setError('Give a reason for removing this post.'); return; }
    run(() => removePost(post.id, reason.trim()), 'Post removed');
  };
  const del = (what = 'post') => { if (confirm(`Delete this ${what}?`)) run(() => deletePost(post.id), 'Deleted'); };
  const close = () => setModal(null);
  const item = (label, fn, cls = '') => (
    <button key={label} className={`block min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-white/5 ${cls}`} onClick={() => { setMenu(false); fn(); }}>{label}</button>
  );

  const body = post.body ?? '';
  const long = body.length > 400 && !expanded;
  const text = long && !more ? `${body.slice(0, 400).trimEnd()}…` : body;
  const totalVotes = post.poll?.options.reduce((n, o) => n + (o.votes || 0), 0) ?? 0;
  const bookmarked = !guest && bookmarksOf(state, me.id).includes(post.id);
  const authorProfile = authorUser(author, user);
  const where = post.community && post.communityId !== NETWORK_ID ? post.community : null;

  return (
    <article className={`${embedded ? 'rounded-xl border border-white/10 bg-white/[.03] p-4' : 'glass p-4 sm:p-5'} ${post.pinned && !embedded ? 'ring-1 ring-brand-500/40' : ''}`} aria-label={`Post by ${author.deleted ? 'Deleted member' : author.name ?? 'member'}`}>
      <header className="flex flex-wrap items-start gap-3">
        {author.deleted ? <Avatar user={authorProfile} size={embedded ? 32 : 42} />
          : <Link to={`/people/${author.id}`} aria-hidden="true" tabIndex={-1}><Avatar user={authorProfile} size={embedded ? 32 : 42} /></Link>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <AuthorName author={author} />
            {!author.deleted && <UserLabels userId={author.id} context="post" max={2} small />}
            {where && <span className="text-slate-400">▸ <Link className="hover:underline" to={communityPath(where.id)}>{where.emoji} {where.name}</Link></span>}
          </div>
          <div className="text-xs text-slate-400">
            <Link to={`/post/${post.id}`} className="hover:underline">{status === 'scheduled' && post.publishAt ? `Scheduled for ${fmtDate(post.publishAt)}` : timeAgo(new Date(post.createdAt).getTime())}</Link>
            {post.editedAt && ' · edited'}{!author.deleted && user(author.id)?.role && ` · ${user(author.id).role}`}
          </div>
        </div>
        {/* On narrow cards the badges wrap onto their own row so they never squeeze the author name. */}
        <div className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:w-auto sm:justify-end">
          {post.pinned && <span className="chip"><Glyph value="📌" tile={false} size={16} /> Pinned</span>}
          {post.type === 'announcement' && <span className="chip !bg-leaf-400/15 !text-leaf-200"><Glyph value="📢" tile={false} size={16} /> Announcement</span>}
          {post.type === 'question' && <span className="chip !bg-brand-400/15 !text-brand-200"><Glyph value="❓" tile={false} size={16} /> Question</span>}
          {post.mandatory && <span className="chip !bg-amber-400/15 !text-amber-200"><Glyph value="mandatory" tile={false} size={16} /> Mandatory read</span>}
          {status === 'pending' && <span className="chip !bg-orange-400/15 !text-orange-200"><Glyph value="⏳" tile={false} size={16} /> Awaiting approval</span>}
          {status === 'draft' && <span className="chip !bg-white/10 !text-slate-200"><Glyph value="📝" tile={false} size={16} /> Draft</span>}
          {status === 'removed' && <span className="chip !bg-rose-400/15 !text-rose-200">Removed</span>}
        </div>
        {!embedded && !guest && (
          <div className="relative">
            <button className="btn btn-ghost h-10 w-10 !p-0" aria-label="Post actions" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="glass glass-strong absolute right-0 z-20 mt-1 w-60 p-1.5" onMouseLeave={() => setMenu(false)}>
                {status === 'published' && item(bookmarked ? '🔖 Remove bookmark' : '🔖 Bookmark', () => dispatch({ type: 'bookmark', id: post.id }))}
                {can.pin && status === 'published' && item(post.pinned ? '📌 Unpin' : '📌 Pin to top', () => run(() => pinPost(post.id, !post.pinned), post.pinned ? 'Unpinned' : 'Pinned'))}
                {!mine && !author.deleted && item(follows ? `👣 Unfollow ${(author.name || '').split(' ')[0]}` : `👣 Follow ${(author.name || '').split(' ')[0]}`, toggleFollow)}
                {status === 'published' && item('🔗 Copy link', () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/post/${post.id}`).then(() => toast('Link copied'), () => {}))}
                {can.edit && item('✏️ Edit', () => setModal('edit'))}
                {can.moderate && !mine && status === 'published' && item('🛡️ Remove post', remove, 'text-rose-300')}
                {can.delete && item('🗑️ Delete', () => del(), 'text-rose-300')}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="mt-3">
        {body && <RichText text={text} mentions={post.mentions || []} className="text-[15px] text-slate-100" />}
        {long && <button className="mt-1 text-sm text-brand-400 hover:underline" onClick={() => setMore(!more)}>{more ? 'See less' : 'See more'}</button>}
      </div>

      {post.poll && (
        <ul className="mt-3 space-y-2" aria-label="Poll options">
          {post.poll.options.map((o) => {
            const pct = totalVotes ? Math.round(((o.votes || 0) / totalVotes) * 100) : 0;
            const mineVote = post.poll.myVote === o.id;
            return (
              <li key={o.id}>
                <button disabled={guest || status !== 'published' || busy} onClick={() => !mineVote && run(() => vote(post.id, o.id))} aria-pressed={mineVote}
                  className={`relative block min-h-11 w-full overflow-hidden rounded-xl border px-3 text-left text-sm ${mineVote ? 'border-brand-500' : 'border-white/10 hover:border-white/25'}`}>
                  <span className="absolute inset-y-0 left-0 bg-brand-500/25" style={{ width: `${pct}%` }} />
                  <span className="relative flex justify-between py-2.5"><span>{mineVote && '✓ '}{o.label}</span><span className="text-slate-300">{pct}%</span></span>
                </button>
              </li>
            );
          })}
          <li className="text-xs text-slate-400">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</li>
        </ul>
      )}

      {post.mandatory && !embedded && !guest && status === 'published' && (
        <div className="mt-3">
          {mine ? (
            <p className="text-xs text-amber-200">You marked this as Mandatory Read{post.mandatory.ackCount != null ? ` · ${post.mandatory.ackCount} acknowledged` : ''}{post.mandatory.deadline ? ` · due ${fmtDate(post.mandatory.deadline)}` : ''}</p>
          ) : post.mandatory.acked ? (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"><Glyph value="mandatory" tile={false} size={16} /> You acknowledged this post.</p>
          ) : (
            <AckBox cfg={post.mandatory} busy={busy} onSubmit={() => run(() => acknowledge(post.id), 'Acknowledged')} />
          )}
          {!mine && can.moderate && post.mandatory.ackCount != null && <p className="mt-1 text-xs text-slate-400">{post.mandatory.ackCount} member{post.mandatory.ackCount === 1 ? '' : 's'} acknowledged</p>}
        </div>
      )}

      {!guest && status === 'pending' && can.moderate && !mine && (
        <div className="mt-3 flex gap-2"><button className="btn btn-primary" disabled={busy} onClick={() => run(() => approvePost(post.id), 'Post approved')}>Approve</button>
          <button className="btn btn-ghost text-rose-300" disabled={busy} onClick={remove}>Reject</button></div>
      )}
      {status === 'pending' && mine && <p className="mt-3 text-xs text-orange-200">Your post is awaiting moderator approval and isn’t visible to others yet.</p>}
      {status === 'removed' && post.removedReason && <p className="mt-3 text-xs text-rose-200">Removed by a moderator: {post.removedReason}</p>}
      {!guest && mine && (status === 'draft' || status === 'scheduled') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
            const p = await publishPost(post.id);
            toast(p.status === 'pending' ? 'Your post is awaiting moderator approval' : 'Published');
          })}>Publish now</button>
          {can.edit && <button className="btn btn-ghost" onClick={() => setModal('edit')}>Edit</button>}
          {can.delete && <button className="btn btn-ghost text-rose-300" disabled={busy} onClick={() => del(status === 'draft' ? 'draft' : 'scheduled post')}>Delete</button>}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}

      {status === 'published' && !embedded && guest && (
        <footer className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/5 pt-2 text-sm text-slate-400">
          <span>❤️ {r.like}</span><span><Glyph value="💬" tile={false} size={16} /> {post.commentCount ?? 0}</span>
          <Link to="/signup" className="ml-auto font-semibold text-brand-400 hover:underline">Join to react</Link>
        </footer>
      )}
      {status === 'published' && !embedded && !guest && (
        <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/5 pt-2 text-sm">
          <button className={`btn btn-ghost !border-0 !bg-transparent !px-2.5 ${r.liked ? 'text-leaf-300' : 'text-slate-300'}`} onClick={like} disabled={busy} aria-pressed={r.liked}>
            {r.liked ? '❤️' : '🤍'} {r.like || ''} <span className="sr-only">likes</span>
          </button>
          <span className="flex" role="group" aria-label="How does this make you feel?">
            {Object.entries(MOODS).map(([k, e]) => {
              const n = r.moods?.[k] || 0;
              return (
                <button key={k} onClick={() => react(k)} disabled={busy} aria-pressed={r.myMood === k} title={k}
                  className={`min-h-10 rounded-lg px-2 text-sm hover:bg-white/5 ${r.myMood === k ? 'bg-white/10' : 'opacity-80'}`}>{e}{n ? <span className="ml-0.5 text-xs">{n}</span> : null}</button>
              );
            })}
          </span>
          <button className="btn btn-ghost !border-0 !bg-transparent !px-2.5 text-slate-300" onClick={() => setShowComments(!showComments)} aria-expanded={showComments}>
            <Glyph value="channels" tile={false} size={16} /> {post.commentCount || ''} {post.type === 'question' ? (post.commentCount === 1 ? 'Answer' : 'Answers') : (post.commentCount === 1 ? 'Comment' : 'Comments')}
          </button>
        </footer>
      )}
      {status === 'published' && !embedded && !guest && showComments && <Comments post={post} />}

      {modal === 'edit' && <Modal title="Edit post" onClose={close} wide><Composer initial={post} onDone={close} /></Modal>}
    </article>
  );
}
