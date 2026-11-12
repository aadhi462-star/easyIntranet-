// Step 2, Questions (templates only; F3, F12, board V2FQuestionnaire). Only the chosen template's
// questions, every one optional, each saying what it fills; the panel beside them shows what will
// be set up, from POST /templates/:key/suggest a moment after each change. Skip questions uses the
// template's defaults.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';
import { Button, Skeleton } from '../ui/Controls.jsx';
import { cleanAnswers, communityKind, fillsOf, fromSuggestion, numberWord, optionsOf, shown, VISIBILITY } from './draft.js';
import { ChipList, StepBar, StepTitle } from './parts.jsx';

const DEBOUNCE = 600;
const SECTION_NAME = { discussions: 'Discussions', events: 'Events', resources: 'Resources', learning: 'Learning' };
const ROLE_NAME = { moderator: 'Moderator', instructor: 'Instructor', teaching_assistant: 'Teaching Assistant' };

/** Calls suggest for the answers; resolves to { config } or throws an ApiError. */
export function suggest(template, answers) {
  return api(`/templates/${encodeURIComponent(template.key)}/suggest`, { method: 'POST', body: { answers, version: template.version } });
}

export default function QuestionsStep({ draft, onAnswers, onDone, onBack, onTemplateGone, onTemplateChanged, onRestricted }) {
  const t = draft.template;
  const questions = useMemo(() => t.questionnaire ?? [], [t.questionnaire]);
  const answers = draft.answers ?? {};
  const visible = questions.filter((q, i) => shown(q, cleanAnswers(questions.slice(0, i), answers)));
  const sent = useMemo(() => cleanAnswers(questions, answers), [questions, answers]);
  const sig = JSON.stringify(sent);

  const [live, setLive] = useState({ status: 'loading', sig: null, config: null });
  const [problem, setProblem] = useState(null); // { code, message, field }
  const [busy, setBusy] = useState(null); // 'continue' | 'skip'
  const seq = useRef(0);

  const handle = useCallback((err) => {
    const code = err instanceof ApiError ? err.code : 'ERROR';
    if (code === 'CREATE_RESTRICTED') { onRestricted(); return; }
    setProblem({ code, message: errorText(err), field: err?.extra?.field });
  }, [onRestricted]);

  const run = useCallback(async (body, s) => {
    const n = ++seq.current;
    setLive((x) => ({ ...x, status: 'loading' }));
    try {
      const { config } = await suggest(t, body);
      if (n === seq.current) { setLive({ status: 'ready', sig: s, config }); setProblem(null); }
      return config;
    } catch (err) {
      if (n === seq.current) { setLive((x) => ({ ...x, status: 'error' })); handle(err); }
      throw err;
    }
  }, [t, handle]);

  useEffect(() => {
    const h = setTimeout(() => { run(sent, sig).catch(() => {}); }, live.sig == null ? 0 : DEBOUNCE);
    return () => clearTimeout(h);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, v) => onAnswers({ ...answers, [key]: v });

  const finish = async (skip) => {
    if (busy) return;
    setBusy(skip ? 'skip' : 'continue');
    try {
      const config = !skip && live.status === 'ready' && live.sig === sig ? live.config : await run(skip ? {} : sent, skip ? '{}' : sig);
      onDone(config, { skipped: skip });
    } catch { /* shown by handle() */ } finally {
      setBusy(null);
    }
  };

  const count = visible.length;
  const fieldError = problem?.code === 'INVALID_ANSWER' || problem?.code === 'UNKNOWN_ANSWER' ? problem.field : null;
  useEffect(() => { if (fieldError) document.getElementById(`cq-${fieldError}`)?.focus(); }, [fieldError]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button type="button" className="link inline-flex min-h-11 items-center gap-1 text-sm" onClick={onBack}><Icon name="back" size={16} />Back to templates</button>
        <p className="t-label mt-1">{t.name} template</p>
      </div>
      <StepTitle sub={count ? `${numberWord(count)} ${count === 1 ? 'question' : 'questions'}. Skip any of them; the template’s defaults fill the gaps.` : 'This template has no questions. Continue to see its suggested setup.'}>
        Tell us about your {communityKind(t.name)}
      </StepTitle>

      {problem && !fieldError && <Problem problem={problem} template={t} onTemplateGone={onTemplateGone} onTemplateChanged={onTemplateChanged} />}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <ol className="flex min-w-0 flex-1 flex-col gap-4">
          {visible.map((q, i) => (
            <li key={q.key} className="panel flex flex-col gap-3 p-5 sm:p-6">
              <span className="t-small">Question {i + 1} of {count} · optional</span>
              <Question q={q} fills={fillsOf(q, t.blueprint)} value={answers[q.key]} onChange={(v) => set(q.key, v)} error={fieldError === q.key ? problem.message : null} />
            </li>
          ))}
        </ol>
        <Summary live={live} template={t} onRetry={() => run(sent, sig).catch(() => {})} />
      </div>

      <StepBar back={{ label: 'Back', onClick: onBack }}
        extra={<Button variant="ghost" onClick={() => finish(true)} busy={busy === 'skip'} disabled={!!busy}>Skip questions</Button>}
        next={{ label: 'Continue to configure', short: 'Continue', onClick: () => finish(false), busy: busy === 'continue', disabled: !!busy }} />
    </div>
  );
}

function Problem({ problem, template, onTemplateGone, onTemplateChanged }) {
  if (problem.code === 'TEMPLATE_INACTIVE' || problem.code === 'TEMPLATE_NOT_FOUND') {
    return (
      <div role="alert" className="notice notice-warn flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-[1_1_240px]"><b>The {template.name} template was turned off.</b> Choose another template, or start from scratch.</span>
        <Button size="sm" onClick={onTemplateGone}>Back to start</Button>
      </div>
    );
  }
  if (problem.code === 'TEMPLATE_VERSION_UNKNOWN') {
    return (
      <div role="alert" className="notice notice-warn flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-[1_1_240px]"><b>This version of the template isn’t available any more.</b> Its questions may have changed. Your answers are kept where the questions still match.</span>
        <Button size="sm" onClick={onTemplateChanged}>Use the new version</Button>
      </div>
    );
  }
  return null; // network and other problems show in the summary panel
}

/** One question by its type (F12): text, list, choice, years or institution. */
function Question({ q, fills: fillsText, value, onChange, error }) {
  const id = `cq-${q.key}`;
  const fills = fillsText ? <p className="t-small" id={`${id}-f`}>Fills: {fillsText}</p> : null;
  const hint = q.help ? <p className="t-small" id={`${id}-h`}>{q.help}</p> : null;
  const described = [fillsText && `${id}-f`, q.help && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
  const err = error ? <p id={`${id}-e`} className="field-error" role="alert">{error}</p> : null;
  const title = <span className="t-h3">{q.label}</span>;

  if (q.type === 'choice' || q.type === 'single_choice' || q.type === 'multiple_choice' || q.type === 'yes_no') {
    const multiple = q.multiple || q.type === 'multiple_choice';
    const options = q.type === 'yes_no' ? [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] : optionsOf(q);
    const picked = (v) => (multiple ? Array.isArray(value) && value.includes(v) : value === v);
    const toggle = (v) => {
      if (!multiple) { onChange(value === v ? undefined : v); return; }
      const cur = Array.isArray(value) ? value : [];
      onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    };
    return (
      <fieldset className="flex flex-col gap-3" aria-describedby={described}>
        <legend className="mb-1">{title}</legend>
        {fills}
        <div className={`grid gap-2 ${options.some((o) => o.help) ? '' : 'sm:grid-cols-2'}`}>
          {options.map((o, i) => (
            <label key={String(o.value)} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-2.5 text-[15px] leading-[22px] text-[var(--az-text)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--az-focus)] ${picked(o.value) ? 'border-[var(--az-ok)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-control)] bg-[var(--az-surface)]'}`}>
              <input id={i === 0 ? id : undefined} type={multiple ? 'checkbox' : 'radio'} name={id} checked={picked(o.value)}
                onChange={() => toggle(o.value)}
                className="mt-1 h-[18px] w-[18px] shrink-0 accent-[var(--az-ok)]" />
              <span className="min-w-0"><span className="font-medium">{o.label}</span>{o.help && <span className="t-small block">{o.help}</span>}</span>
            </label>
          ))}
        </div>
        {!multiple && value !== undefined && <button type="button" className="link self-start text-sm" onClick={() => onChange(undefined)}>Clear this answer</button>}
        {hint}
        {err}
      </fieldset>
    );
  }

  if (q.type === 'list') {
    return (
      <ChipList id={id} label={q.label} labelClassName="t-h3" after={fills} items={Array.isArray(value) ? value : []} onChange={onChange}
        max={q.max ?? 10} itemMax={60} error={error} hint={q.help} addLabel="Add" />
    );
  }

  if (q.type === 'years') return <Years q={q} id={id} value={value} onChange={onChange} title={title} fills={fills} hint={hint} err={err} described={described} />;
  if (q.type === 'institution') return <Institution q={q} id={id} value={value} onChange={onChange} fills={fills} hint={hint} err={err} described={described} />;

  // text (and older long text)
  const long = q.type === 'long_text';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="t-h3">{q.label}</label>
      {fills}
      {long
        ? <textarea id={id} className="input" rows={3} maxLength={1000} value={value ?? ''} aria-describedby={described} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className="input" maxLength={120} value={value ?? ''} aria-describedby={described} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} />}
      {hint}
      {err}
    </div>
  );
}

function Years({ q, id, value, onChange, title, fills, hint, err, described }) {
  const now = new Date().getFullYear();
  const min = Number(q.min) || 1950; const max = Number(q.max) || now + 6;
  const years = [];
  for (let y = max; y >= min; y -= 1) years.push(y);
  const v = value && typeof value === 'object' ? value : {};
  const change = (k, x) => onChange({ ...v, [k]: x ? Number(x) : null });
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={described}>
      <legend className="mb-1">{title}</legend>
      {fills}
      <div className="flex flex-wrap gap-3">
        {[['from', 'From'], ['to', 'To']].map(([k, label]) => (
          <span key={k} className="flex min-w-[8rem] flex-1 flex-col gap-1.5 sm:max-w-[12rem]">
            <label htmlFor={k === 'from' ? id : `${id}-to`} className="text-sm font-medium text-[var(--az-text)]">{label}</label>
            <select id={k === 'from' ? id : `${id}-to`} className="input" value={v[k] ?? ''} onChange={(e) => change(k, e.target.value)}>
              <option value="">Any year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </span>
        ))}
      </div>
      {v.from && v.to && v.from > v.to && <p className="t-small" role="status">The years are swapped when this is used: {v.to} to {v.from}.</p>}
      {!!v.from !== !!v.to && <p className="t-small" role="status">{v.from ? `Used as ${v.from} to ${Math.max(v.from, now)}.` : `Used as ${v.to} only.`}</p>}
      {hint}
      {err}
    </fieldset>
  );
}

const OTHER = '__other';
let institutionsCache = null;

function Institution({ q, id, value, onChange, fills, hint, err, described }) {
  const [state, setState] = useState(() => (institutionsCache ? { status: 'ready', list: institutionsCache } : { status: 'loading', list: [] }));
  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    api('/institutions').then(({ institutions }) => { institutionsCache = institutions ?? []; setState({ status: 'ready', list: institutionsCache }); },
      () => setState({ status: 'error', list: [] }));
  }, []);
  useEffect(() => { if (!institutionsCache) load(); }, [load]);
  const typed = value && typeof value === 'object' ? value.name ?? '' : null;
  const selectValue = typed !== null ? OTHER : value ?? '';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="t-h3">{q.label}</label>
      {fills}
      {state.status === 'loading' && <Skeleton lines={1} label="Loading institutions" />}
      {state.status !== 'loading' && (
        <select id={id} className="input sm:max-w-md" value={selectValue} aria-describedby={described}
          onChange={(e) => onChange(e.target.value === OTHER ? { name: '' } : e.target.value || undefined)}>
          <option value="">Not answered</option>
          {state.list.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          <option value={OTHER}>Not listed: type its name</option>
        </select>
      )}
      {state.status === 'error' && (
        <p className="t-small flex flex-wrap items-center gap-2" role="status">The Institutions list didn’t load. <button type="button" className="link" onClick={load}>Try again</button> or choose “Not listed” and type it.</p>
      )}
      {typed !== null && (
        <span className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium text-[var(--az-text)]">Institution name</label>
          <input id={`${id}-name`} className="input sm:max-w-md" maxLength={120} value={typed} onChange={(e) => onChange({ name: e.target.value })} />
          <span className="t-small">Suggestions only use institutions from the list, so add this name to the community’s name and description in the next step. It doesn’t add an institution to CommunityOne.</span>
        </span>
      )}
      {hint ?? <p className="t-small">From the platform’s Institutions list.</p>}
      {err}
    </div>
  );
}

/** "What this will set up", from the latest suggestion. */
function Summary({ live, template, onRetry }) {
  const c = live.config ? fromSuggestion(live.config) : null;
  const vis = c?.visibility ? VISIBILITY[c.visibility] : null;
  const rows = c ? [
    ['Name', c.name],
    ['Description', c.description],
    ['Category', c.category],
    ['Visibility', vis ? `${vis.label} · ${vis.short}` : 'Not chosen yet'],
    ['Sections', ['Overview', ...c.sections.map((s) => SECTION_NAME[s]), ...(c.learning ? ['Learning'] : []), 'Members', 'About'].join(', ')],
    ['Discussion topics', c.topics.join(', ')],
    ['Event categories', c.eventCategories.join(', ')],
    ['Resource categories', c.resourceCategories.join(', ')],
    ['Roles in use', ['Owner (you)', 'Admin', ...c.roles.map((r) => ROLE_NAME[r] ?? r)].join(', ')],
  ].filter(([, v]) => v) : [];
  return (
    <aside aria-labelledby="cq-sum-h" className="panel flex w-full flex-col gap-3 p-5 lg:sticky lg:top-24 lg:w-[360px] lg:shrink-0">
      <h2 id="cq-sum-h" className="t-h3">What this will set up</h2>
      <p className="t-small">Updates as you answer. You can change all of it in the next step.</p>
      <p className="sr-only" role="status">{live.status === 'loading' ? 'Updating the summary' : live.status === 'ready' ? 'Summary updated' : ''}</p>
      {!c && live.status === 'loading' && <Skeleton lines={6} label="Working out the setup" />}
      {live.status === 'error' && (
        <div className="notice notice-bad flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1">The summary couldn’t update. Your answers are kept.</span>
          <Button size="sm" onClick={onRetry}>Try again</Button>
        </div>
      )}
      {c && (
        <dl className={`flex flex-col divide-y divide-[var(--az-divider)] transition-opacity ${live.status === 'loading' ? 'opacity-60' : ''}`}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 py-2.5 first:pt-0">
              <dt className="t-label">{k}</dt>
              <dd className="text-sm leading-[22px] text-[var(--az-text)] [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="t-small">{template.name} template, version {template.version}</p>
    </aside>
  );
}
