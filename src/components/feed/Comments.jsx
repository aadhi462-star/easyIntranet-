import { useEffect, useRef, useState } from 'react';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { newKey } from '../../lib/api.js';
import { addComment, authorUser, deleteComment, errorText, loadComments } from '../../lib/feed.js';
import { Avatar } from '../ui.jsx';
import RichText from './RichText.jsx';
import { AuthorName } from './PostCard.jsx';

const MAX = 2000;

/**
 * Threaded comments from the server (one level of replies). On questions they read as answers.
 * Deleted comments stay as placeholders so their replies keep their thread.
 */
export default function Comments({ post }) {
  const { user } = useStore();
  const isQ = post.type === 'question';
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
    if (busy || !confirm('Delete this comment?')) return;
    setBusy(true); setError('');
    try { await deleteComment(post.id, c.id); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  if (!comments) {
    return (
      <div className="mt-3 border-t border-white/5 pt-2 text-sm text-3">
        {loadError ? <p role="alert" className="text-rose-300">{loadError} <button className="text-brand-400 underline" onClick={load}>Try again</button></p> : 'Loading comments…'}
      </div>
    );
  }

  const top = comments.filter((c) => !c.parentId);
  const childrenOf = (id) => comments.filter((c) => c.parentId === id);

  // Plain render function (not a component) so the reply input keeps focus across renders.
  const item = (c, depth = 0) => {
    const kids = childrenOf(c.id);
    if (c.deleted) {
      return (
        <li key={c.id} className={depth ? 'ml-10 mt-2' : 'mt-3'}>
          <p className="rounded-xl bg-white/[.03] px-3 py-2 text-xs italic text-3">Comment deleted</p>
          {kids.length > 0 && <ul>{kids.map((r) => item(r, 1))}</ul>}
        </li>
      );
    }
    return (
      <li key={c.id} className={depth ? 'ml-10 mt-2' : 'mt-3'}>
        <div className="flex gap-2.5">
          <Avatar user={authorUser(c.author, user)} size={depth ? 28 : 32} />
          <div className="min-w-0 flex-1">
            <div className="rounded-xl bg-white/5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <AuthorName author={c.author} /><span className="text-3">{timeAgo(new Date(c.createdAt).getTime())}</span>
                {c.editedAt && <span className="text-3">· edited</span>}
              </div>
              <RichText text={c.body} className="mt-1 text-sm text-[var(--az-text)]" />
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-3">
              {!depth && <button className="min-h-8 rounded px-2 hover:bg-white/5" onClick={() => { setReplyTo(c.id); setReply(''); }}>Reply</button>}
              {c.can?.delete && <button className="min-h-8 rounded px-2 text-rose-300 hover:bg-white/5" disabled={busy} onClick={() => remove(c)}>Delete</button>}
            </div>
            {kids.length > 0 && <ul>{kids.map((r) => item(r, 1))}</ul>}
            {replyTo === c.id && (
              <form onSubmit={(e) => send(e, c.id)} className="ml-0 mt-2 flex gap-2">
                <input autoFocus className="input !py-2 text-sm" maxLength={MAX} placeholder={`Reply to ${c.author?.deleted ? 'Deleted member' : c.author?.name ?? 'member'}…`} value={reply} onChange={(e) => setReply(e.target.value)} />
                <button className="btn btn-primary" disabled={busy || !reply.trim()}>Reply</button>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mt-3 border-t border-white/5 pt-2">
      {top.length === 0 && <p className="mt-2 text-xs text-3">{isQ ? 'No answers yet.' : 'No comments yet.'}</p>}
      <ul>{top.map((c) => item(c))}</ul>
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className="input !py-2 text-sm" maxLength={MAX} placeholder={isQ ? 'Write an answer…' : 'Write a comment…'} value={text} onChange={(e) => setText(e.target.value)} aria-label={isQ ? 'Answer' : 'Comment'} />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>{isQ ? 'Answer' : 'Send'}</button>
      </form>
    </div>
  );
}
