// Report something (board S6Moderation, decision D2): a reason from a fixed list and an optional
// note. The person reported never learns who reported them. Reporting the same thing again
// updates your earlier report (MOD-02).
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { REASONS } from '../../lib/manage.js';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';

const NOUN = { post: 'post', comment: 'reply', event: 'event', member: 'member' };

export default function ReportDialog({ targetType, targetId, communityId, communityName, onClose }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState({ reason: '', note: '' });
  const send = async (e) => {
    e.preventDefault();
    if (!reason) { setFieldError({ reason: 'Choose a reason.', note: '' }); return; }
    if (reason === 'other' && !note.trim()) { setFieldError({ reason: '', note: 'Tell the moderators what’s wrong.' }); document.getElementById('rp-note')?.focus(); return; }
    setBusy(true); setError(''); setFieldError({ reason: '', note: '' });
    try {
      await api('/reports', { method: 'POST', body: { targetType, targetId, communityId, reason, note: note.trim() || null } });
      toast(`Thanks. ${communityName ? `${communityName}’s` : 'The community’s'} moderators will review it.`);
      onClose(true);
    } catch (err) {
      setBusy(false);
      if (err.extra?.field === 'note') setFieldError({ reason: '', note: errorText(err) });
      else if (err.extra?.field === 'reason') setFieldError({ reason: errorText(err), note: '' });
      else setError(errorText(err));
    }
  };
  return (
    <Modal title={`Report this ${NOUN[targetType]}`} onClose={() => onClose(false)}>
      <form noValidate className="flex flex-col gap-4" onSubmit={send}>
        <p className="text-2 text-sm">The community’s moderators will review it. The person you report won’t know it was you.</p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" aria-describedby={fieldError.reason ? 'rp-reason-err' : undefined}>
          <legend className="pb-1.5 text-sm font-medium">Why are you reporting it?</legend>
          {REASONS.map(([id, label]) => (
            <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3 text-[15px] ${reason === id ? 'border-[var(--az-focus)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-hairline)] bg-[var(--az-surface)]'}`}>
              <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => { setReason(id); setFieldError({ reason: '', note: '' }); }} className="h-[18px] w-[18px] shrink-0 accent-[var(--az-focus)]" />{label}
            </label>
          ))}
          {fieldError.reason && <p id="rp-reason-err" className="field-error !mt-0">{fieldError.reason}</p>}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rp-note" className="text-sm font-medium">Anything moderators should know? <span className="text-2 font-normal">{reason === 'other' ? '(required)' : 'Optional'}</span></label>
          <textarea id="rp-note" className="input min-h-20" maxLength={1000} required={reason === 'other'} value={note} onChange={(e) => { setNote(e.target.value); if (fieldError.note) setFieldError({ reason: '', note: '' }); }}
            aria-invalid={!!fieldError.note || undefined} aria-describedby={fieldError.note ? 'rp-note-err' : undefined} />
          {fieldError.note && <p id="rp-note-err" className="field-error !mt-0">{fieldError.note}</p>}
        </div>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      </form>
    </Modal>
  );
}
