// One condition on an earlier answer: a question's "Show this question" (showIf) and a rule's
// "when". What each type can be checked with follows the server: a choice by its saved values
// (equals for one answer, includes for several), a list by an item, short text by equal text,
// and any question by whether it was answered.
import { Fld } from './Fields.jsx';
import { slot } from './shared.js';

const LABEL = { equals: 'is', includes: 'includes', answered: 'is answered', unanswered: 'is not answered' };

export function opsFor(q) {
  if (!q) return ['answered', 'unanswered'];
  if (q.type === 'choice') return [q.multiple ? 'includes' : 'equals', 'answered', 'unanswered'];
  if (q.type === 'list') return ['includes', 'answered', 'unanswered'];
  if (q.type === 'text') return ['equals', 'answered', 'unanswered'];
  return ['answered', 'unanswered'];
}
export const opOf = (c) => (!c ? null : 'includes' in c ? 'includes' : 'equals' in c ? 'equals' : c.answered === false ? 'unanswered' : 'answered');

/** A condition for question `q` with operator `op`, keeping `value` where it still fits. */
export function makeCondition(q, op, value) {
  if (!q) return null;
  if (op === 'answered') return { key: q.key, answered: true };
  if (op === 'unanswered') return { key: q.key, answered: false };
  const first = q.type === 'choice' ? (q.options?.[0]?.value ?? '') : '';
  const fits = q.type === 'choice' ? (q.options ?? []).some((o) => o.value === value) : typeof value === 'string';
  return { key: q.key, [op]: fits ? value : first };
}

/** The default condition for a question: its first option, or "is answered". */
export const defaultCondition = (q) => makeCondition(q, opsFor(q)[0], undefined);

/**
 * Fields for one condition. `questions` are the ones it may name; `allowNone` adds an "Always"
 * choice (for showIf), which sets the condition to null.
 */
export default function Condition({ id, label, value, questions, onChange, allowNone = false, error }) {
  const q = questions.find((x) => x.key === value?.key);
  const op = opOf(value);
  const ops = opsFor(q);
  const v = op === 'equals' ? value.equals : op === 'includes' ? value.includes : undefined;
  return (
    <div role="group" aria-label={label} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Fld id={`${id}-q`} label={label} error={error} className="sm:col-span-2">
        {(p) => (
          <select {...p} className="input" value={value?.key ?? ''} onChange={(e) => {
            const next = questions.find((x) => x.key === e.target.value);
            onChange(next ? defaultCondition(next) : null);
          }} disabled={!questions.length}>
            {allowNone && <option value="">Always</option>}
            {!allowNone && !value?.key && <option value="">Choose a question</option>}
            {value?.key && !q && <option value={value.key}>{slot(value.key)} (no such question)</option>}
            {questions.map((x) => <option key={x.key} value={x.key}>{allowNone ? 'When ' : ''}{x.label ? `${x.label.slice(0, 48)}${x.label.length > 48 ? '…' : ''}` : 'Question'} {slot(x.key)}</option>)}
          </select>
        )}
      </Fld>
      {value && (
        <Fld id={`${id}-op`} label="Condition">
          {(p) => (
            <select {...p} className="input" value={op} onChange={(e) => onChange(makeCondition(q ?? { key: value.key, type: 'other' }, e.target.value, v))}>
              {ops.map((o) => <option key={o} value={o}>{LABEL[o]}</option>)}
              {!ops.includes(op) && <option value={op}>{LABEL[op]} (not allowed for this question)</option>}
            </select>
          )}
        </Fld>
      )}
      {value && (op === 'equals' || op === 'includes') && (
        <Fld id={`${id}-v`} label={q?.type === 'list' ? 'Item' : 'Answer'}>
          {(p) => (q?.type === 'choice' ? (
            <select {...p} className="input" value={String(v ?? '')} onChange={(e) => onChange({ key: value.key, [op]: e.target.value })}>
              {!(q.options ?? []).some((o) => o.value === v) && <option value={String(v ?? '')}>{String(v ?? '') || 'Choose'}</option>}
              {(q.options ?? []).map((o, i) => <option key={`${i}-${o.value}`} value={o.value}>{o.label || o.value}</option>)}
            </select>
          ) : <input {...p} className="input" value={String(v ?? '')} onChange={(e) => onChange({ key: value.key, [op]: e.target.value })} />)}
        </Fld>
      )}
    </div>
  );
}
