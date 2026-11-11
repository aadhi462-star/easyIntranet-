// Save / Saved for an event or resource (Stage 4). Saved items live on the account.
import { useState } from 'react';
import { setSaved, useIsSaved } from '../lib/engage.js';
import { errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';

export default function SaveButton({ type, id, label, className = '' }) {
  const saved = useIsSaved(type, id);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try { await setSaved(type, id, !saved); toast(saved ? 'Removed from Saved' : 'Saved'); } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <button type="button" className={`btn btn-ghost ${saved ? 'text-white' : ''} ${className}`} disabled={busy} aria-pressed={saved}
      aria-label={label ? `${saved ? 'Remove' : 'Save'} ${label}${saved ? ' from Saved' : ''}` : undefined} onClick={toggle}>
      {saved ? '✓ Saved' : 'Save'}
    </button>
  );
}
