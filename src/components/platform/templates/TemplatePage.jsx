// One template (F11, board V2FTemplateAdmin): details, questions and blueprint edited on the
// draft, saved with a revision check (TPL-06), published as the next version after the server's
// check (TPL-05), deactivated or activated, and its version history read-only. Communities made
// from it keep their own setup whatever is published here (F6, TPL-02, TPL-03).
// Editing needs a tablet or desktop; phones get status and Activate or Deactivate (F14).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import { errorText } from '../../../lib/communities.js';
import { dateText, dateTimeText } from '../../../lib/platform.js';
import { toast } from '../../../lib/toast.js';
import { CATEGORIES } from '../../../../shared/categories.js';
import { Icon } from '../../icons.jsx';
import { Badge, Button, Skeleton } from '../../ui/Controls.jsx';
import { confirmAction } from '../../ui/Confirm.jsx';
import BlueprintEditor from './BlueprintEditor.jsx';
import { Fld } from './Fields.jsx';
import QuestionsEditor from './QuestionsEditor.jsx';
import SamplePreview from './SamplePreview.jsx';
import { draftOf, toggleActive } from './actions.js';
import { STATUS, blueprintKey, localChecks, placeOf, plural, serverProblems, useWide } from './shared.js';

const enc = encodeURIComponent;
const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'questions', label: 'Questions' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'preview', label: 'Preview samples' },
  { id: 'usage', label: 'Usage' },
];

const contentOf = (t) => t.draft ?? t.current ?? { version: 1, questionnaire: [], blueprint: {} };
const formOf = (t) => {
  const c = contentOf(t);
  return { name: t.name ?? '', description: t.description ?? '', category: t.category, questionnaire: structuredClone(c.questionnaire ?? []), blueprint: structuredClone(c.blueprint ?? {}) };
};
const contentKey = (f) => JSON.stringify([f.questionnaire, f.blueprint]);
const detailsKey = (f) => JSON.stringify([f.name.trim(), f.description.trim(), f.category]);

export default function TemplatePage({ templateKey, onBack, onUpdated }) {
  const wide = useWide();
  const [s, setS] = useState({ state: 'loading' });
  const [form, setForm] = useState(null);
  const base = useRef(null);
  const [tab, setTab] = useState('questions');
  const [selectedQ, setSelectedQ] = useState(null);
  const [problems, setProblems] = useState(null); // the server's, after a save or publish
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(null);
  const [viewing, setViewing] = useState(null); // an older version, read-only
  const [savedAt, setSavedAt] = useState(null);

  const adopt = useCallback((t, { resetForm = true } = {}) => {
    setS({ state: 'ready', t });
    if (resetForm) { const f = formOf(t); setForm(f); base.current = { content: contentKey(f), details: detailsKey(f) }; }
    onUpdated?.(t);
  }, [onUpdated]);

  const load = useCallback(() => {
    setS({ state: 'loading' }); setStale(false); setProblems(null); setViewing(null);
    api(`/admin/templates/${enc(templateKey)}`)
      .then((d) => adopt(d.template))
      .catch((e) => setS({ state: 'error', message: errorText(e), notFound: e?.status === 404 }));
  }, [templateKey, adopt]);
  useEffect(() => { load(); }, [load]);

  const t = s.t;
  const contentChanged = !!form && contentKey(form) !== base.current?.content;
  const detailsChanged = !!form && detailsKey(form) !== base.current?.details;
  const dirty = contentChanged || detailsChanged;

  // Leaving with unsaved changes asks first; the browser's own leave warning covers reloads.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const back = async () => {
    if (dirty && !(await confirmAction({ title: 'Leave without saving?', body: 'Your changes to this draft aren’t saved yet.', confirm: 'Leave', danger: true }))) return;
    onBack();
  };

  const local = useMemo(() => (form ? localChecks(form.questionnaire, form.blueprint) : []), [form]);
  const shownProblems = problems ?? local;
  const errors = useMemo(() => {
    const out = { details: {}, questions: {}, blueprint: {} };
    for (const p of shownProblems) {
      const place = placeOf(p.field);
      if (place.tab === 'questions' && place.question != null) out.questions[place.question] ??= p.message;
      else if (place.tab === 'details') out.details[p.field] ??= p.message;
      else if (place.tab === 'blueprint' || place.tab === null) { const k = blueprintKey(p.field); if (k) out.blueprint[k] ??= p.message; }
    }
    return out;
  }, [shownProblems]);

  const edit = (patch) => { setForm((f) => ({ ...f, ...patch })); setProblems(null); };

  const [refusedBy, setRefusedBy] = useState('save');
  const refuse = (e, action = 'save') => {
    if (e?.code === 'STALE_VERSION') { setStale(true); return; }
    const list = serverProblems(e);
    setProblems(list); setRefusedBy(action);
    const first = placeOf(list[0]?.field);
    if (first.tab) setTab(first.tab);
    if (first.question != null) setSelectedQ(first.question);
  };

  /** Saves the draft; resolves to the saved template, or null when refused. */
  const save = async () => {
    const body = { revision: t.revision };
    if (detailsChanged) Object.assign(body, { name: form.name.trim(), description: form.description.trim() || null, category: form.category });
    if (contentChanged) Object.assign(body, { questionnaire: form.questionnaire, blueprint: form.blueprint });
    try {
      const d = await api(`/admin/templates/${enc(t.key)}`, { method: 'PATCH', body });
      adopt(d.template); setProblems(null); setSavedAt(Date.now());
      return d.template;
    } catch (e) { refuse(e); return null; }
  };
  const onSave = async () => {
    setBusy('save');
    const saved = await save();
    setBusy(null);
    if (saved) toast('Draft saved');
  };

  const draft = t ? draftOf(t) : null;
  const nextVersion = draft?.version ?? (t?.currentVersion ?? 0) + 1;
  const canPublish = (draft || contentChanged) && !local.length && !stale;
  const publish = async () => {
    const earlier = t.communities ?? 0;
    const ok = await confirmAction({
      title: `Publish version ${nextVersion} of ${t.name}?`,
      body: t.currentVersion
        ? `New communities use version ${nextVersion} from now on. The ${plural(earlier, 'community', 'communities')} made from earlier versions don’t change. Anyone in the middle of creating from version ${t.currentVersion} can still finish with it.`
        : `It becomes active and appears under “Use a template” at once.`,
      confirm: 'Publish version',
    });
    if (!ok) return;
    setBusy('publish');
    let current = t;
    if (dirty) { current = await save(); if (!current) { setBusy(null); return; } }
    try {
      const d = await api(`/admin/templates/${enc(current.key)}/publish`, { method: 'POST', body: { revision: current.revision } });
      adopt(d.template); setProblems(null); setSavedAt(null);
      toast(`Version ${nextVersion} published`);
    } catch (e) { refuse(e, 'publish'); }
    setBusy(null);
  };

  const toggle = async () => {
    setBusy('status');
    const next = await toggleActive(t);
    setBusy(null);
    // The revision moves on; unsaved edits on this page stay.
    if (next) adopt(next, { resetForm: false });
  };

  const view = async (version) => {
    setViewing({ version, state: 'loading' });
    try {
      const d = await api(`/admin/templates/${enc(t.key)}/versions/${version}`);
      setViewing({ version, state: 'ready', v: d.version });
    } catch (e) { setViewing({ version, state: 'error', message: errorText(e) }); }
  };

  if (s.state === 'loading' && !t) return <div className="panel p-5"><Skeleton lines={6} label="Loading the template" /></div>;
  if (s.state === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <BackLink onClick={onBack} />
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span><strong>{s.notFound ? 'That template doesn’t exist.' : 'The template didn’t load.'}</strong> {s.notFound ? '' : s.message}</span>
          {!s.notFound && <Button size="sm" onClick={load}>Try again</Button>}
        </div>
      </div>
    );
  }

  const st = STATUS[t.status] ?? { label: t.status, tone: 'neutral' };
  const live = (t.versions ?? []).find((v) => v.version === t.currentVersion);

  const header = (
    <div className="flex flex-col gap-2">
      <BackLink onClick={back} />
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="t-h2">{t.name}</h3>
        {draft && <Badge tone="info">Draft v{draft.version}</Badge>}
        {t.status !== 'draft' && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>
      <p className="text-2 text-sm">
        {t.currentVersion
          ? <>Live: version {t.currentVersion}, used by {plural(live?.communities ?? 0, 'community', 'communities')}. They keep their setup whatever you publish here.</>
          : <>Not published yet. Nobody can create from it until you publish version 1.</>}
      </p>
    </div>
  );

  const statusButton = t.status !== 'draft' && (
    <Button variant={t.status === 'published' ? 'ghost' : 'secondary'} busy={busy === 'status'} disabled={!!busy && busy !== 'status'} onClick={toggle}>
      {t.status === 'published' ? 'Deactivate' : 'Activate'}
    </Button>
  );

  const versions = <Versions t={t} viewing={viewing?.version} onView={wide ? view : null} />;

  // ---- Phones: the status and Activate or Deactivate only (F14). ----
  if (!wide) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p className="notice notice-info">Open this on a larger screen to edit templates.</p>
        {statusButton && <div>{statusButton}</div>}
        {t.status === 'published' && <p className="t-small">Deactivating hides it from “Use a template” at once. Communities made from it keep working.</p>}
        <div className="panel p-4">{versions}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {stale && (
        <div role="alert" className="notice notice-warn flex flex-wrap items-center justify-between gap-3">
          <span><strong>Another admin saved this template first.</strong> Reload to see their version. Your changes here aren’t saved and will be replaced.</span>
          <Button size="sm" onClick={load}>Reload</Button>
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {viewing ? (
            <OldVersion viewing={viewing} onClose={() => setViewing(null)} onRetry={() => view(viewing.version)} />
          ) : (
            <>
              <div role="tablist" aria-label="Template parts" className="no-scrollbar flex overflow-x-auto border-b border-[var(--az-hairline)]">
                {TABS.map((x) => {
                  const bad = x.id === 'details' ? Object.keys(errors.details).length : x.id === 'questions' ? Object.keys(errors.questions).length : x.id === 'blueprint' ? Object.keys(errors.blueprint).length : 0;
                  return (
                    <button key={x.id} type="button" role="tab" id={`tt-${x.id}`} aria-selected={tab === x.id} aria-controls={`tp-${x.id}`} onClick={() => setTab(x.id)}
                      className={`min-h-11 shrink-0 border-b-2 px-3.5 text-sm ${tab === x.id ? 'border-[var(--az-focus)] font-semibold text-[var(--az-text)]' : 'text-2 border-transparent font-medium hover:text-[var(--az-text)]'}`}>
                      {x.label}{bad > 0 && <span className="ml-1.5 text-[var(--az-danger)]" aria-label={`, ${plural(bad, 'problem')}`}>({bad})</span>}
                    </button>
                  );
                })}
              </div>
              <div role="tabpanel" id={`tp-${tab}`} aria-labelledby={`tt-${tab}`} className="min-w-0">
                {tab === 'details' && <Details form={form} errors={errors.details} onChange={edit} t={t} />}
                {tab === 'questions' && (
                  <QuestionsEditor questions={form.questionnaire} blueprint={form.blueprint} errors={errors.questions} selected={selectedQ} onSelect={setSelectedQ}
                    onChange={(questionnaire) => edit({ questionnaire })} />
                )}
                {tab === 'blueprint' && <BlueprintEditor blueprint={form.blueprint} questions={form.questionnaire} errors={errors.blueprint} onChange={(blueprint) => edit({ blueprint })} />}
                {tab === 'preview' && <SamplePreview questions={form.questionnaire} blueprint={form.blueprint} name={form.name} />}
                {tab === 'usage' && <Usage t={t} />}
              </div>
              <CheckPanel problems={shownProblems} fromServer={problems ? refusedBy : null} onGo={(p) => { const pl = placeOf(p.field); if (pl.tab) setTab(pl.tab); if (pl.question != null) setSelectedQ(pl.question); }} />
            </>
          )}
        </div>

        <aside aria-label="Publishing" className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:h-fit">
          <div className="panel flex flex-col gap-3 p-4">
            <b className="text-[var(--az-text)]">{draft ? `Draft version ${draft.version}` : contentChanged ? `New draft, version ${nextVersion}` : 'No draft'}</b>
            <p className="t-small">
              {savedAt ? `Saved ${dateTimeText(savedAt)}. ` : draft ? `Started ${dateTimeText(draft.createdAt)}. ` : contentChanged ? 'Not saved yet. ' : 'Edit the questions or blueprint to start the next version. '}
              One draft at a time; saves are version-checked, so two people can’t overwrite each other.
            </p>
            {dirty && <p className="t-small font-semibold text-[var(--az-warning)]" role="status">Unsaved changes</p>}
            <Button busy={busy === 'save'} disabled={!dirty || stale || (!!busy && busy !== 'save')} onClick={onSave}>Save draft</Button>
            <Button variant="primary" busy={busy === 'publish'} disabled={!canPublish || (!!busy && busy !== 'publish')} onClick={publish}
              aria-describedby={!canPublish ? 'pub-why' : undefined}>
              Publish version {nextVersion}
            </Button>
            {!canPublish && (
              <span id="pub-why" className="t-small">
                {stale ? 'Reload first.' : local.length ? `Fix ${plural(local.length, 'problem')} first.` : 'No unpublished changes yet.'}
              </span>
            )}
            {statusButton}
          </div>
          <div className="panel p-4">{versions}</div>
        </aside>
      </div>
    </div>
  );
}

function BackLink({ onClick }) {
  return (
    <button type="button" className="link inline-flex w-fit items-center gap-1 text-sm" onClick={onClick}>
      <Icon name="back" size={16} />Templates
    </button>
  );
}

function Details({ form, errors, onChange, t }) {
  return (
    <div className="panel flex flex-col gap-4 p-4 md:p-5">
      <h3 className="t-h3">Details</h3>
      <p className="t-small">Name, description and category are shown on the template card and aren’t versioned: saving them changes the card at once.</p>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Fld id="td-name" label="Name" error={errors.name}>
          {(p) => <input {...p} className="input" maxLength={80} value={form.name} onChange={(e) => onChange({ name: e.target.value })} />}
        </Fld>
        <Fld id="td-cat" label="Category" error={errors.category}>
          {(p) => (
            <select {...p} className="input" value={form.category} onChange={(e) => onChange({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </Fld>
        <Fld id="td-desc" label="Description" hint="Who it’s for and what it sets up, shown on the card." error={errors.description} className="md:col-span-2">
          {(p) => <textarea {...p} rows={3} className="input" maxLength={1000} value={form.description} onChange={(e) => onChange({ description: e.target.value })} />}
        </Fld>
      </div>
      <p className="t-small">Key <span className="badge badge-neutral font-mono">{t.key}</span> · created {dateText(t.createdAt)}</p>
    </div>
  );
}

/** Problems found by the page, or the server's after a save or publish (TPL-05). */
function CheckPanel({ problems, fromServer, onGo }) {
  return (
    <section aria-labelledby="ck-h" className="panel flex flex-col gap-3 p-4 md:p-5">
      <h3 id="ck-h" className="t-h3">Check</h3>
      {problems.length ? (
        <div role={fromServer ? 'alert' : undefined} className="notice notice-bad flex flex-col gap-2">
          <span className="flex items-start gap-2">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-[var(--az-danger)]" />
            <span><strong>{plural(problems.length, 'problem')}.</strong> {fromServer === 'publish' ? 'The server’s check refused this version; nothing was published.' : fromServer ? 'The server refused this; nothing was saved.' : 'Publishing is refused until these are fixed.'}</span>
          </span>
          <ul className="flex flex-col gap-1.5 pl-6">
            {problems.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span>{p.message}</span>
                {placeOf(p.field).tab && <button type="button" className="link text-sm" onClick={() => onGo(p)}>Go to it</button>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-sm text-[var(--az-text)]">
          <Icon name="check" size={18} className="mt-0.5 shrink-0 text-[var(--az-ok)]" />
          <span>Every slot in the blueprint is filled by a question. Publishing runs the full check on the server, including a trial suggestion with sample answers.</span>
        </p>
      )}
    </section>
  );
}

function Versions({ t, viewing, onView }) {
  const list = t.versions ?? [];
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2"><Icon name="clock" size={18} /><b className="text-[var(--az-text)]">Versions</b></span>
      {!list.length ? <p className="t-small">No versions yet.</p> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {list.map((v) => {
            const isLive = v.version === t.currentVersion;
            const text = [v.draft ? 'draft' : null, isLive ? 'live' : null, v.publishedAt ? `published ${dateText(v.publishedAt)}${v.publishedBy ? ` by ${v.publishedBy}` : ''}` : null, plural(v.communities ?? 0, 'community', 'communities')].filter(Boolean).join(' · ');
            return (
              <li key={v.version} className="text-2">
                {v.draft || !onView ? <b className="text-[var(--az-text)]">v{v.version}</b> : (
                  <button type="button" className="link" aria-pressed={viewing === v.version} aria-label={`View version ${v.version}, read-only`} onClick={() => onView(v.version)}>v{v.version}</button>
                )} · {text}
              </li>
            );
          })}
        </ul>
      )}
      <p className="t-small">Older versions are read-only. A community always shows the version it was made from.</p>
    </div>
  );
}

function OldVersion({ viewing, onClose, onRetry }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="notice notice-info flex flex-wrap items-center justify-between gap-3">
        <span><strong>Version {viewing.version}, read-only.</strong> {viewing.v?.publishedAt ? `Published ${dateTimeText(viewing.v.publishedAt)}. ` : ''}Your draft is kept as it is.</span>
        <Button size="sm" onClick={onClose}>Back to the draft</Button>
      </div>
      {viewing.state === 'loading' ? <div className="panel p-5"><Skeleton lines={5} label={`Loading version ${viewing.version}`} /></div>
        : viewing.state === 'error' ? (
          <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
            <span><strong>Version {viewing.version} didn’t load.</strong> {viewing.message}</span>
            <Button size="sm" onClick={onRetry}>Try again</Button>
          </div>
        ) : (
          <>
            <QuestionsEditor readOnly questions={viewing.v.questionnaire ?? []} blueprint={viewing.v.blueprint ?? {}} selected={selected} onSelect={setSelected} onChange={() => {}} />
            <BlueprintEditor readOnly blueprint={viewing.v.blueprint ?? {}} questions={viewing.v.questionnaire ?? []} onChange={() => {}} />
          </>
        )}
    </div>
  );
}

function Usage({ t }) {
  const list = (t.versions ?? []).filter((v) => !v.draft);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="t-h3">Usage</h3>
      <p className="t-small">{plural(t.communities ?? 0, 'community', 'communities')} made from this template, counting every version. Each keeps the setup it was made with.</p>
      {!list.length ? <p className="notice notice-info">Nothing is made from it yet: it hasn’t been published.</p> : (
        <div className="panel relative overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Communities made from each version">
            <thead><tr className="bg-[var(--az-band)] text-left">
              {['Version', 'Published', 'By', 'Communities made'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.version} className="border-b border-[var(--az-divider)] last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold">v{v.version}{v.version === t.currentVersion && <Badge tone="ok" className="ml-2">Live</Badge>}</th>
                  <td className="text-2 px-4 py-3">{dateText(v.publishedAt)}</td>
                  <td className="text-2 px-4 py-3">{v.publishedBy ?? '—'}</td>
                  <td className="text-2 px-4 py-3 tabular-nums">{v.communities ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="t-small">Archived communities are included; deleted ones aren’t.</p>
    </div>
  );
}
