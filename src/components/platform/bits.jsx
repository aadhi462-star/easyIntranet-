// Small pieces shared by the Administration screens (redesign Stage 7).
import { useState } from 'react';
import { errorText } from '../../lib/communities.js';
import { Field, Modal } from '../ui.jsx';

/** A row of filter chips with counts (boards S7Users, S7Communities, S7Moderation). */
export function Chips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-11 rounded-full border px-4 text-sm ${value === o.id ? 'border-[var(--az-hairline)] bg-[var(--az-surface)] font-semibold text-white' : 'text-2 border-[var(--az-hairline)] hover:text-white'}`}>
          {o.label}{o.count != null ? ` · ${o.count}` : ''}
        </button>
      ))}
    </div>
  );
}

export function Loading({ label, h = 'h-40' }) {
  return <div aria-busy="true" aria-label={label} className={`glass ${h} animate-pulse`} />;
}

export function Failed({ message, onRetry }) {
  return (
    <div role="alert" className="glass p-5 text-sm">
      <p className="text-rose-300">{message}</p>
      {onRetry && <button className="btn btn-ghost mt-3" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Stat({ label, value, note }) {
  return (
    <div className="bg-[var(--az-surface)] p-5">
      <div className="t-small">{label}</div>
      <div className="mt-1 text-[28px] font-bold leading-9 tabular-nums text-white">{value}</div>
      {note && <div className="t-small">{note}</div>}
    </div>
  );
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
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !pw}>{busy ? 'Checking…' : 'Continue'}</button>
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
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'btn-ghost text-rose-300' : 'btn-primary'}`} disabled={busy || !ok}>{busy ? 'Working…' : action}</button>
        </div>
      </form>
    </Modal>
  );
}

/** A responsive table: real table from md up, stacked rows below (no horizontal page scroll). */
export function Table({ head, rows, empty = 'Nothing here.', label }) {
  if (!rows.length) return <p className="text-3 band p-4 text-sm">{empty}</p>;
  return (
    <div className="glass overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={label}>
        <thead><tr className="bg-[var(--az-band)] text-left">
          {head.map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/** The bar above the greeting on Home. Lime, because it's from the platform, not a community. */
export function AnnouncementBar({ a, onDismiss, preview = false }) {
  const href = a.link ? `#${a.link}` : null;
  return (
    <div role={preview ? undefined : 'status'} className="flex items-start gap-3 rounded-xl border border-brand-400/40 bg-brand-400/10 px-4 py-3 text-sm">
      <span className="min-w-0 flex-1"><b className="text-brand-200">CommunityOne</b> <span className="text-white">{a.message}</span>{href && <> <a href={preview ? undefined : href} className="font-semibold text-brand-300 underline">See more</a></>}</span>
      <button type="button" className="text-2 -my-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-white/5 hover:text-white" aria-label="Dismiss announcement" onClick={onDismiss} disabled={preview}>✕</button>
    </div>
  );
}
