// Small pieces shared by the creation wizard's steps: the bottom bar, field labels with their
// Edited mark, a chip list editor, and the phone breakpoint.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge, Button } from '../ui/Controls.jsx';

const PHONE = '(max-width: 767px)';

/** True below 768 px (the boards' phone layout). */
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(PHONE);
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return phone;
}

export const EditedBadge = () => <Badge tone="info" className="!px-2 !text-xs">Edited</Badge>;

/** The step's title; focused when the step opens so screen readers hear where they are. */
export function StepTitle({ children, sub }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus({ preventScroll: false }); }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <h1 ref={ref} tabIndex={-1} className="t-h1 !text-[1.75rem] !leading-9 outline-none">{children}</h1>
      {sub && <p className="text-[15px] leading-6 text-[var(--az-text-2)]">{sub}</p>}
    </div>
  );
}

/**
 * The step's Back and Continue. On phones it's a bar fixed to the bottom (F1, phone notes) and
 * `extra` moves into the page above it; from 768 px it's the row at the end of the step.
 */
export function StepBar({ back, next, extra, hint }) {
  return (
    <>
      {(extra || hint) && <div className="flex flex-col gap-3 md:hidden">{hint && <p className="t-small">{hint}</p>}{extra}</div>}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--az-hairline)] bg-[var(--az-surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
        md:static md:z-auto md:mt-2 md:border-[var(--az-divider)] md:bg-transparent md:px-0 md:pb-0 md:pt-4">
        {back ? <Button variant="ghost" icon="back" onClick={back.onClick} disabled={back.disabled}><span className="md:hidden">{back.short ?? 'Back'}</span><span className="hidden md:inline">{back.label}</span></Button> : <span />}
        <div className="flex min-w-0 items-center gap-3">
          {hint && <span className="t-small hidden md:inline">{hint}</span>}
          {extra && <span className="hidden items-center gap-2 md:flex">{extra}</span>}
          {next && (
            <Button variant="primary" onClick={next.onClick} disabled={next.disabled} busy={next.busy} aria-describedby={next.describedBy}>
              <span className="md:hidden">{next.short ?? next.label}</span><span className="hidden md:inline">{next.label}</span>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * A list of short names as removable chips with an Add field (event and resource categories,
 * list answers). `max` caps it; `error` is shown under it and linked.
 */
export function ChipList({ id, label, items, onChange, max = 12, itemMax = 40, error, hint, addLabel = 'Add', labelClassName = 'text-sm font-medium text-[var(--az-text)]', after = null, edited = false }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const input = useRef(null);
  const full = items.length >= max;
  const add = () => {
    const v = text.trim().replace(/\s+/g, ' ');
    if (!v) { input.current?.focus(); return; }
    if (v.length > itemMax) { setNote(`Use up to ${itemMax} characters.`); return; }
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) { setNote(`“${v}” is already in the list.`); return; }
    onChange([...items, v]); setText(''); setNote('');
  };
  const described = [hint && `${id}-h`, (error || note) && `${id}-e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2"><span id={`${id}-l`} className={labelClassName}>{label}</span>{edited && <EditedBadge />}</span>
      {after}
      {items.length > 0 && (
        <ul aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2">
          {items.map((x, i) => (
            <li key={`${x}-${i}`} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[var(--az-control)] bg-[var(--az-surface)] pl-3.5 pr-1 text-sm font-medium text-[var(--az-text)]">
              <span className="max-w-[16rem] truncate">{x}</span>
              <button type="button" aria-label={`Remove ${x}`} onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="grid h-7 w-7 place-items-center rounded-full text-[var(--az-text-3)] hover:bg-[var(--az-sunken)]">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">{`${label}: add one`}</label>
        <input id={id} ref={input} className="input min-w-0 flex-1 basis-48" value={text} maxLength={itemMax + 20} disabled={full}
          placeholder={full ? `${max} of ${max}` : 'Type a name'} aria-describedby={described} aria-invalid={error ? true : undefined}
          onChange={(e) => { setText(e.target.value); setNote(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button size="sm" variant="ghost" icon="plus" onClick={add} disabled={full}>{addLabel}</Button>
        <span className="t-small tabular-nums">{items.length} of {max}</span>
      </div>
      {hint && <span id={`${id}-h`} className="t-small">{hint}</span>}
      {(error || note) && <p id={`${id}-e`} className="field-error !mt-0" role={note ? 'status' : undefined}>{error || note}</p>}
    </div>
  );
}

/** The label row of a field: its name and, when it differs from the suggestion, Edited. */
export function FieldLabel({ htmlFor, id, children, edited }) {
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Tag htmlFor={htmlFor} id={id} className="text-sm font-medium text-[var(--az-text)]">{children}</Tag>
      {edited && <EditedBadge />}
    </span>
  );
}

/** aria-describedby for a field with a hint and maybe an error. */
export const describedBy = (id, { hint = true, error } = {}) => [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
