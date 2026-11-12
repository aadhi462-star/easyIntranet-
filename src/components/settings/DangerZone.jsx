// Settings, Danger Zone (G6, board V2GSettings): archive and restore (Owners and Admins), transfer
// ownership (the Owner, or a Platform Admin in Administrative Mode) and request deletion (the
// Owner only; a Platform Admin decides it, with the 30-day restore). Nothing here deletes at once.
import { useCallback, useEffect, useId, useState } from 'react';
import { api } from '../../lib/api.js';
import { communityApi, errorText } from '../../lib/communities.js';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Button } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { useCommunityLifecycle, useCommunityWrite } from '../groups/useCommunity.js';
import { TextField, useMemberList } from './shared.jsx';

/** The community's deletion request ({ status, createdAt, decisionNote }), or null; undefined while loading. */
export function useDeletionRequest(g) {
  const [req, setReq] = useState(undefined);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/deletion-request`).then((d) => setReq(d.request)).catch(() => setReq(null)), [g.id]);
  useEffect(() => { load(); }, [load]);
  return [req, setReq];
}

function Row({ title, children, action }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[var(--az-divider)] p-5 first:border-t-0">
      <span className="min-w-0 flex-[1_1_300px]">
        <span className="block text-[15px] font-semibold text-[var(--az-text)]">{title}</span>
        <span className="t-small block">{children}</span>
      </span>
      {action}
    </div>
  );
}

export default function DangerZone({ g, isOwner }) {
  const lifecycle = useCommunityLifecycle();
  const [req, setReq] = useDeletionRequest(g);
  const [asking, setAsking] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const archived = g.status === 'archived';
  const canTransfer = isOwner || g.adminMode;
  const pending = req?.status === 'open';
  const withdraw = async () => {
    if (!(await confirmAction({ title: 'Withdraw the deletion request?', body: `${g.name} stays as it is.`, confirm: 'Withdraw request' }))) return;
    try { setReq((await api(`/communities/${encodeURIComponent(g.id)}/deletion-request`, { method: 'DELETE' })).request); toast('Request withdrawn'); } catch (err) { toast(errorText(err), 'error'); }
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="t-label">Settings · {isOwner ? 'Owner' : 'Owners and Admins'}</span>
        <h2 className="t-h2 text-[var(--az-danger)]">Danger Zone</h2>
        <p className="t-small max-w-2xl">Changes that affect everyone in {g.name}. Nothing here deletes anything at once.</p>
      </header>
      <section aria-label="Danger Zone" className="panel overflow-hidden border-[var(--az-danger)]">
        <Row title={archived ? 'Restore' : 'Archive'} action={archived
          ? <Button onClick={() => lifecycle.archive(g, false)}>Restore</Button>
          : <Button variant="danger" onClick={() => lifecycle.archive(g, true)} disabled={g.allHands}>Archive</Button>}>
          {archived ? `${g.name} is archived: read-only for members and out of Explore. Restoring opens it again.` : 'Read-only for members, out of Explore. Restore at any time. Owners and Admins.'}
          {g.allHands && !archived ? ' The everyone community can’t be archived.' : ''}
        </Row>
        {canTransfer && (
          <Row title="Transfer ownership" action={!transferring && <Button onClick={() => setTransferring(true)}>Transfer</Button>}>
            To an active member. {isOwner ? 'You become an Admin.' : 'The current Owner becomes an Admin.'} Owner only, or a Platform Admin in Administrative Mode.
          </Row>
        )}
        {canTransfer && transferring && <Transfer g={g} isOwner={isOwner} onClose={() => setTransferring(false)} />}
        {isOwner && (
          <Row title="Request deletion" action={pending
            ? <Button variant="ghost" onClick={withdraw}>Withdraw request</Button>
            : !asking && <Button variant="danger" disabled={req === undefined} onClick={() => setAsking(true)}>Request deletion</Button>}>
            {pending ? `You asked on ${new Date(req.createdAt).toLocaleDateString()}; a Platform Admin will decide. ${g.name} keeps working meanwhile.`
              : req?.status === 'declined' ? `Your last request was declined${req.decisionNote ? `: “${req.decisionNote}”` : ''}. You can ask again.`
                : 'A Platform Admin reviews it. Nothing is deleted until they decide; then it can be restored for 30 days. Owner only.'}
          </Row>
        )}
        {isOwner && asking && !pending && <RequestDeletion g={g} onClose={(r) => { setAsking(false); if (r) setReq(r); }} />}
      </section>
      {!isOwner && <p className="t-small">Only the Owner can request deletion{g.adminMode ? '' : ' or transfer ownership'}.</p>}
    </div>
  );
}

/** Choose an active member to become Owner; a confirm names what changes. */
function Transfer({ g, isOwner, onClose }) {
  const id = useId();
  const { me } = useStore();
  const { run } = useCommunityWrite();
  const members = useMemberList(g);
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const eligible = members.list.filter((m) => m.role !== 'owner' && m.id !== me.id && (m.state ?? 'active') === 'active');
  const send = async (e) => {
    e.preventDefault();
    const person = eligible.find((m) => m.id === to);
    if (!person) { setError('Choose who becomes the Owner.'); return; }
    if (!(await confirmAction({ title: `Make ${person.name} the Owner of ${g.name}?`, body: `${isOwner ? 'You become an Admin' : 'The current Owner becomes an Admin'}. Only the new Owner can transfer it again or request deletion.`, confirm: 'Transfer ownership', danger: true }))) return;
    setBusy(true); setError('');
    try { await run(g.id, () => communityApi.transfer(g.id, person.id), { inline: true }); toast(`${person.name} is now the Owner`); onClose(); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-3 border-t border-[var(--az-divider)] bg-[var(--az-sunken)] p-5" aria-label="Transfer ownership">
      <label htmlFor={id} className="text-sm font-semibold text-[var(--az-text)]">New Owner</label>
      <select id={id} className="input w-full sm:max-w-sm" value={to} onChange={(e) => { setTo(e.target.value); setError(''); }} disabled={members.status !== 'ready'}
        aria-describedby={`${id}-h${error ? ` ${id}-e` : ''}`} aria-invalid={error ? true : undefined}>
        <option value="">{members.status === 'ready' ? 'Choose a member' : 'Loading the members…'}</option>
        {eligible.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role !== 'member' ? ` (${m.role === 'teaching_assistant' ? 'Teaching Assistant' : m.role[0].toUpperCase() + m.role.slice(1)})` : ''}</option>)}
      </select>
      <span id={`${id}-h`} className="t-small">Only active members can become the Owner.</span>
      {error && <span id={`${id}-e`} role="alert" className="field-error">{error}</span>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" type="submit" busy={busy}>Transfer ownership</Button>
      </div>
    </form>
  );
}

/** The Owner asks a Platform Admin to delete the community (Stage 7 D6): a reason and the typed name. */
function RequestDeletion({ g, onClose }) {
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Say why it should be deleted; the reviewer sees this.'); return; }
    setBusy(true); setError('');
    try { const d = await api(`/communities/${encodeURIComponent(g.id)}/deletion-request`, { method: 'POST', body: { reason, confirmName: name } }); toast('Deletion requested'); onClose(d.request); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-4 border-t border-[var(--az-divider)] bg-[var(--az-sunken)] p-5" aria-label={`Request deletion of ${g.name}`}>
      <p className="text-sm text-[var(--az-text)]">A Platform Admin will review what deleting it affects: its {g.memberCount} members and everything posted here. Certificates already issued keep verifying. The community keeps working while you wait, and you can withdraw the request until it’s decided.</p>
      <TextField label="Why should it be deleted?" multiline rows={3} value={reason} onChange={(x) => { setReason(x); setError(''); }} maxLength={2000} hint="Required; the reviewer sees this." error={error || null} />
      <TextField label={`Type ${g.name} to confirm`} value={name} onChange={setName} placeholder={g.name} autoComplete="off" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onClose(null)}>Cancel</Button>
        <Button variant="danger" type="submit" busy={busy} disabled={name.trim() !== g.name}>Send request</Button>
      </div>
    </form>
  );
}
