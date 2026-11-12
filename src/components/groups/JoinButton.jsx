// Join / leave for one community, shared by the community page and community cards. The server
// decides the outcome: Public joins at once, Private sends a request, Closed needs an invitation.
import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { communityApi, communityPath } from '../../lib/communities.js';
import { roleOf } from './helpers.js';
import { useChannelSync, useCommunityWrite } from './useCommunity.js';
import { confirmAction } from '../ui/Confirm.jsx';
import { Modal } from '../ui.jsx';

/** Shared leave flow: confirm, then leave on the server (which refuses an owner or the last admin). */
export function useLeaveGroup() {
  const { me } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  return async (g) => {
    if (!(await confirmAction(`Leave ${g.name}?`))) return;
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
  const [asking, setAsking] = useState(false);
  const join = (answer) => act(async () => {
    const res = await run(g.id, () => communityApi.join(g.id, null, answer));
    if (!res) return;
    if (res.membership?.state === 'active') { toast(`You joined ${g.name}`); channels.add(g.id, [me.id]); }
    else if (res.membership?.state === 'pending') {
      toast('Request sent');
      g.admins.forEach((a) => dispatch({ type: 'notify', silent: true, notification: { userId: a, kind: 'group', link: communityPath(g, 'members'), text: `${me.name} asked to join ${g.name}` } }));
    }
  });
  if (g.accessType === 'public') return <button type="button" className={`btn btn-primary ${className}`} disabled={busy} onClick={() => join()}>Join</button>;
  if (g.accessType === 'restricted') {
    const cancel = () => act(() => run(g.id, () => communityApi.leave(g.id), { ok: 'Request withdrawn' }));
    // A Private community can ask one question with each request (F7); answering is optional.
    const request = () => (g.joinQuestion ? setAsking(true) : join());
    return (
      <>
        <button type="button" className={`btn ${requested ? 'btn-secondary' : 'btn-primary'} ${className}`} disabled={busy} onClick={requested ? cancel : request}>{requested ? 'Cancel request' : 'Request to join'}</button>
        {asking && <JoinQuestion g={g} busy={busy} onClose={() => setAsking(false)} onSend={async (answer) => { await join(answer); setAsking(false); }} />}
      </>
    );
  }
  return <span className={`chip ${className}`} title={user(g.admins[0])?.name ? `Ask ${user(g.admins[0]).name} to add you` : 'Ask a community admin to add you'}><Icon name="lock" size={14} /> Invite only</span>;
}

/** The community's join question, asked with a Private request. */
function JoinQuestion({ g, busy, onClose, onSend }) {
  const [answer, setAnswer] = useState('');
  const id = `join-q-${g.id}`;
  return (
    <Modal title={`Ask to join ${g.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSend(answer.trim() || undefined); }} className="flex flex-col gap-4">
        <div>
          <label htmlFor={id} className="text-sm font-semibold">{g.joinQuestion}</label>
          <textarea id={id} className="input mt-1.5 min-h-24" maxLength={500} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-describedby={`${id}-h`} />
          <p id={`${id}-h`} className="t-small mt-1">Optional. The community’s admins see your answer with your request. {500 - answer.length} characters left.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Modal>
  );
}
