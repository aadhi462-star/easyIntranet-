// Small pieces shared by the Administration screens (redesign Stage 7, restyled for v2 G on the
// shared controls: board V2GPlatformAdmin, phones V2GPhoneTable).
import { useState } from 'react';
import { errorText } from '../../lib/communities.js';
import { STATUS_LABEL } from '../../lib/platform.js';
import { Icon } from '../icons.jsx';
import { Modal } from '../ui.jsx';
import { Badge, Button, Skeleton, Stat } from '../ui/Controls.jsx';

export { Stat };

/** A row of filter chips with counts (boards S7Users, S7Communities, S7Moderation). */
export function Chips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" className="filter-chip" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}{o.count != null ? ` · ${o.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function Loading({ label, lines = 4 }) {
  return <div className="panel p-5"><Skeleton lines={lines} label={label} /></div>;
}

export function Failed({ message, onRetry, title = 'This didn’t load.' }) {
  return (
    <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
      <span><strong>{title}</strong> {message}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** A labelled field on the v2 tokens (label above, hint below). */
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-[var(--az-text)]">{label}</span>
      {children}
      {hint && <span className="t-small">{hint}</span>}
    </label>
  );
}

/** A checkbox with its label and an optional hint. */
export function Check({ label, hint, checked, onChange, disabled }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[22px]">
      <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--az-focus)]" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="t-small block">{hint}</span>}</span>
    </label>
  );
}

/** One choice of a radio group, drawn as a bordered option (board ".opt"). */
export function Option({ name, checked, onChange, label, hint }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[15px] leading-[22px] ${checked ? 'border-[var(--az-focus)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-hairline)] bg-[var(--az-surface)]'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--az-focus)]" />
      <span><b className="font-semibold">{label}</b>{hint && <span className="t-small block">{hint}</span>}</span>
    </label>
  );
}

/** A short explanatory card under a screen. */
export function Note({ title, children }) {
  return <section className="panel flex flex-col gap-2 p-4"><h3 className="t-h3">{title}</h3><p className="text-2 text-sm">{children}</p></section>;
}

/** A label / value row inside a card (board ".lr"). */
export function KV({ label, children, width = 'sm:w-36' }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-[var(--az-divider)] py-2.5 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className={`t-small flex-none ${width}`}>{label}</span>
      <span className="min-w-0 flex-1 break-words text-[15px]">{children}</span>
    </div>
  );
}

const STATUS_TONE = { active: 'ok', pending_approval: 'warn', unverified: 'warn', suspended: 'bad', deleted: 'bad', deactivated: 'neutral' };
export function StatusBadge({ status, short = false }) {
  const label = short && status === 'pending_approval' ? 'Waiting' : STATUS_LABEL[status] ?? status;
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label}</Badge>;
}

/** D4: asks for the password again. The server decides whether it's right. */
export function PasswordDialog({ onConfirm, onCancel }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onConfirm(pw); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title="Enter your password again" onClose={onCancel}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-2 text-sm">This action can’t be taken lightly, so it needs your password if you haven’t entered it in the last 10 minutes.</p>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!pw}>Continue</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A dialog that needs a written reason (and optionally the name typed), for suspensions,
 * deletions and declines. `onSubmit(values)` throws to show an error.
 */
export function ReasonDialog({ title, intro, reasonLabel = 'Reason', reasonHint = 'Required', confirmName, action, danger = false, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit({ reason: reason.trim(), confirmName: name }); } catch (err) {
      if (err?.code !== 'CANCELLED') setError(errorText(err));
      setBusy(false);
    }
  };
  const ok = reason.trim() && (!confirmName || name.trim() === confirmName);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {intro && <div className="text-2 text-sm">{intro}</div>}
        <Field label={reasonLabel} hint={reasonHint}><textarea className="input min-h-20" required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {confirmName && <Field label={`Type ${confirmName} to confirm`}><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder={confirmName} /></Field>}
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={busy} disabled={!ok}>{action}</Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * A table from 768 px up; below that, one card per row with the same fields (board
 * V2GPhoneTable), so nothing scrolls sideways on a phone.
 *
 * columns: [{ head, cell(row), num?, sr? (head read aloud only), wrap?, place? }] where place
 * is 'title' (the card's heading), 'badge' (beside it), 'action' (bottom right) or omitted (a
 * label / value pair). `extra(row)` adds a full-width line under a row, like a job's last error.
 */
export function DataTable({ label, columns, rows, rowKey = (r) => r.id, cardLabel, empty = 'Nothing here.', extra }) {
  if (!rows.length) return <p className="notice notice-info">{empty}</p>;
  const title = columns.find((c) => c.place === 'title') ?? columns[0];
  const badge = columns.filter((c) => c.place === 'badge');
  const actions = columns.filter((c) => c.place === 'action');
  const pairs = columns.filter((c) => c !== title && !badge.includes(c) && !actions.includes(c));
  return (
    <>
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm" aria-label={label}>
          <thead><tr className="text-left">
            {columns.map((c, i) => (
              <th key={i} scope="col" className={`t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-2.5 ${c.num ? 'text-right' : ''}`}>
                {c.sr ? <span className="sr-only">{c.head}</span> : c.head}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const more = extra?.(r);
              return [
                <tr key={rowKey(r)} className={more ? '' : 'border-b border-[var(--az-divider)] last:border-0'}>
                  {columns.map((c, i) => (
                    <td key={i} className={`px-4 py-3 align-middle ${c.num ? 'text-right tabular-nums' : ''} ${c.place === 'action' ? 'text-right' : ''} ${c.wrap ? '' : 'whitespace-nowrap'}`}>{c.cell(r)}</td>
                  ))}
                </tr>,
                more && <tr key={`${rowKey(r)}:more`} className="border-b border-[var(--az-divider)] last:border-0"><td colSpan={columns.length} className="px-4 pb-3">{more}</td></tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={label}>
        {rows.map((r) => {
          const more = extra?.(r);
          return (
            <li key={rowKey(r)}>
              <article className="panel flex flex-col gap-3 p-4" aria-label={cardLabel?.(r)}>
                <div className="flex items-center gap-2.5">
                  <div className="min-w-0 flex-1 break-words font-semibold">{title.cell(r)}</div>
                  {badge.map((c, i) => <div key={i} className="flex-none">{c.cell(r)}</div>)}
                </div>
                {(pairs.length > 0 || actions.length > 0) && (
                  <div className="flex flex-wrap items-end gap-2.5">
                    {pairs.length > 0 && (
                      <dl className="m-0 grid min-w-0 flex-[1_1_150px] grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                        {pairs.map((c, i) => [
                          <dt key={`t${i}`} className="t-small">{c.head}</dt>,
                          <dd key={`d${i}`} className="m-0 min-w-0 break-words">{c.cell(r)}</dd>,
                        ])}
                      </dl>
                    )}
                    {actions.map((c, i) => <div key={i} className="flex flex-wrap gap-2">{c.cell(r)}</div>)}
                  </div>
                )}
                {more}
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The bar above the greeting on Home: from the platform, not a community. */
export function AnnouncementBar({ a, onDismiss, preview = false }) {
  const href = a.link ? `#${a.link}` : null;
  return (
    <div role={preview ? undefined : 'status'} className="notice notice-info flex items-start gap-3">
      <Icon name="announce" size={18} className="mt-0.5 flex-none text-[var(--az-info)]" />
      <span className="min-w-0 flex-1 break-words"><b className="font-semibold">CommunityOne</b> {a.message}{href && <> <a href={preview ? undefined : href} className="link">See more</a></>}</span>
      <button type="button" className="btn btn-ghost btn-icon btn-sm -my-1 flex-none" aria-label="Dismiss announcement" onClick={onDismiss} disabled={preview}><Icon name="x" size={18} /></button>
    </div>
  );
}
