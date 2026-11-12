import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore, timeAgo, fmtDate } from '../lib/store.jsx';
import { PageHeader } from '../components/ui.jsx';
import FileList, { MAX_SIZE, ShareModal, downloadFile, fileIcon, storeUpload } from '../components/collab/FileList.jsx';
import { DocEditor, SheetEditor, SlidesEditor, useObjectUrl } from '../components/collab/editors.jsx';
import { fmtSize, getBlob } from '../components/collab/fileStore.js';
import { toast } from '../lib/toast.js';
import { canSeeGroupItem } from '../components/collab/common.jsx';
import { Icon } from '../components/icons.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';

export default function Files() {
  const { id } = useParams();
  const { state, me } = useStore();
  if (!id) {
    return (
      <>
        <PageHeader title="Files" subtitle="Shared documents, photos and templates for the whole network." />
        <FileList />
      </>
    );
  }
  // Same rule as the file lists: network files, the group's files, your own, or ones shared with you.
  const file = (state.files ?? []).find((f) => f.id === id && (canSeeGroupItem(state, me, f) || f.sharedWith?.includes(me.id)));
  if (!file) return <div className="glass p-8">File not found. <Link to="/files" className="text-brand-400 underline">Back to files</Link></div>;
  return <FileView key={file.id} file={file} />;
}

function FileView({ file }) {
  const { dispatch, me, user } = useStore();
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState(true);
  // Editors are controlled by this local draft; only the store dispatch is debounced.
  const [draft, setDraft] = useState(file.content);
  const draftRef = useRef(file.content);
  const pending = useRef(false);
  const timer = useRef(null);
  const canEdit = file.authorId === me.id || me.admin || file.sharedWith?.includes(me.id);
  const created = file.kind !== 'upload';

  // Write the latest draft to the store; snapshot a version at most every 10 minutes.
  const flushRef = useRef(null);
  flushRef.current = () => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    const content = draftRef.current;
    dispatch({ type: 'update', col: 'files', id: file.id, silent: true, patch: (x, uid) => {
      const last = x.versions?.at(-1);
      const snap = !last || Date.now() - last.at > 10 * 60e3;
      return { ...x, content, updatedAt: Date.now(), versions: snap ? [...(x.versions ?? []), { at: Date.now(), by: uid, content: x.content }] : x.versions };
    } });
    setSaved(true);
  };
  const flush = () => flushRef.current();
  // `next` is new content or an updater of the latest draft.
  const change = (next) => {
    const content = typeof next === 'function' ? next(draftRef.current) : next;
    draftRef.current = content;
    setDraft(content);
    pending.current = true;
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  // Leaving the page saves any edit still waiting on the debounce.
  useEffect(() => () => flushRef.current(), []);
  // Adopt content that changed outside this editor — a restored snapshot, or a save from another
  // tab — unless we have an unsaved local edit (that edit wins and is flushed as usual). Our own
  // flushes write draftRef.current, so they compare equal and are ignored. `rev` re-keys the
  // editors; it is bumped in the same batch as setDraft, so the remounted DocEditor's mount
  // effect sees the adopted content (keying on file.restoredAt remounted it one render early,
  // with the old draft, and its next keystroke wrote that old HTML back).
  const [rev, setRev] = useState(0);
  const restoredAt = file.restoredAt ?? 0;
  const seenRestore = useRef(restoredAt);
  const editorBox = useRef(null);
  // A sheet cell or slide field being typed in isn't "pending" until it commits, so treat a
  // focused field as a local edit too and adopt the outside change once it's done.
  const editingField = () => { const el = document.activeElement; return !!el && editorBox.current?.contains(el) && /^(INPUT|TEXTAREA)$/.test(el.tagName); };
  const [blurTick, setBlurTick] = useState(0);
  useEffect(() => {
    const restored = restoredAt !== seenRestore.current;
    seenRestore.current = restoredAt;
    // Sheets/slides are objects; another tab's state arrives as freshly parsed copies, so compare by value.
    const same = file.content === draftRef.current || JSON.stringify(file.content) === JSON.stringify(draftRef.current);
    if (!restored && (pending.current || same || editingField())) return;
    clearTimeout(timer.current);
    pending.current = false;
    draftRef.current = file.content;
    setDraft(file.content);
    setSaved(true);
    setRev((r) => r + 1);
  }, [file.content, restoredAt, blurTick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Link to="/files" className="text-sm text-brand-400 hover:underline">← Files</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <Icon name={fileIcon(file)} size={26} />
        <input className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500 rounded-lg px-1" defaultValue={file.name} readOnly={!canEdit}
          aria-label="File name" onBlur={(e) => e.target.value.trim() && e.target.value !== file.name && dispatch({ type: 'update', col: 'files', id: file.id, patch: { name: e.target.value.trim() } })} />
        {created && <span className="text-xs text-[var(--az-text-2)]" role="status">{saved ? '✓ Saved' : 'Saving…'}</span>}
        <button className="btn btn-ghost" onClick={() => downloadFile(file)}>Download</button>
        {(file.authorId === me.id || me.admin) && <button className="btn btn-ghost" onClick={() => setShare(true)}>Share</button>}
      </div>
      <p className="mb-4 text-xs text-[var(--az-text-2)]">By {user(file.authorId)?.name} · updated {timeAgo(file.updatedAt ?? file.createdAt)}{file.sharedWith?.length ? ` · shared with ${file.sharedWith.map((i) => user(i)?.name).join(', ')}` : ''}</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <div>
          <div ref={editorBox} onBlur={() => setBlurTick((t) => t + 1)}>
          {file.kind === 'doc' && <DocEditor key={rev} value={draft} onChange={change} readOnly={!canEdit} />}
          {file.kind === 'sheet' && <SheetEditor key={rev} value={draft} onChange={change} readOnly={!canEdit} />}
          {file.kind === 'slides' && <SlidesEditor key={rev} value={draft} onChange={change} readOnly={!canEdit} />}
          </div>
          {file.kind === 'upload' && <Preview file={file} />}
        </div>
        <Versions file={file} canEdit={canEdit} flush={flush} />
      </div>
      {share && <ShareModal file={file} onClose={() => setShare(false)} />}
    </div>
  );
}

function Preview({ file }) {
  const [state, setState] = useState({ blob: null, text: null, missing: false });
  const v = file.versions?.at(-1);
  useEffect(() => {
    let live = true;
    if (!v) { setState({ blob: null, text: null, missing: true }); return undefined; }
    getBlob(v.key).then(async (blob) => {
      if (!live) return;
      if (!blob) return setState({ blob: null, text: null, missing: true });
      const isText = file.type.startsWith('text/') || /json|xml|csv|markdown/.test(file.type);
      setState({ blob, text: isText ? (await blob.text()).slice(0, 200000) : null, missing: false });
    }).catch(() => live && setState({ blob: null, text: null, missing: true }));
    return () => { live = false; };
  }, [v?.key, file.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = useObjectUrl(state.blob);

  if (state.missing) return <div className="panel p-10 text-center text-[var(--az-text-2)]">The file’s content isn’t stored in this browser. Uploads are kept locally in IndexedDB.</div>;
  if (!url) return <div className="glass h-64 animate-pulse" />;
  const t = file.type;
  return (
    <div className="glass overflow-hidden p-2">
      {t.startsWith('image/') && <img src={url} alt={file.name} className="mx-auto max-h-[75vh] rounded-lg" />}
      {t.startsWith('video/') && <video src={url} controls className="mx-auto max-h-[75vh] w-full rounded-lg" />}
      {t.startsWith('audio/') && <audio src={url} controls className="w-full" />}
      {t === 'application/pdf' && <iframe src={url} title={file.name} className="h-[75vh] w-full rounded-lg bg-[#fff]" />}
      {state.text != null && <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-[var(--az-text)] scroll-thin">{state.text}</pre>}
      {!/^(image|video|audio)\//.test(t) && t !== 'application/pdf' && state.text == null && (
        <div className="p-10 text-center text-[var(--az-text-2)]">No preview for this file type. <button className="text-brand-400 underline" onClick={() => downloadFile(file)}>Download it</button>.</div>
      )}
    </div>
  );
}

function Versions({ file, canEdit, flush }) {
  const { dispatch, me, user } = useStore();
  const input = useRef(null);
  const versions = file.versions ?? [];
  const created = file.kind !== 'upload';
  return (
    <aside className="glass h-fit p-4" aria-label="Version history">
      <h2 className="mb-3 font-semibold">Versions</h2>
      {file.kind === 'upload' && canEdit && (
        <>
          <button className="btn btn-ghost mb-3 w-full" onClick={() => input.current.click()}>Upload new version</button>
          <input ref={input} type="file" hidden onChange={async (e) => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > MAX_SIZE) { alert('That file is over the 30 MB limit.'); return; }
            let v;
            try { v = await storeUpload(f, me.id); } catch { toast('Couldn’t store that file — browser storage may be full.', 'error'); return; }
            dispatch({ type: 'update', col: 'files', id: file.id, patch: (x) => ({ ...x, size: f.size, type: f.type || x.type, updatedAt: Date.now(), versions: [...x.versions, v] }) });
          }} />
        </>
      )}
      {!versions.length && <p className="text-sm text-[var(--az-text-2)]">{created ? 'Snapshots are saved as you edit.' : 'No versions.'}</p>}
      <ol className="space-y-2 text-sm">
        {[...versions].reverse().map((v, i) => (
          <li key={v.key ?? v.at} className="rounded-lg bg-[var(--az-sunken)] p-2">
            <div className="font-medium">{created ? `Snapshot ${versions.length - i}` : `v${versions.length - i}`}{!created && i === 0 && <span className="chip ml-2">current</span>}</div>
            <div className="text-xs text-[var(--az-text-2)]">{user(v.by)?.name} · {fmtDate(v.at)}{v.size != null ? ` · ${fmtSize(v.size)}` : ''}</div>
            {created && canEdit && v.content != null && (
              <button className="mt-1 text-xs text-brand-400 hover:underline" onClick={async () => {
                if (!(await confirmAction('Restore this snapshot? Current content is kept as a new snapshot.'))) return;
                flush();
                dispatch({ type: 'update', col: 'files', id: file.id, patch: (x, uid) => ({ ...x, content: v.content, restoredAt: Date.now(), updatedAt: Date.now(), versions: [...x.versions, { at: Date.now(), by: uid, content: x.content }] }) });
              }}>Restore</button>
            )}
            {!created && i > 0 && (
              <button className="mt-1 text-xs text-brand-400 hover:underline" onClick={async () => {
                const b = await getBlob(v.key);
                if (b) { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: v.name ?? file.name }); a.click(); }
              }}>Download this version</button>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
