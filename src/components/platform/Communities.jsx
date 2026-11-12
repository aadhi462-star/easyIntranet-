// Administration → Communities (board S7Communities; D1, D2, D4): every community with filters,
// a panel per community (staff, counts, what deleting it affects), suspend and restore, a new
// Owner for a community without one (COM-08), and the deletion requests queue with its review.
// Restyled for v2 G (boards V2GPlatformAdmin, V2GPhoneTable: cards under 768 px).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { dateText, usePasswordGate } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { Chips, DataTable, Failed, Loading, ReasonDialog } from './bits.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const SHOW = [['all', 'All'], ['requests', 'Deletion requests'], ['no_owner', 'No active Owner'], ['suspended', 'Suspended'], ['archived', 'Archived'], ['deleted', 'Deleted, restorable']];
const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} bytes`);

export default function Communities() {
  const [show, setShow] = useState('all');
  const [s, setS] = useState({ state: 'loading' });
  // /admin/communities?open=<id> opens that community's panel (Delete community on a community page, E12).
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('open'));
  const load = useCallback(() => {
    setS((p) => ({ ...p, state: p.d ? 'ready' : 'loading' }));
    api(`/admin/communities?show=${show}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [show]);
  useEffect(() => { load(); }, [load]);
  const counts = s.d?.counts ?? {};
  const list = s.d?.show === show ? s.d.communities : [];
  const name = (c) => (
    <button type="button" className="link flex min-w-0 items-center gap-2.5 text-left" onClick={() => setOpen(c.id)}>
      <CommunityTile c={c} size={28} /><span className="min-w-0 break-words">{c.name}</span>
    </button>
  );

  const requestColumns = [
    { head: 'Community', place: 'title', cell: name },
    { head: 'Status', place: 'badge', cell: (c) => <Badge tone="warn">{c.request.mine ? 'You’re reviewing' : c.request.reviewBy ? `${c.request.reviewBy} is reviewing` : 'Waiting'}</Badge> },
    { head: 'Asked by', cell: (c) => c.request.by ?? 'Deleted member' },
    { head: 'Asked', cell: (c) => <span className="text-2">{dateText(c.request.createdAt)}</span> },
  ];
  const columns = [
    { head: 'Community', place: 'title', cell: name },
    { head: 'Visibility', cell: (c) => <VisibilityBadge visibility={c.visibility} /> },
    { head: 'Members', num: true, cell: (c) => c.memberCount },
    { head: 'Owner', cell: (c) => (c.ownerCount ? c.owner : <span className="text-2">No active Owner</span>) },
    { head: 'Status', place: 'badge', cell: (c) => <CommunityStatus c={c} /> },
    { head: 'Actions', sr: true, place: 'action', cell: (c) => <Button size="sm" variant="ghost" onClick={() => setOpen(c.id)}>{!c.ownerCount && c.status !== 'deleted' ? 'Choose an Owner' : 'Open'}</Button> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Chips label="Show" value={show} onChange={setShow} options={SHOW.map(([id, label]) => ({ id, label, count: counts[id] }))} />
      {s.state === 'loading' ? <Loading label="Loading communities" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : show === 'requests' ? (
        <section aria-labelledby="dr-h" className="flex flex-col gap-3">
          <h3 id="dr-h" className="t-h3">Deletion requests</h3>
          <DataTable label="Deletion requests" columns={requestColumns} rows={list} cardLabel={(c) => c.name} empty="No deletion requests are waiting." />
          <p className="t-small">Oldest first. Opening a request shows what deleting affects and marks it yours for 30 minutes, so two admins don’t decide it at once. The Owner can withdraw it until it’s decided.</p>
        </section>
      ) : (
        <>
          <DataTable label="Communities" columns={columns} rows={list} cardLabel={(c) => c.name} empty="No communities here." />
          <p className="t-small">AlumniZone is listed and sorted like any other community.</p>
        </>
      )}
      {open && <Panel id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function CommunityStatus({ c }) {
  if (c.status === 'deleted') return <Badge tone="bad">{c.purging ? 'Being removed' : `Deleted · goes ${dateText(c.purgeAfter)}`}</Badge>;
  if (c.status === 'suspended') return <Badge tone="bad">Suspended</Badge>;
  if (c.status === 'archived') return <Badge>Archived</Badge>;
  if (!c.ownerCount) return <Badge tone="warn">Needs an Owner</Badge>;
  return <Badge tone="ok">Active</Badge>;
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
      {s.state === 'loading' ? <Loading label="Loading community" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <CommunityTile c={c} size={40} />
            <span className="min-w-0 flex-1"><span className="t-small block">{c.memberCount} members · {c.status === 'active' ? 'Active' : c.status}</span>
              {c.statusReason && <span className="t-small block">Reason on record: “{c.statusReason}”</span>}</span>
            <VisibilityBadge visibility={c.visibility} />
          </div>
          {c.status === 'deleted' && (
            <p role="status" className="notice notice-bad">
              Deleted {dateText(c.deletedAt)}. Members who open an old link see “This community has been removed”. {c.purging ? 'Removal for good has started and can’t be stopped.' : `It can be restored until ${dateText(c.purgeAfter)}; after that it’s removed for good.`}
            </p>
          )}
          <section aria-labelledby="cs-h">
            <h3 id="cs-h" className="t-label mb-1">Owners and Admins</h3>
            {s.d.staff.length ? <ul className="list-rows">{s.d.staff.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{m.name}</span><span className="text-2">{m.role === 'owner' ? 'Owner' : 'Admin'}{m.accountStatus !== 'active' ? ` · account ${m.accountStatus}` : ''}</span></li>
            ))}</ul> : <p className="notice notice-warn">Nobody is in charge of this community.</p>}
          </section>
          {req && <RequestReview req={req} review={review} c={c} impact={s.d.impact} onDecline={() => setDialog('decline')} onApprove={() => setDialog('approve')} />}
          {!req && c.status !== 'deleted' && <Impact impact={s.d.impact} />}
          <div className="flex flex-wrap gap-2">
            {c.status !== 'deleted' && <Link className="btn btn-secondary" to={`${communityPath(c)}?admin=1`}>Open in Administrative Mode</Link>}
            {['active', 'archived'].includes(c.status) && <Button onClick={() => setDialog('suspend')}>Suspend…</Button>}
            {c.status === 'suspended' && <Button variant="primary" onClick={async () => { try { await post('unsuspend'); done('Community restored'); } catch (e) { toast(errorText(e), 'error'); } }}>Lift suspension</Button>}
            {c.status !== 'deleted' && !s.d.staff.some((m) => m.role === 'owner' && m.accountStatus === 'active') && <Button onClick={() => setDialog('owner')}>Choose an Owner…</Button>}
            {c.status !== 'deleted' && !req && <Button variant="danger" onClick={() => setDialog('delete')}>Delete…</Button>}
            {c.status === 'deleted' && !c.purging && <Button variant="primary" onClick={async () => { if (!(await confirmAction(`Restore ${c.name}? Everything comes back as it was, memberships included.`))) return; try { await post('restore'); done('Community restored'); } catch (e) { toast(errorText(e), 'error'); } }}>Restore</Button>}
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
      <dl className="list-rows">{rows.map(([k, v]) => <div key={k} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt className="text-2">{k}</dt><dd className={k.startsWith('Open') && v !== 'None' ? 'font-semibold text-[var(--az-warning)]' : ''}>{v}</dd></div>)}</dl>
    </section>
  );
}

function RequestReview({ req, review, impact, onApprove, onDecline }) {
  const blocked = impact.openReports + impact.openAppeals > 0;
  return (
    <section aria-labelledby="rr-h" className="sunken flex flex-col gap-4 p-5">
      <h3 id="rr-h" className="t-h3">Deletion request</h3>
      <p className="t-small">Asked by {req.requestedBy ?? 'a deleted member'} on {dateText(req.createdAt)}. The community kept working since; this shows it as it is now.</p>
      <blockquote className="panel p-4 text-sm">“{req.reason}”</blockquote>
      <Impact impact={impact} />
      {review && !review.mine && <p role="alert" className="notice notice-warn">{review.message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {blocked && <span id="why-off" className="t-small">Decide the open reports and appeals first.</span>}
        <Button disabled={!review?.mine} onClick={onDecline}>Decline</Button>
        <Button variant="danger" disabled={!review?.mine || blocked} aria-describedby={blocked ? 'why-off' : undefined} onClick={onApprove}>Approve deletion…</Button>
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
    if (!(await confirmAction(`Make ${m.name} an Owner of ${c.name}? The previous Owner, if still a member, becomes an Admin.`))) return;
    try { await onPick(m.id); } catch (e) { setError(errorText(e)); }
  };
  return (
    <Modal title={`New Owner for ${c.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-2 text-sm">For a community whose only Owner left or was suspended. Choose one of its active members; they’re notified.</p>
        <label><span className="sr-only">Search members</span><input type="search" className="input" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {error && <p role="alert" className="field-error">{error}</p>}
        {list === null ? <Loading label="Loading members" lines={2} /> : list.length ? (
          <ul className="list-rows">{list.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{m.name} <span className="text-2">· {m.role}</span></span><Button size="sm" onClick={() => pick(m)}>Make Owner</Button></li>
          ))}</ul>
        ) : <p className="text-2 text-sm">No active members match.</p>}
      </div>
    </Modal>
  );
}
