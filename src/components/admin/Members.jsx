import { useState } from 'react';
import { Link } from 'react-router-dom';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { Avatar, Field, Modal } from '../ui.jsx';

const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
export const inviteLink = (c) => `${location.origin}${location.pathname}#/invite/${c}`;

export default function Members() {
  const { state, me, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [inviting, setInviting] = useState(false);
  const roles = state.roles || [];
  const users = state.users
    .filter((u) => filter === 'all' || (filter === 'admins' && u.admin) || (filter === 'external' && u.external) || (filter === 'deactivated' && (u.deactivated || u.status === 'deactivated')) || (filter === 'pending' && u.status === 'pending'))
    .filter((u) => !q || `${u.name} ${u.email} ${u.city} ${u.batch}`.toLowerCase().includes(q.toLowerCase()));
  const upd = (id, patch) => dispatch({ type: 'update', col: 'users', id, patch, meta: patch });
  const invites = state.invites || [];
  const pending = state.users.filter((u) => u.status === 'pending');
  const isOff = (u) => u.deactivated || u.status === 'deactivated';
  // The admin "waiting for approval" note is done once the request is handled either way.
  // Removed rather than marked read: it's a broadcast (per-admin readBy), so `read` alone left
  // other admins with a stale unread badge.
  const clearApprovalNotes = (u) => dispatch({ type: 'set', key: 'notifications', silent: true, value: (list = []) => list.filter((n) => !(
    n.adminOnly && (n.ref ? n.ref === u.id : !!u.name && n.text?.includes(u.name) && /approval/i.test(n.text)))) });
  // Keep the External flag and the External user role in step.
  const setExternal = (u, on) => upd(u.id, { external: on, roleId: on ? 'external' : (u.roleId === 'external' || !u.roleId ? 'member' : u.roleId) });
  const setRole = (u, roleId) => upd(u.id, { roleId, external: roleId === 'external' ? true : u.roleId === 'external' ? false : !!u.external });
  const setActive = (u, on) => upd(u.id, { deactivated: !on, status: on ? 'active' : 'deactivated' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" type="search" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        <select className="input !w-44" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter members">
          <option value="all">All members</option><option value="admins">Admins</option><option value="external">External users</option><option value="pending">Pending approval</option><option value="deactivated">Deactivated</option>
        </select>
        <button className="btn btn-primary ml-auto" onClick={() => setInviting(true)}>+ Invite people</button>
      </div>
      <Registration />
      {pending.length > 0 && (
        <section className="glass p-5" aria-label="Pending members">
          <h3 className="mb-3 font-bold">Pending members · {pending.length}</h3>
          <ul className="divide-y divide-white/5 text-sm">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
                <Avatar user={u} size={32} />
                <span className="min-w-48 flex-1"><span className="block font-semibold text-white">{u.name}</span>
                  <span className="text-xs text-slate-400">{u.email}{u.batch ? ` · Class of ${u.batch}` : ''}{u.joinedAt ? ` · signed up ${timeAgo(u.joinedAt)}` : ''}</span></span>
                <button className="btn btn-primary h-10 text-xs" onClick={() => {
                  dispatch({ type: 'member/approve', id: u.id });
                  clearApprovalNotes(u);
                  dispatch({ type: 'notify', silent: true, notification: { userId: u.id, kind: 'info', link: '/feed', text: `Welcome! Your CommunityOne account was approved.` } });
                }}>Approve</button>
                <button className="btn btn-ghost h-10 text-xs" onClick={() => { if (!confirm(`Decline ${u.name}’s request? Their account will be removed.`)) return; clearApprovalNotes(u); dispatch({ type: 'remove', col: 'users', id: u.id }); }}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="p-3">Member</th><th className="p-3">Batch</th><th className="p-3">Role</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => (
              <tr key={u.id} className={isOff(u) ? 'opacity-50' : ''}>
                <td className="p-3"><Link to={`/people/${u.id}`} className="flex items-center gap-2"><Avatar user={u} size={32} /><span><span className="block font-semibold text-white">{u.name}{u.admin && <span className="chip ml-2">Admin</span>}</span><span className="text-xs text-slate-400">{u.email}</span></span></Link></td>
                <td className="p-3 text-slate-300">{u.batch ?? '—'}</td>
                <td className="p-3">
                  <select className="input !w-40 !py-1.5" value={u.roleId || 'member'} onChange={(e) => setRole(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={!!u.external} onChange={(e) => setExternal(u, e.target.checked)} />External</label>
                </td>
                <td className="p-3 text-xs">{isOff(u) ? <span className="text-rose-300">Deactivated</span> : u.status === 'pending' ? <span className="text-amber-200">Pending</span> : <span className="text-emerald-300">Active</span>}</td>
                <td className="whitespace-nowrap p-3 text-right">
                  {u.id !== me.id && <>
                    <button className="btn btn-ghost h-9 text-xs" onClick={() => upd(u.id, { admin: !u.admin })}>{u.admin ? 'Remove admin' : 'Make admin'}</button>
                    <button className="btn btn-ghost ml-1 h-9 text-xs" onClick={() => (isOff(u) || confirm(`Deactivate ${u.name}? They won’t be able to sign in.`)) && setActive(u, isOff(u))}>
                      {isOff(u) ? 'Reactivate' : 'Deactivate'}
                    </button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="glass p-5">
        <h3 className="font-bold">Invitations (optional) · {invites.filter((i) => i.status === 'pending').length} pending</h3>
        <p className="mb-3 text-xs text-slate-500">Anyone can sign up while registration is open. Invitations are a quick way to bring specific people in with their batch pre-filled.</p>
        {invites.length === 0 ? <p className="text-sm text-slate-400">No invitations sent yet.</p> : (
          <ul className="divide-y divide-white/5 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-48 flex-1"><span className="font-medium text-white">{i.email}</span>{i.external && <span className="chip ml-2">External</span>}
                  <span className="block text-xs text-slate-500">Code {i.code} · {timeAgo(i.createdAt)} · {i.status}</span></span>
                <button className="btn btn-ghost h-9 text-xs" onClick={() => navigator.clipboard?.writeText(inviteLink(i.code))}>Copy link</button>
                {i.status === 'pending' && <button className="btn btn-ghost h-9 text-xs" onClick={() => dispatch({ type: 'update', col: 'invites', id: i.id, patch: { status: 'revoked' } })}>Revoke</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteModal({ onClose }) {
  const { state, me, dispatch } = useStore();
  const [mode, setMode] = useState('email');
  const [email, setEmail] = useState('');
  const [batch, setBatch] = useState('');
  const [external, setExternal] = useState(false);
  const [csv, setCsv] = useState('email,batch\n');
  const [created, setCreated] = useState([]);
  const allowExternal = state.policies?.allowExternalUsers !== false;

  const make = (rows) => {
    const existing = new Set([...state.users.map((u) => (u.email || '').toLowerCase()), ...(state.invites || []).filter((i) => i.status === 'pending').map((i) => (i.email || '').toLowerCase())]);
    const out = [];
    for (const r of rows) {
      const e = r.email?.trim().toLowerCase();
      if (!e || !/^\S+@\S+\.\S+$/.test(e) || existing.has(e)) continue;
      existing.add(e);
      const item = { code: code(), email: e, batch: r.batch ? Number(r.batch) : null, external: !!r.external && allowExternal, invitedBy: me.id, status: 'pending', expiresAt: Date.now() + 30 * 864e5 };
      dispatch({ type: 'add', col: 'invites', item });
      out.push(item);
    }
    setCreated(out);
  };

  const parseCsv = () => {
    const [head, ...lines] = csv.trim().split(/\r?\n/);
    const cols = head.split(',').map((c) => c.trim().toLowerCase());
    return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()]))).map((r) => ({ ...r, external: /^(1|true|yes)$/i.test(r.external || '') }));
  };

  return (
    <Modal title="Invite people" onClose={onClose} wide>
      {created.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">{created.length} invitation{created.length === 1 ? '' : 's'} created. Share these links (demo: no email is sent).</p>
          <ul className="space-y-2 text-sm">{created.map((c) => (
            <li key={c.code} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2">
              <span className="flex-1 truncate"><b>{c.email}</b><span className="block truncate font-mono text-xs text-slate-400">{inviteLink(c.code)}</span></span>
              <button className="btn btn-ghost h-9 text-xs" onClick={() => navigator.clipboard?.writeText(inviteLink(c.code))}>Copy</button>
            </li>
          ))}</ul>
          <button className="btn btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">{[['email', 'By email'], ['csv', 'Bulk CSV']].map(([v, l]) => <button key={v} className={`btn h-10 ${mode === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(v)}>{l}</button>)}</div>
          {mode === 'email' ? (
            <>
              <Field label="Email addresses" hint="Separate several with commas"><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
              <Field label="Batch (optional)"><input className="input" type="number" value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>
              <label className={`flex min-h-11 items-center gap-2 text-sm ${allowExternal ? '' : 'opacity-50'}`}>
                <input type="checkbox" className="h-5 w-5 accent-brand-500" disabled={!allowExternal} checked={external} onChange={(e) => setExternal(e.target.checked)} />
                Invite as external user (restricted access){!allowExternal && ' — disabled by policy'}
              </label>
              <button className="btn btn-primary w-full" onClick={() => make(email.split(',').map((e) => ({ email: e, batch, external })))}>Create invitations</button>
            </>
          ) : (
            <>
              <Field label="Paste CSV" hint="Columns: email, batch, external (yes/no). Header row required."><textarea className="input min-h-40 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
              <button className="btn btn-primary w-full" onClick={() => make(parseCsv())}>Import and create invitations</button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Registration() {
  const { state, dispatch } = useStore();
  const reg = state.settings.registration || { open: true, requireApproval: false, guidelines: '', allowedDomains: [] };
  const [domains, setDomains] = useState((reg.allowedDomains || []).join(', '));
  const set = (patch) => dispatch({ type: 'set', key: 'settings', value: (s) => ({ ...s, registration: { ...reg, ...s.registration, ...patch } }) });
  return (
    <section className="glass space-y-4 p-5" aria-label="Registration">
      <h3 className="font-bold">Registration</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={reg.open !== false} onChange={(e) => set({ open: e.target.checked })} />
          Open sign-up — anyone can create an account</label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={!!reg.requireApproval} onChange={(e) => set({ requireApproval: e.target.checked })} />
          Require admin approval for new members</label>
      </div>
      <Field label="Allowed email domains (optional)" hint="Comma separated, e.g. alumni.example.edu. Leave empty to allow any email.">
        <input className="input" value={domains} onChange={(e) => setDomains(e.target.value)}
          onBlur={() => set({ allowedDomains: domains.split(',').map((d) => d.trim().replace(/^@/, '').toLowerCase()).filter(Boolean) })} />
      </Field>
      <Field label="Community guidelines" hint="Shown on the sign-up page; new members agree to them.">
        <textarea className="input min-h-28" value={reg.guidelines || ''} onChange={(e) => set({ guidelines: e.target.value })} />
      </Field>
    </section>
  );
}
