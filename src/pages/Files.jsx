import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore, timeAgo, fmtDate } from '../lib/store.jsx';
import { PageHeader } from '../components/ui.jsx';
import FileList, { MAX_SIZE, ShareModal, downloadFile, fileIcon, storeUpload } from '../components/collab/FileList.jsx';
import { DocEditor, SheetEditor, SlidesEditor, useObjectUrl } from '../components/collab/editors.jsx';
import { fmtSize, getBlob } from '../components/collab/fileStore.js';

export default function Files() {
  const { id } = useParams();
  const { state } = useStore();
  if (!id) {
    return (
      <>
        <PageHeader title="Files" subtitle="Shared documents, photos and templates for the whole network." />
        <FileList />
      </>
    );
  }
  const file = (state.files ?? []).find((f) => f.id === id);
  if (!file) return <div className="glass p-8">File not found. <Link to="/files" className="text-brand-400 underline">Back to files</Link></div>;
  return <FileView key={file.id} file={file} />;
}

function FileView({ file }) {
  const { dispatch, me, user } = useStore();
  const [share, setShare] = useState(false);
  const [saved, setSaved] = useState(true);
  const timer = useRef(null);
  const canEdit = file.authorId === me.id || me.admin || file.sharedWith?.includes(me.id);
  const created = file.kind !== 'upload';

  // Debounced autosave for created docs; snapshot a version at most every 10 minutes.
  const change = (content) => {
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dispatch({ type: 'update', col: 'files', id: file.id, silent: true, patch: (x, uid) => {
        const last = x.versions?.at(-1);
        const snap = !last || Date.now() - last.at > 10 * 60e3;
        return { ...x, content, updatedAt: Date.now(), versions: snap ? [...(x.versions ?? []), { at: Date.now(), by: uid, content: x.content }] : x.versions };
      } });
      setSaved(true);
    }, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div>
      <Link to="/files" className="text-sm text-brand-400 hover:underline">← Files</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <span className="text-2xl" aria-hidden="true">{fileIcon(file)}</span>
        <input className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500 rounded-lg px-1" defaultValue={file.name} readOnly={!canEdit}
          aria-label="File name" onBlur={(e) => e.target.value.trim() && e.target.value !== file.name && dispatch({ type: 'update', col: 'files', id: file.id, patch: { name: e.target.value.trim() } })} />
        {created && <span className="text-xs text-slate-400" role="status">{saved ? '✓ Saved' : 'Saving…'}</span>}
        <button className="btn btn-ghost" onClick={() => downloadFile(file)}>⬇ Download</button>
        {(file.authorId === me.id || me.admin) && <button className="btn btn-ghost" onClick={() => setShare(true)}>Share</button>}
      </div>
      <p className="mb-4 text-xs text-slate-400">By {user(file.authorId)?.name} · updated {timeAgo(file.updatedAt ?? file.createdAt)}{file.sharedWith?.length ? ` · shared with ${file.sharedWith.map((i) => user(i)?.name).join(', ')}` : ''}</p>

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <div>
          {file.kind === 'doc' && <DocEditor key={file.restoredAt ?? 0} value={file.content} onChange={change} readOnly={!canEdit} />}
          {file.kind === 'sheet' && <SheetEditor key={file.restoredAt ?? 0} value={file.content} onChange={change} readOnly={!canEdit} />}
          {file.kind === 'slides' && <SlidesEditor key={file.restoredAt ?? 0} value={file.content} onChange={change} readOnly={!canEdit} />}
          {file.kind === 'upload' && <Preview file={file} />}
        </div>
        <Versions file={file} canEdit={canEdit} />
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

  if (state.missing) return <div className="glass p-10 text-center text-slate-400">The file’s content isn’t stored in this browser. Uploads are kept locally in IndexedDB.</div>;
  if (!url) return <div className="glass h-64 animate-pulse" />;
  const t = file.type;
  return (
    <div className="glass overflow-hidden p-2">
      {t.startsWith('image/') && <img src={url} alt={file.name} className="mx-auto max-h-[75vh] rounded-lg" />}
      {t.startsWith('video/') && <video src={url} controls className="mx-auto max-h-[75vh] w-full rounded-lg" />}
      {t.startsWith('audio/') && <audio src={url} controls className="w-full" />}
      {t === 'application/pdf' && <iframe src={url} title={file.name} className="h-[75vh] w-full rounded-lg bg-white" />}
      {state.text != null && <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-slate-200 scroll-thin">{state.text}</pre>}
      {!/^(image|video|audio)\//.test(t) && t !== 'application/pdf' && state.text == null && (
        <div className="p-10 text-center text-slate-400">No preview for this file type. <button className="text-brand-400 underline" onClick={() => downloadFile(file)}>Download it</button>.</div>
      )}
    </div>
  );
}

function Versions({ file, canEdit }) {
  const { dispatch, me, user } = useStore();
  const input = useRef(null);
  const versions = file.versions ?? [];
  const created = file.kind !== 'upload';
  return (
    <aside className="glass h-fit p-4" aria-label="Version history">
      <h2 className="mb-3 font-semibold">Versions</h2>
      {file.kind === 'upload' && canEdit && (
        <>
          <button className="btn btn-ghost mb-3 w-full" onClick={() => input.current.click()}>⬆ Upload new version</button>
          <input ref={input} type="file" hidden onChange={async (e) => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > MAX_SIZE) { alert('That file is over the 30 MB limit.'); return; }
            const v = await storeUpload(f, me.id);
            dispatch({ type: 'update', col: 'files', id: file.id, patch: (x) => ({ ...x, size: f.size, type: f.type || x.type, updatedAt: Date.now(), versions: [...x.versions, v] }) });
          }} />
        </>
      )}
      {!versions.length && <p className="text-sm text-slate-400">{created ? 'Snapshots are saved as you edit.' : 'No versions.'}</p>}
      <ol className="space-y-2 text-sm">
        {[...versions].reverse().map((v, i) => (
          <li key={v.key ?? v.at} className="rounded-lg bg-white/5 p-2">
            <div className="font-medium">{created ? `Snapshot ${versions.length - i}` : `v${versions.length - i}`}{!created && i === 0 && <span className="chip ml-2">current</span>}</div>
            <div className="text-xs text-slate-400">{user(v.by)?.name} · {fmtDate(v.at)}{v.size != null ? ` · ${fmtSize(v.size)}` : ''}</div>
            {created && canEdit && v.content != null && (
              <button className="mt-1 text-xs text-brand-400 hover:underline" onClick={() => {
                if (!confirm('Restore this snapshot? Current content is kept as a new snapshot.')) return;
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
