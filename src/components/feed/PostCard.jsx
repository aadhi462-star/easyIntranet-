import UserLabels from '../UserLabels.jsx';
import { Icon } from '../icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { communityPath } from '../../lib/communities.js';
import { Link } from 'react-router-dom';
import { fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { setSaved, useIsSaved } from '../../lib/engage.js';
import { toast } from '../../lib/toast.js';
import {
  acknowledge, approvePost, authorUser, deletePost, errorText, MOODS, pinPost, publishPost, setReaction, vote,
} from '../../lib/feed.js';
import { Avatar, Modal } from '../ui.jsx';
import { Badge, IconButton } from '../ui/Controls.jsx';
import Comments from './Comments.jsx';
import Composer from './Composer.jsx';
import { AckBox } from './Mandatory.jsx';
import RichText from './RichText.jsx';
import RemoveDialog from './RemoveDialog.jsx';
import ReportDialog from '../manage/Report.jsx';
import { GUEST } from './utils.js';
import { confirmAction } from '../ui/Confirm.jsx';

const MOOD_LABEL = { happy: 'Happy', neutral: 'Neutral', sad: 'Sad' };
// Reaction buttons (E9): 44 px targets; your own reaction is pressed and tinted.
const REACT = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium sm:px-2.5 text-[var(--az-text-2)] hover:bg-[var(--az-sunken)] disabled:cursor-not-allowed aria-pressed:bg-[color-mix(in_srgb,var(--az-focus)_14%,transparent)] aria-pressed:text-[var(--az-link)]';

/** The author's name: a profile link, or plain "Deleted member". */
export function AuthorName({ author, className = '' }) {
  if (!author || author.deleted) return <span className={`font-semibold text-[var(--az-text-3)] ${className}`}>Deleted member</span>;
  return <Link to={`/people/${author.id}`} className={`font-semibold text-[var(--az-text)] hover:underline ${className}`}>{author.name || 'Member'}</Link>;
}

const commentLabel = (n, question) => {
  if (!n) return question ? 'Answer' : 'Comment';
  const [one, many] = question ? ['answer', 'answers'] : ['comment', 'comments'];
  return `${n} ${n === 1 ? one : many}`;
};

/**
 * One server post (see src/lib/feed.js). Every action goes to the API and the card re-renders
 * from the post the server returns. Controls follow `post.can.*`, and the server checks again.
 * `readOnly` (or no signed-in user) renders a guest view without any interaction.
 */
export default function PostCard({ post, expanded = false, embedded = false, readOnly = false }) {
  const { me: signedIn, user } = useStore();
  const guest = readOnly || !signedIn;
  const me = signedIn ?? GUEST;
  const [showComments, setShowComments] = useState(expanded);
  const [modal, setModal] = useState(null); // edit | report | remove | reject
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { text, warn }
  const status = post.status || 'published';
  const published = status === 'published';
  const author = post.author ?? {};
  const authorName = author.deleted ? 'Deleted member' : author.name ?? 'member';
  const mine = !!me.id && author.id === me.id;
  const can = post.can ?? {};
  const r = post.reactions ?? { like: 0, liked: false, moods: {}, myMood: null };

  // Runs one API call; the shared feed cache updates every list showing this post.
  const run = async (fn, ok) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); if (ok) toast(ok); } catch (e) {
      // The pin limit (E8) is the server's 409 PIN_LIMIT: shown as a warning, in the card and as a toast.
      const warn = e?.code === 'PIN_LIMIT';
      const text = errorText(e);
      setError({ text, warn });
      if (warn) toast(text);
    } finally { setBusy(false); }
  };
  const like = () => run(() => setReaction(post.id, 'like', !r.liked));
  // One mood each (CNT-16): another mood replaces yours on the server; yours again clears it.
  const react = (k) => run(() => setReaction(post.id, k, r.myMood !== k));
  const del = async (what = 'post') => { if ((await confirmAction(`Delete this ${what}?`))) run(() => deletePost(post.id), 'Deleted'); };
  const close = () => setModal(null);

  const body = post.body ?? '';
  const long = body.length > 400 && !expanded;
  const text = long && !more ? `${body.slice(0, 400).trimEnd()}…` : body;
  const totalVotes = post.poll?.options.reduce((n, o) => n + (o.votes || 0), 0) ?? 0;
  // Saved lives on the account (Stage 4).
  const bookmarked = useIsSaved('post', post.id) && !guest;
  const save = () => run(() => setSaved('post', post.id, !bookmarked), bookmarked ? 'Removed from Saved' : 'Saved');
  const authorProfile = authorUser(author, user);
  const where = post.community ?? null;

  // The post menu (E10): everyday items, then moderation under its own heading. Each item shows
  // only when the server allows it (post.can). Follow [Name] was browser-only and has left the menu.
  const items = [
    published && { label: bookmarked ? 'Remove from Saved' : 'Save', icon: 'bookmarks', fn: save },
    published && { label: 'Copy link', icon: 'link', fn: () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/post/${post.id}`).then(() => toast('Link copied'), () => {}) },
    can.edit && { label: 'Edit', icon: 'pen', fn: () => setModal('edit') },
    mine && can.delete && { label: 'Delete', icon: 'x', fn: () => del(), danger: true },
    !mine && published && { label: 'Report', icon: 'flag', fn: () => setModal('report') },
  ].filter(Boolean);
  const modItems = [
    can.pin && published && { label: post.pinned ? 'Unpin' : 'Pin to top', icon: 'pinned', fn: () => run(() => pinPost(post.id, !post.pinned), post.pinned ? 'Unpinned' : 'Pinned') },
    can.moderate && !mine && published && { label: 'Remove post', icon: 'ban', fn: () => setModal('remove'), danger: true },
    !mine && can.delete && { label: 'Delete', icon: 'x', fn: () => del(), danger: true },
  ].filter(Boolean);
  const hasMenu = !embedded && !guest && (items.length > 0 || modItems.length > 0);

  const label = status === 'removed' ? `Removed post by ${authorName}` : status === 'pending' ? `Post by ${authorName}, awaiting approval` : `Post by ${authorName}`;
  const shell = embedded ? 'sunken p-4' : `panel p-4 sm:p-5 ${status === 'removed' ? 'bg-[var(--az-page)]' : ''}`;

  return (
    <article className={`${shell} flex min-w-0 flex-col gap-3`} aria-label={label}>
      <header className="flex items-start gap-3">
        {author.deleted ? <Avatar user={authorProfile} size={embedded ? 32 : 44} />
          : <Link to={`/people/${author.id}`} aria-hidden="true" tabIndex={-1}><Avatar user={authorProfile} size={embedded ? 32 : 44} /></Link>}
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_180px]">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]">
            <AuthorName author={author} />
            {!author.deleted && <UserLabels userId={author.id} context="post" max={2} small />}
            {where && <span className="t-small">in <Link className="font-semibold text-[var(--az-text)] hover:underline" to={communityPath(where.id)}>{where.name}</Link></span>}
          </div>
          <div className="t-small">
            <Link to={`/post/${post.id}`} className="hover:underline">{status === 'scheduled' && post.publishAt ? `Scheduled for ${fmtDate(post.publishAt)}` : timeAgo(new Date(post.createdAt).getTime())}</Link>
            {post.editedAt && ' · edited'}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {post.topic && <Badge>{post.topic.name}</Badge>}
          {post.pinned && <Badge icon="pinned">Pinned</Badge>}
          {post.type === 'announcement' && <Badge tone="info" icon="announce">Announcement</Badge>}
          {post.type === 'question' && <Badge tone="info" icon="questions">Question</Badge>}
          {post.type === 'poll' && <Badge tone="info" icon="poll">Poll</Badge>}
          {post.mandatory && <Badge tone="warn" icon="mandatory">Mandatory read</Badge>}
          {status === 'pending' && <Badge tone="warn" icon="clock">Awaiting approval</Badge>}
          {status === 'draft' && <Badge icon="drafts">Draft</Badge>}
          {status === 'scheduled' && <Badge icon="scheduled">Scheduled</Badge>}
          {status === 'removed' && <Badge tone="bad">Removed</Badge>}
          {status === 'removed' && can.moderate && <span className="badge bg-[var(--az-surface)] text-[var(--az-text)] shadow-[inset_0_0_0_1px_var(--az-control)]">Moderators only</span>}
        </div>
        </div>
        {hasMenu && <PostMenu items={items} modItems={modItems} />}
      </header>

      {body && (
        <div>
          <RichText text={text} mentions={post.mentions || []} className={`text-[15px] ${status === 'removed' ? 'text-[var(--az-text-2)]' : 'text-[var(--az-text)]'}`} />
          {long && <button type="button" className="link mt-1 min-h-8 text-sm" onClick={() => setMore(!more)}>{more ? 'See less' : 'See more'}</button>}
        </div>
      )}
      {post.attachments?.length > 0 && <Attachments list={post.attachments} />}

      {post.poll && (
        <ul className="flex flex-col gap-2" aria-label="Poll options">
          {post.poll.options.map((o) => {
            const pct = totalVotes ? Math.round(((o.votes || 0) / totalVotes) * 100) : 0;
            const mineVote = post.poll.myVote === o.id;
            return (
              <li key={o.id}>
                <button type="button" disabled={guest || !published || busy} onClick={() => !mineVote && run(() => vote(post.id, o.id))} aria-pressed={mineVote}
                  className={`relative block min-h-11 w-full overflow-hidden rounded-[10px] border bg-[var(--az-surface)] text-left text-[15px] font-medium text-[var(--az-text)] disabled:cursor-default ${mineVote ? 'border-[var(--az-focus)]' : 'border-[var(--az-control)] hover:bg-[var(--az-sunken)]'}`}>
                  <span aria-hidden="true" className={`absolute inset-y-0 left-0 ${mineVote ? 'bg-[color-mix(in_srgb,var(--az-focus)_14%,transparent)]' : 'bg-[var(--az-sunken)]'}`} style={{ width: `${pct}%` }} />
                  <span className="relative flex justify-between gap-3 px-3.5 py-2.5">
                    <span className="inline-flex min-w-0 items-center gap-2">{mineVote && <Icon name="check" size={16} />}<span className="min-w-0 break-words">{o.label}{mineVote && ' · your vote'}</span></span>
                    <span className="tabular-nums">{pct}%</span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="t-small">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</li>
        </ul>
      )}

      {post.mandatory && !embedded && !guest && published && (
        <div>
          {mine ? (
            <p className="t-small">You marked this as Mandatory Read{post.mandatory.ackCount != null ? ` · ${post.mandatory.ackCount} acknowledged` : ''}{post.mandatory.deadline ? ` · due ${fmtDate(post.mandatory.deadline)}` : ''}</p>
          ) : post.mandatory.acked ? (
            <p className="notice notice-ok flex items-center gap-2"><Icon name="mandatory" size={18} className="text-[var(--az-ok)]" /> You acknowledged this post.</p>
          ) : (
            <AckBox cfg={post.mandatory} busy={busy} onSubmit={() => run(() => acknowledge(post.id), 'Acknowledged')} />
          )}
          {!mine && can.moderate && post.mandatory.ackCount != null && <p className="t-small mt-1">{post.mandatory.ackCount} member{post.mandatory.ackCount === 1 ? '' : 's'} acknowledged</p>}
        </div>
      )}

      {!guest && status === 'pending' && can.moderate && !mine && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => approvePost(post.id), 'Post approved')}>Approve</button>
          <button type="button" className="btn btn-secondary btn-sm text-[var(--az-danger)]" disabled={busy} onClick={() => setModal('reject')}>Reject</button>
        </div>
      )}
      {status === 'pending' && mine && <p className="notice notice-warn">Your post is awaiting moderator approval and isn’t visible to others yet.</p>}
      {status === 'removed' && post.removedReason && (
        <p className="notice notice-bad flex items-start gap-2"><Icon name="ban" size={18} className="mt-0.5 text-[var(--az-danger)]" /><span>Removed by a moderator: {post.removedReason}</span></p>
      )}
      {!guest && mine && (status === 'draft' || status === 'scheduled') && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => {
            const p = await publishPost(post.id);
            toast(p.status === 'pending' ? 'Your post is awaiting moderator approval' : 'Published');
          })}>Publish now</button>
          {can.edit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModal('edit')}>Edit</button>}
          {can.delete && <button type="button" className="btn btn-secondary btn-sm text-[var(--az-danger)]" disabled={busy} onClick={() => del(status === 'draft' ? 'draft' : 'scheduled post')}>Delete</button>}
        </div>
      )}

      {error && (
        <p role="alert" className={`notice ${error.warn ? 'notice-warn' : 'notice-bad'} flex items-start gap-2`}>
          <Icon name="alert" size={18} className={`mt-0.5 ${error.warn ? 'text-[var(--az-warning)]' : 'text-[var(--az-danger)]'}`} /><span>{error.text}</span>
        </p>
      )}

      {published && !embedded && guest && (
        <footer className="flex flex-wrap items-center gap-4 border-t border-[var(--az-divider)] pt-2 text-sm text-[var(--az-text-2)]">
          <span className="inline-flex items-center gap-1"><Icon name="heart" size={18} /> {r.like} <span className="sr-only">likes</span></span>
          <span className="inline-flex items-center gap-1"><Icon name="channels" size={18} /> {post.commentCount ?? 0} <span className="sr-only">comments</span></span>
          <Link to="/signup" className="link ml-auto">Join to react</Link>
        </footer>
      )}
      {published && !embedded && !guest && (
        <footer className="flex flex-wrap items-center gap-0.5 border-t border-[var(--az-divider)] pt-2">
          <button type="button" className={REACT} onClick={like} disabled={busy} aria-pressed={!!r.liked} aria-label={`Like, ${r.like || 'no likes'}`}>
            <Icon name="heart" size={20} className={r.liked ? 'fill-current' : ''} />{r.like ? <span className="tabular-nums">{r.like}</span> : null}
          </button>
          <span className="flex flex-wrap gap-0.5" role="group" aria-label="How does this make you feel?">
            {Object.entries(MOODS).map(([k, icon]) => {
              const n = r.moods?.[k] || 0;
              return (
                <button key={k} type="button" className={REACT} onClick={() => react(k)} disabled={busy} aria-pressed={r.myMood === k}
                  aria-label={`${MOOD_LABEL[k] ?? k}, ${n || 'no reactions'}`} title={MOOD_LABEL[k] ?? k}>
                  <Icon name={icon} size={20} />{n ? <span className="tabular-nums">{n}</span> : null}
                </button>
              );
            })}
          </span>
          <button type="button" className={REACT} onClick={() => setShowComments(!showComments)} aria-expanded={showComments} aria-label={commentLabel(post.commentCount || 0, post.type === 'question')}>
            <Icon name="channels" size={20} />
            {/* Phones show the count only, so the row stays on one line; the name is the full label. */}
            {post.commentCount ? <span className="tabular-nums sm:hidden">{post.commentCount}</span> : null}
            <span className="hidden sm:inline">{commentLabel(post.commentCount || 0, post.type === 'question')}</span>
          </button>
          <span className="flex-1" />
          <IconButton icon="bookmarks" label="Save post" size="sm" aria-pressed={bookmarked} disabled={busy} onClick={save}
            className={`!border-0 !bg-transparent hover:!bg-[var(--az-sunken)] ${bookmarked ? 'text-[var(--az-link)]' : 'text-[var(--az-text-2)]'}`} />
        </footer>
      )}
      {published && !embedded && !guest && showComments && <Comments post={post} />}

      {modal === 'edit' && <Modal title="Edit post" onClose={close} wide><Composer initial={post} onDone={close} /></Modal>}
      {modal === 'report' && <ReportDialog targetType="post" targetId={post.id} communityId={post.communityId} communityName={post.community?.name} onClose={close} />}
      {(modal === 'remove' || modal === 'reject') && <RemoveDialog post={post} reject={modal === 'reject'} onClose={close} />}
    </article>
  );
}

/** The post actions menu: closes on Escape, a click outside, Tab or a choice; arrows move through it. */
function PostMenu({ items, modItems }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const button = useRef(null);
  const list = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    list.current?.querySelector('[role="menuitem"]')?.focus();
    const onDown = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const onKey = (e) => {
    const all = [...(list.current?.querySelectorAll('[role="menuitem"]') ?? [])];
    const i = all.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); all[(n + all.length) % all.length]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); }
    else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(all.length - 1);
    else if (e.key === 'Tab') setOpen(false);
  };
  const pick = (fn) => { setOpen(false); button.current?.focus(); fn(); };
  const row = (it) => (
    <button key={it.label} type="button" role="menuitem" tabIndex={-1} onClick={() => pick(it.fn)}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium hover:bg-[var(--az-sunken)] focus-visible:bg-[var(--az-sunken)] ${it.danger ? 'text-[var(--az-danger)]' : 'text-[var(--az-text)]'}`}>
      <Icon name={it.icon} size={18} />{it.label}
    </button>
  );
  return (
    <div className="relative" ref={wrap}>
      <button ref={button} type="button" aria-label="Post actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="btn btn-ghost btn-icon btn-sm !border-0 !bg-transparent text-[var(--az-text)] hover:!bg-[var(--az-sunken)]">
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div ref={list} role="menu" aria-label="Post actions" onKeyDown={onKey}
          className="absolute right-0 z-20 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-[10px] border border-[var(--az-hairline)] bg-[var(--az-raised)] p-1.5 shadow-[var(--az-shadow)]">
          {items.map(row)}
          {modItems.length > 0 && (
            <div role="group" aria-label="Moderation">
              {items.length > 0 && <div role="separator" className="my-1.5 h-px bg-[var(--az-divider)]" />}
              <div className="t-label px-2.5 pb-0.5 pt-1.5" aria-hidden="true">Moderation</div>
              {modItems.map(row)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A post's images (shown inline, opened full size) and PDFs (download rows). */
function Attachments({ list }) {
  const images = list.filter((f) => f.kind === 'image');
  const docs = list.filter((f) => f.kind !== 'image');
  const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
          {images.map((f) => (
            <a key={f.id} href={`/api/files/${f.id}?inline=1`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name} full size`}
              className="block overflow-hidden rounded-xl border border-[var(--az-divider)] bg-[var(--az-sunken)]">
              <img src={`/api/files/${f.id}?inline=1`} alt={f.alt || f.name} loading="lazy" className={`w-full object-cover ${images.length > 1 ? 'aspect-square' : 'max-h-96'}`} />
            </a>
          ))}
        </div>
      )}
      {docs.map((f) => (
        <a key={f.id} href={`/api/files/${f.id}`} download className="sunken flex items-center gap-3 px-3 py-2.5 text-sm text-[var(--az-text)] hover:border-[var(--az-hairline)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[var(--az-control)] text-xs font-bold">PDF</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
          <span className="t-small shrink-0">{mb(f.size)}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-[var(--az-link)]"><Icon name="download" size={16} /><span className="hidden sm:inline">Download</span></span>
        </a>
      ))}
    </div>
  );
}
