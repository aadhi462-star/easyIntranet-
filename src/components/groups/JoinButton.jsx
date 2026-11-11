// Join / leave for one community, shared by the community page and community cards. The server
// decides the outcome: Public joins at once, Private sends a request, Closed needs an invitation.
import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { communityApi, communityPath } from '../../lib/communities.js';
import { roleOf } from './helpers.js';
import { useChannelSync, useCommunityWrite } from './useCommunity.js';

/** Shared leave flow: confirm, then leave on the server (which refuses an owner or the last admin). */
export function useLeaveGroup() {
  const { me } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  return async (g) => {
    if (!confirm(`Leave ${g.name}?`)) return;
    if (await run(g.id, () => communityApi.leave(g.id), { ok: `You left ${g.name}` })) channels.drop(g.id, me.id);
  };
}

export default function JoinButton({ g, className = '' }) {
  const { dispatch, me, user } = useStore();
  const leave = useLeaveGroup();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  const [busy, setBusy] = useState(false);
  const role = roleOf(g, me.id);
  const requested = (g.joinRequests || []).includes(me.id);
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (g.allHands && role) return null;
  if (role) {
    return <button className={`btn btn-ghost ${className}`} disabled={busy} onClick={() => act(() => leave(g))}>Leave</button>;
  }
  if (g.status === 'archived') return <span className={`chip ${className}`}>Archived</span>;
  const join = () => act(async () => {
    const res = await run(g.id, () => communityApi.join(g.id));
    if (!res) return;
    if (res.membership?.state === 'active') { toast(`You joined ${g.name}`); channels.add(g.id, [me.id]); }
    else if (res.membership?.state === 'pending') {
      toast('Request sent');
      g.admins.forEach((a) => dispatch({ type: 'notify', silent: true, notification: { userId: a, kind: 'group', link: communityPath(g, 'members'), text: `${me.name} asked to join ${g.name}` } }));
    }
  });
  if (g.accessType === 'public') return <button className={`btn btn-primary ${className}`} disabled={busy} onClick={join}>Join</button>;
  if (g.accessType === 'restricted') {
    const cancel = () => act(() => run(g.id, () => communityApi.leave(g.id), { ok: 'Request withdrawn' }));
    return <button className={`btn ${requested ? 'btn-ghost' : 'btn-primary'} ${className}`} disabled={busy} onClick={requested ? cancel : join}>{requested ? 'Cancel request' : 'Request to join'}</button>;
  }
  return <span className={`chip ${className}`} title={user(g.admins[0])?.name ? `Ask ${user(g.admins[0]).name} to add you` : 'Ask a community admin to add you'}><Icon name="lock" size={14} /> Invite only</span>;
}

