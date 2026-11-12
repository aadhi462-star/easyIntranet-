// Community settings, shared parts (v2 workstream G, G1; boards V2GSettings and V2GPhoneSettings).
// Each settings section is its own page with its own Save and Discard. A section keeps only the
// fields someone changed (its "edits") on top of what the server last said, so a reload after a
// conflict shows the other admin's values everywhere except where this person made a choice.
// Saving sends only that section's fields, with the community's version (SET-03); leaving with
// unsaved changes asks first, in the app and on page close (SET-09).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api.js';
import { communityApi, errorText } from '../../lib/communities.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { useCommunityWrite } from '../groups/useCommunity.js';

/** True below the desktop layout (the bottom bar shows): Manage becomes a list of pages (G12). */
export function useNarrow() {
  const query = '(max-width: 1023px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return narrow;
}

/**
 * Asks before leaving with unsaved changes: closing or reloading the tab (beforeunload), and
 * links inside the app (the router here can't block navigation, so link clicks are caught first).
 */
export function useLeaveGuard(dirty, label) {
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
      if (await confirmAction({ title: `Discard your changes to ${label}?`, body: 'They haven’t been saved. Leaving discards them.', confirm: 'Discard and leave', cancel: 'Keep editing', danger: true })) navigate(to);
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true); };
  }, [dirty, label, location.pathname, location.search, navigate]);
}

/**
 * The community as the server stores it (GET /communities/:id: settings, version, sections),
 * re-read whenever the store's copy moves on (another write here, Branding, Archive). `save`
 * sends a PATCH with the version last read and keeps the answer; the store is refreshed too.
 */
export function useSettingsSource(g) {
  const { run } = useCommunityWrite();
  const [s, setS] = useState({ status: 'loading' });
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const reload = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}`)
    .then((d) => { if (live.current) setS({ status: 'ready', community: d.community, sections: d.sections ?? {} }); return d; })
    .catch((e) => { if (live.current) setS((p) => (p.status === 'ready' ? p : { status: 'error', message: errorText(e) })); }), [g.id]);
  useEffect(() => { reload(); }, [reload, g.serverVersion, g.status]);
  const version = s.community?.version ?? g.serverVersion ?? 1;
  const save = useCallback(async (body) => {
    const res = await run(g.id, () => communityApi.update(g.id, { version, ...body }), { inline: true });
    if (res?.community && live.current) {
      setS((p) => ({ ...p, community: { ...p.community, ...res.community }, sections: res.community.settings?.sections && Array.isArray(res.community.settings.sections)
        ? Object.fromEntries(Object.keys(p.sections ?? {}).map((k) => [k, res.community.settings.sections.includes(k)])) : p.sections }));
    }
    return res;
  }, [g.id, run, version]);
  return { ...s, settings: s.community?.settings ?? {}, version, reload, save };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * One section's draft: `value` is the server's values with this person's edits on top. `submit`
 * takes the body to PATCH; a STALE_VERSION answer sets `conflict`, and `reload` re-reads the
 * community while keeping the edits, so the person's choice stays selected.
 */
export function useSectionDraft(src, base) {
  const [edits, setEdits] = useState({});
  const [st, setSt] = useState({ busy: false, error: null, conflict: false });
  const value = useMemo(() => ({ ...base, ...edits }), [base, edits]);
  const changed = Object.keys(edits).filter((k) => !same(edits[k], base[k]));
  const dirty = changed.length > 0;
  const set = useCallback((k, v) => { setEdits((e) => ({ ...e, [k]: v })); setSt((x) => ({ ...x, error: null })); }, []);
  const discard = () => { setEdits({}); setSt({ busy: false, error: null, conflict: false }); };
  const submit = async (body, { ok = 'Saved' } = {}) => {
    setSt({ busy: true, error: null, conflict: false });
    try {
      const res = await src.save(body);
      setEdits({});
      setSt({ busy: false, error: null, conflict: false });
      toast(ok);
      return res;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'STALE_VERSION') setSt({ busy: false, error: null, conflict: true });
      else setSt({ busy: false, error: err, conflict: false });
      return null;
    }
  };
  const reload = async () => { await src.reload(); setSt((x) => ({ ...x, conflict: false })); };
  /** The server's message when it named this field (`name`, or `settings.audience`). */
  const fieldError = (...fields) => {
    const f = st.error?.extra?.field;
    return f && fields.includes(f) ? errorText(st.error) : null;
  };
  return { value, set, changed, dirty, discard, submit, reload, fieldError, ...st };
}

/**
 * A settings section page: its title and lede, the fields, and the Save bar, pinned above the
 * bottom bar on phones while there are unsaved changes. `summary` says what changed.
 */
export function SectionForm({ title, lede, draft, summary, onSave, who = 'Owners and Admins', fields = [], children, footer = true }) {
  const id = useId();
  useLeaveGuard(draft.dirty, title);
  // An error the server tied to a field shown here appears at that field; anything else here.
  const formError = !draft.error ? null : fields.includes(draft.error.extra?.field) ? 'Check the field marked above.' : errorText(draft.error);
  const submit = (e) => { e.preventDefault(); if (!draft.busy && draft.dirty) onSave(); };
  return (
    <form onSubmit={submit} aria-labelledby={`${id}-h`} className="flex min-w-0 flex-col gap-6" noValidate>
      <header className="flex flex-col gap-1">
        <span className="t-label">Settings{who ? ` · ${who}` : ''}</span>
        <h2 id={`${id}-h`} className="t-h2">{title}</h2>
        {lede && <p className="t-small max-w-2xl">{lede}</p>}
      </header>
      {children}
      {draft.conflict && (
        <div role="alert" className="notice notice-warn flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-[1_1_240px]">Another admin saved changes to these settings first. Reload to see theirs; your choices stay selected so you can save them again.</span>
          <Button size="sm" icon="repeat" onClick={draft.reload}>Reload this section</Button>
        </div>
      )}
      {formError && <p role="alert" className="notice notice-bad">{formError}</p>}
      {draft.dirty ? (
        <div role="region" aria-label="Unsaved changes"
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] px-4 py-3 shadow-[var(--az-shadow)] lg:bottom-4">
          <span className="min-w-0 flex-[1_1_200px] text-sm text-[var(--az-text)]">{summary || 'You have unsaved changes.'}</span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={draft.discard} disabled={draft.busy}>Discard</Button>
            <Button variant="primary" type="submit" busy={draft.busy}>Save changes</Button>
          </span>
        </div>
      ) : footer && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" type="submit" disabled>Save</Button>
          <span className="t-small">Nothing changed yet</span>
        </div>
      )}
    </form>
  );
}

/** A rule the platform sets: shown as a row, never as a disabled field (SET-01). */
export function Locked({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-[var(--az-sunken)] px-3.5 py-2.5 text-sm text-[var(--az-text)]">
      <Badge>Managed by CommunityOne</Badge>
      <span className="min-w-0 flex-[1_1_260px]">{children}</span>
    </div>
  );
}

/** A group of fields with a heading inside a section. */
export function Group({ title, hint, children, aside }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="panel flex min-w-0 flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-[1_1_240px]">
          <h3 id={`${id}-h`} className="t-h3">{title}</h3>
          {hint && <p className="t-small mt-0.5">{hint}</p>}
        </span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A labelled text field or textarea; its hint and error are linked with aria-describedby. */
export function TextField({ label, hint, error, value, onChange, multiline = false, rows = 4, maxLength, ...rest }) {
  const id = useId();
  const described = [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--az-text)]">{label}</label>
      <Tag id={id} className={`input w-full ${multiline ? 'min-h-24 py-2.5' : ''}`} rows={multiline ? rows : undefined} value={value ?? ''} maxLength={maxLength}
        aria-describedby={described} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} {...rest} />
      {hint && <span id={`${id}-h`} className="t-small">{hint}</span>}
      {error && <span id={`${id}-e`} className="field-error">{error}</span>}
    </div>
  );
}

/** Radio options drawn as rows with a title and a hint (board: Visibility, Who can post). */
export function Choices({ legend, hint, value, onChange, options, name }) {
  const id = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={hint ? `${id}-h` : undefined}>
      <legend className="mb-1 text-sm font-semibold text-[var(--az-text)]">{legend}</legend>
      {hint && <span id={`${id}-h`} className="t-small -mt-1">{hint}</span>}
      {options.map((o) => (
        <label key={o.value} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-[15px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--az-focus)] ${value === o.value ? 'border-[var(--az-focus)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-hairline)] bg-[var(--az-surface)] hover:bg-[var(--az-sunken)]'}`}>
          <input type="radio" name={name ?? id} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)}
            aria-describedby={o.hint ? `${id}-${o.value}` : undefined} className="mt-1 h-[18px] w-[18px] shrink-0 accent-[var(--az-focus)]" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-[var(--az-text)]">
              {o.icon && <Icon name={o.icon} size={18} />}{o.label}{o.current && <Badge tone="info">Current</Badge>}
            </span>
            {o.hint && <span id={`${id}-${o.value}`} className="t-small">{o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** A row that leads somewhere else: what it is, a line about it, and a link. */
export function InfoRow({ title, children, to, action }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--az-divider)] py-3 first:border-t-0 first:pt-0">
      <span className="min-w-0 flex-[1_1_260px]">
        <span className="block text-[15px] font-semibold text-[var(--az-text)]">{title}</span>
        {children && <span className="t-small block">{children}</span>}
      </span>
      {to && <Link to={to} className="link text-sm font-semibold">{action}</Link>}
    </div>
  );
}

/** The community's member list (Roles, Moderation, Danger Zone): { status, list, reload }. */
export function useMemberList(g) {
  const [s, setS] = useState({ status: 'loading', list: [] });
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/members`)
    .then((d) => setS({ status: 'ready', list: d.members ?? [] }))
    .catch((e) => setS({ status: 'error', list: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load, g.memberCount]);
  return { ...s, reload: load };
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const changedText = (labels) => (labels.length ? `You changed ${labels.join(', ')}.` : '');
