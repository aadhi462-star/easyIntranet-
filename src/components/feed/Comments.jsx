import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { timeAgo, uid, useStore } from '../../lib/store.jsx';
import { summarize } from '../../lib/assist.js';
import { Avatar, UserLink } from '../ui.jsx';
import RichText from './RichText.jsx';

/** Threaded comments. On questions they act as answers with upvotes and a best answer. */
export default function Comments({ post }) {
  const { dispatch, me, user } = useStore();
  const isQ = post.type === 'question';
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reply, setReply] = useState('');
  const [summary, setSummary] = useState(null);

  const top = post.comments.filter((c) => !c.parentId);
  const sorted = isQ
    ? [...top].sort((a, b) => (b.id === post.bestAnswerId) - (a.id === post.bestAnswerId) || (b.upvotes?.length || 0) - (a.upvotes?.length || 0))
    : top;
  const childrenOf = (id) => post.comments.filter((c) => c.parentId === id);

  const patch = (fn) => dispatch({ type: 'update', col: 'posts', id: post.id, patch: fn });
  const upvote = (cid) => patch((p, meId) => ({ ...p, comments: p.comments.map((c) => (c.id === cid
    ? { ...c, upvotes: (c.upvotes || []).includes(meId) ? c.upvotes.filter((x) => x !== meId) : [...(c.upvotes || []), meId] } : c)) }));
  const markBest = (c) => {
    patch({ bestAnswerId: post.bestAnswerId === c.id ? null : c.id });
    if (post.bestAnswerId !== c.id && c.authorId !== me.id) {
      dispatch({ type: 'notify', notification: { userId: c.authorId, kind: 'like', link: `/post/${post.id}`, text: `${me.name} marked your answer as the best answer` } });
    }
  };
  const notifyAuthor = (verb) => post.authorId !== me.id && dispatch({ type: 'notify',
    notification: { userId: post.authorId, kind: 'comment', link: `/post/${post.id}`, text: `${me.name} ${verb} your post` } });

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    dispatch({ type: 'post/comment', id: post.id, text: text.trim() });
    notifyAuthor(isQ ? 'answered' : 'commented on');
    setText('');
  };
  const sendReply = (e, parent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    const c = { id: uid('c'), authorId: me.id, text: reply.trim(), createdAt: Date.now(), parentId: parent.id, upvotes: [] };
    patch((p) => ({ ...p, comments: [...p.comments, c] }));
    if (parent.authorId !== me.id) dispatch({ type: 'notify', notification: { userId: parent.authorId, kind: 'comment', link: `/post/${post.id}`, text: `${me.name} replied to your comment` } });
    setReply(''); setReplyTo(null);
  };
  const summarizeThread = async () => {
    setSummary({ loading: true });
    setSummary(await summarize([post.text, ...post.comments.map((c) => c.text)].join('\n')));
  };

  // Plain render function (not a component) so the reply input keeps focus across renders.
  const item = (c, depth = 0) => {
    const best = isQ && c.id === post.bestAnswerId;
    return (
      <li key={c.id} className={depth ? 'ml-10 mt-2' : 'mt-3'}>
        <div className="flex gap-2.5">
          <Avatar user={user(c.authorId)} size={depth ? 28 : 32} />
          <div className="min-w-0 flex-1">
            <div className={`rounded-xl px-3 py-2 ${best ? 'bg-emerald-500/10 ring-1 ring-emerald-400/40' : 'bg-white/5'}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <UserLink id={c.authorId} /><span className="text-slate-500">{timeAgo(c.createdAt)}</span>
                {best && <span className="chip !bg-emerald-500/20 !text-emerald-200">✔ Best answer</span>}
              </div>
              <RichText text={c.text} className="mt-1 text-sm text-slate-200" />
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-400">
              <button className="min-h-8 rounded px-2 hover:bg-white/5" onClick={() => upvote(c.id)} aria-pressed={(c.upvotes || []).includes(me.id)}>
                ▲ {isQ ? 'Upvote' : 'Like'} {c.upvotes?.length || ''}
              </button>
              {!depth && <button className="min-h-8 rounded px-2 hover:bg-white/5" onClick={() => { setReplyTo(c.id); setReply(''); }}>Reply</button>}
              {isQ && !depth && post.authorId === me.id && (
                <button className="min-h-8 rounded px-2 hover:bg-white/5" onClick={() => markBest(c)}>{best ? 'Unmark best' : 'Mark as best answer'}</button>
              )}
            </div>
            {childrenOf(c.id).length > 0 && <ul>{childrenOf(c.id).map((r) => item(r, 1))}</ul>}
            {replyTo === c.id && (
              <form onSubmit={(e) => sendReply(e, c)} className="ml-0 mt-2 flex gap-2">
                <input autoFocus className="input !py-2 text-sm" placeholder={`Reply to ${user(c.authorId)?.name}…`} value={reply} onChange={(e) => setReply(e.target.value)} />
                <button className="btn btn-primary">Reply</button>
              </form>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mt-3 border-t border-white/5 pt-2">
      {post.comments.length >= 3 && (
        <div className="mb-1">
          <button className="text-xs text-brand-400 hover:underline" onClick={summarizeThread}><Glyph value="✨" tile={false} size={16} /> Summarize this thread</button>
          {summary && <p className="mt-2 rounded-xl bg-brand-500/10 p-3 text-sm text-slate-200">{summary.loading ? 'Smart Assist is reading the thread…' : <>{summary.text} <span className="text-xs text-slate-400">({summary.source})</span></>}</p>}
        </div>
      )}
      <ul>{sorted.map((c) => item(c))}</ul>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input className="input !py-2 text-sm" placeholder={isQ ? 'Write an answer…' : 'Write a comment…'} value={text} onChange={(e) => setText(e.target.value)} aria-label={isQ ? 'Answer' : 'Comment'} />
        <button className="btn btn-primary" disabled={!text.trim()}>{isQ ? 'Answer' : 'Send'}</button>
      </form>
    </div>
  );
}
