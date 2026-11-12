// One right action per membership state (v2 workstream D, D7), from the server's membership
// object on GET /communities: Public, not joined: Join. Private: Request to join. Requested:
// Withdraw request. Member (active or restricted): Open. Left: Rejoin (a Private community asks
// again). Removed less than the cooldown ago: the date you can ask again, no button. The server
// checks every click again (MEM-01, MEM-07, VIS-13); the list is refreshed after each one.
// JoinButton.jsx stays as it is for the screens that still use the store's group shape.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { communityApi, communityPath } from '../../lib/communities.js';
import { toast } from '../../lib/toast.js';
import { Badge, Button } from '../ui/Controls.jsx';
import { useCommunityWrite } from './useCommunity.js';

export const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', instructor: 'Instructor', teaching_assistant: 'Teaching Assistant', member: 'Member' };
export const roleLabel = (role) => ROLE_LABEL[role] ?? 'Member';

/** What the membership state is now, in the words the action uses. */
export function membershipView(c, now = Date.now()) {
  const m = c.membership;
  const state = m?.state ?? null;
  if (state === 'active' || state === 'restricted') return { kind: 'member', state };
  if (state === 'pending') return { kind: 'pending' };
  if (state === 'removed' && m.rejoinAfter && Date.parse(m.rejoinAfter) > now) return { kind: 'wait', until: m.rejoinAfter };
  if (c.status !== 'active' || c.visibility === 'closed') return { kind: 'none' };
  if (state === 'left') return { kind: 'left' };
  return { kind: c.visibility === 'private' ? 'request' : 'join' };
}

/** Your status on a card: Member · Admin, Restricted, Request pending, You left. Null when none. */
export function MembershipBadge({ c }) {
  const v = membershipView(c);
  if (v.kind === 'member') {
    return v.state === 'restricted'
      ? <Badge tone="warn">Restricted</Badge>
      : <Badge tone="ok">{c.membership.role && c.membership.role !== 'member' ? `Member · ${roleLabel(c.membership.role)}` : 'Member'}</Badge>;
  }
  if (v.kind === 'pending') return <Badge tone="info">Request pending</Badge>;
  if (v.kind === 'left') return <Badge>You left</Badge>;
  return null;
}

/**
 * The one action for `c` (a GET /communities row). `onChange` runs after a write so the caller
 * reloads its list; the store's copy of the community and the sidebar refresh on their own.
 */
export default function MembershipAction({ c, onChange, size = 'sm', className = '' }) {
  const { run } = useCommunityWrite();
  const [busy, setBusy] = useState(false);
  const v = membershipView(c);

  const act = async (fn, describe) => {
    setBusy(true);
    try {
      const res = await run(c.id, fn);
      if (res) toast(describe(res));
      await onChange?.();
    } finally { setBusy(false); }
  };
  const join = () => act(() => communityApi.join(c.id), (res) => (res.membership?.state === 'pending'
    ? `Request sent. ${c.name}’s admins decide.` : `You joined ${c.name}`));
  const withdraw = () => act(() => communityApi.leave(c.id), () => `Request to join ${c.name} withdrawn`);

  if (v.kind === 'member') {
    return <Link to={communityPath(c)} className={`btn btn-secondary ${size === 'sm' ? 'btn-sm' : ''} ${className}`} aria-label={`Open ${c.name}`}>Open</Link>;
  }
  if (v.kind === 'wait') return <span className={`t-small ${className}`}>You can ask again on {shortDate(v.until)}</span>;
  if (v.kind === 'none') return null;
  const [label, onClick, variant] = {
    pending: ['Withdraw request', withdraw, 'secondary'],
    left: [c.visibility === 'private' ? 'Request to join' : 'Rejoin', join, 'primary'],
    request: ['Request to join', join, 'primary'],
    join: ['Join', join, 'primary'],
  }[v.kind];
  return (
    <Button variant={variant} size={size} busy={busy} onClick={onClick} className={className} aria-label={`${label}: ${c.name}`}>{label}</Button>
  );
}
