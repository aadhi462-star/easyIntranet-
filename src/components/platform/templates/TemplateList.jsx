// Administration → Templates: what people see under "Use a template" (F11). Category, status,
// live version, any draft, how many communities each made, filters and New template. Phones get
// the list and Activate or Deactivate only (F14).
import { useMemo, useState } from 'react';
import { api } from '../../../lib/api.js';
import { errorText } from '../../../lib/communities.js';
import { dateText } from '../../../lib/platform.js';
import { CATEGORIES } from '../../../../shared/categories.js';
import { Modal } from '../../ui.jsx';
import { Icon } from '../../icons.jsx';
import { Badge, Button, Skeleton } from '../../ui/Controls.jsx';
import { Fld } from './Fields.jsx';
import { draftOf, lastPublished, toggleActive } from './actions.js';
import { STATUS, keyFor, plural, useWide } from './shared.js';

const HEAD = ['Template', 'Category', 'Status', 'Live version', 'Draft', 'Communities made', 'Last published', 'Actions'];
// Below 1280 px each row stacks, and every value carries its column's name.
const CELL = 'flex items-baseline justify-between gap-3 px-4 py-1.5 xl:table-cell xl:px-2.5 xl:py-3';
const Label = ({ children }) => <span aria-hidden="true" className="t-label xl:hidden">{children}</span>;
const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'active', label: 'Active', test: (t) => t.status === 'published' },
  { id: 'inactive', label: 'Inactive', test: (t) => t.status === 'inactive' },
  { id: 'draft', label: 'With a draft', test: (t) => !!draftOf(t) },
];

export default function TemplateList({ s, onRetry, onOpen, onUpdated }) {
  const wide = useWide();
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);
  const list = s.templates ?? [];
  const shownList = useMemo(() => list.filter(FILTERS.find((f) => f.id === filter).test), [list, filter]);

  const toggle = async (t) => {
    setBusy(t.key);
    const next = await toggleActive(t);
    setBusy(null);
    if (next) onUpdated(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-2 max-w-2xl text-sm">What people see under “Use a template”. Changing a template never changes communities already made from it.</p>
        {wide ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)} disabled={s.state !== 'ready'}>New template</Button>
          : <p className="t-small">Create and edit templates on a larger screen.</p>}
      </div>

      {s.state === 'loading' ? (
        <div className="panel p-5"><Skeleton lines={6} label="Loading templates" /></div>
      ) : s.state === 'error' ? (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span><strong>Templates didn’t load.</strong> {s.message}</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      ) : !list.length ? (
        <div className="notice notice-info flex flex-wrap items-center justify-between gap-3">
          <span>There are no templates yet. People can still start a community from scratch.</span>
          {wide && <Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>New template</Button>}
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filter templates" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="filter-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} · {list.filter(f.test).length}
              </button>
            ))}
          </div>

          {!shownList.length ? (
            <p className="notice notice-info">No templates match this filter.</p>
          ) : (
            <div className="panel relative overflow-x-auto">
              <table className="block w-full border-collapse text-sm xl:table" aria-label="Templates">
                <thead className="sr-only xl:not-sr-only xl:table-header-group">
                  <tr className="bg-[var(--az-band)] text-left">
                    {HEAD.map((h) => <th key={h} scope="col" className="t-label border-b border-[var(--az-hairline)] px-2.5 py-3 align-bottom">{h === 'Actions' ? <span className="sr-only">{h}</span> : h}</th>)}
                  </tr>
                </thead>
                <tbody className="block xl:table-row-group">
                  {shownList.map((t) => {
                    const st = STATUS[t.status] ?? { label: t.status, tone: 'neutral' };
                    const draft = draftOf(t);
                    return (
                      <tr key={t.key} className="block border-b border-[var(--az-divider)] py-2 last:border-0 xl:table-row xl:py-0">
                        <th scope="row" className={`${CELL} text-left font-semibold`}>
                          <Label>{HEAD[0]}</Label>
                          <button type="button" className="link text-left" onClick={() => onOpen(t.key)}>{t.name}</button>
                        </th>
                        <td className={`${CELL} text-2`}><Label>{HEAD[1]}</Label><span>{t.category}</span></td>
                        <td className={CELL}><Label>{HEAD[2]}</Label><Badge tone={st.tone}>{st.label}</Badge></td>
                        <td className={`${CELL} text-2 tabular-nums`}><Label>{HEAD[3]}</Label><span>{t.currentVersion ? `v${t.currentVersion}` : '—'}</span></td>
                        <td className={CELL}><Label>{HEAD[4]}</Label>{draft ? <Badge tone="info">Draft v{draft.version}</Badge> : <span className="text-3">—</span>}</td>
                        <td className={`${CELL} text-2 tabular-nums`}><Label>{HEAD[5]}</Label><span>{t.communities ?? 0}</span></td>
                        <td className={`${CELL} text-2`}><Label>{HEAD[6]}</Label><span>{dateText(lastPublished(t))}</span></td>
                        <td className={CELL}>
                          <Label>{HEAD[7]}</Label>
                          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                            {wide && <button type="button" className="link inline-flex items-center gap-1 text-sm" aria-label={`Edit ${t.name}`} onClick={() => onOpen(t.key)}><Icon name="pen" size={16} />Edit</button>}
                            {t.status === 'draft' ? <span className="t-small self-center">Not published</span> : (
                              <Button size="sm" variant={t.status === 'published' ? 'ghost' : 'secondary'} busy={busy === t.key} onClick={() => toggle(t)}
                                aria-label={`${t.status === 'published' ? 'Deactivate' : 'Activate'} ${t.name}`}>
                                {t.status === 'published' ? 'Deactivate' : 'Activate'}
                              </Button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="t-small">Communities made counts every community created from any version that hasn’t been deleted, with archived ones included. {plural(list.length, 'template')} in all.</p>
        </>
      )}

      {creating && <NewTemplate taken={list.map((t) => t.key)} onClose={() => setCreating(false)} onCreated={(t) => { setCreating(false); onUpdated(t); onOpen(t.key); }} />}
    </div>
  );
}

/** A new template starts as a draft, version 1: nobody sees it until it's published. */
function NewTemplate({ taken, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', key: '', category: CATEGORIES[0], description: '' });
  const [keyEdited, setKeyEdited] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setErrors({}); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Give it a name of 2 to 80 characters.';
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(f.key)) errs.key = 'Use 2 to 40 lowercase letters, digits and hyphens, starting with a letter.';
    else if (taken.includes(f.key)) errs.key = 'Another template already uses that key.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      const d = await api('/admin/templates', { method: 'POST', idempotent: true,
        body: { key: f.key, name: f.name.trim(), category: f.category, description: f.description.trim() || null, questionnaire: [], blueprint: { name: f.name.trim() } } });
      onCreated(d.template);
    } catch (err) {
      const field = err?.extra?.field;
      if (field && ['name', 'key', 'category', 'description'].includes(field)) setErrors({ [field]: errorText(err) }); else setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="New template" onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Fld id="nt-name" label="Name" error={errors.name}>
          {(p) => <input {...p} className="input" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value, ...(keyEdited ? {} : { key: keyFor(e.target.value) }) })} />}
        </Fld>
        <Fld id="nt-key" label="Key" hint="Lowercase letters, digits and hyphens. It names the template in links and can’t be changed later." error={errors.key}>
          {(p) => <input {...p} className="input font-mono" maxLength={40} spellCheck={false} value={f.key}
            onChange={(e) => { setKeyEdited(true); set({ key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }); }} />}
        </Fld>
        <Fld id="nt-cat" label="Category" error={errors.category}>
          {(p) => (
            <select {...p} className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </Fld>
        <Fld id="nt-desc" label="Who it’s for" hint="One line, shown on the template card." error={errors.description}>
          {(p) => <input {...p} className="input" maxLength={1000} value={f.description} onChange={(e) => set({ description: e.target.value })} />}
        </Fld>
        <p className="t-small">Starts as an inactive draft, version 1. Nobody sees it until it’s published and active.</p>
        {error && <p role="alert" className="notice notice-bad"><strong>The template wasn’t created.</strong> {error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>Create draft</Button>
        </div>
      </form>
    </Modal>
  );
}
