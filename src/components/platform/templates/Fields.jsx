// Form pieces for the template editor: labelled fields with hints and errors linked by
// aria-describedby, a list-of-text editor and slot buttons.
import { useRef, useState } from 'react';
import { IconButton, Button } from '../../ui/Controls.jsx';
import { describedBy, slot } from './shared.js';

/** A labelled field. `children(props)` renders the control with its id and descriptions. */
export function Fld({ id, label, hint, error, className = '', children }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-[var(--az-text)]">{label}</label>
      {children({ id, 'aria-describedby': describedBy(id, { hint, error }), 'aria-invalid': error ? true : undefined })}
      {hint && <span id={`${id}-hint`} className="t-small">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error">{error}</span>}
    </div>
  );
}

/** A checkbox with its label. */
export function Check({ id, label, checked, onChange, hint }) {
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--az-focus)]" checked={!!checked} onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined} />
      <span className="flex flex-col">
        <label htmlFor={id} className="text-sm text-[var(--az-text)]">{label}</label>
        {hint && <span id={`${id}-hint`} className="t-small">{hint}</span>}
      </span>
    </div>
  );
}

/** A group of checkboxes over a fixed list; `value` is the chosen ids. */
export function CheckGroup({ id, legend, options, value = [], onChange, hint, error }) {
  const toggle = (o, on) => onChange(on ? options.map((x) => x.id).filter((x) => x === o || value.includes(x)) : value.filter((x) => x !== o));
  return (
    <fieldset className="min-w-0" aria-describedby={describedBy(id, { hint, error })}>
      <legend className="mb-1.5 text-sm font-medium text-[var(--az-text)]">{legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => <Check key={o.id} id={`${id}-${o.id}`} label={o.label} checked={value.includes(o.id)} onChange={(on) => toggle(o.id, on)} />)}
      </div>
      {hint && <span id={`${id}-hint`} className="t-small mt-1.5 block">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error block">{error}</span>}
    </fieldset>
  );
}

/** Buttons that insert a question's slot into the text field `target` at the cursor. */
export function SlotButtons({ keys, target, value, onChange, label }) {
  if (!keys.length) return null;
  const insert = (k) => {
    const el = target.current;
    const at = el && typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd : at;
    const next = value.slice(0, at) + slot(k) + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + slot(k).length, at + slot(k).length); } });
  };
  return (
    <div role="group" aria-label={`Insert a slot into ${label}`} className="flex flex-wrap items-center gap-1.5">
      <span className="t-small">Insert</span>
      {keys.map((k) => (
        <button key={k} type="button" className="btn btn-ghost btn-sm !min-h-8 !px-2.5 font-mono text-xs" aria-label={`Insert ${slot(k)}`} onClick={() => insert(k)}>{slot(k)}</button>
      ))}
    </div>
  );
}

/** Text with slots: an input or textarea plus its slot buttons. */
export function PatternField({ id, label, hint, error, value, onChange, keys, multiline = false, rows = 3, maxLength }) {
  const ref = useRef(null);
  const v = value ?? '';
  return (
    <Fld id={id} label={label} hint={hint} error={error}>
      {(p) => (
        <>
          {multiline
            ? <textarea ref={ref} {...p} rows={rows} maxLength={maxLength} className="input font-mono text-sm" value={v} onChange={(e) => onChange(e.target.value)} />
            : <input ref={ref} {...p} maxLength={maxLength} className="input font-mono text-sm" value={v} onChange={(e) => onChange(e.target.value)} />}
          <SlotButtons keys={keys} target={ref} value={v} onChange={onChange} label={label} />
        </>
      )}
    </Fld>
  );
}

/** A list of short text items: reorder, remove, add. */
export function ListField({ id, label, hint, error, value = [], onChange, max, itemLabel = 'item', placeholder, maxLength = 60 }) {
  const [draft, setDraft] = useState('');
  const full = max != null && value.length >= max;
  const add = () => {
    const s = draft.trim();
    if (!s || full) return;
    onChange([...value, s]); setDraft('');
  };
  const move = (i, d) => { const next = [...value]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <fieldset className="min-w-0" aria-describedby={describedBy(id, { hint, error })}>
      <legend className="mb-1.5 text-sm font-medium text-[var(--az-text)]">{label}{max != null && <span className="t-small ml-2 font-normal">{value.length} of {max}</span>}</legend>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1.5">
          {value.map((item, i) => (
            <li key={`${i}-${item}`} className="flex min-w-0 items-center gap-1.5">
              <input className="input min-w-0 flex-1 py-1.5 font-mono text-sm" aria-label={`${label}, ${itemLabel} ${i + 1}`} value={item} maxLength={maxLength}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
              <IconButton size="sm" icon="up" label={`Move ${itemLabel} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton size="sm" icon="down" label={`Move ${itemLabel} ${i + 1} down`} disabled={i === value.length - 1} onClick={() => move(i, 1)} />
              <IconButton size="sm" icon="x" label={`Remove ${itemLabel} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 gap-1.5">
        <input id={id} className="input min-w-0 flex-1 py-1.5 text-sm" aria-label={`Add to ${label}`} placeholder={placeholder} value={draft} maxLength={maxLength} disabled={full}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button size="sm" icon="plus" onClick={add} disabled={!draft.trim() || full}>Add</Button>
      </div>
      {hint && <span id={`${id}-hint`} className="t-small mt-1.5 block">{hint}</span>}
      {error && <span id={`${id}-error`} className="field-error block">{error}</span>}
    </fieldset>
  );
}
