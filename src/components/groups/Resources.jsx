// A community's Resources tab (Stage 4, board S4Resources): its library of files and links.
// Everything is on the server: files are stored there (decision S4-1) and only download for
// people who can open the community.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { fmtDate } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import SaveButton from '../SaveButton.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const MB = 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.md';
const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const BADGE = { pdf: 'PDF', image: 'IMG', office: 'DOC', text: 'TXT' };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

function useResources(g, { q, category, sort }) {
  const [s, setS] = useState({ status: 'loading', resources: [], categories: [], canAdd: false });
  const load = useCallback(() => {
    const p = new URLSearchParams({ sort, ...(q ? { q } : {}), ...(category ? { category } : {}) });
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
  const [uploading, setUploading] = useState(false);
  const picker = useRef(null);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const r = useResources(g, { q, category, sort });
  const filtered = !!(q || category);

  // Pick a file → upload it → ask for its title and category. Too-large files stop before upload.
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * MB) { toast('Files can be up to 10 MB.', 'error'); return; }
    setUploading(true);
    try { setModal({ mode: 'file', file: await uploadFile(g.id, file) }); } catch (err) { toast(errorText(err), 'error'); } finally { setUploading(false); }
  };
  const remove = async (res) => {
    if (!(await confirmAction(`Delete “${res.title}”? It stops opening for everyone straight away.`))) return;
    try { await api(`/resources/${res.id}`, { method: 'DELETE' }); toast('Resource deleted'); r.reload(); } catch (err) { toast(errorText(err), 'error'); }
  };
  const addButtons = r.canAdd && (
    <>
      <button className="btn btn-ghost" onClick={() => setModal({ mode: 'link' })}>Add link</button>
      <button className="btn btn-primary" disabled={uploading} onClick={() => picker.current?.click()}>{uploading ? 'Uploading…' : 'Upload file'}</button>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <input ref={picker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="input min-w-0 flex-[1_1_240px]" placeholder="Search resources" aria-label="Search resources" value={text} onChange={(e) => setText(e.target.value)} />
        <label className="text-3 flex items-center gap-2 text-sm">Sort
          <select className="input !w-36" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option>
          </select>
        </label>
        {addButtons}
      </div>
      {r.categories.length > 0 && (
        <div role="group" aria-label="Category" className="no-scrollbar flex gap-2 overflow-x-auto">
          {['', ...r.categories].map((cat) => (
            <button key={cat || 'all'} type="button" aria-pressed={category === cat} onClick={() => setCategory(cat)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm ${category === cat ? 'bg-[var(--cm-tint)] font-semibold text-white shadow-[inset_0_0_0_1px_var(--cm-line)]' : 'text-2 border border-[var(--az-hairline)] hover:text-white'}`}>{cat || 'All'}</button>
          ))}
        </div>
      )}

      {r.status === 'loading' && !r.resources.length ? <div aria-busy="true" aria-label="Loading resources" className="glass h-40 animate-pulse" />
        : r.status === 'error' ? <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{r.message}</p><button className="btn btn-ghost mt-3" onClick={r.reload}>Try again</button></div>
          : r.resources.length === 0 ? (
            <section className="raised flex flex-col items-center gap-3 p-8 text-center">
              <Icon name="doc" size={28} />
              <h2 className="t-h2 text-white">{filtered ? 'Nothing matches' : 'No resources yet'}</h2>
              <p className="text-2 max-w-md">{filtered ? 'Try other words or another category.'
                : r.canAdd ? `Share handbooks, slides, photos and useful links with everyone in ${g.name}.` : 'When admins add handbooks, slides or links, they’ll be here.'}</p>
            </section>
          ) : (
            <>
              <div className="glass hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-[var(--az-band)] text-left">
                    {['Name', 'Category', 'Added by', 'Size', 'Added'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
                    <th scope="col" className="border-b border-[var(--az-hairline)] px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr></thead>
                  <tbody>{r.resources.map((x) => <Row key={x.id} x={x} onEdit={() => setModal({ mode: 'edit', resource: x })} onDelete={() => remove(x)} />)}</tbody>
                </table>
              </div>
              <ul className="list-rows md:hidden">{r.resources.map((x) => <MobileRow key={x.id} x={x} onEdit={() => setModal({ mode: 'edit', resource: x })} onDelete={() => remove(x)} />)}</ul>
            </>
          )}
      <p className="t-small">Files: PDF, images, Word, Excel, PowerPoint or plain text, up to 10 MB. They always download; nothing opens as a page. Files aren’t scanned for viruses.</p>
      {modal && <ResourceForm g={g} modal={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); r.reload(); }} />}
    </div>
  );
}

function Open({ x, className = '' }) {
  return x.kind === 'link'
    ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow" className={`btn btn-ghost ${className}`} aria-label={`Open ${x.title} (opens ${host(x.url)})`}>Open</a>
    : <a href={`/api/files/${x.file.id}`} download className={`btn btn-ghost ${className}`} aria-label={`Download ${x.title}`}>Download</a>;
}

function Badge({ x }) {
  return <span className="grid h-8 w-10 shrink-0 place-items-center rounded-md border border-[var(--az-hairline)] text-[10px] font-bold text-white">{x.kind === 'link' ? 'URL' : BADGE[x.file.kind] ?? 'FILE'}</span>;
}

function Row({ x, onEdit, onDelete }) {
  return (
    <tr className="border-b border-[var(--az-divider)] last:border-0">
      <td className="px-4 py-3"><span className="flex items-center gap-3"><Badge x={x} /><span className="min-w-0"><span className="block font-semibold text-white">{x.title}</span>{x.description && <span className="t-small line-clamp-1">{x.description}</span>}</span></span></td>
      <td className="text-2 px-4 py-3">{x.category ?? <span className="text-3">—</span>}</td>
      <td className="text-2 px-4 py-3">{x.addedBy.name}</td>
      <td className="text-2 whitespace-nowrap px-4 py-3 tabular-nums">{x.kind === 'link' ? host(x.url) : sizeText(x.file.size)}</td>
      <td className="text-2 whitespace-nowrap px-4 py-3">{fmtDate(Date.parse(x.createdAt), { day: 'numeric', month: 'short' })}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <span className="inline-flex gap-2"><Open x={x} /><SaveButton type="resource" id={x.id} label={x.title} />{x.canEdit && <Manage x={x} onEdit={onEdit} onDelete={onDelete} />}</span>
      </td>
    </tr>
  );
}

function MobileRow({ x, onEdit, onDelete }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Badge x={x} />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{x.title}</span>
        <span className="t-small">{[x.category, x.kind === 'link' ? host(x.url) : sizeText(x.file.size), x.addedBy.name].filter(Boolean).join(' · ')}</span></span>
      <Open x={x} className="!px-3" />
      <SaveButton type="resource" id={x.id} label={x.title} className="!px-3" />
      {x.canEdit && <Manage x={x} onEdit={onEdit} onDelete={onDelete} />}
    </li>
  );
}

function Manage({ x, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button className="btn btn-ghost w-11 !p-0" aria-label={`Manage ${x.title}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}><Icon name="more" size={18} /></button>
      {open && (
        <span role="menu" className="glass absolute right-0 z-20 mt-1 flex w-44 flex-col p-1.5 text-left text-sm shadow-xl" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="min-h-10 rounded-lg px-3 text-left hover:bg-white/5" onClick={() => { setOpen(false); onEdit(); }}>Edit{x.kind === 'file' ? ' or replace' : ''}</button>
          <button role="menuitem" className="min-h-10 rounded-lg px-3 text-left text-rose-300 hover:bg-white/5" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>
        </span>
      )}
    </span>
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
    if (f.size > 10 * MB) { setError('Files can be up to 10 MB.'); return; }
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
          <div className="sunken flex items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-white">{file.name}</span>
            <span className="text-3 shrink-0">{sizeText(file.size)}</span>
            {res && <button type="button" className="btn btn-ghost min-h-10" disabled={busy} onClick={() => picker.current?.click()}>Replace file</button>}
            <input ref={picker} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={replace} />
          </div>
        )}
        {isLink && <Field label="Link"><input className="input" type="url" required placeholder="https://" value={v.url} onChange={set('url')} /></Field>}
        <Field label="Title"><input className="input" required maxLength={200} value={v.title} onChange={set('title')} /></Field>
        <Field label="Category" hint="Optional, for example Guides or Slides"><input className="input" maxLength={40} value={v.category} onChange={set('category')} /></Field>
        <Field label="Description" hint="Optional"><textarea className="input min-h-20" maxLength={1000} value={v.description} onChange={set('description')} /></Field>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : res ? 'Save' : 'Add resource'}</button>
        </div>
      </form>
    </Modal>
  );
}
