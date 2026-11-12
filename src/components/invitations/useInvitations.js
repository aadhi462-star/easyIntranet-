// A community's invitations for its Owners and Admins (v2 workstream F, F9; board V2FInvites):
// GET /communities/:id/invitations, every status at once, so the status filters can show counts
// without a request each. The server keeps the newest 500.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';

// The server's status names, in the order the filters show them. "open" is shown as Pending.
export const STATUSES = [
  ['open', 'Pending', 'warn'],
  ['accepted', 'Accepted', 'ok'],
  ['declined', 'Declined', 'neutral'],
  ['expired', 'Expired', 'neutral'],
  ['revoked', 'Revoked', 'bad'],
];
export const statusInfo = (s) => STATUSES.find(([k]) => k === s) ?? ['open', 'Pending', 'warn'];

export const dayText = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** "in 12 days", "tomorrow", "today", from now until `iso`. */
export function untilText(iso) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Who an invitation is for, as the Admin typed it: the account's name, or the address. */
export const inviteeOf = (i) => i.user?.name ?? i.email ?? 'Someone';

export function useInvitations(communityId, { enabled = true } = {}) {
  const [s, setS] = useState({ status: enabled ? 'loading' : 'off', list: [], message: '' });
  const load = useCallback(async () => {
    if (!enabled || !communityId) { setS({ status: 'off', list: [], message: '' }); return; }
    try {
      const { invitations } = await api(`/communities/${encodeURIComponent(communityId)}/invitations`);
      setS({ status: 'ready', list: invitations, message: '' });
    } catch (err) {
      setS((prev) => ({ ...prev, status: prev.status === 'ready' ? 'ready' : 'error', message: errorText(err) }));
    }
  }, [communityId, enabled]);
  useEffect(() => { load(); }, [load]);
  const pending = s.list.filter((i) => i.status === 'open').length;
  return { ...s, pending, reload: load };
}
