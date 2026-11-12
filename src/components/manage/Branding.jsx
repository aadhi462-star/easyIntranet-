// Manage, Branding (v2 workstream E, decisions E3 to E6, board V2EBranding): an Owner or Admin
// uploads the community's logo and cover and picks one of the six accents, with a live preview of
// the header at desktop and phone width and of the card in Explore. Pictures go to the
// community's file store first (uploadFile); nothing the community shows changes until Save,
// which sends only what changed to PATCH /communities/:id/branding. The server checks the
// picture rules again from the bytes (E4) and records the change in the activity log.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, uploadFile } from '../../lib/api.js';
import { ACCENTS, accentOf, errorText } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';
import { Button } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';
import { useCommunityWrite } from '../groups/useCommunity.js';

const MB = 1024 * 1024;
// The same rules the server applies (server/routes/branding.js PICTURE_RULES): checked here first
// so a picture that can't be used isn't uploaded at all. Shapes allow 2% either way.
const RULES = {
  logo: { maxBytes: 2 * MB, minWidth: 256, minHeight: 256, ratio: 1, shape: 'square', Label: 'Logos' },
  cover: { maxBytes: 5 * MB, minWidth: 1600, minHeight: 400, ratio: 4, shape: '4:1 (for example 1600 by 400 px)', Label: 'Covers' },
};
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const typeMessage = (kind) => `Use a PNG, JPEG or WebP image. SVG and other files can’t be used as a ${kind}.`;
const FAILED = 'The upload didn’t finish. Nothing was changed, and your other choices are kept. Try again.';
const FIELD = { logoFileId: 'logo', coverFileId: 'cover', accent: 'accent' };
const LABEL = { logo: 'logo', cover: 'cover', accent: 'accent' };
const mb = (n) => `${(n / MB).toFixed(1).replace(/\.0$/, '')} MB`;
const ACCENT_NAME = { sky: 'Sky', violet: 'Violet', amber: 'Amber', teal: 'Teal', rose: 'Rose', orange: 'Orange' };

/** Width and height of an image file as the browser decodes it; null when it can't. */
function dimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** The rule a picture breaks, in the server's words, or null when it passes. */
async function checkPicture(kind, file) {
  const r = RULES[kind];
  if (!TYPES.includes(file.type)) return typeMessage(kind);
  if (file.size > r.maxBytes) return `This image is ${mb(file.size)}. ${r.Label} can be up to ${mb(r.maxBytes)}.`;
  const d = await dimensions(file);
  if (!d) return typeMessage(kind);
  if (d.width < r.minWidth || d.height < r.minHeight) return `This image is ${d.width} by ${d.height} px. ${r.Label} need at least ${r.minWidth} by ${r.minHeight}.`;
  if (Math.abs(d.width / d.height - r.ratio) > r.ratio * 0.02) return `This image is ${d.width} by ${d.height} px. ${r.Label} need to be ${r.shape}.`;
  return null;
}

// A picture in the draft: `id` undefined means unchanged, null means removed, otherwise the new
// file's id; `url` is what the preview shows.
const saved = (g) => ({ logo: { url: g.logoUrl ?? null }, cover: { url: g.coverUrl ?? null }, accent: accentOf(g) });

export default function Branding({ g }) {
  const { run } = useCommunityWrite();
  const [draft, setDraft] = useState(() => saved(g));
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(null); // { kind, name }
  const [retry, setRetry] = useState({}); // kind → the file whose upload failed
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'phone' : 'desktop'));
  const objectUrls = useRef([]);
  const inputs = { logo: useRef(null), cover: useRef(null) };

  // Picks up a save made elsewhere (another tab, another admin) once nothing is pending here.
  const sig = `${g.logoUrl}|${g.coverUrl}|${g.accent}`;
  const changes = ['logo', 'cover'].filter((k) => draft[k].id !== undefined).concat(draft.accent !== accentOf(g) ? ['accent'] : []);
  const dirty = changes.length > 0;
  useEffect(() => { if (!dirty) setDraft(saved(g)); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Leaving with unsaved changes asks first (SET-09): closing or reloading the tab, and links
  // inside the app (the router here can't block navigation, so link clicks are caught first).
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    const click = async (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest?.('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href.startsWith('#/')) return;
      const to = href.slice(1);
      if (to === location.pathname + location.search) return;
      e.preventDefault(); e.stopPropagation();
      if (await confirmAction({ title: 'Leave without saving?', body: 'Your branding changes haven’t been saved. Leaving discards them.', confirm: 'Leave', danger: true })) navigate(to);
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true); };
  }, [dirty, location.pathname, location.search, navigate]);

  const clearError = (k) => setErrors((x) => ({ ...x, [k]: undefined, form: undefined }));
  const choose = useCallback(async (kind, file) => {
    if (!file) return;
    setStatus(''); clearError(kind); setRetry((x) => ({ ...x, [kind]: undefined }));
    const broken = await checkPicture(kind, file);
    if (broken) { setErrors((x) => ({ ...x, [kind]: broken })); return; }
    setUploading({ kind, name: file.name });
    try {
      const stored = await uploadFile(g.id, file);
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      setDraft((d) => ({ ...d, [kind]: { id: stored.id, url } }));
    } catch (err) {
      const refused = err instanceof ApiError && err.status >= 400 && err.status < 500;
      setErrors((x) => ({ ...x, [kind]: refused ? (err.code === 'FILE_TYPE' ? typeMessage(kind) : errorText(err)) : FAILED }));
      if (!refused) setRetry((x) => ({ ...x, [kind]: file }));
    } finally {
      setUploading(null);
    }
  }, [g.id]);

  const remove = (kind) => { setStatus(''); clearError(kind); setDraft((d) => ({ ...d, [kind]: { id: null, url: null } })); };
  const discard = () => { setDraft(saved(g)); setErrors({}); setRetry({}); setStatus(''); };

  const save = async (e) => {
    e.preventDefault();
    if (busy || !dirty || uploading) return;
    const body = {};
    if (draft.logo.id !== undefined) body.logoFileId = draft.logo.id;
    if (draft.cover.id !== undefined) body.coverFileId = draft.cover.id;
    if (draft.accent !== accentOf(g)) body.accent = draft.accent;
    setBusy(true); setErrors({}); setStatus('');
    try {
      await run(g.id, () => api(`/communities/${encodeURIComponent(g.id)}/branding`, { method: 'PATCH', body }), { inline: true });
      setDraft((d) => ({ logo: { url: d.logo.url }, cover: { url: d.cover.url }, accent: d.accent }));
      setStatus('Branding saved. Members see it on their next page load; the change is in the activity log.');
    } catch (err) {
      const kind = FIELD[err?.extra?.field];
      setErrors(kind ? { [kind]: errorText(err) } : { form: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const preview = { ...g, accent: draft.accent, logoUrl: draft.logo.url, coverUrl: draft.cover.url };
  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <form onSubmit={save} aria-labelledby="br-h" className="panel flex min-w-0 flex-1 flex-col gap-6 p-5 sm:p-6">
        <div>
          <h2 id="br-h" className="t-h2">Branding</h2>
          <p className="t-small mt-1">How {g.name} looks in its header, in Explore, in My Communities and on Home. Owners and Admins can change it.</p>
        </div>

        <Picture kind="logo" legend="Logo" draft={draft.logo} error={errors.logo} uploading={uploading?.kind === 'logo' ? uploading : null} inputRef={inputs.logo}
          onChoose={choose} onRemove={remove} retry={retry.logo} disabled={!!uploading || busy}
          hint="PNG, JPEG or WebP. Square, at least 256 by 256 px, up to 2 MB. Until you upload one, the tile shows the community’s initials in its accent."
          current={draft.logo.url
            ? <img src={draft.logo.url} alt="Current logo" className="h-16 w-16 rounded-2xl object-cover" />
            : <span role="img" aria-label="Current logo: lettered tile"><CommunityTile c={preview} size={64} /></span>} />

        <Picture kind="cover" legend="Cover" draft={draft.cover} error={errors.cover} uploading={uploading?.kind === 'cover' ? uploading : null} inputRef={inputs.cover}
          onChoose={choose} onRemove={remove} retry={retry.cover} disabled={!!uploading || busy} stacked
          hint="PNG, JPEG or WebP, 4:1, at least 1600 by 400 px, up to 5 MB. It’s centre-cropped: the preview shows what each screen size keeps. Without a cover, the header shows a flat band in the accent tint."
          current={draft.cover.url
            ? <img src={draft.cover.url} alt="Current cover image" className="aspect-[4/1] w-full rounded-xl object-cover" />
            : <div role="img" aria-label="No cover: a flat band in the accent tint" className={`cm-cover cm-${draft.accent} aspect-[4/1] w-full rounded-xl`} />} />

        <fieldset aria-describedby="br-acc-h" className="flex flex-col gap-3">
          <legend className="t-h3 mb-3">Accent</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <label key={a} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--az-focus)] ${draft.accent === a ? 'border-[var(--az-text)] bg-[var(--az-sunken)]' : 'border-[var(--az-hairline)]'}`}>
                <input type="radio" name="accent" value={a} className="sr-only" checked={draft.accent === a}
                  onChange={() => { setStatus(''); clearError('accent'); setDraft((d) => ({ ...d, accent: a })); }} />
                <span aria-hidden="true" className={`cm-tile cm-${a} h-5 w-5 rounded-full`} />
                <span>{ACCENT_NAME[a]}</span>
                {draft.accent === a && <Icon name="check" size={16} />}
              </label>
            ))}
          </div>
          <span id="br-acc-h" className="t-small">Colours the cover band when there’s no cover, the logo tile, the selected section and date tiles. Buttons and links stay the platform colour in every community.</span>
          {errors.accent && <p className="field-error" role="alert">{errors.accent}</p>}
        </fieldset>

        {errors.form && <p className="notice notice-bad" role="alert">{errors.form}</p>}
        {status && <p className="notice notice-info" role="status">{status}</p>}

        {dirty && (
          <div role="region" aria-label="Unsaved changes"
            className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-sunken)] p-3 lg:bottom-4">
            <span className="inline-flex items-center gap-2 text-sm text-[var(--az-text)]"><Icon name="info" size={18} />Unsaved changes: {changes.map((k) => LABEL[k]).join(', ')}</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={discard} disabled={busy}>Discard</Button>
              <Button size="sm" variant="primary" type="submit" busy={busy} disabled={!!uploading}>Save changes</Button>
            </span>
          </div>
        )}
      </form>

      <Preview g={preview} view={view} setView={setView} />
    </div>
  );
}

/** One picture's controls: what it is now, upload or replace, remove, and its rule or error. */
function Picture({ kind, legend, draft, current, hint, error, uploading, retry, inputRef, onChoose, onRemove, disabled, stacked = false }) {
  const has = !!draft.url;
  const errorId = `br-${kind}-e`;
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`br-${kind}-h${error ? ` ${errorId}` : ''}`}>
      <legend className="t-h3 mb-3">{legend}</legend>
      <div className={stacked ? 'flex flex-col gap-3' : 'flex flex-wrap items-start gap-4'}>
        {current}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onChoose(kind, f); }} />
          <div className="flex flex-wrap gap-2">
            <Button icon="image" busy={!!uploading} disabled={disabled} onClick={() => inputRef.current?.click()}>{has ? `Replace ${kind}` : `Upload ${kind}`}</Button>
            <Button variant="ghost" disabled={!has || disabled} onClick={() => onRemove(kind)}>{kind === 'logo' ? 'Remove' : 'Remove cover'}</Button>
          </div>
          {!stacked && <span id={`br-${kind}-h`} className="t-small">{hint}</span>}
        </div>
      </div>
      {stacked && <span id={`br-${kind}-h`} className="t-small">{hint}</span>}
      {uploading && <p className="t-small" role="status">Uploading {uploading.name}…</p>}
      {error && (
        <div id={errorId} role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-start gap-2"><Icon name="alert" size={18} className="mt-0.5 shrink-0 text-[var(--az-danger)]" />{error}</span>
          {retry && <Button size="sm" onClick={() => onChoose(kind, retry)}>Try again</Button>}
        </div>
      )}
    </fieldset>
  );
}

const SECTION_TABS = ['Overview', 'Discussions', 'Learning', 'Events', 'Resources', 'Members'];

/** The header drawn with the unsaved choices, at desktop or phone width, and the card. */
function Preview({ g, view, setView }) {
  const phone = view === 'phone';
  const meta = [g.type || null, g.accessType === 'restricted' ? 'Private' : g.accessType === 'private' ? 'Closed' : 'Public', `${g.memberCount ?? 0} members`].filter(Boolean).join(' · ');
  const visibility = g.accessType === 'restricted' ? 'private' : g.accessType === 'private' ? 'closed' : 'public';
  return (
    <section aria-labelledby="br-pv" className="panel flex w-full min-w-0 flex-col gap-4 p-5 xl:sticky xl:top-24 xl:w-[440px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="br-pv" className="t-h3">Preview</h2>
        <div role="group" aria-label="Preview size" className="inline-flex rounded-lg border border-[var(--az-hairline)] p-0.5">
          {[['desktop', 'monitor', 'Desktop'], ['phone', 'user', 'Phone']].map(([id, icon, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${view === id ? 'bg-[var(--az-sunken)] text-[var(--az-text)]' : 'text-[var(--az-text-2)]'}`}>
              <Icon name={icon} size={16} />{label}
            </button>
          ))}
        </div>
      </div>
      <p className="t-small">Unsaved changes, drawn with the real header. Nobody else sees them until you save.</p>

      <span className="t-label">{phone ? 'Phone header' : 'Desktop header'}</span>
      <div className={`overflow-hidden rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] ${phone ? 'mx-auto w-full max-w-[260px]' : 'w-full'}`}>
        {g.coverUrl
          ? <img src={g.coverUrl} alt={`Cover crop at ${phone ? 390 : 1280} px`} className={`w-full object-cover object-center ${phone ? 'aspect-[13/4]' : 'aspect-[32/5]'}`} />
          : <div role="img" aria-label="Cover band in the accent tint" className={`cm-cover cm-${g.accent} w-full ${phone ? 'aspect-[13/4]' : 'aspect-[32/5]'}`} />}
        <div className={`flex gap-3 px-3 pb-3 ${phone ? 'flex-col' : 'items-end'}`}>
          <span className={`-mt-6 inline-block rounded-2xl border-2 border-[var(--az-surface)] ${phone ? 'self-start' : ''}`}>
            {g.logoUrl ? <img src={g.logoUrl} alt="" className={`${phone ? 'h-10 w-10' : 'h-14 w-14'} rounded-xl object-cover`} /> : <CommunityTile c={g} size={phone ? 40 : 56} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-[var(--az-text)]">{g.name}</span>
            <span className="t-small block truncate">{meta}</span>
          </span>
        </div>
        <div className="no-scrollbar flex gap-4 overflow-x-auto border-t border-[var(--az-divider)] px-3">
          {SECTION_TABS.map((t, i) => (
            <span key={t} className={`shrink-0 border-b-2 py-2 text-xs ${i === 0 ? `cm-${g.accent} border-[var(--cm-ink)] font-semibold text-[var(--az-text)]` : 'border-transparent text-[var(--az-text-2)]'}`}>{t}</span>
          ))}
        </div>
      </div>

      <span className="t-label">In Explore and My Communities</span>
      <div className="overflow-hidden rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)]">
        {g.coverUrl
          ? <img src={g.coverUrl} alt="" className="aspect-[4/1] w-full object-cover object-center" />
          : <div aria-hidden="true" className={`cm-cover cm-${g.accent} aspect-[4/1] w-full`} />}
        <div className="flex flex-col gap-2 p-3">
          <span className="flex items-center gap-2">
            {g.logoUrl ? <img src={g.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <CommunityTile c={g} size={36} />}
            <span className="truncate font-semibold text-[var(--az-text)]">{g.name}</span>
          </span>
          {g.description && <span className="t-small line-clamp-2">{g.description}</span>}
          <span className="t-small flex items-center gap-2"><VisibilityBadge visibility={visibility} />{g.memberCount ?? 0} members</span>
        </div>
      </div>
    </section>
  );
}
