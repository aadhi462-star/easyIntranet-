import { useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { Field, Tabs, UserLink } from '../ui.jsx';

/** Finds the reported content so moderators can see it and remove it. */
function resolve(state, flag) {
  switch (flag.kind) {
    case 'post': { const p = state.posts.find((x) => x.id === flag.refId); return p && { text: p.text, authorId: p.authorId, link: `/post/${p.id}` }; }
    case 'forum': { const f = state.forumPosts.find((x) => x.id === flag.refId); return f && { text: `${f.title} — ${f.body}`, authorId: f.authorId, link: `/forums/${f.id}` }; }
    case 'comment': {
      for (const p of state.posts) { const c = p.comments.find((x) => x.id === flag.refId); if (c) return { text: c.text, authorId: c.authorId, link: `/post/${p.id}`, postId: p.id }; }
      return null;
    }
    case 'idea': { const i = (state.ideas || []).find((x) => x.id === flag.refId); return i && { text: `${i.title} — ${i.description ?? ''}`, authorId: i.authorId, link: `/ideas/${i.id}` }; }
    default: return null;
  }
}

function removeContent(dispatch, flag, target) {
  if (flag.kind === 'post') dispatch({ type: 'post/delete', id: flag.refId });
  else if (flag.kind === 'forum') dispatch({ type: 'forum/delete', id: flag.refId });
  else if (flag.kind === 'comment') dispatch({ type: 'update', col: 'posts', id: target.postId, patch: (p) => ({ ...p, comments: p.comments.filter((c) => c.id !== flag.refId) }) });
  else if (flag.kind === 'idea') dispatch({ type: 'remove', col: 'ideas', id: flag.refId });
}

export default function Moderation() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState('flags');
  const flags = state.flags || [];
  const pendingPosts = state.posts.filter((p) => p.status === 'pending');
  const mod = { requireApproval: false, newMemberHoldDays: 0, bannedWords: [], whitelist: [], ...state.settings.moderation };
  const setMod = (patch) => dispatch({ type: 'set', key: 'settings', value: (s) => ({ ...s, moderation: { ...mod, ...s.moderation, ...patch } }) });
  const [word, setWord] = useState('');
  const [wl, setWl] = useState('');
  const open = flags.filter((f) => f.status === 'open');

  return (
    <div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'flags', label: 'Reported', count: open.length },
        { id: 'approval', label: 'Awaiting approval', count: pendingPosts.length },
        { id: 'rules', label: 'Rules' },
      ]} />

      {tab === 'flags' && (
        flags.length === 0 ? <p className="glass p-6 text-sm text-slate-400">No reports. 🎉</p> : (
          <ul className="space-y-3">
            {[...open, ...flags.filter((f) => f.status !== 'open')].map((f) => {
              const target = resolve(state, f);
              return (
                <li key={f.id} className={`glass p-4 ${f.status !== 'open' ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="chip">{f.kind}</span><span>Reported by <UserLink id={f.reporterId} /> · {timeAgo(f.createdAt)}</span>
                    <span className={`ml-auto font-semibold ${f.status === 'open' ? 'text-amber-200' : 'text-slate-400'}`}>{f.status}</span>
                  </div>
                  <p className="mt-2 text-sm"><b>Reason:</b> {f.reason}</p>
                  {target ? (
                    <blockquote className="mt-2 rounded-lg bg-white/5 p-3 text-sm text-slate-300">
                      <span className="line-clamp-3">{target.text}</span>
                      <span className="mt-1 block text-xs">by <UserLink id={target.authorId} /> · <Link to={target.link} className="text-brand-400 hover:underline">View in context</Link></span>
                    </blockquote>
                  ) : <p className="mt-2 text-xs text-slate-500">The content has already been removed.</p>}
                  {f.status === 'open' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn btn-ghost h-10" onClick={() => dispatch({ type: 'update', col: 'flags', id: f.id, patch: { status: 'dismissed' } })}>Dismiss</button>
                      {target && <button className="btn h-10 bg-rose-500/80 text-white hover:bg-rose-500" onClick={() => {
                        if (!confirm('Remove this content for everyone?')) return;
                        removeContent(dispatch, f, target);
                        dispatch({ type: 'update', col: 'flags', id: f.id, patch: { status: 'removed' } });
                        dispatch({ type: 'notify', silent: true, notification: { userId: target.authorId, kind: 'info', link: '/manuals', text: 'A moderator removed your content for breaking the community guidelines.' } });
                      }}>Remove content</button>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      {tab === 'approval' && (
        pendingPosts.length === 0 ? <p className="glass p-6 text-sm text-slate-400">No posts are waiting for approval.</p> : (
          <ul className="space-y-3">
            {pendingPosts.map((p) => (
              <li key={p.id} className="glass p-4">
                <div className="text-xs text-slate-400"><UserLink id={p.authorId} /> · {timeAgo(p.createdAt)} · {p.scope?.type === 'group' ? state.groups.find((g) => g.id === p.scope.id)?.name : 'Network wall'}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{p.text}</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary h-10" onClick={() => {
                    dispatch({ type: 'update', col: 'posts', id: p.id, patch: { status: 'published', createdAt: Date.now() } });
                    dispatch({ type: 'notify', silent: true, notification: { userId: p.authorId, kind: 'info', link: `/post/${p.id}`, text: 'Your post was approved and is now live.' } });
                  }}>Approve</button>
                  <button className="btn btn-ghost h-10" onClick={() => {
                    dispatch({ type: 'post/delete', id: p.id });
                    dispatch({ type: 'notify', silent: true, notification: { userId: p.authorId, kind: 'info', link: '/feed', text: 'A moderator declined your post.' } });
                  }}>Decline</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === 'rules' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass space-y-3 p-5">
            <h3 className="font-bold">Approval</h3>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={mod.requireApproval} onChange={(e) => setMod({ requireApproval: e.target.checked })} />Hold every new post for moderator approval</label>
            <Field label="Hold posts from members who joined in the last N days" hint="0 turns this off. Whitelisted members and admins are never held.">
              <input className="input !w-32" type="number" min="0" value={mod.newMemberHoldDays} onChange={(e) => setMod({ newMemberHoldDays: Math.max(0, Number(e.target.value)) })} />
            </Field>
            <p className="text-xs text-slate-500">The post editor reads <code>settings.moderation</code> and saves held posts with status “pending”.</p>
          </section>
          <section className="glass space-y-3 p-5">
            <h3 className="font-bold">Banned words</h3>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const w = word.trim().toLowerCase(); if (w && !mod.bannedWords.includes(w)) setMod({ bannedWords: [...mod.bannedWords, w] }); setWord(''); }}>
              <input className="input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a word or phrase" aria-label="Banned word" />
              <button className="btn btn-primary">Add</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {mod.bannedWords.length === 0 && <span className="text-sm text-slate-500">None yet.</span>}
              {mod.bannedWords.map((w) => <button key={w} className="chip min-h-9 !px-3" onClick={() => setMod({ bannedWords: mod.bannedWords.filter((x) => x !== w) })} aria-label={`Remove ${w}`}>{w} ✕</button>)}
            </div>
          </section>
          <section className="glass space-y-3 p-5 lg:col-span-2">
            <h3 className="font-bold">Whitelisted members</h3>
            <p className="text-xs text-slate-500">Their posts skip approval and banned-word checks.</p>
            <div className="flex gap-2">
              <select className="input" value={wl} onChange={(e) => setWl(e.target.value)} aria-label="Member to whitelist">
                <option value="">Choose a member…</option>
                {state.users.filter((u) => !mod.whitelist.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button className="btn btn-primary" disabled={!wl} onClick={() => { setMod({ whitelist: [...mod.whitelist, wl] }); setWl(''); }}>Add</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {mod.whitelist.map((id) => <button key={id} className="chip min-h-9 !px-3" onClick={() => setMod({ whitelist: mod.whitelist.filter((x) => x !== id) })}>{state.users.find((u) => u.id === id)?.name ?? id} ✕</button>)}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
