import UserLabels from '../UserLabels.jsx';
import { Glyph } from '../icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { LANGUAGES, summarize, translate } from '../../lib/zia.js';
import { Avatar, Modal, UserLink } from '../ui.jsx';
import Comments from './Comments.jsx';
import Composer from './Composer.jsx';
import { AckBox, MandatoryConfig, MandatoryReport } from './Mandatory.jsx';
import { AdvocacyReport, InsightsModal, ReportModal, RepostModal } from './PostModals.jsx';
import RichText from './RichText.jsx';
import { followingIds, GUEST, MOODS, needsApproval, scopeLabel, SHARE_TARGETS, statusOf } from './utils.js';

// Views are counted once per post per page load.
const seen = new Set();

/** `readOnly` (or no signed-in user) renders a guest view without any interaction. */
export default function PostCard({ post, expanded = false, embedded = false, readOnly = false }) {
  const { state, dispatch, me: signedIn, user } = useStore();
  const guest = readOnly || !signedIn;
  const me = signedIn ?? GUEST;
  const [showComments, setShowComments] = useState(expanded);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const [more, setMore] = useState(false);
  const [zia, setZia] = useState(null);
  const [lang, setLang] = useState('');
  const ref = useRef(null);
  const status = statusOf(post);
  const mine = post.authorId === me.id;
  const group = post.scope?.type === 'group' ? state.groups.find((g) => g.id === post.scope.id) : null;
  const canManageMandatory = post.scope?.type !== 'user' && (me.admin || !!group?.admins.includes(me.id));
  const canInsights = mine || me.admin;
  const original = post.repostOf ? state.posts.find((p) => p.id === post.repostOf) : null;
  const follows = followingIds(state, me).includes(post.authorId);

  useEffect(() => {
    if (guest || embedded || status !== 'published' || seen.has(post.id) || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || seen.has(post.id)) return;
      seen.add(post.id);
      dispatch({ type: 'update', col: 'posts', id: post.id, silent: true, patch: (p, meId) => ({ ...p, views: { ...p.views, [meId]: (p.views?.[meId] || 0) + 1 } }) });
      io.disconnect();
    }, { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [post.id, status, embedded, guest, dispatch]);

  const patch = (p) => dispatch({ type: 'update', col: 'posts', id: post.id, patch: p });
  const react = (mood) => patch((p, meId) => {
    const r = { ...p.reactions };
    if (r[meId] === mood) delete r[meId]; else r[meId] = mood;
    return { ...p, reactions: r };
  });
  const like = () => {
    dispatch({ type: 'post/like', id: post.id });
    if (!post.likes.includes(me.id) && !mine) dispatch({ type: 'notify', notification: { userId: post.authorId, kind: 'like', link: `/post/${post.id}`, text: `${me.name} liked your post` } });
  };
  const toggleFollow = () => {
    const f = (state.follows || []).find((x) => x.authorId === me.id && x.targetId === post.authorId);
    if (f) dispatch({ type: 'remove', col: 'follows', id: f.id });
    else dispatch({ type: 'add', col: 'follows', item: { targetId: post.authorId } });
  };
  const approve = () => {
    patch({ status: 'published', createdAt: Date.now() });
    dispatch({ type: 'notify', notification: { userId: post.authorId, kind: 'info', link: `/post/${post.id}`, text: 'Your post was approved and published' } });
  };
  const share = (k) => {
    const t = SHARE_TARGETS[k];
    window.open(t.url(post.advocacy.url, post.advocacy.tweet), '_blank', 'noopener,noreferrer');
    patch((p, meId) => ({ ...p, advocacy: { ...p.advocacy, shares: { ...p.advocacy.shares, [k]: [...new Set([...(p.advocacy.shares?.[k] || []), meId])] } } }));
  };
  const doSummary = async () => { setZia({ loading: true }); setZia({ kind: 'summary', ...(await summarize(post.text)) }); };
  const doTranslate = async (l) => {
    setLang(l);
    if (!l) { setZia(null); return; }
    setZia({ loading: true });
    const r = await translate(post.text, l);
    setZia({ kind: 'translation', text: r.text ?? 'Translation isn’t available in this browser. Chrome’s on-device Translator is needed.', source: r.source });
  };
  const close = () => setModal(null);
  const item = (label, fn, cls = '') => (
    <button key={label} className={`block min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-white/5 ${cls}`} onClick={() => { setMenu(false); fn(); }}>{label}</button>
  );

  const long = post.text.length > 400 && !expanded;
  const text = long && !more ? `${post.text.slice(0, 400).trimEnd()}…` : post.text;
  const images = (post.attachments || []).filter((a) => a.type?.startsWith('image/'));
  const files = (post.attachments || []).filter((a) => !a.type?.startsWith('image/'));
  const totalVotes = post.poll?.options.reduce((n, o) => n + o.votes.length, 0) ?? 0;
  const myMood = post.reactions?.[me.id];

  return (
    <article ref={ref} className={`${embedded ? 'rounded-xl border border-white/10 bg-white/[.03] p-4' : 'glass p-4 sm:p-5'} ${post.pinned && !embedded ? 'ring-1 ring-brand-500/40' : ''}`} aria-label={`Post by ${user(post.authorId)?.name}`}>
      <header className="flex flex-wrap items-start gap-3">
        <Link to={`/people/${post.authorId}`} aria-hidden="true" tabIndex={-1}><Avatar user={user(post.authorId)} size={embedded ? 32 : 42} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
            <UserLink id={post.authorId} />
            <UserLabels userId={post.authorId} context="post" max={2} small />
            {post.scope?.type !== 'network' && <span className="text-slate-400">▸ {group ? <Link className="hover:underline" to={`/groups/${group.id}`}>{group.emoji} {group.name}</Link> : scopeLabel(state, post.scope)}</span>}
          </div>
          <div className="text-xs text-slate-400">
            <Link to={`/post/${post.id}`} className="hover:underline">{status === 'scheduled' ? `Scheduled for ${fmtDate(post.publishAt)}` : timeAgo(post.createdAt)}</Link>
            {post.editedAt && ' · edited'}{user(post.authorId)?.role && ` · ${user(post.authorId).role}`}
          </div>
        </div>
        {/* On narrow cards the badges wrap onto their own row so they never squeeze the author name. */}
        <div className="order-last flex w-full flex-wrap gap-1 sm:order-none sm:w-auto sm:justify-end">
          {post.pinned && <span className="chip"><Glyph value="📌" tile={false} size={16} /> Pinned</span>}
          {post.type === 'announcement' && <span className="chip !bg-leaf-400/15 !text-leaf-200"><Glyph value="📢" tile={false} size={16} /> Announcement</span>}
          {post.type === 'question' && <span className="chip !bg-brand-400/15 !text-brand-200"><Glyph value="❓" tile={false} size={16} /> Question</span>}
          {post.type === 'advocacy' && <span className="chip !bg-leaf-400/15 !text-leaf-200"><Glyph value="📣" tile={false} size={16} /> Advocacy</span>}
          {post.mandatory && <span className="chip !bg-amber-400/15 !text-amber-200"><Glyph value="mandatory" tile={false} size={16} /> Mandatory read</span>}
          {status === 'pending' && <span className="chip !bg-orange-400/15 !text-orange-200"><Glyph value="⏳" tile={false} size={16} /> Awaiting approval</span>}
          {status === 'draft' && <span className="chip !bg-white/10 !text-slate-200"><Glyph value="📝" tile={false} size={16} /> Draft</span>}
        </div>
        {!embedded && !guest && (
          <div className="relative">
            <button className="btn btn-ghost h-10 w-10 !p-0" aria-label="Post actions" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="glass glass-strong absolute right-0 z-20 mt-1 w-60 p-1.5" onMouseLeave={() => setMenu(false)}>
                {status === 'published' && item(state.bookmarks.includes(post.id) ? '🔖 Remove bookmark' : '🔖 Bookmark', () => dispatch({ type: 'bookmark', id: post.id }))}
                {me.admin && status === 'published' && item(post.pinned ? '📌 Unpin' : '📌 Pin to top', () => patch({ pinned: !post.pinned }))}
                {!mine && item(follows ? `👣 Unfollow ${user(post.authorId)?.name.split(' ')[0]}` : `👣 Follow ${user(post.authorId)?.name.split(' ')[0]}`, toggleFollow)}
                {canManageMandatory && status === 'published' && item(post.mandatory ? '✅ Manage Mandatory Read' : '✅ Mark as Mandatory Read', () => setModal('mandatory'))}
                {post.mandatory && (mine || canManageMandatory) && item('📋 View Report', () => setModal('mreport'))}
                {post.advocacy && (mine || me.admin) && item('📈 Advocacy report', () => setModal('areport'))}
                {canInsights && status === 'published' && item('📊 Insights', () => setModal('insights'))}
                {status === 'published' && item('🔗 Copy link', () => navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/post/${post.id}`))}
                {mine && item('✏️ Edit', () => setModal('edit'))}
                {(mine || me.admin) && item('🗑️ Delete', () => { if (confirm('Delete this post?')) dispatch({ type: 'post/delete', id: post.id }); }, 'text-rose-300')}
                {!mine && status === 'published' && item('🚩 Report post', () => setModal('report'))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="mt-3">
        {post.advocacy?.title && <h3 className="mb-1 font-bold">{post.advocacy.title}</h3>}
        {post.text && <RichText text={text} mentions={post.mentions} className="text-[15px] text-slate-100" />}
        {long && <button className="mt-1 text-sm text-brand-400 hover:underline" onClick={() => setMore(!more)}>{more ? 'See less' : 'See more'}</button>}
        {!embedded && post.text && status === 'published' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {post.text.length > 280 && <button className="min-h-8 text-brand-400 hover:underline" onClick={doSummary}><Glyph value="✨" tile={false} size={16} /> Summarize</button>}
            <label className="flex items-center gap-1 text-slate-400"><Glyph value="globe" tile={false} size={16} />
              <select className="min-h-8 rounded-md bg-transparent text-slate-300 hover:bg-white/5" value={lang} onChange={(e) => doTranslate(e.target.value)} aria-label="Translate post">
                <option value="">Translate</option>{LANGUAGES.map(([c, n]) => <option key={c} value={c} className="bg-ink-850">{n}</option>)}
              </select>
            </label>
          </div>
        )}
        {zia && (
          <div className="mt-2 rounded-xl bg-brand-500/10 p-3 text-sm text-slate-200">
            {zia.loading ? 'Zia is working…' : <><b className="text-xs uppercase tracking-wide text-brand-400">{zia.kind === 'summary' ? 'Summary' : 'Translation'}</b><p className="mt-1">{zia.text}</p><span className="text-xs text-slate-400">Zia · {zia.source}</span></>}
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className={`mt-3 grid gap-2 ${images.length > 1 ? 'grid-cols-2' : ''}`}>
          {images.map((a) => <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-96 w-full rounded-xl object-cover" />)}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((a) => <li key={a.id}><a className="chip !py-1.5" href={a.dataUrl} download={a.name}><Glyph value="📎" tile={false} size={16} /> {a.name} <span className="opacity-60">{Math.ceil(a.size / 1024)} KB</span></a></li>)}
        </ul>
      )}

      {post.poll && (
        <ul className="mt-3 space-y-2" aria-label="Poll options">
          {post.poll.options.map((o) => {
            const pct = totalVotes ? Math.round((o.votes.length / totalVotes) * 100) : 0;
            const mineVote = o.votes.includes(me.id);
            return (
              <li key={o.id}>
                <button disabled={guest || status !== 'published'} onClick={() => dispatch({ type: 'post/vote', id: post.id, optionId: o.id })} aria-pressed={mineVote}
                  className={`relative block min-h-11 w-full overflow-hidden rounded-xl border px-3 text-left text-sm ${mineVote ? 'border-brand-500' : 'border-white/10 hover:border-white/25'}`}>
                  <span className="absolute inset-y-0 left-0 bg-brand-500/25" style={{ width: `${pct}%` }} />
                  <span className="relative flex justify-between py-2.5"><span>{mineVote && '✓ '}{o.text}</span><span className="text-slate-300">{pct}%</span></span>
                </button>
              </li>
            );
          })}
          <li className="text-xs text-slate-400">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</li>
        </ul>
      )}

      {original && <div className="mt-3"><PostCard post={original} embedded readOnly={guest} /></div>}
      {post.repostOf && !original && <p className="mt-3 rounded-xl bg-white/5 p-3 text-sm text-slate-400">The original post is no longer available.</p>}

      {post.advocacy && (
        <div className="mt-3 rounded-xl border border-white/10 p-3">
          <a href={post.advocacy.url} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-brand-400 underline">{post.advocacy.url}</a>
          {status === 'published' && !embedded && !guest && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Share via</span>
              {post.advocacy.platforms.map((k) => (
                <button key={k} className="btn btn-ghost !py-1.5 text-xs" onClick={() => share(k)} aria-label={`Share on ${SHARE_TARGETS[k].label}`}>
                  <b>{SHARE_TARGETS[k].icon}</b> {SHARE_TARGETS[k].label} · {post.advocacy.shares?.[k]?.length || 0}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {post.mandatory && !embedded && !guest && status === 'published' && (
        <div className="mt-3">
          {mine ? (
            <p className="text-xs text-amber-200">You marked this as Mandatory Read · {post.mandatory.acks.length} acknowledged{post.mandatory.deadline ? ` · due ${fmtDate(post.mandatory.deadline)}` : ''}</p>
          ) : post.mandatory.acks.includes(me.id) ? (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"><Glyph value="mandatory" tile={false} size={16} /> You acknowledged this post.</p>
          ) : (
            <AckBox cfg={post.mandatory} onSubmit={() => dispatch({ type: 'post/ack', id: post.id })} />
          )}
        </div>
      )}

      {!guest && status === 'pending' && me.admin && !mine && (
        <div className="mt-3 flex gap-2"><button className="btn btn-primary" onClick={approve}>Approve</button>
          <button className="btn btn-ghost text-rose-300" onClick={() => dispatch({ type: 'post/delete', id: post.id })}>Reject</button></div>
      )}
      {status === 'pending' && mine && <p className="mt-3 text-xs text-orange-200">Your post is awaiting moderator approval and isn’t visible to others yet.</p>}
      {!guest && (status === 'draft' || status === 'scheduled') && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => patch({ status: needsApproval(state, me, post.text) ? 'pending' : 'published', createdAt: Date.now(), publishAt: undefined })}>Publish now</button>
          <button className="btn btn-ghost" onClick={() => setModal('edit')}>Edit</button>
          {status === 'scheduled' && <button className="btn btn-ghost" onClick={() => patch({ status: 'draft', publishAt: undefined })}>Move to drafts</button>}
          <button className="btn btn-ghost text-rose-300" onClick={() => dispatch({ type: 'post/delete', id: post.id })}>Delete</button>
        </div>
      )}

      {status === 'published' && !embedded && guest && (
        <footer className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/5 pt-2 text-sm text-slate-400">
          <span>❤️ {post.likes.length}</span><span><Glyph value="💬" tile={false} size={16} /> {post.comments.length}</span>
          <Link to="/signup" className="ml-auto font-semibold text-brand-400 hover:underline">Join to react</Link>
        </footer>
      )}
      {status === 'published' && !embedded && !guest && (
        <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/5 pt-2 text-sm">
          <button className={`btn btn-ghost !border-0 !bg-transparent !px-2.5 ${post.likes.includes(me.id) ? 'text-leaf-300' : 'text-slate-300'}`} onClick={like} aria-pressed={post.likes.includes(me.id)}>
            {post.likes.includes(me.id) ? '❤️' : '🤍'} {post.likes.length || ''} <span className="sr-only">likes</span>
          </button>
          <span className="flex" role="group" aria-label="How does this make you feel?">
            {Object.entries(MOODS).map(([k, e]) => {
              const n = Object.values(post.reactions || {}).filter((v) => v === k).length;
              return (
                <button key={k} onClick={() => react(k)} aria-pressed={myMood === k} title={k}
                  className={`min-h-10 rounded-lg px-2 text-sm hover:bg-white/5 ${myMood === k ? 'bg-white/10' : 'opacity-80'}`}>{e}{n ? <span className="ml-0.5 text-xs">{n}</span> : null}</button>
              );
            })}
          </span>
          <button className="btn btn-ghost !border-0 !bg-transparent !px-2.5 text-slate-300" onClick={() => setShowComments(!showComments)} aria-expanded={showComments}>
            <Glyph value="channels" tile={false} size={16} /> {post.comments.length || ''} {post.type === 'question' ? 'Answers' : 'Comments'}
          </button>
          <button className="btn btn-ghost !border-0 !bg-transparent !px-2.5 text-slate-300" onClick={() => setModal('repost')}>↗ Share</button>
          <span className="flex-1" />
          {canInsights && <button className="min-h-10 px-2 text-xs text-slate-400 hover:text-white" onClick={() => setModal('insights')}><Glyph value="👁" tile={false} size={16} /> {Object.keys(post.views || {}).length}</button>}
        </footer>
      )}
      {status === 'published' && !embedded && !guest && showComments && <Comments post={post} />}

      {modal === 'edit' && <Modal title="Edit post" onClose={close} wide><Composer initial={post} onDone={close} /></Modal>}
      {modal === 'mandatory' && (
        <MandatoryConfig initial={post.mandatory} onClose={close}
          onSave={(cfg) => {
            if (!post.mandatory) {
              const audience = (post.scope?.type === 'group' ? group?.members ?? [] : state.users.map((u) => u.id)).filter((id) => id !== me.id);
              audience.forEach((u) => dispatch({ type: 'notify', notification: { userId: u, kind: 'mandatory', link: `/post/${post.id}`, text: `${me.name} marked a post as Mandatory Read` } }));
            }
            dispatch({ type: 'post/mandatory', id: post.id, mandatory: cfg }); close();
          }}
          onRemove={post.mandatory ? () => { dispatch({ type: 'post/mandatory', id: post.id, mandatory: null }); close(); } : null} />
      )}
      {modal === 'mreport' && <MandatoryReport post={post} onClose={close} />}
      {modal === 'areport' && <AdvocacyReport post={post} onClose={close} />}
      {modal === 'insights' && <InsightsModal post={post} onClose={close} />}
      {modal === 'repost' && <RepostModal post={post} onClose={close} />}
      {modal === 'report' && <ReportModal post={post} onClose={close} />}
    </article>
  );
}
