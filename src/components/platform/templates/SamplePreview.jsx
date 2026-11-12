// Preview samples (board V2FTemplateAdmin): staff type sample answers and see what the blueprint
// would suggest. Only in this page: the answers are never saved or shown to anyone creating a
// community, and the server runs its own check when the version is published.
import { useMemo, useState } from 'react';
import { Fld } from './Fields.jsx';
import { BLUEPRINT_LABELS, ROLES, SECTIONS, VISIBILITY, preview, shown, slot } from './shared.js';

const labelOf = (list, id) => list.find((x) => x.id === id)?.label ?? id;

export default function SamplePreview({ questions, blueprint, name }) {
  const [answers, setAnswers] = useState({});
  const set = (k, v) => setAnswers((a) => ({ ...a, [k]: v }));
  // Questions hidden by an earlier answer don't count, as when someone creates a community.
  const visible = useMemo(() => {
    const out = {};
    for (const q of questions) {
      const v = answers[q.key];
      if (!shown(q, out) || v == null) continue;
      out[q.key] = q.type === 'list' && typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v;
    }
    return out;
  }, [questions, answers]);
  const r = useMemo(() => preview(blueprint, visible, name), [blueprint, visible, name]);
  const list = (v) => (v.length ? v.join(', ') : '—');
  const rows = [
    ['name', blueprint.name, r.name],
    ['description', blueprint.description, r.description || '—'],
    ['membership', blueprint.membership?.visibility ? labelOf(VISIBILITY, blueprint.membership.visibility) : 'Public', labelOf(VISIBILITY, r.visibility)],
    ['topics', (blueprint.topics ?? []).join(', '), list(r.topics)],
    ['sections', (blueprint.sections ?? []).map((x) => labelOf(SECTIONS, x)).join(', '), list([...r.sections.map((x) => labelOf(SECTIONS, x)), ...(r.learning ? ['Learning'] : [])])],
    ['resourceCategories', (blueprint.resourceCategories ?? []).join(', '), list(r.resourceCategories)],
    ['eventCategories', (blueprint.eventCategories ?? []).join(', '), list(r.eventCategories)],
    ['roles', ['Owner', 'Admin', ...(blueprint.roles ?? []).map((x) => labelOf(ROLES, x))].join(', '), ['Owner', 'Admin', ...r.roles.map((x) => labelOf(ROLES, x))].join(', ')],
    ['guidelines', blueprint.guidelines ? `${blueprint.guidelines.length} characters` : '—', r.guidelines ? `${r.guidelines.slice(0, 160)}${r.guidelines.length > 160 ? '…' : ''}` : '—'],
  ];

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="sp-a" className="panel flex flex-col gap-4 p-4 md:p-5">
        <div>
          <h3 id="sp-a" className="t-h3">Sample answers</h3>
          <p className="t-small mt-1">Sample answers are typed by staff to test the template; they’re never saved or shown to anyone creating a community.</p>
        </div>
        {!questions.length ? <p className="t-small">This version has no questions; the blueprint is used as it is.</p> : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {questions.map((q, i) => (shown(q, visible) ? <Answer key={q.key || i} q={q} i={i} value={answers[q.key]} onChange={(v) => set(q.key, v)} /> : (
              <p key={q.key || i} className="t-small self-center">Question {i + 1} is hidden by an earlier answer.</p>
            )))}
          </div>
        )}
      </section>

      <section aria-labelledby="sp-b" className="panel overflow-hidden">
        <h3 id="sp-b" className="t-h3 px-4 pb-2 pt-4 md:px-5">Blueprint, with sample answers</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-labelledby="sp-b">
            <thead><tr className="bg-[var(--az-band)] text-left">
              {['Field', 'Rule', 'With the sample answers'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(([k, rule, result]) => (
                <tr key={k} className="border-b border-[var(--az-divider)] last:border-0 align-top">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold">{BLUEPRINT_LABELS[k] === 'Membership' ? 'Visibility' : BLUEPRINT_LABELS[k]}</th>
                  <td className="text-2 px-4 py-3 font-mono text-xs">{rule || '—'}</td>
                  <td className="px-4 py-3 text-[var(--az-text)]">{result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small px-4 py-3 md:px-5">{(blueprint.rules ?? []).length ? 'Rules are applied to the sample answers. ' : ''}A quick look in this page; publishing runs the server’s own check.</p>
      </section>
    </div>
  );
}

function Answer({ q, i, value, onChange }) {
  const id = `sa-${i}`;
  const label = `${i + 1}. ${q.label || slot(q.key)}`;
  if (q.type === 'choice' && q.multiple) {
    const v = Array.isArray(value) ? value : [];
    return (
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-[var(--az-text)]">{label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {(q.options ?? []).map((o, j) => (
            <label key={j} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={v.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...v, o.value] : v.filter((x) => x !== o.value))} />
              {o.label || o.value}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (q.type === 'years') {
    const v = value ?? {};
    return (
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-medium text-[var(--az-text)]">{label}</legend>
        <div className="flex items-center gap-2">
          <input className="input w-28" inputMode="numeric" aria-label="First year" placeholder="From" maxLength={4} value={v.from ?? ''} onChange={(e) => onChange({ ...v, from: e.target.value })} />
          <span className="text-2">to</span>
          <input className="input w-28" inputMode="numeric" aria-label="Last year" placeholder="To" maxLength={4} value={v.to ?? ''} onChange={(e) => onChange({ ...v, to: e.target.value })} />
        </div>
      </fieldset>
    );
  }
  return (
    <Fld id={id} label={label} hint={q.type === 'list' ? 'Separate items with commas.' : q.type === 'institution' ? 'An institution’s name.' : undefined}>
      {(p) => (q.type === 'choice' ? (
        <select {...p} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">No answer</option>
          {(q.options ?? []).map((o, j) => <option key={j} value={o.value}>{o.label || o.value}</option>)}
        </select>
      ) : q.type === 'list' ? (
        <input {...p} className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...p} className="input" maxLength={q.maxLength} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      ))}
    </Fld>
  );
}
