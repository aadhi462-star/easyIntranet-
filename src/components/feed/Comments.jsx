import { useEffect, useRef, useState } from 'react';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { newKey } from '../../lib/api.js';
import { addComment, authorUser, deleteComment, errorText, loadComments } from '../../lib/feed.js';
import { Avatar } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { IconButton, Skeleton } from '../ui/Controls.jsx';
import RichText from './RichText.jsx';
import ReportDialog from '../manage/Report.jsx';
import { AuthorName } from './PostCard.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const MAX = 2000;

/**
 * Threaded comments from the server (one level of replies). On questions they read as answers.
 * Deleted comments stay as placeholders so their replies keep their thread (CNT-07).
 */
export default function Comments({ post }) {
  const { user, me } = useStore();
  const [reporting, setReporting] = useState(null);
  const isQ = post.type === 'question';
  const noun = isQ ? 'answer' : 'comment';
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  // One idempotency key per comment being written; a new one after each successful send.
  const keys = useRef({ top: newKey(), reply: newKey() });
  const comments = post.comments;

  const load = () => { setLoadError(''); loadComments(post.id).catch((e) => setLoadError(errorText(e))); };
  useEffect(() => { if (!comments) load(); }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e, parentId = null) => {
    e.preventDefault();
    const body = (parentId ? reply : text).trim();
    if (!body || busy) return;
    if (body.length > MAX) { setError(`Comments can be up to ${MAX} characters.`); return; }
    setBusy(true); setError('');
    const slot = parentId ? 'reply' : 'top';
    try {
      await addComment(post.id, { body, parentId }, keys.current[slot]);
      keys.current[slot] = newKey();
      if (parentId) { setReply(''); setReplyTo(null); } else setText('');
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    if (busy || !(await confirmAction(`Delete this ${c.parentId ? 'reply' : noun}?`))) return;
    setBusy(true); setError('');
    try { await deleteComment(post.id, c.id); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  if (!comments) {
    return (
      <div className="pt-1">
        {loadError ? (
          <p role="alert" className="notice notice-bad flex flex-wrap items-center gap-3"><span className="flex-1">{loadError}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Try again</button></p>
        ) : <Skeleton lines={2} label={isQ ? 'Loading answers' : 'Loading comments'} />}
      </div>
    );
  }

  const top = comments.filter((c) => !c.parentId);
  const childrenOf = (id) => comments.filter((c) => c.parentId === id);
  const bubble = (c) => (
    <div className="min-w-0 flex-1 rounded-xl bg-[var(--az-sunken)] px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
        <AuthorName author={c.author} />
        <span className="t-small">· {timeAgo(new Date(c.createdAt).getTime())}{c.editedAt ? ' · edited' : ''}</span>
      </div>
      <RichText text={c.body} className="mt-0.5 text-sm leading-[22px] text-[var(--az-text)]" />
    </div>
  );

  // Plain render function (not a component) so the reply input keeps focus across renders.
  const item = (c, depth = 0) => {
    const kids = childrenOf(c.id);
    const what = depth ? 'reply' : noun;
    const replies = kids.length > 0 && <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-[var(--az-divider)] pl-2.5">{kids.map((r) => item(r, 1))}</ul>;
    if (c.deleted) {
      return (
        <li key={c.id}>
          <div className="flex gap-2.5">
            {!depth && <span className="h-7 w-7 shrink-0" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="t-small rounded-xl border border-dashed border-[var(--az-control)] px-3.5 py-2.5 italic">This {what} was deleted.</p>
              {replies}
            </div>
          </div>
        </li>
      );
    }
    const others = me && c.author?.id && c.author.id !== me.id;
    return (
      <li key={c.id}>
        <div className="flex gap-2.5">
          <Avatar user={authorUser(c.author, user)} size={28} />
          <div className="min-w-0 flex-1">
            {bubble(c)}
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {!depth && (
                <button type="button" className="btn btn-ghost btn-sm !border-0 !bg-transparent text-[var(--az-text-2)] hover:!bg-[var(--az-sunken)]" onClick={() => { setReplyTo(c.id); setReply(''); }}>
                  <Icon name="reply" size={16} /> Reply
                </button>
              )}
              {c.can?.delete && (
                <button type="button" className="btn btn-ghost btn-sm !border-0 !bg-transparent text-[var(--az-danger)] hover:!bg-[var(--az-sunken)]" disabled={busy} onClick={() => remove(c)}>Delete</button>
              )}
              {others && <IconButton icon="flag" size="sm" label={`Report this ${what}`} className="!border-0 !bg-transparent text-[var(--az-text-2)] hover:!bg-[var(--az-sunken)]" onClick={() => setReporting(c.id)} />}
            </div>
            {replies}
            {replyTo === c.id && (
              <form onSubmit={(e) => send(e, c.id)} className="mt-2 flex gap-2" aria-label={`Reply to ${c.author?.deleted ? 'Deleted member' : c.author?.name ?? 'member'}`}>
                <input autoFocus className="input min-w-0" maxLength={MAX} aria-label="Your reply"
                  placeholder={`Reply to ${c.author?.deleted ? 'Deleted member' : c.author?.name ?? 'member'}`} value={reply} onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setReplyTo(null); }} />
                <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !reply.trim()}>Reply</button>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section aria-label={isQ ? 'Answers' : 'Comments'} className="flex flex-col gap-3.5 pt-1">
      {top.length === 0 && <p className="t-small">{isQ ? 'No answers yet.' : 'No comments yet.'}</p>}
      {top.length > 0 && <ul className="flex flex-col gap-3.5">{top.map((c) => item(c))}</ul>}
      {error && <p role="alert" className="notice notice-bad">{error}</p>}
      <form onSubmit={send} className="flex items-center gap-2.5" aria-label={isQ ? 'Write an answer' : 'Write a comment'}>
        {me && <span className="hidden sm:block"><Avatar user={me} size={28} /></span>}
        <label className="min-w-0 flex-1">
          <span className="sr-only">{isQ ? 'Your answer' : 'Your comment'}</span>
          <input className="input" maxLength={MAX} placeholder={isQ ? 'Write an answer' : 'Write a comment'} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary shrink-0" disabled={busy || !text.trim()}>{isQ ? 'Answer' : 'Send'}</button>
      </form>
      {reporting && <ReportDialog targetType="comment" targetId={reporting} communityId={post.communityId} communityName={post.community?.name} onClose={() => setReporting(null)} />}
    </section>
  );
}
