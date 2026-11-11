import { useState } from 'react';
import { fmtDate, useStore } from '../../lib/store.jsx';
import { Avatar, UserLink } from '../ui.jsx';
import { RANK, roleOf } from './helpers.js';
import { communityApi } from '../../lib/communities.js';
import { useChannelSync, useCommunityWrite } from './useCommunity.js';

const ROLE_CHIP = { owner: '!bg-amber-500/20 !text-amber-200', admin: '!bg-leaf-500/20 !text-leaf-200', moderator: '!bg-brand-500/15 !text-brand-200', member: '' };

/** Members, join requests and (for the owner) ownership transfer. All changes go to the server. */
export default function Members({ group, perms }) {
  const { dispatch, user, me } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  const [roleFilter, setRoleFilter] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const [heir, setHeir] = useState('');
  const myRole = roleOf(group, me.id);
  const isOwner = myRole === 'owner';
  const archived = group.status === 'archived';
  // Same rule as the server: you manage only people below your own role (the owner: everyone else).
  const canManage = (id) => perms.canModerate && id !== me.id && roleOf(group, id) !== 'owner'
    && (isOwner || (RANK[roleOf(group, id)] ?? 0) < (RANK[myRole] ?? 0));

  const act = async (key, fn, opts) => {
    setBusy(key);
    try { return await run(group.id, fn, opts); } finally { setBusy(null); }
  };
  const setRole = (id, role) => act(`role-${id}`, () => communityApi.setMember(group.id, id, { role }), { ok: `${user(id)?.name ?? 'Member'} is now ${role === 'admin' ? 'an admin' : `a ${role}`}` });
  const restrict = (id) => {
    if (!confirm(`Restrict ${user(id)?.name}? They stay in ${group.name} and can read it, but can’t post or comment.`)) return;
    act(`restrict-${id}`, () => communityApi.setMember(group.id, id, { state: 'restricted' }), { ok: 'Member restricted' });
  };
  const remove = async (id) => {
    if (!confirm(`Remove ${user(id)?.name} from ${group.name}?`)) return;
    if (await act(`remove-${id}`, () => communityApi.setMember(group.id, id, { state: 'removed' }), { ok: 'Member removed' })) channels.drop(group.id, id);
  };
  const decide = async (id, approve) => {
    if (!await act(`req-${id}`, () => communityApi.decide(group.id, id, approve), { ok: approve ? 'Request approved' : 'Request declined' })) return;
    if (approve) channels.add(group.id, [id]);
    dispatch({ type: 'notify', silent: true, notification: { userId: id, kind: 'group', link: `/groups/${group.id}`,
      text: approve ? `Your request to join ${group.name} was approved` : `Your request to join ${group.name} was declined` } });
  };
  const transfer = async () => {
    if (!heir || !confirm(`Make ${user(heir)?.name} the owner of ${group.name}? You’ll stay on as an admin.`)) return;
    if (await act('transfer', () => communityApi.transfer(group.id, heir), { ok: `${user(heir)?.name} now owns ${group.name}` })) setHeir('');
  };

  // Search by name, job, company or city; filter by role (Stage 4, board S4Members).
  const needle = q.trim().toLowerCase();
  const members = group.members.map(user).filter((u) => u
    && (!needle || [u.name, u.role, u.company, u.city].filter(Boolean).join(' ').toLowerCase().includes(needle))
    && (!roleFilter || roleOf(group, u.id) === roleFilter));
  const requests = (group.joinRequests || []).map(user).filter(Boolean);
  const order = { owner: 0, admin: 1, moderator: 2, member: 3 };
  members.sort((a, b) => order[roleOf(group, a.id)] - order[roleOf(group, b.id)] || a.name.localeCompare(b.name));
  const heirs = group.members.filter((id) => id !== me.id).map(user).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      {perms.canAdmin && requests.length > 0 && (
        <section className="glass p-5" aria-label="Join requests">
          <h3 className="mb-3 font-bold">Join requests <span className="chip ml-1">{requests.length}</span></h3>
          <ul className="space-y-2">
            {requests.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3">
                <Avatar user={u} size={36} />
                <div className="flex-1 text-sm"><UserLink id={u.id} /><div className="text-xs text-slate-400">{[u.batch, u.dept, u.city].filter(Boolean).join(' · ')}</div>
                  {group.requestNotes?.[u.id] && <p className="mt-1 text-xs text-slate-300">“{group.requestNotes[u.id]}”</p>}</div>
                <button className="btn btn-primary" disabled={!!busy} onClick={() => decide(u.id, true)}>Approve</button>
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => decide(u.id, false)}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isOwner && heirs.length > 0 && (
        <section className="glass flex flex-wrap items-end gap-3 p-5" aria-label="Transfer ownership">
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-slate-300">Transfer ownership</span>
            <select className="input" value={heir} onChange={(e) => setHeir(e.target.value)}>
              <option value="">Choose a member</option>
              {heirs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">The owner can’t leave. Hand the community to another member first; you’ll stay an admin.</span>
          </label>
          <button className="btn btn-ghost" disabled={!heir || !!busy} onClick={transfer}>Transfer</button>
        </section>
      )}
      <section className="glass p-5" aria-label="Members">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="t-h3 text-white">{group.memberCount ?? group.members.length} members{(needle || roleFilter) ? <span className="text-3 font-normal"> · {members.length} shown</span> : null}</h3>
          <div className="flex flex-wrap gap-2">
            <input className="input !w-64" type="search" placeholder="Search by name, company or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
            <select className="input !w-36" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role">
              <option value="">Everyone</option><option value="owner">Owner</option><option value="admin">Admins</option><option value="moderator">Moderators</option><option value="member">Members</option>
            </select>
          </div>
        </div>
        <ul className="divide-y divide-white/5">
          {members.map((u) => {
            const role = roleOf(group, u.id);
            const manage = canManage(u.id) && !archived;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1 text-sm"><UserLink id={u.id} /><div className="text-3 truncate text-xs">{u.role}{u.company ? ` · ${u.company}` : ''}</div></div>
                {group.joinedAt?.[u.id] && <span className="text-3 hidden text-xs sm:inline">Joined {fmtDate(Date.parse(group.joinedAt[u.id]), { month: 'short', year: 'numeric' })}</span>}
                <span className={`chip capitalize ${ROLE_CHIP[role] ?? ''}`}>{role}</span>
                {manage && (
                  <>
                    {perms.canAdmin && (
                      <select className="input !w-36 !py-1.5 text-xs" value={role} onChange={(e) => setRole(u.id, e.target.value)} aria-label={`Role for ${u.name}`} disabled={!!busy}>
                        {/* Only the owner can make admins (nobody grants a role equal to their own). */}
                        {(isOwner || role === 'admin') && <option value="admin">Admin</option>}
                        <option value="moderator">Moderator</option><option value="member">Member</option>
                      </select>
                    )}
                    <button className="btn btn-ghost h-9 !px-3 text-xs" onClick={() => restrict(u.id)} disabled={!!busy}>Restrict</button>
                    <button className="btn btn-ghost h-9 !px-3 text-xs text-rose-300" onClick={() => remove(u.id)} disabled={!!busy}>Remove</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
