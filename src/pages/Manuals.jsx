import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, fmtDate, timeAgo, uid } from '../lib/store.jsx';
import { Avatar, Field, Modal, PageHeader, UserLink } from '../components/ui.jsx';
import ManualList, { ManualForm } from '../components/collab/ManualList.jsx';
import { Menu, Prose, Select, UserPicker, toDateTimeInput } from '../components/collab/common.jsx';
import { canReadArticle, canWriteArticle, findArticle, isLive, manualRoles, patchArticle, sharedAccess } from '../components/collab/manual.js';

export default function Manuals() {
  const { id, articleId } = useParams();
  const { state, me } = useStore();
  if (!id) {
    return (
      <>
        <PageHeader title="Manuals" subtitle="The network’s knowledge base: handbooks, guides and checklists." />
        <ManualList />
      </>
    );
  }
  const manual = state.manuals.find((m) => m.id === id);
  const shared = manual?.chapters.some((c) => c.articles.some((a) => sharedAccess(a, me)));
  if (!manual || (!manual.published && !manualRoles(manual, me).canEdit && !shared)) {
    return <div className="glass p-8">Manual not found. <Link to="/manuals" className="text-brand-400 underline">Back to manuals</Link></div>;
  }
  return <ManualView manual={manual} articleId={articleId} />;
}

function ManualView({ manual, articleId }) {
  const { dispatch, me } = useStore();
  const nav = useNavigate();
  const roles = manualRoles(manual, me);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [tag, setTag] = useState(null);
  const { chapter, article } = articleId ? findArticle(manual, articleId) : {};

  const visible = (a) => canReadArticle(manual, a, me);
  const matches = (a) => (!q || `${a.title} ${a.body} ${(a.tags ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase())) && (!tag || a.tags?.includes(tag));
  const allTags = [...new Set(manual.chapters.flatMap((c) => c.articles.filter(visible).flatMap((a) => a.tags ?? [])))];

  const addChapter = () => {
    const title = prompt('Chapter name');
    if (title?.trim()) dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: (m) => ({ ...m, chapters: [...m.chapters, { id: uid('ch'), title: title.trim(), articles: [] }] }) });
  };

  return (
    <div className="ext-grid grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="ext-menu glass h-fit p-3 lg:sticky lg:top-24" aria-label="Manual contents">
        <Link to="/manuals" className="px-2 text-xs text-brand-400 hover:underline">← All manuals</Link>
        <Link to={`/manuals/${manual.id}`} className="mt-2 block px-2 font-bold hover:underline">{manual.title}</Link>
        <input className="input mt-3 !py-2" type="search" placeholder="Search this manual" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search this manual" />
        {!!allTags.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {allTags.map((t) => <button key={t} className={`chip ${tag === t ? '!bg-brand-500 !text-white' : ''}`} onClick={() => setTag(tag === t ? null : t)} aria-pressed={tag === t}>#{t}</button>)}
          </div>
        )}
        <nav className="mt-3 space-y-3">
          {manual.chapters.map((c) => {
            const arts = c.articles.filter((a) => visible(a) && matches(a));
            if ((q || tag) && !arts.length) return null;
            return (
              <div key={c.id}>
                <div className="flex items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="flex-1">{c.title}</span>
                  {roles.canEdit && <button className="h-8 w-8 rounded hover:bg-white/5" aria-label={`New article in ${c.title}`} onClick={() => setModal({ type: 'new', chapterId: c.id })}>＋</button>}
                </div>
                {arts.map((a) => (
                  <Link key={a.id} to={`/manuals/${manual.id}/${a.id}`}
                    className={`flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm ${a.id === articleId ? 'bg-brand-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                    <span className="flex-1 truncate">{a.title}</span>
                    {!a.published && <span title="Draft" aria-label="Draft"><Glyph value="✎" tile={false} size={16} /></span>}
                    {a.published && !isLive(a) && <span title="Scheduled" aria-label="Scheduled"><Glyph value="⏰" tile={false} size={16} /></span>}
                    {a.mandatory && <span title="Mandatory read" aria-label="Mandatory read"><Glyph value="❗" tile={false} size={16} /></span>}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        {roles.canEdit && <button className="btn btn-ghost mt-3 w-full" onClick={addChapter}>＋ Chapter</button>}
      </aside>

      <section>
        {article && visible(article) ? (
          <ArticleView key={article.id} manual={manual} chapter={chapter} article={article} />
        ) : (
          <>
            <PageHeader title={manual.title} subtitle={manual.description}
              actions={roles.admin && (
                <>
                  <button className="btn btn-primary" onClick={() => dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: { published: !manual.published } })}>
                    {manual.published ? 'Unpublish manual' : 'Publish manual'}
                  </button>
                  <Menu label="Manual actions" items={[
                    { label: 'Edit details', onClick: () => setModal({ type: 'edit' }) },
                    { label: 'Settings', onClick: () => setModal({ type: 'settings' }) },
                    { label: 'Delete manual', danger: true, onClick: () => { if (confirm('Delete this manual and all its articles?')) { dispatch({ type: 'remove', col: 'manuals', id: manual.id }); nav('/manuals'); } } },
                  ]} />
                </>
              )} />
            {!manual.published && <p className="glass mb-4 p-3 text-sm text-amber-200">This manual is unpublished. Only its admins and contributors can see it. Published articles are visible to members once the manual is published.</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {manual.chapters.map((c) => (
                <div key={c.id} className="glass p-5">
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 font-semibold">{c.title}</h2>
                    {roles.canEdit && (
                      <Menu label={`Chapter ${c.title} actions`} items={[
                        { label: 'New article', onClick: () => setModal({ type: 'new', chapterId: c.id }) },
                        { label: 'Rename chapter', onClick: () => { const t = prompt('Chapter name', c.title); if (t?.trim()) dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: (m) => ({ ...m, chapters: m.chapters.map((x) => (x.id === c.id ? { ...x, title: t.trim() } : x)) }) }); } },
                        { label: 'Delete chapter', danger: true, hidden: !roles.admin, onClick: () => confirm(`Delete “${c.title}” and its articles?`) && dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: (m) => ({ ...m, chapters: m.chapters.filter((x) => x.id !== c.id) }) }) },
                      ]} />
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {c.articles.filter(visible).map((a) => <li key={a.id}><Link to={`/manuals/${manual.id}/${a.id}`} className="text-slate-300 hover:text-white hover:underline"><Glyph value="📄" tile={false} size={16} /> {a.title}</Link></li>)}
                    {!c.articles.filter(visible).length && <li className="text-slate-500">No articles yet.</li>}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {modal?.type === 'new' && <NewArticle manual={manual} chapterId={modal.chapterId} onClose={() => setModal(null)} />}
      {modal?.type === 'edit' && <ManualForm manual={manual} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && <ManualSettings manual={manual} onClose={() => setModal(null)} />}
    </div>
  );
}

function NewArticle({ manual, chapterId, onClose }) {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const templates = state.articleTemplates ?? [{ id: 'blank', name: 'Blank', body: '' }];
  const [tpl, setTpl] = useState(templates[0].id);
  const [title, setTitle] = useState('');
  const create = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const id = uid('a');
    dispatch({ type: 'manual/article', manualId: manual.id, chapterId, article: { id, title: title.trim(), body: templates.find((t) => t.id === tpl)?.body ?? '', published: false, tags: [] } });
    onClose();
    nav(`/manuals/${manual.id}/${id}?edit=1`);
  };
  return (
    <Modal title="New article" onClose={onClose}>
      <form onSubmit={create} className="space-y-4">
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-300">Start from a template</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <label key={t.id} className={`cursor-pointer rounded-xl p-3 text-sm ring-1 ${tpl === t.id ? 'bg-brand-500/20 ring-brand-500' : 'ring-white/10 hover:bg-white/5'}`}>
                <input type="radio" name="tpl" className="sr-only" checked={tpl === t.id} onChange={() => setTpl(t.id)} />
                <div className="font-semibold">{t.name}</div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-400">{t.body ? t.body.replace(/[#\n]+/g, ' ').trim() : 'Start from scratch'}</div>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary w-full">Create article</button>
      </form>
    </Modal>
  );
}

function ManualSettings({ manual, onClose }) {
  const { dispatch } = useStore();
  const [tab, setTab] = useState('permission');
  const [publishWho, setWho] = useState(manual.publishWho ?? 'contributors');
  const [admins, setAdmins] = useState(manual.admins ?? []);
  const [contributors, setContributors] = useState(manual.contributors ?? []);
  return (
    <Modal title="Manual settings" onClose={onClose} wide>
      <div className="mb-4 flex gap-2">
        {[['permission', 'Permission'], ['members', 'Members']].map(([id, l]) => <button key={id} className={`btn ${tab === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(id)}>{l}</button>)}
      </div>
      {tab === 'permission' ? (
        <Field label="Who can publish Articles">
          <Select label="Who can publish articles" value={publishWho} onChange={setWho} options={[['contributors', 'Admins and contributors'], ['admins', 'Admins only']]} />
        </Field>
      ) : (
        <div className="space-y-4">
          <Field label="Admins"><UserPicker value={admins} onChange={setAdmins} /></Field>
          <Field label="Contributors"><UserPicker value={contributors} onChange={setContributors} exclude={admins} /></Field>
        </div>
      )}
      <button className="btn btn-primary mt-5 w-full" onClick={() => { dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: { publishWho, admins: admins.length ? admins : manual.admins, contributors } }); onClose(); }}>Save settings</button>
    </Modal>
  );
}

function ArticleView({ manual, chapter, article }) {
  const { state, dispatch, me, user } = useStore();
  const nav = useNavigate();
  const roles = manualRoles(manual, me);
  const canWrite = canWriteArticle(manual, article, me);
  const [editing, setEditing] = useState(() => canWrite && new URLSearchParams(location.hash.split('?')[1]).get('edit') === '1');
  const [draft, setDraft] = useState({ title: article.title, body: article.body, tags: (article.tags ?? []).join(', ') });
  const [modal, setModal] = useState(null);
  const [ack, setAck] = useState(false);
  const patch = (fn) => dispatch(patchArticle(manual.id, article.id, fn));

  const save = () => {
    dispatch({ type: 'manual/article', manualId: manual.id, chapterId: chapter.id,
      article: { id: article.id, title: draft.title.trim() || article.title, body: draft.body, tags: draft.tags.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean), editedBy: me.id } });
    setEditing(false);
  };

  const notifyAll = (text) => state.users.filter((u) => u.id !== me.id).forEach((u) => dispatch({ type: 'notify', silent: true,
    notification: { userId: u.id, kind: 'mandatory', text, link: `/manuals/${manual.id}/${article.id}` } }));
  const acked = article.mandatory?.acks?.includes(me.id);

  return (
    <article>
      <div className="mb-2 text-sm text-slate-400">{manual.title} › {chapter.title}</div>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        {editing ? (
          <input className="input flex-1 text-xl font-bold" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Article title" />
        ) : <h1 className="flex-1 text-2xl font-extrabold sm:text-3xl">{article.title}</h1>}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={() => { setEditing(false); setDraft({ title: article.title, body: article.body, tags: (article.tags ?? []).join(', ') }); }}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>Save</button>
            </>
          ) : (
            <>
              {canWrite && <button className="btn btn-ghost" onClick={() => { setDraft({ title: article.title, body: article.body, tags: (article.tags ?? []).join(', ') }); setEditing(true); }}><Glyph value="✎" tile={false} size={16} /> Edit</button>}
              {roles.canPublish && (
                <button className="btn btn-primary" onClick={() => patch((a) => ({ ...a, published: !a.published, publishAt: null }))}>
                  {article.published ? 'Unpublish' : 'Publish'}
                </button>
              )}
              <Menu label="Article actions" items={[
                { label: 'Schedule publish', hidden: !roles.canPublish, onClick: () => setModal('schedule') },
                { label: 'Share Article', hidden: !roles.admin, onClick: () => setModal('share') },
                { label: article.mandatory ? 'Manage Mandatory Read' : 'Mark as Mandatory Read', hidden: !roles.admin, onClick: () => setModal('mandatory') },
                { label: 'Version history', onClick: () => setModal('versions') },
                { label: 'Delete article', danger: true, hidden: !roles.admin, onClick: () => {
                  if (!confirm('Delete this article?')) return;
                  dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: (m) => ({ ...m, chapters: m.chapters.map((c) => ({ ...c, articles: c.articles.filter((x) => x.id !== article.id) })) }) });
                  nav(`/manuals/${manual.id}`);
                } },
              ]} />
            </>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {!article.published && <span className="chip !bg-amber-400/15 !text-amber-200">Draft</span>}
        {article.published && !isLive(article) && <span className="chip !bg-leaf-500/15 !text-leaf-200"><Glyph value="⏰" tile={false} size={16} /> Scheduled for {fmtDate(article.publishAt)}</span>}
        {isLive(article) && <span className="chip !bg-emerald-500/15 !text-emerald-200">Published</span>}
        {article.mandatory && <span className="chip !bg-rose-500/15 !text-rose-200"><Glyph value="❗" tile={false} size={16} /> Mandatory read</span>}
        {sharedAccess(article, me) && <span className="chip">Shared with you · {sharedAccess(article, me) === 'edit' ? 'can edit' : 'read-only'}</span>}
        <span>Updated {timeAgo(article.updatedAt)}{article.editedBy ? ` by ${user(article.editedBy)?.name}` : ''}</span>
        {!editing && (article.tags ?? []).map((t) => <span key={t} className="chip">#{t}</span>)}
      </div>

      {editing ? (
        <div className="space-y-3">
          <textarea className="input min-h-[50vh] font-mono text-sm" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} aria-label="Article body"
            placeholder="## Heading, - bullet, 1. numbered, **bold**" />
          <Field label="Tags" hint="Comma separated"><input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></Field>
        </div>
      ) : (
        <div className="glass p-6 sm:p-8"><Prose text={article.body} /></div>
      )}

      {article.mandatory && !editing && (
        <div className="glass mt-4 p-5">
          {acked ? (
            <p className="text-sm text-emerald-200">✓ You acknowledged this article.</p>
          ) : article.mandatory.by === me.id ? (
            <p className="text-sm text-slate-400">You marked this article as mandatory read. {article.mandatory.acks.length} members have acknowledged it.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (ack) patch((a, uid2) => ({ ...a, mandatory: { ...a.mandatory, acks: [...new Set([...a.mandatory.acks, uid2])], ackAt: { ...a.mandatory.ackAt, [uid2]: Date.now() } } })); }}
              className="flex flex-wrap items-center gap-3">
              <label className="flex flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> {article.mandatory.message || 'I have read and understood this article.'}</label>
              <button className="btn btn-primary" disabled={!ack}>{article.mandatory.button || 'Submit'}</button>
            </form>
          )}
          {roles.admin && <button className="mt-3 text-xs text-brand-400 hover:underline" onClick={() => setModal('report')}>View Report</button>}
        </div>
      )}

      {modal === 'schedule' && <ScheduleModal article={article} onClose={() => setModal(null)} onSave={(t) => patch((a) => ({ ...a, published: true, publishAt: t }))} />}
      {modal === 'share' && <ShareArticle article={article} onClose={() => setModal(null)} onSave={(sharedWith) => {
        const added = sharedWith.filter((s) => !(article.sharedWith ?? []).some((x) => x.userId === s.userId));
        patch((a) => ({ ...a, sharedWith }));
        added.forEach((s) => dispatch({ type: 'notify', silent: true, notification: { userId: s.userId, kind: 'manual', text: `${me.name} shared “${article.title}” with you`, link: `/manuals/${manual.id}/${article.id}` } }));
      }} />}
      {modal === 'mandatory' && <MandatoryModal article={article} onClose={() => setModal(null)}
        onSave={(m) => { patch((a) => ({ ...a, mandatory: m ? { acks: [], ackAt: {}, ...a.mandatory, ...m, by: a.mandatory?.by ?? me.id } : undefined })); if (m && !article.mandatory) notifyAll(`${me.name} marked “${article.title}” as Mandatory Read`); }} />}
      {modal === 'report' && <ReadReport article={article} manual={manual} onClose={() => setModal(null)} />}
      {modal === 'versions' && <VersionHistory article={article} canRestore={canWrite} onClose={() => setModal(null)}
        onRestore={(v) => dispatch({ type: 'manual/article', manualId: manual.id, chapterId: chapter.id, article: { id: article.id, body: v.body, editedBy: me.id } })} />}
    </article>
  );
}

function ScheduleModal({ article, onClose, onSave }) {
  const [v, setV] = useState(toDateTimeInput(article.publishAt ?? Date.now() + 864e5));
  return (
    <Modal title="Schedule publish" onClose={onClose}>
      <Field label="Publish on" hint="Members see the article from this time."><input className="input" type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <button className="btn btn-primary mt-4 w-full" onClick={() => { const t = new Date(v).getTime(); if (t > Date.now()) { onSave(t); onClose(); } else alert('Pick a time in the future.'); }}>Schedule</button>
    </Modal>
  );
}

function ShareArticle({ article, onClose, onSave }) {
  const { user } = useStore();
  const [list, setList] = useState(article.sharedWith ?? []);
  const ids = list.map((s) => s.userId);
  return (
    <Modal title="Share Article" onClose={onClose} wide>
      <p className="mb-3 text-sm text-slate-400">Share with network members who aren’t part of this manual.</p>
      <UserPicker value={ids} onChange={(next) => setList(next.map((id) => list.find((s) => s.userId === id) ?? { userId: id, access: 'read' }))} />
      {!!list.length && (
        <ul className="mt-4 space-y-2">
          {list.map((s) => (
            <li key={s.userId} className="flex items-center gap-3 text-sm">
              <Avatar user={user(s.userId)} size={28} /><span className="flex-1">{user(s.userId)?.name}</span>
              <Select className="!w-36" label={`Access for ${user(s.userId)?.name}`} value={s.access} onChange={(access) => setList(list.map((x) => (x.userId === s.userId ? { ...x, access } : x)))}
                options={[['read', 'Read-only'], ['edit', 'Can edit']]} />
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-primary mt-5 w-full" onClick={() => { onSave(list); onClose(); }}>Done</button>
    </Modal>
  );
}

function MandatoryModal({ article, onClose, onSave }) {
  const m = article.mandatory ?? {};
  const [message, setMessage] = useState(m.message ?? 'I have read and understood this article.');
  const [button, setButton] = useState(m.button ?? 'Acknowledge');
  const [deadline, setDeadline] = useState(toDateTimeInput(m.deadline ?? Date.now() + 7 * 864e5));
  return (
    <Modal title={article.mandatory ? 'Manage Mandatory Read' : 'Mark as Mandatory Read'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Deadline"><input className="input" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Acknowledgement message"><input className="input" value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <Field label="Button text"><input className="input" value={button} onChange={(e) => setButton(e.target.value)} /></Field>
        <div className="rounded-xl bg-white/5 p-3 text-sm"><div className="mb-2 text-xs text-slate-400">Preview</div>
          <label className="flex items-center gap-2"><input type="checkbox" disabled /> {message}</label><button className="btn btn-primary mt-2" disabled>{button}</button></div>
        <div className="flex justify-between gap-2">
          {article.mandatory ? <button className="btn btn-ghost text-rose-300" onClick={() => { onSave(null); onClose(); }}>Remove Mandatory Read</button> : <span />}
          <button className="btn btn-primary" onClick={() => { onSave({ message, button, deadline: new Date(deadline).getTime() }); onClose(); }}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function ReadReport({ article, onClose }) {
  const { state, dispatch, me, user } = useStore();
  const m = article.mandatory;
  const pending = state.users.filter((u) => u.id !== m.by && !m.acks.includes(u.id));
  const remind = (u) => dispatch({ type: 'notify', silent: true, notification: { userId: u.id, kind: 'mandatory', text: `Reminder from ${me.name}: please read “${article.title}”`, link: location.hash.slice(1) } });
  return (
    <Modal title="Mandatory read report" onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-400">{m.acks.length} read · {pending.length} not yet{m.deadline ? ` · due ${fmtDate(m.deadline)}` : ''}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Read ({m.acks.length})</h3>
          <ul className="space-y-2">{m.acks.map((id) => <li key={id} className="flex items-center gap-2 text-sm"><Avatar user={user(id)} size={26} /><UserLink id={id} />
            {m.ackAt?.[id] && <span className="text-xs text-slate-500">{timeAgo(m.ackAt[id])}</span>}</li>)}</ul>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Not read ({pending.length})</h3>
            {!!pending.length && <button className="text-xs text-brand-400 hover:underline" onClick={() => { pending.forEach(remind); alert('Reminders sent.'); }}>Remind all</button>}</div>
          <ul className="space-y-2">{pending.map((u) => (
            <li key={u.id} className="flex items-center gap-2 text-sm"><Avatar user={u} size={26} /><span className="flex-1">{u.name}</span>
              <button className="text-xs text-brand-400 hover:underline" onClick={() => remind(u)}>Send a reminder</button></li>
          ))}</ul>
        </div>
      </div>
    </Modal>
  );
}

function VersionHistory({ article, canRestore, onRestore, onClose }) {
  const versions = [...(article.versions ?? [])].reverse();
  const [sel, setSel] = useState(null);
  return (
    <Modal title="Version history" onClose={onClose} wide>
      {!versions.length ? <p className="text-sm text-slate-400">No earlier versions. A version is saved each time the article is edited.</p> : (
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <ol className="space-y-1">
            <li className="rounded-lg bg-brand-500/20 px-3 py-2 text-sm">Current · {timeAgo(article.updatedAt)}</li>
            {versions.map((v, i) => (
              <li key={v.at ?? i}><button className={`w-full rounded-lg px-3 py-2 text-left text-sm ${sel === v ? 'bg-white/10' : 'hover:bg-white/5'}`} onClick={() => setSel(v)}>
                Version {versions.length - i}<div className="text-xs text-slate-500">{v.at ? fmtDate(v.at) : 'Unknown date'}</div></button></li>
            ))}
          </ol>
          <div className="min-h-40 rounded-xl bg-white/5 p-4">
            {sel ? <>
              <Prose text={sel.body} />
              {canRestore && <button className="btn btn-primary mt-4" onClick={() => { onRestore(sel); onClose(); }}>Restore this version</button>}
            </> : <p className="text-sm text-slate-400">Select a version to preview it.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
