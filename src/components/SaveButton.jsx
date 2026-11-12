// Save / Saved for an event or resource (Stage 4). Saved items live on the account.
// v2 tokens: a bookmark icon, filled once saved. `iconOnly` draws the small icon button used in
// table rows (board V2EModules, Resources); otherwise a secondary button reading Save or Saved.
import { useState } from 'react';
import { setSaved, useIsSaved } from '../lib/engage.js';
import { errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';
import { Icon } from './icons.jsx';

export default function SaveButton({ type, id, label, iconOnly = false, size, className = '' }) {
  const saved = useIsSaved(type, id);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try { await setSaved(type, id, !saved); toast(saved ? 'Removed from Saved' : 'Saved'); } catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  };
  const name = label ? `${saved ? 'Remove' : 'Save'} ${label}${saved ? ' from Saved' : ''}`
    : iconOnly ? (saved ? 'Remove from Saved' : 'Save') : undefined;
  const icon = (
    <span aria-hidden="true" className={`inline-flex ${saved ? 'text-[var(--az-link)] [&_path]:fill-current' : ''}`}>
      <Icon name="bookmarks" size={iconOnly ? 18 : 16} />
    </span>
  );
  if (iconOnly) {
    return (
      <button type="button" className={`btn btn-ghost btn-icon ${size === 'sm' ? 'btn-sm' : ''} !border-transparent !bg-transparent hover:!bg-[var(--az-sunken)] ${className}`}
        disabled={busy} aria-pressed={saved} aria-label={name} title={name} onClick={toggle}>
        {icon}
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-secondary ${size === 'sm' ? 'btn-sm' : ''} ${className}`} disabled={busy} aria-pressed={saved}
      aria-label={name} onClick={toggle}>
      {icon}{saved ? 'Saved' : 'Save'}
    </button>
  );
}
