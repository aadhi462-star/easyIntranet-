import { Glyph, Icon } from '../icons.jsx';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore, timeAgo, uid } from '../../lib/store.jsx';
import { Empty, Field, Modal, Tabs } from '../ui.jsx';
import { Menu, Select, UserPicker } from './common.jsx';
import { deleteBlob, downloadBlob, fmtSize, getBlob, putBlob } from './fileStore.js';
import { sheetToCsv } from './editors.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

export const MAX_SIZE = 30 * 1024 * 1024; // 30 MB per attachment, as in Connect

/** Icon name for a file, drawn with <Icon name={fileIcon(f)} />. */
const KIND_ICON = { doc: 'drafts', sheet: 'poll', slides: 'slides', folder: 'files' };
export function fileIcon(f) {
  if (KIND_ICON[f.kind]) return KIND_ICON[f.kind];
  if (f.type?.startsWith('image/')) return 'image';
  if (f.type?.startsWith('video/')) return 'video';
  if (f.type?.startsWith('audio/')) return 'music';
  if (f.type === 'application/pdf' || f.type?.startsWith('text/')) return 'doc';
  return 'paperclip';
}

export async function downloadFile(f) {
  if (f.kind === 'doc') return downloadBlob(new Blob([`<!doctype html><meta charset="utf-8"><title>${f.name}</title>${f.content}`], { type: 'text/html' }), `${f.name}.html`);
  if (f.kind === 'sheet') return downloadBlob(new Blob([sheetToCsv(f.content?.cells ?? {})], { type: 'text/csv' }), `${f.name}.csv`);
  if (f.kind === 'slides') return downloadBlob(new Blob([f.content.slides.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.body}`).join('\n\n')], { type: 'text/plain' }), `${f.name}.txt`);
  const v = f.versions.at(-1);
  const blob = v && await getBlob(v.key);
  if (blob) downloadBlob(blob, f.name);
  else alert('This file’s content is not stored in this browser.');
}

/** Upload helper shared by the list and the viewer (new version). */
export async function storeUpload(file, userId) {
  const key = uid('blob');
  await putBlob(key, file);
  return { key, size: file.size, at: Date.now(), by: userId, name: file.name };
}

function FileActions({ f, folders, onShare, onRename, onMove }) {
  const { dispatch, me } = useStore();
  const nav = useNavigate();
  const mine = f.authorId === me.id || me.admin;
  return (
    <Menu label={`Actions for ${f.name}`} items={[
      { label: 'Open', onClick: () => nav(`/files/${f.id}`) },
      { label: 'Download', onClick: () => downloadFile(f) },
      { label: 'Rename', onClick: onRename, hidden: !mine },
      { label: 'Move to…', onClick: onMove, hidden: !mine || !folders.length },
      { label: 'Share', onClick: onShare, hidden: !mine },
      { label: 'Delete', danger: true, hidden: !mine, onClick: async () => {
        if (!(await confirmAction(`Delete “${f.name}”? This can’t be undone.`))) return;
        f.versions?.forEach((v) => deleteBlob(v.key).catch(() => {}));
        dispatch({ type: 'remove', col: 'files', id: f.id });
      } },
    ]} />
  );
}

export function ShareModal({ file, onClose }) {
  const { dispatch, me } = useStore();
  const [ids, setIds] = useState(file.sharedWith ?? []);
  return (
    <Modal title={`Share “${file.name}”`} onClose={onClose}>
      <UserPicker value={ids} onChange={setIds} exclude={[file.authorId]} />
      <button className="btn btn-primary mt-4 w-full" onClick={() => {
        dispatch({ type: 'update', col: 'files', id: file.id, patch: { sharedWith: ids } });
        ids.filter((i) => !(file.sharedWith ?? []).includes(i)).forEach((userId) => dispatch({ type: 'notify', silent: true,
          notification: { userId, kind: 'file', text: `${me.name} shared “${file.name}” with you`, link: `/files/${file.id}` } }));
        onClose();
      }}>Share</button>
    </Modal>
  );
}

function NameModal({ title, initial = '', onSave, onClose, children }) {
  const [name, setName] = useState(initial);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onSave(name.trim()); onClose(); } }} className="space-y-4">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {children}
        <button className="btn btn-primary w-full">Save</button>
      </form>
    </Modal>
  );
}

/**
 * File manager: folders, uploads (blobs in IndexedDB) and created Documents, Spreadsheets
 * and Presentations. `groupId` scopes it to a group; otherwise it shows network files.
 */
export default function FileList({ groupId }) {
  const { state, dispatch, me } = useStore();
  const nav = useNavigate();
  const input = useRef(null);
  const [folderId, setFolderId] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null); // { type, file? }
  const [busy, setBusy] = useState('');
  const [drop, setDrop] = useState(false);
  const scope = (x) => (x.groupId ?? null) === (groupId ?? null);
  const folders = (state.folders ?? []).filter(scope);
  const folder = folders.find((x) => x.id === folderId);
  const path = []; for (let f = folder; f; f = folders.find((x) => x.id === f.parentId)) path.unshift(f);

  let files = (state.files ?? []).filter((f) => (tab === 'shared' ? f.sharedWith?.includes(me.id) : scope(f)));
  if (tab === 'mine') files = files.filter((f) => f.authorId === me.id);
  if (tab === 'recent') files = [...files].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)).slice(0, 15);
  const browsing = tab === 'all' && !q;
  if (browsing) files = files.filter((f) => (f.folderId ?? null) === folderId);
  if (q) files = files.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  const subfolders = browsing ? folders.filter((x) => (x.parentId ?? null) === folderId) : [];

  const upload = async (list) => {
    const arr = [...list];
    const tooBig = arr.filter((f) => f.size > MAX_SIZE);
    if (tooBig.length) alert(`${tooBig.map((f) => f.name).join(', ')} ${tooBig.length > 1 ? 'are' : 'is'} over the 30 MB limit.`);
    for (const file of arr.filter((f) => f.size <= MAX_SIZE)) {
      setBusy(`Uploading ${file.name}…`);
      try {
        const v = await storeUpload(file, me.id);
        dispatch({ type: 'add', col: 'files', item: { name: file.name, kind: 'upload', type: file.type || 'application/octet-stream', size: file.size,
          folderId: browsing ? folderId : null, groupId: groupId ?? null, sharedWith: [], versions: [v], updatedAt: Date.now() } });
      } catch (e) { alert(`Couldn’t store ${file.name}: ${e.message}`); }
    }
    setBusy('');
  };

  const create = (kind) => {
    const id = uid('fl');
    const content = kind === 'doc' ? '<h2>Untitled document</h2><p></p>' : kind === 'sheet' ? { cells: {} } : { slides: [{ id: uid('sl'), title: 'Title slide', body: '' }] };
    const names = { doc: 'Untitled document', sheet: 'Untitled spreadsheet', slides: 'Untitled presentation' };
    dispatch({ type: 'add', col: 'files', item: { id, name: names[kind], kind, type: `application/x-${kind}`, size: 0, folderId: browsing ? folderId : null,
      groupId: groupId ?? null, sharedWith: [], versions: [], content, updatedAt: Date.now() } });
    nav(`/files/${id}`);
  };

  return (
    <div onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrop(true); } }} onDragLeave={() => setDrop(false)}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDrop(false); upload(e.dataTransfer.files); } }}
      className={`rounded-2xl transition ${drop ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={(t) => { setTab(t); setFolderId(null); }} tabs={[{ id: 'all', label: 'All files' }, { id: 'recent', label: 'Recent' }, { id: 'mine', label: 'My files' },
          ...(groupId ? [] : [{ id: 'shared', label: 'Shared with me' }])]} />
        <input className="input !w-48" type="search" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
        <div className="ml-auto flex flex-wrap gap-2">
          <Menu label="Create" items={[
            { label: 'Document', onClick: () => create('doc') },
            { label: 'Spreadsheet', onClick: () => create('sheet') },
            { label: 'Presentation', onClick: () => create('slides') },
            { label: 'New folder', onClick: () => setModal({ type: 'folder' }) },
          ]} />
          <button className="btn btn-primary" onClick={() => input.current.click()}>Upload</button>
          <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {browsing && (
        <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <button className="rounded px-2 py-1 hover:bg-white/5" onClick={() => setFolderId(null)}><Glyph value="home" tile={false} size={16} /> Files</button>
          {path.map((p) => <span key={p.id} className="flex items-center gap-1">/<button className="rounded px-2 py-1 hover:bg-white/5" onClick={() => setFolderId(p.id)}>{p.name}</button></span>)}
        </nav>
      )}
      {busy && <p role="status" className="mb-3 text-sm text-brand-400">{busy}</p>}

      {!subfolders.length && !files.length ? (
        <Empty icon="files" title="Nothing here yet">Upload files (drag & drop works), or create a document, spreadsheet or presentation.</Empty>
      ) : (
        <div className="glass divide-y divide-white/5">
          {subfolders.map((fo) => (
            <div key={fo.id} className="flex items-center gap-3 p-3">
              <button className="flex min-h-10 flex-1 items-center gap-3 text-left" onClick={() => setFolderId(fo.id)}>
                <span className="text-xl" aria-hidden="true"><Glyph value="files" tile={false} size={16} /></span><span className="font-medium">{fo.name}</span>
                <span className="text-xs text-slate-500">{(state.files ?? []).filter((f) => f.folderId === fo.id).length} items</span>
              </button>
              <Menu label={`Actions for folder ${fo.name}`} items={[
                { label: 'Rename', hidden: fo.authorId !== me.id && !me.admin, onClick: () => setModal({ type: 'renameFolder', folder: fo }) },
                { label: 'Delete folder', danger: true, hidden: fo.authorId !== me.id && !me.admin, onClick: async () => {
                  if (!(await confirmAction(`Delete folder “${fo.name}”? Its files and subfolders move up one level.`))) return;
                  (state.files ?? []).filter((f) => f.folderId === fo.id).forEach((f) => dispatch({ type: 'update', col: 'files', id: f.id, patch: { folderId: fo.parentId ?? null }, silent: true }));
                  (state.folders ?? []).filter((x) => x.parentId === fo.id).forEach((x) => dispatch({ type: 'update', col: 'folders', id: x.id, patch: { parentId: fo.parentId ?? null }, silent: true }));
                  dispatch({ type: 'remove', col: 'folders', id: fo.id });
                } },
              ]} />
            </div>
          ))}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <Link to={`/files/${f.id}`} className="flex min-h-10 min-w-0 flex-1 items-center gap-3">
                <Icon name={fileIcon(f)} size={20} />
                <span className="min-w-0"><span className="block truncate font-medium">{f.name}</span>
                  <span className="text-xs text-slate-500">{state.users.find((u) => u.id === f.authorId)?.name} · {timeAgo(f.updatedAt ?? f.createdAt)}
                    {f.kind === 'upload' ? ` · ${fmtSize(f.size)}` : ''}{f.versions?.length > 1 ? ` · v${f.versions.length}` : ''}{f.sharedWith?.length ? ' · shared' : ''}</span></span>
              </Link>
              <FileActions f={f} folders={folders} onShare={() => setModal({ type: 'share', file: f })}
                onRename={() => setModal({ type: 'rename', file: f })} onMove={() => setModal({ type: 'move', file: f })} />
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Files are stored in this browser (IndexedDB). Max 30 MB per file.</p>

      {modal?.type === 'folder' && <NameModal title="New folder" onClose={() => setModal(null)}
        onSave={(name) => dispatch({ type: 'add', col: 'folders', item: { name, parentId: folderId, groupId: groupId ?? null } })} />}
      {modal?.type === 'renameFolder' && <NameModal title="Rename folder" initial={modal.folder.name} onClose={() => setModal(null)}
        onSave={(name) => dispatch({ type: 'update', col: 'folders', id: modal.folder.id, patch: { name } })} />}
      {modal?.type === 'rename' && <NameModal title="Rename file" initial={modal.file.name} onClose={() => setModal(null)}
        onSave={(name) => dispatch({ type: 'update', col: 'files', id: modal.file.id, patch: { name } })} />}
      {modal?.type === 'share' && <ShareModal file={modal.file} onClose={() => setModal(null)} />}
      {modal?.type === 'move' && <MoveModal file={modal.file} folders={folders} onClose={() => setModal(null)} />}
    </div>
  );
}

function MoveModal({ file, folders, onClose }) {
  const { dispatch } = useStore();
  const [to, setTo] = useState(file.folderId ?? '');
  return (
    <Modal title={`Move “${file.name}”`} onClose={onClose}>
      <Select label="Destination folder" value={to} onChange={setTo} options={[['', 'Files (top level)'], ...folders.map((f) => [f.id, `${f.name}`])]} />
      <button className="btn btn-primary mt-4 w-full" onClick={() => { dispatch({ type: 'update', col: 'files', id: file.id, patch: { folderId: to || null } }); onClose(); }}>Move</button>
    </Modal>
  );
}
