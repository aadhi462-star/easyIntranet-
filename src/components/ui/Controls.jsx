// Shared controls on the v2 tokens (board "Components"): Button, IconButton, Badge, Skeleton,
// Stat. Screens move onto these as they're restyled (workstreams C–G).
import { Icon } from '../icons.jsx';

const VARIANT = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' };

/** A button. `icon` is an icon name; `busy` shows a spinner and disables it. */
export function Button({ variant = 'secondary', size, icon, busy = false, className = '', children, ...rest }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined}
      className={`btn ${VARIANT[variant] ?? VARIANT.secondary} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}>
      {busy ? <span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
        : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

/** An icon-only button; `label` is required (it's the accessible name). */
export function IconButton({ icon, label, variant = 'ghost', size, className = '', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}
      className={`btn ${VARIANT[variant] ?? VARIANT.ghost} btn-icon ${size === 'sm' ? 'btn-sm' : ''} ${className}`}>
      <Icon name={icon} size={18} />
    </button>
  );
}

const TONE = { neutral: 'badge-neutral', ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad', info: 'badge-info' };
export function Badge({ tone = 'neutral', icon, children, className = '' }) {
  return <span className={`badge ${TONE[tone] ?? TONE.neutral} ${className}`}>{icon && <Icon name={icon} size={14} />}{children}</span>;
}

/** Placeholder lines while something loads. */
export function Skeleton({ lines = 3, label = 'Loading', className = '' }) {
  const widths = ['60%', '85%', '40%', '70%', '50%'];
  return (
    <div aria-busy="true" aria-label={label} className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton h-3.5" style={{ width: widths[i % widths.length] }} />)}
    </div>
  );
}

/** One figure with its label and a note. */
export function Stat({ label, value, note }) {
  return (
    <div className="bg-[var(--az-surface)] p-5">
      <div className="t-small">{label}</div>
      <div className="mt-1 text-[28px] font-bold leading-9 tabular-nums text-[var(--az-text)]">{value}</div>
      {note && <div className="t-small">{note}</div>}
    </div>
  );
}
