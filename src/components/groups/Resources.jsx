// A community's Resources tab (board V2EModules, Resources; Stage 4 S4Resources): its library of
// files and links, on the v2 tokens. Everything is on the server: files are stored there
// (decision S4-1) and only download for people who can open the community. Who may add, edit or
// delete comes from the API (`canAdd`, each resource's `canEdit`).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { fmtDate } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Button, Skeleton } from '../ui/Controls.jsx';
import SaveButton from '../SaveButton.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import Field from '../events/FormField.jsx';
import Menu from '../resources/Menu.jsx';

const MB = 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.md';
const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const BADGE = { pdf: 'PDF', image: 'IMG', office: 'DOC', text: 'TXT' };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const dateOf = (x) => fmtDate(Date.parse(x.updatedAt ?? x.createdAt), { day: 'numeric', month: 'short', year: 'numeric' });
const tooBig = (f) => `Files can be up to 10 MB. ${f.name} is ${sizeText(f.size)}.`;

function useResources(g, { q, category, sort }) {
  const [s, setS] = useState({ status: 'loading', resources: [], categories: [], canAdd: false });
  const load = useCallback(() => {
    const p = new URLSearchParams({ sort, ...(q ? { q } : {}), ...(category ? { category } : {}) });
    setS((p0) => ({ ...p0, status: 'loading' }));
    return api(`/communities/${encodeURIComponent(g.id)}/resources?${p}`)
      .then((d) => setS({ status: 'ready', ...d }))
      .catch((e) => setS((p0) => ({ ...p0, status: 'error', message: errorText(e) })));
  }, [g.id, q, category, sort]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

export default function Resources({ g }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [modal, setModal] = useState(null); // { mode: 'link' | 'file' | 'edit', resource?, file? }
  const [uploading, setUploading] = useState(null); // the file name while it uploads
  const [uploadError, setUploadError] = useState('');
  const picker = useRef(null);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const r = useResources(g, { q, category, sort });
  const filtered = !!(q || category);

  // Pick a file → upload it → ask for its title and category. Too-large files stop before upload.
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    if (file.size > 10 * MB) { setUploadError(tooBig(file)); return; }
    setUploading(file.name);
    try { setModal({ mode: 'file', file: await uploadFile(g.id, file) }); } catch (err) { setUploadError(errorText(err)); } finally { setUploading(null); }
  };
  const remove = async (res) => {
    if (!(await confirmAction({ title: `Delete “${res.title}”?`, body: 'It stops opening for everyone straight away.', confirm: 'Delete', danger: true }))) return;
    try { await api(`/resources/${res.id}`, { method: 'DELETE' }); toast('Resource deleted'); r.reload(); } catch (err) { toast(errorText(err), 'error'); }
  };
  const addLink = () => setModal({ mode: 'link' });
  const upload = () => picker.current?.click();
  const actions = (x) => ({ onEdit: () => setModal({ mode: 'edit', resource: x }), onDelete: () => remove(x) });
  const firstLoad = r.status === 'loading' && !r.resources.length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <input ref={picker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-[1_1_240px] items-center">
          <span className="sr-only">Search resources</span>
          <Icon name="search" size={16} className="text-2 pointer-events-none absolute left-3" />
          <input type="search" className="input !pl-9" placeholder="Search resources" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="text-2 flex items-center gap-2 text-sm">Sort
          <select className="input !w-32" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option>
          </select>
        </label>
        {r.canAdd && <>
          <span className="hidden gap-2 sm:flex">
            <Button variant="secondary" icon="link" onClick={addLink}>Add link</Button>
            <Button variant="primary" icon="paperclip" busy={!!uploading} onClick={upload}>{uploading ? 'Uploading…' : 'Upload file'}</Button>
          </span>
          {/* Phones: Upload file and Add link share one Add menu. */}
          <span className="ml-auto sm:hidden">
            <Menu label="Add a resource" width={180} items={[{ label: 'Upload file', icon: 'paperclip', onSelect: upload }, { label: 'Add link', icon: 'link', onSelect: addLink }]}
              trigger={({ props }) => (
                <button type="button" {...props} className="btn btn-primary" disabled={!!uploading}><Icon name="plus" size={18} />{uploading ? 'Uploading…' : 'Add'}</button>
              )} />
          </span>
        </>}
      </div>
      {r.categories.length > 0 && (
        <div role="group" aria-label="Category" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
          {['', ...r.categories].map((cat) => (
            <button key={cat || 'all'} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)} className="filter-chip !min-h-10 shrink-0">{cat || 'All'}</button>
          ))}
        </div>
      )}

      {uploading && <p role="status" className="notice notice-info flex items-start gap-2.5"><Icon name="info" size={18} className="mt-0.5" /><span>Uploading {uploading}. When it finishes you give it a title and category.</span></p>}
      {uploadError && (
        <p role="alert" className="notice notice-bad flex items-start gap-2.5">
          <Icon name="alert" size={18} className="mt-0.5 text-[var(--az-danger)]" /><span className="min-w-0 flex-1 break-words">{uploadError}</span>
          <button type="button" className="link shrink-0 text-sm" onClick={() => setUploadError('')}>Dismiss</button>
        </p>
      )}

      {firstLoad ? <div className="panel p-5"><Skeleton lines={4} label="Loading resources" /></div>
        : r.status === 'error' ? (
          <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1"><strong>Couldn’t load resources:</strong> {r.message}</span>
            <Button size="sm" onClick={r.reload}>Try again</Button>
          </div>
        ) : r.resources.length === 0 ? (
          <section className="panel flex flex-col items-center gap-2 px-5 py-10 text-center">
            <Icon name="doc" size={28} className="text-2" />
            <h2 className="t-h3 text-[var(--az-text)]">{filtered ? 'Nothing matches' : 'No resources yet'}</h2>
            <p className="text-2 max-w-md text-sm">{filtered ? 'Try other words or another category.'
              : r.canAdd ? `Share handbooks, slides, photos and useful links with everyone in ${g.name}.` : 'When admins add handbooks, slides or links, they’ll be here.'}</p>
            {filtered && <Button size="sm" className="mt-2" onClick={() => { setText(''); setQ(''); setCategory(''); }}>Clear search</Button>}
          </section>
        ) : (
          <>
            <div className="panel hidden overflow-x-auto md:block" aria-busy={r.status === 'loading' || undefined}>
              <table className="w-full border-collapse text-sm">
                <thead><tr className="text-left">
                  {['Title', 'Category', 'Added by', 'Updated', 'Size'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
                  <th scope="col" className="border-b border-[var(--az-hairline)] px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>{r.resources.map((x) => <Row key={x.id} x={x} {...actions(x)} />)}</tbody>
              </table>
            </div>
            <ul className="panel list-rows min-w-0 md:hidden" aria-label="Resources">{r.resources.map((x) => <MobileRow key={x.id} x={x} {...actions(x)} />)}</ul>
          </>
        )}
      <p className="t-small">Files: PDF, images, Word, Excel, PowerPoint or plain text, up to 10 MB. They always download; nothing opens as a page. Files aren’t scanned for viruses.</p>
      {modal && <ResourceForm g={g} modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); r.reload(); }} />}
    </div>
  );
}

function Open({ x, className = '' }) {
  return x.kind === 'link'
    ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className={`btn btn-secondary btn-sm ${className}`} aria-label={`Open ${x.title} (opens ${host(x.url)})`}><Icon name="external" size={16} />Open</a>
    : <a href={`/api/files/${x.file.id}`} download className={`btn btn-secondary btn-sm ${className}`} aria-label={`Download ${x.title}`}><Icon name="download" size={16} />Download</a>;
}

function TypeTile({ x }) {
  return (
    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--az-control)] text-[11px] font-bold text-[var(--az-text)]">
      {x.kind === 'link' ? 'LINK' : BADGE[x.file.kind] ?? 'FILE'}
    </span>
  );
}

/** Save, and Edit / Delete for those the server allows (`canEdit`). */
function RowActions({ x, onEdit, onDelete }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Open x={x} />
      <SaveButton type="resource" id={x.id} label={x.title} iconOnly size="sm" />
      {x.canEdit && (
        <Menu label={`Actions for ${x.title}`} width={180}
          items={[{ label: x.kind === 'file' ? 'Edit or replace' : 'Edit', icon: 'pen', onSelect: onEdit }, { label: 'Delete', icon: 'x', danger: true, onSelect: onDelete }]}
          trigger={({ props }) => (
            <button type="button" {...props} aria-label={`More for ${x.title}`} title={`More for ${x.title}`} className="btn btn-ghost btn-icon btn-sm !border-transparent !bg-transparent hover:!bg-[var(--az-sunken)]">
              <Icon name="more" size={18} />
            </button>
          )} />
      )}
    </span>
  );
}

function Row({ x, onEdit, onDelete }) {
  const sub = x.kind === 'link' ? host(x.url) : x.description;
  return (
    <tr className="border-b border-[var(--az-divider)] last:border-0">
      <td className="min-w-[16rem] px-4 py-3">
        <span className="flex items-center gap-3"><TypeTile x={x} />
          <span className="min-w-0"><span className="block break-words font-semibold text-[var(--az-text)]">{x.title}</span>{sub && <span className="t-small line-clamp-1">{sub}</span>}</span>
        </span>
      </td>
      <td className="text-2 px-4 py-3">{x.category ?? <><span aria-hidden="true">—</span><span className="sr-only">None</span></>}</td>
      <td className="text-2 whitespace-nowrap px-4 py-3">{x.addedBy.name}</td>
      <td className="text-2 whitespace-nowrap px-4 py-3">{dateOf(x)}{x.kind === 'file' && x.version > 1 && <span title={`Version ${x.version}`}> · v{x.version}</span>}</td>
      <td className="text-2 whitespace-nowrap px-4 py-3 tabular-nums">{x.kind === 'file' ? sizeText(x.file.size) : ''}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right"><RowActions x={x} onEdit={onEdit} onDelete={onDelete} /></td>
    </tr>
  );
}

function MobileRow({ x, onEdit, onDelete }) {
  const meta = [x.category, x.kind === 'link' ? host(x.url) : sizeText(x.file.size), x.addedBy.name, dateOf(x)].filter(Boolean).join(' · ');
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="flex min-w-0 flex-[1_1_12rem] items-center gap-3">
        <TypeTile x={x} />
        <span className="min-w-0"><span className="block break-words font-semibold text-[var(--az-text)]">{x.title}</span>
          <span className="t-small block break-words">{meta}</span></span>
      </span>
      <span className="ml-auto"><RowActions x={x} onEdit={onEdit} onDelete={onDelete} /></span>
    </li>
  );
}

/** Add a link, finish adding an uploaded file, or edit (and for files, replace) a resource. */
function ResourceForm({ g, modal, onClose, onSaved }) {
  const res = modal.resource;
  const [v, setV] = useState({
    title: res?.title ?? (modal.file ? modal.file.name.replace(/\.[^.]+$/, '') : ''),
    description: res?.description ?? '', category: res?.category ?? '', url: res?.url ?? '',
  });
  const [file, setFile] = useState(modal.file ?? res?.file ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  const picker = useRef(null);
  const isLink = modal.mode === 'link' || res?.kind === 'link';
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const replace = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 10 * MB) { setError(tooBig(f)); return; }
    setBusy(true); setError('');
    try { setFile(await uploadFile(g.id, f)); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { title: v.title, description: v.description || null, category: v.category || null };
    try {
      if (res) {
        await api(`/resources/${res.id}`, { method: 'PATCH', body: { ...body, version: res.version, ...(isLink ? { url: v.url } : file && file.id !== res.file?.id ? { fileId: file.id } : {}) } });
        toast('Resource saved');
      } else {
        await api(`/communities/${encodeURIComponent(g.id)}/resources`, { method: 'POST', idempotencyKey: key.current, body: { ...body, ...(isLink ? { url: v.url } : { fileId: file.id }) } });
        toast('Resource added');
      }
      onSaved();
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title={res ? 'Edit resource' : isLink ? 'Add a link' : 'Add a file'} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        {!isLink && file && (
          <div className="sunken flex min-w-0 flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-[var(--az-text)]">{file.name}</span>
            <span className="t-small shrink-0">{sizeText(file.size)}</span>
            {res && <Button size="sm" disabled={busy} onClick={() => picker.current?.click()}>Replace file</Button>}
            <input ref={picker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={replace} />
          </div>
        )}
        {isLink && <Field label="Link"><input className="input" type="url" required placeholder="https://" value={v.url} onChange={set('url')} /></Field>}
        <Field label="Title"><input className="input" required maxLength={200} value={v.title} onChange={set('title')} /></Field>
        <Field label="Category" hint="Optional, for example Guides or Slides"><input className="input" maxLength={40} value={v.category} onChange={set('category')} /></Field>
        <Field label="Description" hint="Optional"><textarea className="input min-h-20" maxLength={1000} value={v.description} onChange={set('description')} /></Field>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : res ? 'Save' : 'Add resource'}</button>
        </div>
      </form>
    </Modal>
  );
}
