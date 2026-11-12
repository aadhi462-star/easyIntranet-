// Administration → Communities (board S7Communities; D1, D2, D4): every community with filters,
// a panel per community (staff, counts, what deleting it affects), suspend and restore, a new
// Owner for a community without one (COM-08), and the deletion requests queue with its review.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { dateText, usePasswordGate } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';
import { Chips, Failed, Loading, ReasonDialog, Table } from './bits.jsx';

const SHOW = [['all', 'All'], ['requests', 'Deletion requests'], ['no_owner', 'No active Owner'], ['suspended', 'Suspended'], ['archived', 'Archived'], ['deleted', 'Deleted, restorable']];
const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

export default function Communities() {
  const [show, setShow] = useState('all');
  const [s, setS] = useState({ state: 'loading' });
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    setS((p) => ({ ...p, state: p.d ? 'ready' : 'loading' }));
    api(`/admin/communities?show=${show}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [show]);
  useEffect(() => { load(); }, [load]);
  const counts = s.d?.counts ?? {};
  const list = s.d?.show === show ? s.d.communities : [];

  return (
    <div className="flex flex-col gap-5">
      <Chips label="Show" value={show} onChange={setShow} options={SHOW.map(([id, label]) => ({ id, label, count: counts[id] }))} />
      {s.state === 'loading' ? <Loading label="Loading communities" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : show === 'requests' ? (
        <section aria-labelledby="dr-h" className="flex flex-col gap-3">
          <h2 id="dr-h" className="t-h2 text-white">Deletion requests</h2>
          <Table label="Deletion requests" head={['Community', 'Asked by', 'Asked', 'Status']} empty="No deletion requests are waiting."
            rows={list.map((c) => (
              <tr key={c.id} className="border-b border-[var(--az-divider)] last:border-0">
                <td className="px-4 py-3"><button className="flex items-center gap-3 font-semibold text-white hover:underline" onClick={() => setOpen(c.id)}><CommunityTile c={c} size={28} />{c.name}</button></td>
                <td className="text-2 px-4 py-3">{c.request.by ?? 'Deleted member'}</td>
                <td className="text-3 px-4 py-3">{dateText(c.request.createdAt)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">{c.request.mine ? 'Waiting · you’re reviewing' : c.request.reviewBy ? `Waiting · ${c.request.reviewBy} is reviewing` : 'Waiting'}</span></td>
              </tr>
            ))} />
          <p className="t-small">Oldest first. Opening a request marks it as yours for 30 minutes, so two admins don’t decide it at once. The Owner can withdraw it until it’s decided.</p>
        </section>
      ) : (
        <Table label="Communities" head={['Community', 'Visibility', 'Members', 'Owner', 'Status', '']} empty="No communities here."
          rows={list.map((c) => (
            <tr key={c.id} className="border-b border-[var(--az-divider)] last:border-0">
              <td className="px-4 py-3"><button className="flex items-center gap-3 text-left font-semibold text-white hover:underline" onClick={() => setOpen(c.id)}><CommunityTile c={c} size={28} />{c.name}</button></td>
              <td className="px-4 py-3"><VisibilityBadge visibility={c.visibility} /></td>
              <td className="text-2 px-4 py-3 tabular-nums">{c.memberCount}</td>
              <td className="text-2 px-4 py-3">{c.ownerCount ? c.owner : <span className="text-amber-200">No active Owner</span>}</td>
              <td className="text-2 px-4 py-3">{c.status === 'deleted' ? `Deleted · goes for good ${dateText(c.purgeAfter)}${c.purging ? ' · removing…' : ''}` : c.status === 'active' ? 'Active' : c.status.replace(/^\w/, (x) => x.toUpperCase())}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right"><button className="text-brand-300 hover:underline" onClick={() => setOpen(c.id)}>Open</button></td>
            </tr>
          ))} />
      )}
      {open && <Panel id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function Panel({ id, onClose, onChanged }) {
  const withPassword = usePasswordGate();
  const [s, setS] = useState({ state: 'loading' });
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api(`/admin/communities/${encodeURIComponent(id)}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (msg) => { toast(msg); setDialog(null); load(); onChanged(); };
  const post = (path, body) => api(`/admin/communities/${encodeURIComponent(id)}/${path}`, { method: 'POST', body });
  const c = s.d?.community;
  const req = s.d?.request?.status === 'open' ? s.d.request : null;
  // Opening a request marks it as yours (DEL-15).
  const [review, setReview] = useState(null);
  useEffect(() => {
    if (!req) return;
    api(`/admin/deletion-requests/${req.id}/review`, { method: 'POST' }).then(() => setReview({ mine: true })).catch((e) => setReview({ mine: false, message: errorText(e) }));
  }, [req?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title={c ? c.name : 'Community'} onClose={onClose} wide>
      {s.state === 'loading' ? <Loading label="Loading community" /> : s.state === 'error' ? <Failed message={s.message} /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <CommunityTile c={c} size={40} />
            <span className="min-w-0 flex-1"><span className="t-small block">{c.memberCount} members · {c.status === 'active' ? 'Active' : c.status}</span>
              {c.statusReason && <span className="t-small block">Reason on record: “{c.statusReason}”</span>}</span>
            <VisibilityBadge visibility={c.visibility} />
          </div>
          {c.status === 'deleted' && (
            <p role="status" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              Deleted {dateText(c.deletedAt)}. Members who open an old link see “This community has been removed”. {c.purging ? 'Removal for good has started and can’t be stopped.' : `It can be restored until ${dateText(c.purgeAfter)}; after that it’s removed for good.`}
            </p>
          )}
          <section aria-labelledby="cs-h">
            <h3 id="cs-h" className="t-label mb-1">Owners and Admins</h3>
            {s.d.staff.length ? <ul className="list-rows">{s.d.staff.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 py-2 text-sm"><span className="text-white">{m.name}</span><span className="text-3">{m.role === 'owner' ? 'Owner' : 'Admin'}{m.accountStatus !== 'active' ? ` · account ${m.accountStatus}` : ''}</span></li>
            ))}</ul> : <p className="text-sm text-amber-200">Nobody is in charge of this community.</p>}
          </section>
          {req && <RequestReview req={req} review={review} c={c} impact={s.d.impact} onDecline={() => setDialog('decline')} onApprove={() => setDialog('approve')} />}
          {!req && c.status !== 'deleted' && <Impact impact={s.d.impact} />}
          <div className="flex flex-wrap gap-2">
            {c.status !== 'deleted' && <Link className="btn btn-ghost" to={`${communityPath(c)}?admin=1`}>Open in Administrative Mode</Link>}
            {['active', 'archived'].includes(c.status) && !c.isDefault && <button className="btn btn-ghost" onClick={() => setDialog('suspend')}>Suspend…</button>}
            {c.status === 'suspended' && <button className="btn btn-primary" onClick={async () => { try { await post('unsuspend'); done('Community restored'); } catch (e) { toast(errorText(e), 'error'); } }}>Lift suspension</button>}
            {c.status !== 'deleted' && !s.d.staff.some((m) => m.role === 'owner' && m.accountStatus === 'active') && <button className="btn btn-ghost" onClick={() => setDialog('owner')}>Make someone Owner…</button>}
            {c.status !== 'deleted' && !c.isDefault && !req && <button className="btn btn-ghost text-rose-300" onClick={() => setDialog('delete')}>Delete…</button>}
            {c.status === 'deleted' && !c.purging && <button className="btn btn-primary" onClick={async () => { if (!confirm(`Restore ${c.name}? Everything comes back as it was, memberships included.`)) return; try { await post('restore'); done('Community restored'); } catch (e) { toast(errorText(e), 'error'); } }}>Restore</button>}
          </div>
          {dialog === 'suspend' && <ReasonDialog title={`Suspend ${c.name}`} action="Suspend" danger reasonHint="Required; its staff see it" onClose={() => setDialog(null)}
            intro="It’s hidden from everyone except its own Owners, Admins and Moderators, who can read it but not change it. Nothing is deleted."
            onSubmit={async ({ reason }) => { await post('suspend', { reason }); done('Community suspended'); }} />}
          {dialog === 'delete' && <ReasonDialog title={`Delete ${c.name}`} action="Delete community" danger confirmName={c.name} reasonLabel="Why it’s being deleted" reasonHint="Required; the Owners are told why" onClose={() => setDialog(null)}
            intro={<>For a community breaking platform rules (D2). <Impact impact={s.d.impact} compact /> It disappears at once, can be restored for 30 days, then is removed for good. Asks for your password if you haven’t entered it in 10 minutes.</>}
            onSubmit={async ({ reason, confirmName }) => { await withPassword(() => post('delete', { note: reason, confirmName })); done('Community deleted · restorable for 30 days'); }} />}
          {dialog === 'approve' && <ReasonDialog title={`Approve deleting ${c.name}`} action="Approve deletion" danger confirmName={c.name} reasonLabel="Your decision note" reasonHint="Required; the Owner sees it" onClose={() => setDialog(null)}
            intro="The community disappears at once and can be restored for 30 days; after that it’s removed for good. Members are notified. Asks for your password if you haven’t entered it in 10 minutes."
            onSubmit={async ({ reason, confirmName }) => { await withPassword(() => api(`/admin/deletion-requests/${req.id}/approve`, { method: 'POST', body: { note: reason, confirmName } })); done('Deletion approved · restorable for 30 days'); }} />}
          {dialog === 'decline' && <ReasonDialog title="Decline the request" action="Decline" reasonLabel="Your decision note" reasonHint="Required; the Owner sees it in a notification and on their Danger Zone" onClose={() => setDialog(null)}
            onSubmit={async ({ reason }) => { await api(`/admin/deletion-requests/${req.id}/decline`, { method: 'POST', body: { note: reason } }); done('Request declined'); }} />}
          {dialog === 'owner' && <OwnerPicker c={c} onClose={() => setDialog(null)} onPick={async (userId) => { await post('owner', { userId }); done('New Owner set'); }} />}
        </div>
      )}
    </Modal>
  );
}

function Impact({ impact: i, compact = false }) {
  const rows = [
    ['Members', `${i.members} · each gets a notification`],
    ['Posts, replies, events, resources', `${i.posts} · ${i.replies} · ${i.events} · ${i.resources}`],
    ['Courses with active learners', i.courses ? `${i.courses} · ${i.learners} learners` : 'None'],
    ['Certificates issued', `${i.certificates} · keep verifying`],
    ['Open reports and appeals', i.openReports + i.openAppeals ? `${i.openReports} reports · ${i.openAppeals} appeals · decide first` : 'None'],
    ['Files in storage', `${i.files} · ${bytes(i.fileBytes)}`],
  ];
  if (compact) return <span>It affects {i.members} members, {i.posts} posts and {i.files} files.</span>;
  return (
    <section aria-labelledby="im-h">
      <h3 id="im-h" className="t-label mb-1">What deleting it affects</h3>
      <dl className="list-rows">{rows.map(([k, v]) => <div key={k} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-2">{k}</dt><dd className={k.startsWith('Open') && v !== 'None' ? 'text-amber-200' : 'text-white'}>{v}</dd></div>)}</dl>
    </section>
  );
}

function RequestReview({ req, review, impact, onApprove, onDecline }) {
  const blocked = impact.openReports + impact.openAppeals > 0;
  return (
    <section aria-labelledby="rr-h" className="raised flex flex-col gap-4 p-5">
      <h3 id="rr-h" className="t-h3 text-white">Deletion request</h3>
      <p className="t-small">Asked by {req.requestedBy ?? 'a deleted member'} on {dateText(req.createdAt)}. The community kept working since; this shows it as it is now.</p>
      <blockquote className="band p-4 text-sm text-white">“{req.reason}”</blockquote>
      <Impact impact={impact} />
      {review && !review.mine && <p role="alert" className="text-sm text-amber-200">{review.message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {blocked && <span id="why-off" className="t-small">Decide the open reports and appeals first.</span>}
        <button className="btn btn-ghost" disabled={!review?.mine} onClick={onDecline}>Decline</button>
        <button className="btn btn-ghost text-rose-300" disabled={!review?.mine || blocked} aria-describedby={blocked ? 'why-off' : undefined} onClick={onApprove}>Approve deletion…</button>
      </div>
    </section>
  );
}

function OwnerPicker({ c, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api(`/admin/communities/${encodeURIComponent(c.id)}/members?q=${encodeURIComponent(q)}`).then((d) => setList(d.members)).catch((e) => setError(errorText(e))), 200);
    return () => clearTimeout(t);
  }, [c.id, q]);
  const pick = async (m) => {
    if (!confirm(`Make ${m.name} an Owner of ${c.name}? The previous Owner, if still a member, becomes an Admin.`)) return;
    try { await onPick(m.id); } catch (e) { setError(errorText(e)); }
  };
  return (
    <Modal title={`New Owner for ${c.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-2 text-sm">For a community whose only Owner left or was suspended. Choose one of its active members; they’re notified.</p>
        <label><span className="sr-only">Search members</span><input type="search" className="input" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {list === null ? <Loading label="Loading members" h="h-20" /> : list.length ? (
          <ul className="list-rows">{list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="text-white">{m.name} <span className="text-3">· {m.role}</span></span><button className="btn btn-ghost" onClick={() => pick(m)}>Make Owner</button></li>
          ))}</ul>
        ) : <p className="text-3 text-sm">No active members match.</p>}
      </div>
    </Modal>
  );
}
