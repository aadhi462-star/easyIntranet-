import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, uid } from '../../lib/store.jsx';
import { Empty, Field, Modal } from '../ui.jsx';
import { ScopeBadge, canSeeGroupItem } from './common.jsx';
import { canReadArticle, manualRoles } from './manual.js';

export function ManualForm({ manual, groupId, onClose }) {
  const { dispatch, me } = useStore();
  const nav = useNavigate();
  const [title, setTitle] = useState(manual?.title ?? '');
  const [description, setDescription] = useState(manual?.description ?? '');
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (manual) dispatch({ type: 'update', col: 'manuals', id: manual.id, patch: { title: title.trim(), description } });
    else {
      const id = uid('man');
      dispatch({ type: 'add', col: 'manuals', prepend: false, item: { id, title: title.trim(), description, admins: [me.id], contributors: [], published: false,
        publishWho: 'contributors', groupId: groupId ?? null, chapters: [{ id: uid('ch'), title: 'Getting started', articles: [] }] } });
      nav(`/manuals/${id}`);
    }
    onClose();
  };
  return (
    <Modal title={manual ? 'Edit manual' : 'New manual'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter Leads Handbook" /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <button className="btn btn-primary w-full">{manual ? 'Save' : 'Create manual'}</button>
      </form>
    </Modal>
  );
}

/** Manuals grid. Embeddable in groups via `groupId`. */
export default function ManualList({ groupId }) {
  const { state, me, can } = useStore();
  const [creating, setCreating] = useState(false);
  const manuals = state.manuals.filter((m) => (groupId ? m.groupId === groupId : true) && (m.published || manualRoles(m, me).canEdit) && (canSeeGroupItem(state, me, m) || manualRoles(m, me).canEdit));
  return (
    <div>
      {can('manual.create') && <div className="mb-4 flex justify-end"><button className="btn btn-primary" onClick={() => setCreating(true)}>＋ New manual</button></div>}
      {manuals.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {manuals.map((m) => {
            const articles = m.chapters.flatMap((c) => c.articles).filter((a) => canReadArticle(m, a, me));
            return (
              <Link key={m.id} to={`/manuals/${m.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="brand-gradient grid h-11 w-11 place-items-center rounded-xl text-xl" aria-hidden="true"><Glyph value="📖" tile={false} size={16} /></span>
                  <div className="flex flex-wrap justify-end gap-1">{!m.published && <span className="chip !bg-amber-400/15 !text-amber-200">Unpublished</span>}{m.groupId && <ScopeBadge groupId={m.groupId} />}</div>
                </div>
                <h3 className="mt-3 font-semibold">{m.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{m.description}</p>
                <p className="mt-3 text-xs text-slate-500">{m.chapters.length} chapters · {articles.length} articles</p>
              </Link>
            );
          })}
        </div>
      ) : <Empty icon="📖" title="No manuals yet">Manuals hold handbooks, guides and checklists.</Empty>}
      {creating && <ManualForm groupId={groupId} onClose={() => setCreating(false)} />}
    </div>
  );
}
