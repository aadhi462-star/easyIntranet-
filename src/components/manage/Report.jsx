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
  const send = async (e) => {
    e.preventDefault();
    if (!reason) { setError('Choose a reason.'); return; }
    setBusy(true); setError('');
    try {
      await api('/reports', { method: 'POST', body: { targetType, targetId, communityId, reason, note: note.trim() || null } });
      toast(`Thanks. ${communityName ? `${communityName}’s` : 'The community’s'} moderators will review it.`);
      onClose(true);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title={`Report this ${NOUN[targetType]}`} onClose={() => onClose(false)}>
      <form className="flex flex-col gap-4" onSubmit={send}>
        <p className="text-2 text-sm">The community’s moderators will review it. The person you report won’t know it was you.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Why are you reporting it?</legend>
          {REASONS.map(([id, label]) => (
            <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${reason === id ? 'border-brand-400 bg-brand-400/10 text-white' : 'border-[var(--az-hairline)] text-slate-200'}`}>
              <input type="radio" name="reason" value={id} checked={reason === id} onChange={() => setReason(id)} className="h-4 w-4 accent-[var(--color-brand-400)]" />{label}
            </label>
          ))}
        </fieldset>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Anything moderators should know? {reason === 'other' ? <span className="text-amber-200">(required)</span> : <span className="text-3 font-normal">Optional</span>}</span>
          <textarea className="input min-h-20" maxLength={1000} required={reason === 'other'} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      </form>
    </Modal>
  );
}
