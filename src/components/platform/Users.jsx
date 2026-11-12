// Administration → Users (board S7Users; D3, D4, D6): search and filters, a person's panel with
// their communities, sessions and reports, Suspend / Reactivate, Sign out everywhere and
// platform roles. Restricted (per community) and Suspended (platform) are shown side by side.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { dateText, downloadCsv, ROLE_LABEL, STATUS_LABEL, usePasswordGate } from '../../lib/platform.js';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { Chips, Failed, Loading, ReasonDialog, Table } from './bits.jsx';

const PAGE = 25;
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const ago = (d) => (d ? timeAgo(Date.parse(d)) : 'Never');

export default function Users() {
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
    const withEmail = confirm('Include email addresses in the export? Choose Cancel to leave them out.');
    setExporting(true);
    try { await downloadCsv(`/admin/users.csv?${params}${withEmail ? '&email=1' : ''}`); toast('Export downloaded · recorded in the activity log'); } catch (e) { toast(errorText(e), 'error'); }
    setExporting(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-[1_1_260px]"><span className="sr-only">Search users</span>
          <input type="search" className="input" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="text-2 flex items-center gap-2 text-sm">Role
          <select className="input !w-48" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Any role</option><option value="super_admin">Super Admin</option><option value="platform_admin">Platform Admin</option><option value="none">No platform role</option>
          </select></label>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
      </div>
      <Chips label="Status" options={chips} value={status} onChange={setStatus} />
      {s.state === 'loading' ? <Loading label="Loading users" /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : (
        <>
          <p className="sr-only" role="status">{s.d.total} people</p>
          <div className="hidden md:block">
            <Table label="Users" head={['Person', 'Status', 'Platform role', 'Communities', 'Last active']} empty="Nobody matches."
              rows={s.d.users.map((u) => (
                <tr key={u.id} className="cursor-pointer border-b border-[var(--az-divider)] last:border-0 hover:bg-white/[.03]" onClick={() => setOpen(u.id)}>
                  <td className="px-4 py-3"><button className="flex items-center gap-3 text-left font-semibold text-white" onClick={(e) => { e.stopPropagation(); setOpen(u.id); }}>
                    <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[var(--az-band)] text-[11px] font-bold">{initials(u.name)}</span>{u.name}</button></td>
                  <td className="px-4 py-3"><StatusPill status={u.status} /></td>
                  <td className="text-2 px-4 py-3">{u.roles.length ? u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ') : '—'}</td>
                  <td className="text-2 px-4 py-3 tabular-nums">{u.communityCount}</td>
                  <td className="text-3 px-4 py-3">{ago(u.lastActive)}</td>
                </tr>
              ))} />
          </div>
          <ul className="list-rows md:hidden">
            {s.d.users.map((u) => (
              <li key={u.id}><button className="flex w-full items-center gap-3 py-3 text-left" onClick={() => setOpen(u.id)}>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{u.name}</span>
                  <span className="t-small">{[u.roles.map((r) => ROLE_LABEL[r]).join(', '), `${u.communityCount} communities`, ago(u.lastActive)].filter(Boolean).join(' · ')}</span></span>
                <StatusPill status={u.status} />
              </button></li>
            ))}
            {!s.d.users.length && <li className="text-3 py-3 text-sm">Nobody matches.</li>}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="t-small">{s.d.total ? `${page * PAGE + 1}–${Math.min(s.d.total, (page + 1) * PAGE)} of ${s.d.total}` : ''} · emails are shown in each person’s panel and left out of exports unless you choose them; every export is logged.</p>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <button className="btn btn-ghost" disabled={(page + 1) * PAGE >= s.d.total} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Note title="Platform roles">Only a Super Admin grants or removes Platform Admin, never for themselves, and enters their password again first. The last Super Admin can’t be removed.</Note>
        <Note title="Takes effect at once">Suspending someone or removing their role ends their sessions; the next request they make is refused, wherever they are.</Note>
        <Note title="Restricted vs suspended"><b className="text-white">Restricted</b> is per community, set by its moderators. <b className="text-white">Suspended</b> is the whole platform, set here.</Note>
      </div>
      {open && <Person id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function Note({ title, children }) {
  return <section className="band flex flex-col gap-2 p-4"><h3 className="t-h3 text-white">{title}</h3><p className="text-2 text-sm">{children}</p></section>;
}

export function StatusPill({ status }) {
  const bad = ['suspended', 'deleted'].includes(status);
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${bad ? 'bg-rose-500/15 text-rose-200' : status === 'active' ? 'text-2' : 'bg-amber-400/15 text-amber-200'}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function Person({ id, onClose, onChanged }) {
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
  return (
    <Modal title={u?.name ?? 'Person'} onClose={onClose} wide>
      {s.state === 'loading' ? <Loading label="Loading person" /> : s.state === 'error' ? <Failed message={s.message} /> : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1"><span className="t-small block">{u.email} · joined {dateText(u.createdAt)} · {u.emailConfirmed ? 'email confirmed' : 'email not confirmed'}</span>
              {u.statusReason && <span className="t-small block">Reason on record: “{u.statusReason}”</span>}</span>
            <StatusPill status={u.status} />
          </div>
          <section aria-labelledby="pc-h">
            <h3 id="pc-h" className="t-label mb-1">Communities</h3>
            {s.d.communities.length ? (
              <ul className="list-rows">
                {s.d.communities.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`${communityPath(c)}${c.visibility === 'public' ? '' : '?admin=1'}`} className="text-white hover:underline">{c.name}</Link>
                    <span className="text-3">{c.state === 'restricted' ? `Restricted${c.restriction?.until ? ` until ${dateText(c.restriction.until)}` : ''}${c.restriction?.by ? ` · by ${c.restriction.by}` : ''}`
                      : c.state === 'pending' ? 'Asked to join' : c.role.replace('_', ' ').replace(/^\w/, (x) => x.toUpperCase())}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-3 text-sm">Not in any community.</p>}
          </section>
          <section aria-labelledby="ps-h" className="grid gap-2 sm:grid-cols-2">
            <h3 id="ps-h" className="sr-only">Sign-in and reports</h3>
            <p className="band p-3 text-sm"><span className="t-small block">Active sessions</span>{s.d.sessions.active}{s.d.sessions.last ? ` · last ${ago(s.d.sessions.last)}` : ''}</p>
            <p className="band p-3 text-sm"><span className="t-small block">Reports about them</span>{s.d.reports.count ? `${s.d.reports.count} in ${s.d.reports.communities} ${s.d.reports.communities === 1 ? 'community' : 'communities'}` : 'None'}</p>
          </section>
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-ghost" to={`/people/${u.id}`}>Profile</Link>
            {u.status === 'active' && <button className="btn btn-ghost" onClick={() => confirm(`Sign ${u.name} out on every device?`) && act('sessions/revoke', {}, 'Signed out everywhere')}>Sign out everywhere</button>}
            {!self && u.status === 'active' && <button className="btn btn-ghost" onClick={() => setDialog('role')}>Platform role…</button>}
            {u.status === 'pending_approval' && <button className="btn btn-primary" onClick={() => act('approve', {}, 'Account approved')}>Approve</button>}
            {!self && u.status === 'active' && <button className="btn btn-ghost text-rose-300" onClick={() => setDialog('suspend')}>Suspend…</button>}
            {u.status === 'suspended' && <button className="btn btn-primary" onClick={() => act('reactivate', {}, 'Account reactivated')}>Reactivate</button>}
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
  const { me } = useStore();
  const isSuper = me?.platformRoles?.includes?.('super_admin') ?? me?.roles?.includes?.('super_admin');
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
        <p className="text-2 text-sm">Only a Super Admin changes these, and enters their password again if it’s been more than 10 minutes.{isSuper === false ? ' You can see them but not change them.' : ''}</p>
        {rows.map((r) => {
          const has = u.roles.includes(r);
          return (
            <Field key={r} label={ROLE_LABEL[r]}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-2 text-sm">{has ? 'Has this role' : 'Doesn’t have this role'}</span>
                <button className="btn btn-ghost" disabled={busy} onClick={() => toggle(r, !has)}>{has ? 'Remove' : 'Grant'}</button>
              </div>
            </Field>
          );
        })}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </div>
    </Modal>
  );
}
