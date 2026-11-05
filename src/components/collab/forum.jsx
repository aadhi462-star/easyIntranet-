import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, timeAgo } from '../../lib/store.jsx';
import { Avatar, Field, Modal, UserLink } from '../ui.jsx';
import { Menu, Prose, Select, slugify } from './common.jsx';

export const canPostIn = (cat, me) => !cat || cat.whoCanPost !== 'admins' || me?.admin;

export function ForumEditor({ post, groupId, defaultCategory, onClose }) {
  const { state, dispatch, me } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [cats, setCats] = useState(post?.categories ?? (defaultCategory ? [defaultCategory] : []));
  const [commentsDisabled, setCD] = useState(post?.commentsDisabled ?? false);
  const [showCats, setShowCats] = useState(false);
  const [gear, setGear] = useState(false);
  const allowed = state.forumCategories.filter((c) => canPostIn(c, me));

  const save = (status) => {
    if (!title.trim()) return;
    const data = { title: title.trim(), body, categories: cats, commentsDisabled, status, groupId: post?.groupId ?? groupId ?? null };
    dispatch({ type: 'forum/save', post: post ? { ...data, id: post.id } : data });
    onClose();
    if (status === 'published' && post) nav(`/forums/${post.id}`);
  };

  // Closing the editor with content keeps it as a draft, as in Connect.
  const close = () => { if (!post && title.trim()) save('draft'); else onClose(); };

  return (
    <Modal title={post ? 'Edit forum post' : 'New forum post'} onClose={close} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" className="btn btn-ghost" onClick={() => setShowCats(!showCats)} aria-expanded={showCats}>
            🏷️ {cats.length ? `${cats.length} categor${cats.length > 1 ? 'ies' : 'y'}` : 'Choose Category'}
          </button>
          {showCats && (
            <div className="glass glass-strong absolute left-0 z-30 mt-1 w-60 p-2">
              {allowed.map((c) => (
                <label key={c.id} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-white/5">
                  <input type="checkbox" checked={cats.includes(c.id)} onChange={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])} />{c.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" className="btn btn-ghost h-10 w-10 !p-0" aria-label="Post settings" onClick={() => setGear(!gear)}><Glyph value="⚙️" tile={false} size={16} /></button>
          {gear && (
            <div className="glass glass-strong absolute left-0 z-30 mt-1 w-56 p-1.5">
              <button className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-white/5" onClick={() => { setCD(!commentsDisabled); setGear(false); }}>
                {commentsDisabled ? 'Enable Comments' : 'Disable Comments'}
              </button>
            </div>
          )}
        </div>
        {commentsDisabled && <span className="chip !bg-amber-400/15 !text-amber-200">Comments off</span>}
      </div>
      <div className="space-y-3">
        <input className="input text-lg font-semibold" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        <textarea className="input min-h-48" placeholder="Write your post. Use ## for headings and - for bullets." value={body} onChange={(e) => setBody(e.target.value)} aria-label="Body" />
      </div>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <p className="self-center text-xs text-slate-500">{post ? '' : 'Closing this editor saves your post to My Drafts.'}</p>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => save('draft')} disabled={!title.trim()}>Save draft</button>
          <button className="btn btn-primary" onClick={() => save('published')} disabled={!title.trim()}>Publish</button>
        </div>
      </div>
    </Modal>
  );
}

export function CategoryModal({ category, onClose }) {
  const { dispatch } = useStore();
  const [name, setName] = useState(category?.name ?? '');
  const [autoFollow, setAF] = useState(category?.autoFollow ?? false);
  const [whoCanPost, setWho] = useState(category?.whoCanPost ?? 'everyone');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const finalSlug = slug || slugify(name);
  const save = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data = { name: name.trim(), autoFollow, whoCanPost, slug: finalSlug };
    if (category) dispatch({ type: 'update', col: 'forumCategories', id: category.id, patch: data });
    else dispatch({ type: 'forum/category', category: data });
    onClose();
  };
  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Title"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoFollow} onChange={(e) => setAF(e.target.checked)} /> Show posts in everyone’s feed</label>
        <Field label="Who can share posts under this category">
          <Select value={whoCanPost} onChange={setWho} options={[['everyone', 'All members'], ['admins', 'Admins only']]} label="Who can post" />
        </Field>
        {category && (
          <Field label="Category URL" hint={`Preview: #/forums/${finalSlug}`}>
            <input className="input" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={slugify(name)} />
          </Field>
        )}
        <button className="btn btn-primary w-full">{category ? 'Update' : 'Create'}</button>
      </form>
    </Modal>
  );
}

export function ForumCard({ post }) {
  const { state, dispatch, me, user } = useStore();
  const cats = state.forumCategories.filter((c) => post.categories.includes(c.id));
  const voted = post.upvotes.includes(me.id);
  return (
    <article className="glass flex gap-4 p-4 sm:p-5">
      <button onClick={() => dispatch({ type: 'forum/upvote', id: post.id })} aria-pressed={voted} aria-label={`Upvote, ${post.upvotes.length} votes`}
        className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold ring-1 ${voted ? 'bg-brand-500/25 text-white ring-brand-500' : 'ring-white/10 hover:bg-white/5'}`}>
        ▲<span>{post.upvotes.length}</span>
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/forums/${post.id}`} className="font-semibold text-white hover:underline">{post.title}</Link>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{post.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <Avatar user={user(post.authorId)} size={20} /> {user(post.authorId)?.name} · {timeAgo(post.createdAt)}
          {cats.map((c) => <Link key={c.id} to={`/forums/${c.slug || c.id}`} className="chip">{c.name}</Link>)}
          <span><Glyph value="💬" tile={false} size={16} /> {post.replies.length}</span>
          {post.bestReplyId && <span className="chip !bg-emerald-500/15 !text-emerald-200">✓ Answered</span>}
          {post.commentsDisabled && <span><Glyph value="🔇" tile={false} size={16} /></span>}
        </div>
      </div>
    </article>
  );
}

export function ForumPostView({ post }) {
  const { state, dispatch, me, user } = useStore();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [reply, setReply] = useState('');
  const cats = state.forumCategories.filter((c) => post.categories.includes(c.id));
  const mine = post.authorId === me.id;
  const replies = [...post.replies].sort((a, b) => (b.id === post.bestReplyId) - (a.id === post.bestReplyId));

  return (
    <div className="space-y-4">
      <Link to="/forums" className="text-sm text-brand-400 hover:underline">← All forums</Link>
      <article className="glass p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <Avatar user={user(post.authorId)} size={44} />
          <div className="flex-1">
            <h1 className="text-xl font-bold sm:text-2xl">{post.title}</h1>
            <div className="mt-1 text-sm text-slate-400"><UserLink id={post.authorId} /> · {timeAgo(post.createdAt)} {post.status === 'draft' && <span className="chip ml-1">Draft</span>}</div>
          </div>
          <Menu items={[
            { label: 'Edit', onClick: () => setEdit(true), hidden: !mine && !me.admin },
            { label: post.commentsDisabled ? 'Enable comments' : 'Disable comments', onClick: () => dispatch({ type: 'forum/save', post: { id: post.id, commentsDisabled: !post.commentsDisabled } }), hidden: !mine && !me.admin },
            { label: 'Delete', danger: true, onClick: () => { if (confirm('Delete this forum post?')) { dispatch({ type: 'forum/delete', id: post.id }); nav('/forums'); } }, hidden: !mine && !me.admin },
          ]} />
        </div>
        <div className="mt-5"><Prose text={post.body} /></div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {cats.map((c) => <Link key={c.id} to={`/forums/${c.slug || c.id}`} className="chip">{c.name}</Link>)}
          <button className={`btn ml-auto ${post.upvotes.includes(me.id) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => dispatch({ type: 'forum/upvote', id: post.id })}>▲ Upvote · {post.upvotes.length}</button>
        </div>
      </article>

      <section aria-label="Replies" className="space-y-3">
        <h2 className="font-semibold">{post.replies.length} {post.replies.length === 1 ? 'reply' : 'replies'}</h2>
        {replies.map((r) => (
          <div key={r.id} className={`glass p-4 ${r.id === post.bestReplyId ? 'ring-1 ring-emerald-400/60' : ''}`}>
            <div className="flex items-center gap-2 text-sm">
              <Avatar user={user(r.authorId)} size={28} /><UserLink id={r.authorId} /><span className="text-slate-500">· {timeAgo(r.createdAt)}</span>
              {r.id === post.bestReplyId && <span className="chip !bg-emerald-500/15 !text-emerald-200">✓ Best reply</span>}
              {mine && (
                <button className="ml-auto text-xs text-brand-400 hover:underline" onClick={() => dispatch({ type: 'forum/save', post: { id: post.id, bestReplyId: post.bestReplyId === r.id ? null : r.id } })}>
                  {r.id === post.bestReplyId ? 'Unmark best' : 'Mark as best'}
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{r.text}</p>
          </div>
        ))}
        {post.commentsDisabled ? (
          <p className="glass p-4 text-sm text-slate-400"><Glyph value="🔇" tile={false} size={16} /> The author turned off replies for this post.</p>
        ) : post.status === 'published' && (
          <form className="glass flex gap-2 p-3" onSubmit={(e) => {
            e.preventDefault(); if (!reply.trim()) return;
            dispatch({ type: 'forum/reply', id: post.id, text: reply.trim() });
            if (!mine) dispatch({ type: 'notify', notification: { userId: post.authorId, kind: 'forum', text: `${me.name} replied to “${post.title}”`, link: `/forums/${post.id}` } });
            setReply('');
          }}>
            <input className="input" placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="Reply" />
            <button className="btn btn-primary">Reply</button>
          </form>
        )}
      </section>
      {edit && <ForumEditor post={post} onClose={() => setEdit(false)} />}
    </div>
  );
}
