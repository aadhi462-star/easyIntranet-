// Administration → Users (board S7Users; D3, D4, D6; restyled for v2 G, board V2GPlatformAdmin):
// search and filters, a person's panel with their communities, sessions and reports, Suspend /
// Reactivate, Sign out everywhere and platform roles. Restricted (per community) and Suspended
// (platform) are shown side by side. Buttons follow the signed-in person's permissions; the
// server checks each one again.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { dateText, downloadCsv, ROLE_LABEL, usePasswordGate, useStaffAccess } from '../../lib/platform.js';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { Button } from '../ui/Controls.jsx';
import { Chips, DataTable, Failed, Loading, Note, ReasonDialog, StatusBadge } from './bits.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const PAGE = 25;
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const ago = (d) => (d ? timeAgo(Date.parse(d)) : 'Never');
const ROLE_FILTER = ['super_admin', 'platform_admin', 'user_manager', 'community_manager', 'lms_manager', 'trust_safety', 'finance_manager', 'support_agent'];

export default function Users() {
  const access = useStaffAccess();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(0);
  const [s, setS] = useState({ state: 'loading' });
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const params = `q=${encodeURIComponent(q.trim())}${status ? `&status=${status}` : ''}${role ? `&role=${role}` : ''}`;
  const load = useCallback(() => {
    setS((p) => ({ ...p, state: p.d ? 'ready' : 'loading' }));
    api(`/admin/users?${params}&limit=${PAGE}&offset=${page * PAGE}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [params, page]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(0); }, [params]);

  const counts = s.d?.counts ?? {};
  const chips = [
    { id: '', label: 'All', count: counts.all }, { id: 'pending', label: 'Waiting for approval', count: counts.pending },
    { id: 'suspended', label: 'Suspended', count: counts.suspended }, { id: 'restricted', label: 'Restricted in a community', count: counts.restricted },
    { id: 'deactivated', label: 'Deactivated', count: counts.deactivated },
  ];
  const exportCsv = async () => {
    const withEmail = await confirmAction({ title: 'Include email addresses?', body: 'Emails are only exported when you choose them. The export is recorded in the activity log either way.',
      confirm: 'Include emails', cancel: 'Leave them out' });
    setExporting(true);
    try { await downloadCsv(`/admin/users.csv?${params}${withEmail ? '&email=1' : ''}`); toast('Export downloaded · recorded in the activity log'); } catch (e) { toast(errorText(e), 'error'); }
    setExporting(false);
  };

  const columns = [
    { head: 'Person', place: 'title', cell: (u) => (
      <button type="button" className="link flex min-w-0 items-center gap-3 text-left" onClick={() => setOpen(u.id)}>
        <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--az-sunken)] text-xs font-bold text-[var(--az-text)]">{initials(u.name)}</span>
        <span className="min-w-0 break-words">{u.name}</span>
      </button>
    ) },
    { head: 'Status', place: 'badge', cell: (u) => <StatusBadge status={u.status} short /> },
    { head: 'Platform role', cell: (u) => (u.roles.length ? u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') : <span className="text-2">None</span>) },
    { head: 'Communities', num: true, cell: (u) => u.communityCount },
    { head: 'Last active', cell: (u) => <span className="text-2">{ago(u.lastActive)}</span> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-[1_1_220px]"><span className="sr-only">Search people</span>
          <input type="search" className="input" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="min-w-0 flex-[0_1_200px]"><span className="sr-only">Platform role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Any role</option>
            {ROLE_FILTER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            <option value="none">No platform role</option>
          </select></label>
        {access.can('users.export') && <Button icon="download" onClick={exportCsv} busy={exporting}>Export CSV</Button>}
      </div>
      <Chips label="Status" options={chips} value={status} onChange={setStatus} />
      {s.state === 'loading' ? <Loading label="Loading users" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : (
        <>
          <p className="sr-only" role="status">{s.d.total} people</p>
          <DataTable label="Users" columns={columns} rows={s.d.users} cardLabel={(u) => u.name} empty="Nobody matches." />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-small min-w-0 flex-[1_1_260px]">{s.d.total ? `${page * PAGE + 1}–${Math.min(s.d.total, (page + 1) * PAGE)} of ${s.d.total} · ` : ''}Emails are shown in each person’s panel and left out of exports unless you choose them; every export is logged.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" disabled={(page + 1) * PAGE >= s.d.total} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Note title="Platform roles">Only a Super Admin grants or removes Platform Admin, never for themselves, and enters their password again first. The last Super Admin can’t be removed.</Note>
        <Note title="Takes effect at once">Suspending someone or removing their role ends their sessions; the next request they make is refused, wherever they are.</Note>
        <Note title="Restricted vs suspended"><b className="font-semibold text-[var(--az-text)]">Restricted</b> is per community, set by its moderators. <b className="font-semibold text-[var(--az-text)]">Suspended</b> is the whole platform, set here.</Note>
      </div>
      {open && <Person id={open} access={access} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

/** Kept for older imports; the v2 badge. */
export const StatusPill = StatusBadge;

function Person({ id, access, onClose, onChanged }) {
  const { me } = useStore();
  const withPassword = usePasswordGate();
  const [s, setS] = useState({ state: 'loading' });
  const [dialog, setDialog] = useState(null);
  const load = useCallback(() => api(`/admin/users/${encodeURIComponent(id)}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) })), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (msg) => { toast(msg); load(); onChanged(); };
  const act = async (path, body, msg) => { try { await api(`/admin/users/${encodeURIComponent(id)}/${path}`, { method: 'POST', body }); done(msg); } catch (e) { if (e.code !== 'CANCELLED') toast(errorText(e), 'error'); } };
  const u = s.d?.user;
  const self = u?.id === me?.id;
  const canRoles = access.can('roles.assign.critical') || access.can('users.manage');
  return (
    <Modal title={u?.name ?? 'Person'} onClose={onClose} wide>
      {s.state === 'loading' ? <Loading label="Loading person" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 break-words"><span className="t-small block">{u.email} · joined {dateText(u.createdAt)} · {u.emailConfirmed ? 'email confirmed' : 'email not confirmed'}</span>
              {u.statusReason && <span className="t-small block">Reason on record: “{u.statusReason}”</span>}</span>
            <StatusBadge status={u.status} />
          </div>
          <section aria-labelledby="pc-h">
            <h3 id="pc-h" className="t-label mb-1">Communities</h3>
            {s.d.communities.length ? (
              <ul className="list-rows">
                {s.d.communities.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`${communityPath(c)}${c.visibility === 'public' ? '' : '?admin=1'}`} className="link">{c.name}</Link>
                    <span className="text-2">{c.state === 'restricted' ? `Restricted${c.restriction?.until ? ` until ${dateText(c.restriction.until)}` : ''}${c.restriction?.by ? ` · by ${c.restriction.by}` : ''}`
                      : c.state === 'pending' ? 'Asked to join' : c.role.replace('_', ' ').replace(/^\w/, (x) => x.toUpperCase())}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-2 text-sm">Not in any community.</p>}
          </section>
          <section aria-labelledby="ps-h" className="grid gap-2 sm:grid-cols-2">
            <h3 id="ps-h" className="sr-only">Sign-in and reports</h3>
            <p className="sunken p-3 text-sm"><span className="t-small block">Active sessions</span>{s.d.sessions.active}{s.d.sessions.last ? ` · last ${ago(s.d.sessions.last)}` : ''}</p>
            <p className="sunken p-3 text-sm"><span className="t-small block">Reports about them</span>{s.d.reports.count ? `${s.d.reports.count} in ${s.d.reports.communities} ${s.d.reports.communities === 1 ? 'community' : 'communities'}` : 'None'}</p>
          </section>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" to={`/people/${u.id}`}>Profile</Link>
            {u.status === 'active' && access.can('users.suspend') && <Button onClick={async () => (await confirmAction(`Sign ${u.name} out on every device?`)) && act('sessions/revoke', {}, 'Signed out everywhere')}>Sign out everywhere</Button>}
            {!self && u.status === 'active' && canRoles && <Button onClick={() => setDialog('role')}>Platform role…</Button>}
            {u.status === 'pending_approval' && access.can('users.approve') && <Button variant="primary" onClick={() => act('approve', {}, 'Account approved')}>Approve</Button>}
            {!self && u.status === 'active' && access.can('users.suspend') && <Button variant="danger" onClick={() => setDialog('suspend')}>Suspend…</Button>}
            {u.status === 'suspended' && access.can('users.suspend') && <Button variant="primary" onClick={() => act('reactivate', {}, 'Account reactivated')}>Reactivate</Button>}
          </div>
          {dialog === 'suspend' && (
            <ReasonDialog title={`Suspend ${u.name}`} action="Suspend" danger reasonHint="Required; they get an email with it"
              intro="Signs them out everywhere now and stops them signing in. Their posts stay unless removed separately."
              onClose={() => setDialog(null)} onSubmit={async ({ reason }) => { await api(`/admin/users/${encodeURIComponent(id)}/suspend`, { method: 'POST', body: { reason } }); setDialog(null); done('Account suspended'); }} />
          )}
          {dialog === 'role' && <RoleDialog u={u} onClose={() => setDialog(null)} onSave={async (role, grant) => {
            await withPassword(() => api(`/admin/users/${encodeURIComponent(id)}/roles`, { method: 'POST', body: { role, grant } }));
            setDialog(null); done(grant ? 'Role granted' : 'Role removed');
          }} />}
        </div>
      )}
    </Modal>
  );
}

function RoleDialog({ u, onClose, onSave }) {
  const { can } = useStaffAccess();
  const isSuper = can('roles.assign.critical');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = async (role, grant) => {
    setBusy(true); setError('');
    try { await onSave(role, grant); } catch (e) { if (e.code !== 'CANCELLED') setError(errorText(e)); setBusy(false); }
  };
  const rows = ['super_admin', 'platform_admin'];
  return (
    <Modal title={`Platform role · ${u.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-2 text-sm">Only a Super Admin changes these, and enters their password again if it’s been more than 10 minutes.{isSuper ? '' : ' You can see them but not change them.'}</p>
        <ul className="list-rows">
          {rows.map((r) => {
            const has = u.roles.includes(r);
            return (
              <li key={r} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span><b className="block text-sm font-semibold">{ROLE_LABEL[r]}</b><span className="t-small">{has ? 'Has this role' : 'Doesn’t have this role'}</span></span>
                <Button size="sm" variant={has ? 'danger' : 'secondary'} disabled={busy || !isSuper} onClick={() => toggle(r, !has)}>{has ? 'Remove' : 'Grant'}</Button>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="field-error">{error}</p>}
      </div>
    </Modal>
  );
}
