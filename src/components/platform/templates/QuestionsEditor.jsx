// The questions of a template version (F12): a table to add, reorder, open and remove, and the
// open question's editor below it. Five types only: short text, list, choice (one or several),
// year range and institution. Each fills the slot named by its key.
import { Badge, Button, IconButton } from '../../ui/Controls.jsx';
import { confirmAction } from '../../ui/Confirm.jsx';
import Condition from './Condition.jsx';
import { Check, Fld } from './Fields.jsx';
import { ANSWER_KINDS, MAX_QUESTIONS, blankQuestion, fills, kindLabel, kindOf, slot, valueFor } from './shared.js';

const HEAD = ['#', 'Question', 'Type', 'Slot', 'Fills', 'Actions'];

export default function QuestionsEditor({ questions, onChange, blueprint, errors = {}, selected, onSelect, readOnly = false }) {
  const set = (i, q) => onChange(questions.map((x, j) => (j === i ? q : x)));
  const move = (i, d) => {
    const next = [...questions]; [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
    if (selected === i) onSelect(i + d); else if (selected === i + d) onSelect(i);
  };
  const add = () => {
    const used = new Set(questions.map((q) => q.key));
    let n = questions.length + 1;
    while (used.has(`question_${n}`)) n += 1;
    onChange([...questions, blankQuestion(n)]);
    onSelect(questions.length);
  };
  const remove = async (i) => {
    const q = questions[i];
    const ok = await confirmAction({ title: `Remove question ${i + 1}?`, body: `${q.label || 'This question'} goes from the draft. Anything in the blueprint that uses ${slot(q.key)} stays until you change it there.`, confirm: 'Remove question' });
    if (!ok) return;
    // Questions shown only after this answer are shown always instead.
    onChange(questions.filter((_, j) => j !== i).map((x) => (x.showIf?.key === q.key ? withoutShowIf(x) : x)));
    onSelect(null);
  };
  // Renaming a slot keeps later questions that depend on it pointing at it.
  const rename = (i, key) => {
    const old = questions[i].key;
    onChange(questions.map((x, j) => (j === i ? { ...x, key } : x.showIf?.key === old ? { ...x, showIf: { ...x.showIf, key } } : x)));
  };
  const q = selected != null ? questions[selected] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="t-h3">Questions</h3>
        {!readOnly && <Button size="sm" icon="plus" onClick={add} disabled={questions.length >= MAX_QUESTIONS}>Add question</Button>}
      </div>
      <p className="t-small">People creating a community can skip any question; each answer only suggests a setup they can change. Up to {MAX_QUESTIONS} questions.</p>

      {!questions.length ? (
        <p className="notice notice-info">No questions yet. Without questions, people get the blueprint as it is and fill in the rest themselves.</p>
      ) : (
        <div className="panel relative overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Questions">
            <thead>
              <tr className="bg-[var(--az-band)] text-left">
                {HEAD.map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-3 py-2.5">{h === 'Actions' ? <span className="sr-only">{h}</span> : h}</th>)}
              </tr>
            </thead>
            <tbody>
              {questions.map((x, i) => (
                <tr key={i} className={`border-b border-[var(--az-divider)] last:border-0 ${selected === i ? 'bg-[var(--az-band)]' : ''}`}>
                  <td className="text-2 px-3 py-2.5 tabular-nums">{i + 1}</td>
                  <td className="min-w-56 px-3 py-2.5">
                    <span className="font-semibold text-[var(--az-text)]">{x.label || <span className="text-3 font-normal">No question yet</span>}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      {x.required && <Badge>Required</Badge>}
                      {x.showIf && <Badge tone="info">Shown when {slot(x.showIf.key)} {'answered' in x.showIf ? (x.showIf.answered ? 'is answered' : 'is not answered') : `${'includes' in x.showIf ? 'includes' : 'is'} ${String(x.showIf.equals ?? x.showIf.includes)}`}</Badge>}
                      {errors[i] && <Badge tone="bad" icon="alert">Needs a fix</Badge>}
                    </span>
                  </td>
                  <td className="text-2 whitespace-nowrap px-3 py-2.5">{kindLabel(x)}</td>
                  <td className="px-3 py-2.5"><span className="badge badge-neutral font-mono">{slot(x.key)}</span></td>
                  <td className="text-2 px-3 py-2.5">{fills(x.key, blueprint).join(', ') || <span className="text-3">Nothing yet</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex justify-end gap-1">
                      {!readOnly && <IconButton size="sm" icon="up" label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />}
                      {!readOnly && <IconButton size="sm" icon="down" label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)} />}
                      <IconButton size="sm" icon={readOnly ? 'eye' : 'pen'} label={`${readOnly ? 'View' : 'Edit'} question ${i + 1}`} aria-pressed={selected === i} onClick={() => onSelect(selected === i ? null : i)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {q && (
        <QuestionForm key={selected} index={selected} q={q} earlier={questions.slice(0, selected)} error={errors[selected]} readOnly={readOnly}
          onChange={(next) => set(selected, next)} onRename={(k) => rename(selected, k)} onRemove={() => remove(selected)} onClose={() => onSelect(null)} />
      )}
    </div>
  );
}

const withoutShowIf = (q) => { const { showIf, ...rest } = q; return rest; };

/** Changing the answer type keeps only the fields that type uses. */
function retype(q, kindId) {
  const k = ANSWER_KINDS.find((x) => x.id === kindId);
  const { options, multiple, maxLength, max: _max, ...base } = q;
  const next = { ...base, type: k.type };
  if (k.type === 'choice') {
    next.multiple = !!k.multiple;
    next.options = options?.length ? options : [{ value: '', label: '' }, { value: '', label: '' }];
  }
  if (k.type === 'text' && maxLength != null) next.maxLength = maxLength;
  return next;
}

function QuestionForm({ index, q, earlier, error, readOnly, onChange, onRename, onRemove, onClose }) {
  const id = `tq-${index}`;
  const set = (patch) => onChange({ ...q, ...patch });
  return (
    <section aria-labelledby={`${id}-h`} className="panel p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${id}-h`} className="t-h3">Question {index + 1}</h3>
        <span className="flex gap-2">
          {!readOnly && <Button size="sm" variant="ghost" icon="x" onClick={onRemove}>Remove question</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </span>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="notice notice-bad mb-4"><strong>Fix this question.</strong> {error}</p>}
      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 md:grid-cols-2">
        <Fld id={`${id}-label`} label="Question" className="md:col-span-2">
          {(p) => <input {...p} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error ? true : undefined} className="input" maxLength={160} value={q.label ?? ''} onChange={(e) => set({ label: e.target.value })} />}
        </Fld>
        <Fld id={`${id}-type`} label="Answer type">
          {(p) => (
            <select {...p} className="input" value={kindOf(q)} onChange={(e) => onChange(retype(q, e.target.value))}>
              {ANSWER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          )}
        </Fld>
        <Fld id={`${id}-key`} label="Slot name" hint={`Lowercase letters, digits and _. Used as ${slot(q.key || 'name')} in the blueprint; renaming it doesn’t change the blueprint.`}>
          {(p) => <input {...p} className="input font-mono" maxLength={40} value={q.key ?? ''} spellCheck={false}
            onChange={(e) => onRename(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />}
        </Fld>
        <Fld id={`${id}-help`} label="Hint shown to people" className="md:col-span-2">
          {(p) => <input {...p} className="input" maxLength={300} value={q.help ?? ''} onChange={(e) => set({ help: e.target.value })} />}
        </Fld>

        {q.type === 'text' && (
          <Fld id={`${id}-max`} label="Longest answer (optional)" hint="In characters. Leave empty for the usual limit.">
            {(p) => <input {...p} type="number" inputMode="numeric" min={1} max={1000} className="input max-w-40" value={q.maxLength ?? ''}
              onChange={(e) => { const n = parseInt(e.target.value, 10); const { maxLength, ...rest } = q; onChange(Number.isFinite(n) && n > 0 ? { ...rest, maxLength: n } : rest); }} />}
          </Fld>
        )}
        {q.type === 'list' && <p className="t-small md:col-span-2">People type short items, one at a time. A list item in the blueprint that is only {slot(q.key)} becomes one item per answer.</p>}
        {q.type === 'years' && <p className="t-small md:col-span-2">People pick a first and a last year. In text it reads as “2009 to 2022”.</p>}
        {q.type === 'institution' && <p className="t-small md:col-span-2">People pick from the platform’s list in Administration, Institutions.</p>}
        {q.type === 'choice' && <Options id={id} q={q} onChange={(options) => set({ options })} />}

        <div className="md:col-span-2">
          <Check id={`${id}-req`} label="Required answer" checked={q.required} onChange={(v) => set({ required: v })}
            hint="Skipping all questions still works; a required question must be answered once someone starts." />
        </div>

        <div className="md:col-span-2">
          <Condition id={`${id}-dep`} label="Show this question" allowNone questions={earlier} value={q.showIf ?? null}
            onChange={(c) => onChange(c ? { ...q, showIf: c } : withoutShowIf(q))} />
          <p className="t-small mt-1.5">{earlier.length ? 'Ask it only after a particular earlier answer.' : 'The first question is always shown.'}</p>
        </div>
      </fieldset>
    </section>
  );
}

/** A choice's options: what people read, and the value saved (and used in rules). */
function Options({ id, q, onChange }) {
  const options = q.options ?? [];
  const set = (i, patch) => onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setLabel = (i, label) => {
    const o = options[i];
    // The saved value follows the label until someone types their own.
    set(i, { label, ...(!o.value || o.value === valueFor(o.label ?? '') ? { value: valueFor(label) } : {}) });
  };
  const move = (i, d) => { const next = [...options]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <fieldset className="min-w-0 md:col-span-2" aria-describedby={`${id}-opt-hint`}>
      <legend className="mb-1.5 text-sm font-medium text-[var(--az-text)]">Options <span className="t-small ml-2 font-normal">{options.length} of 20</span></legend>
      <ul className="flex flex-col gap-2">
        {options.map((o, i) => (
          <li key={i} className="grid min-w-0 grid-cols-[1fr_auto] gap-1.5 sm:grid-cols-[1fr_12rem_auto]">
            <input className="input min-w-0 py-1.5" aria-label={`Option ${i + 1}, shown as`} placeholder="Shown as" maxLength={80} value={o.label ?? ''} onChange={(e) => setLabel(i, e.target.value)} />
            <input className="input col-start-1 row-start-2 min-w-0 py-1.5 font-mono text-sm sm:col-start-auto sm:row-start-auto" aria-label={`Option ${i + 1}, saved as`} placeholder="saved_as" maxLength={80} spellCheck={false}
              value={o.value ?? ''} onChange={(e) => set(i, { value: e.target.value })} />
            <span className="row-span-2 flex items-start gap-1 sm:row-span-1">
              <IconButton size="sm" icon="up" label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" icon="down" label={`Move option ${i + 1} down`} disabled={i === options.length - 1} onClick={() => move(i, 1)} />
              <IconButton size="sm" icon="x" label={`Remove option ${i + 1}`} disabled={options.length <= 2} onClick={() => onChange(options.filter((_, j) => j !== i))} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" icon="plus" disabled={options.length >= 20} onClick={() => onChange([...options, { value: '', label: '' }])}>Add option</Button>
        <span id={`${id}-opt-hint`} className="t-small">2–20 options. Rules and “Show this question” use the saved value.</span>
      </div>
    </fieldset>
  );
}
