// A community's Manage tab (redesign Stage 6, boards S6Manage and S6Mobile): Overview · Queue ·
// Members · Analytics · Settings · Branding (v2 E6), for its Owners, Admins and Moderators. Each role opens on its
// first job (D5): Owners on Overview, Admins and Moderators on the Queue. Moderators get the Queue
// and a read-only Members list; Analytics, Settings and Branding are for Owners and Admins; only Owners see
// the Danger Zone. The server checks every one of these again.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { managePath } from '../../lib/manage.js';
import { useServerFeed } from '../../lib/feed.js';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Empty, Field } from '../ui.jsx';
import { roleOf } from '../groups/helpers.js';
import RolePanel, { RequestQueue, ReviewQueue } from '../groups/RolePanel.jsx';
import Settings from '../groups/Settings.jsx';
import Cases, { Appeals } from './Cases.jsx';
import ManageMembers from './ManageMembers.jsx';
import Analytics from './Analytics.jsx';
import Branding from './Branding.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queue', label: 'Queue', count: true },
  { id: 'members', label: 'Members' },
  { id: 'analytics', label: 'Analytics', admins: true },
  { id: 'settings', label: 'Settings', admins: true },
  // v2 E6: logo, cover and accent, beside Settings; Owners and Admins only (managePath(g, 'branding')).
  { id: 'branding', label: 'Branding', admins: true },
];

/** What's waiting: reports, held posts, join requests and appeals, for this person's role. */
export function useQueueCounts(g, perms) {
  const [n, setN] = useState({ reports: 0, requests: 0, appeals: 0 });
  const held = useServerFeed({ view: 'pending', community: g.id, keep: (p) => p.status === 'pending', enabled: !!perms.canModerate });
  const load = useCallback(async () => {
    if (!perms.canModerate) return;
    const [cases, reqs, appeals] = await Promise.all([
      api(`/communities/${encodeURIComponent(g.id)}/cases`).then((d) => d.cases.length).catch(() => 0),
      perms.canAdmin ? api(`/communities/${encodeURIComponent(g.id)}/requests`).then((d) => d.requests.length).catch(() => 0) : 0,
      perms.canAdmin ? api(`/communities/${encodeURIComponent(g.id)}/appeals`).then((d) => d.appeals.length).catch(() => 0) : 0,
    ]);
    setN({ reports: cases, requests: reqs, appeals });
  }, [g.id, perms.canModerate, perms.canAdmin]);
  useEffect(() => { load(); }, [load]);
  const posts = held.posts.filter((p) => p.status === 'pending').length;
  return { ...n, posts, total: n.reports + n.requests + n.appeals + posts, reload: load };
}

export default function Manage({ g, perms, section }) {
  const { me } = useStore();
  const role = g.adminMode ? 'admin' : roleOf(g, me.id);
  const counts = useQueueCounts(g, perms);
  if (!perms.canModerate) return <Empty icon="lock" title="Manage is for this community’s Owners, Admins and Moderators" />;
  const sections = SECTIONS.filter((s) => !s.admins || perms.canAdmin);
  // D5: each role opens on its first job.
  const first = role === 'owner' ? 'overview' : 'queue';
  const current = sections.some((s) => s.id === section) ? section : first;
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav aria-label="Manage" className="no-scrollbar -mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 lg:sticky lg:top-24 lg:w-52 lg:flex-col lg:gap-0.5">
        {sections.map((s) => (
          <Link key={s.id} to={managePath(g, s.id)} aria-current={current === s.id ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-full border px-4 text-sm lg:rounded-lg lg:border-0 lg:px-3 ${current === s.id ? 'border-[var(--cm-line)] bg-[var(--cm-tint)] font-semibold text-white lg:text-[var(--cm-ink)]' : 'text-2 border-[var(--az-hairline)] hover:text-white'}`}>
            {s.label}{s.count && counts.total > 0 && <span className="rounded-full bg-brand-400 px-2 text-xs font-bold text-ink-950">{counts.total}</span>}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {current === 'overview' && <Overview g={g} perms={perms} role={role} counts={counts} />}
        {current === 'queue' && <Queue g={g} perms={perms} counts={counts} />}
        {current === 'members' && <ManageMembers g={g} perms={perms} />}
        {current === 'analytics' && <Analytics g={g} />}
        {current === 'branding' && <Branding key={g.id} g={g} />}
        {current === 'settings' && (
          <div className="flex flex-col gap-8">
            <Settings key={g.id} group={g} />
            {role === 'owner' && <DangerZone g={g} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ g, perms, role, counts }) {
  const rows = [
    ['Reports', counts.reports, 'reports'], ['Posts held for approval', counts.posts, 'posts'],
    ...(perms.canAdmin ? [['Join requests', counts.requests, 'requests'], ['Appeals', counts.appeals, 'appeals']] : []),
  ];
  return (
    <div className="flex flex-col gap-6">
      <div><span className="t-label">Manage · {role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Moderator'}</span><h2 className="t-h2 mt-1 text-white">{role === 'owner' ? `Is ${g.name} healthy and set up?` : 'What needs you'}</h2></div>
      {role === 'owner' && <RolePanel g={g} role="owner" />}
      <section aria-labelledby="wait-h" className="raised flex flex-col p-5">
        <div className="flex items-baseline justify-between gap-3 pb-2"><h3 id="wait-h" className="t-h3 text-white">Waiting for a decision</h3><Link to={managePath(g, 'queue')} className="text-sm text-brand-300 hover:underline">Open the queue</Link></div>
        {rows.map(([label, n, kind]) => (
          <Link key={kind} to={`${managePath(g, 'queue')}?show=${kind}`} className="flex min-h-12 items-center justify-between gap-3 border-t border-[var(--az-divider)] text-sm text-white hover:bg-white/[.02]">
            <span>{label}</span><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${n ? 'bg-amber-500/15 text-amber-200' : 'bg-white/[.06] text-slate-300'}`}>{n}</span>
          </Link>
        ))}
        {counts.total === 0 && <p className="t-small pt-3">Nothing needs a decision. New requests and reports show here and in your notifications.</p>}
      </section>
      {role === 'owner' && <DeletionBanner g={g} />}
    </div>
  );
}

function Queue({ g, perms, counts }) {
  const [params, setParams] = useSearchParams();
  const kinds = [['reports', 'Reports', counts.reports], ['posts', 'Held posts', counts.posts],
    ...(perms.canAdmin ? [['requests', 'Join requests', counts.requests], ['appeals', 'Appeals', counts.appeals]] : []), ['resolved', 'Decided', null]];
  const show = kinds.some(([k]) => k === params.get('show')) ? params.get('show') : 'reports';
  const caseId = params.get('case');
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Show" className="no-scrollbar flex gap-2 overflow-x-auto">
        {kinds.map(([k, label, n]) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => { setParams({ show: k }); counts.reload(); }}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${show === k ? 'bg-[var(--cm-tint)] font-semibold text-white shadow-[inset_0_0_0_1px_var(--cm-line)]' : 'text-2 border border-[var(--az-hairline)] hover:text-white'}`}>
            {label}{n != null ? ` · ${n}` : ''}
          </button>
        ))}
      </div>
      {show === 'reports' && <Cases key={`open-${caseId}`} g={g} initial={caseId} onChange={counts.reload} />}
      {show === 'resolved' && <Cases key="resolved" g={g} resolved />}
      {show === 'posts' && <ReviewQueue g={g} framed />}
      {show === 'requests' && <RequestQueue g={g} />}
      {show === 'appeals' && <Appeals g={g} onChange={counts.reload} />}
    </div>
  );
}

/** Danger Zone: request deletion (D6). Archive and transfer stay where they are (Settings, Members). */
function DangerZone({ g }) {
  const [req, setReq] = useState(undefined);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/deletion-request`).then((d) => setReq(d.request)).catch(() => setReq(null)), [g.id]);
  useEffect(() => { load(); }, [load]);
  const withdraw = async () => {
    if (!(await confirmAction('Withdraw the deletion request?'))) return;
    try { setReq((await api(`/communities/${encodeURIComponent(g.id)}/deletion-request`, { method: 'DELETE' })).request); toast('Request withdrawn'); } catch (err) { toast(errorText(err), 'error'); }
  };
  const pending = req?.status === 'open';
  return (
    <section id="danger" aria-labelledby="dz-h" className="flex flex-col gap-3 border-t border-[var(--az-divider)] pt-6">
      <h3 id="dz-h" className="t-h2 text-rose-300">Danger Zone</h3>
      <div className="glass flex flex-wrap items-center gap-3 p-5">
        <span className="min-w-0 flex-[1_1_300px]">
          <b className="text-white">Request deletion</b>
          <span className="t-small block">{pending ? `You asked on ${new Date(req.createdAt).toLocaleDateString()} · waiting for a Platform Admin. ${g.name} keeps working meanwhile.`
            : req?.status === 'declined' ? `Your last request was declined${req.decisionNote ? `: “${req.decisionNote}”` : ''}.` : 'A Platform Admin reviews it. Nothing is deleted until they decide.'}</span>
        </span>
        {pending ? <button className="btn btn-ghost" onClick={withdraw}>Withdraw request</button> : <button className="btn btn-ghost text-rose-300" disabled={req === undefined} onClick={() => setOpen(true)}>Request deletion…</button>}
      </div>
      {open && <RequestDeletion g={g} onClose={(r) => { setOpen(false); if (r) setReq(r); }} />}
    </section>
  );
}

function DeletionBanner({ g }) {
  const [req, setReq] = useState(null);
  useEffect(() => { api(`/communities/${encodeURIComponent(g.id)}/deletion-request`).then((d) => setReq(d.request)).catch(() => {}); }, [g.id]);
  if (req?.status !== 'open') return null;
  return <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">You asked for {g.name} to be deleted on {new Date(req.createdAt).toLocaleDateString()}. A Platform Admin will decide. <Link to={`${managePath(g, 'settings')}#danger`} className="underline">Withdraw request</Link></p>;
}

function RequestDeletion({ g, onClose }) {
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const d = await api(`/communities/${encodeURIComponent(g.id)}/deletion-request`, { method: 'POST', body: { reason, confirmName: name } }); toast('Deletion requested'); onClose(d.request); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={send} className="raised flex flex-col gap-4 p-5" aria-labelledby="rd-h">
      <h4 id="rd-h" className="t-h3 text-white">Request deletion of {g.name}</h4>
      <p className="text-2 text-sm">A Platform Admin will review what deleting it affects: its {g.memberCount} members and everything posted here. Certificates already issued keep verifying. The community keeps working while you wait, and you can withdraw the request until it’s decided.</p>
      <Field label="Why should it be deleted?" hint="Required; the reviewer sees this."><textarea className="input min-h-24" required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label={`Type ${g.name} to confirm`}><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder={g.name} /></Field>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={() => onClose(null)}>Cancel</button>
        <button className="btn btn-ghost text-rose-300" disabled={busy || name.trim() !== g.name}>{busy ? 'Sending…' : 'Send request'}</button>
      </div>
    </form>
  );
}
