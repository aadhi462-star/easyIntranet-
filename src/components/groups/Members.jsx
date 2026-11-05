import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar, UserLink } from '../ui.jsx';
import { roleOf } from './helpers.js';

const ROLE_CHIP = { admin: '!bg-leaf-500/20 !text-leaf-200', moderator: '!bg-brand-500/15 !text-brand-200', member: '' };

export default function Members({ group, isAdmin }) {
  const { state, dispatch, user, me } = useStore();
  const [q, setQ] = useState('');
  const patch = (fn) => dispatch({ type: 'update', col: 'groups', id: group.id, patch: fn });

  // A group must keep at least one admin.
  const isLastAdmin = (id) => group.admins.includes(id) && group.admins.length === 1;
  const setRole = (id, role) => role !== 'admin' && isLastAdmin(id) ? null : patch((g) => ({
    ...g,
    admins: role === 'admin' ? [...new Set([...g.admins, id])] : g.admins.filter((x) => x !== id),
    moderators: role === 'moderator' ? [...new Set([...(g.moderators || []), id])] : (g.moderators || []).filter((x) => x !== id),
  }));
  const remove = (id) => {
    if (isLastAdmin(id)) return;
    if (!confirm(`Remove ${user(id)?.name} from ${group.name}?`)) return;
    // Record the opt-out so a dynamic-membership rule doesn't re-add them.
    patch((g) => ({ ...g, members: g.members.filter((x) => x !== id), admins: g.admins.filter((x) => x !== id), moderators: (g.moderators || []).filter((x) => x !== id),
      optedOut: [...new Set([...(g.optedOut || []), id])] }));
    // Drop them from linked channels too (members and admins). A channel left empty is
    // deleted; one whose admin list empties promotes the first remaining member.
    for (const c of state.channels.filter((c) => c.groupId === group.id && (c.members.includes(id) || (c.admins || []).includes(id)))) {
      const rest = c.members.filter((m) => m !== id);
      if (!rest.length) { dispatch({ type: 'channel/delete', id: c.id, silent: true }); continue; }
      dispatch({ type: 'update', col: 'channels', id: c.id, silent: true, patch: (x) => {
        const members = x.members.filter((m) => m !== id);
        if (!x.admins) return { ...x, members };
        const admins = x.admins.filter((m) => m !== id);
        return { ...x, members, admins: admins.length ? admins : members.slice(0, 1) };
      } });
    }
  };
  const decide = (id, approve) => {
    // group/addMembers also clears the request and opt-out and syncs linked channels.
    if (approve) dispatch({ type: 'group/addMembers', id: group.id, userIds: [id] });
    else patch((g) => ({ ...g, joinRequests: (g.joinRequests || []).filter((x) => x !== id) }));
    dispatch({ type: 'notify', silent: true, notification: { userId: id, kind: 'group', link: `/groups/${group.id}`,
      text: approve ? `Your request to join ${group.name} was approved` : `Your request to join ${group.name} was declined` } });
  };

  const members = group.members.map(user).filter((u) => u && u.name.toLowerCase().includes(q.toLowerCase()));
  const requests = (group.joinRequests || []).map(user).filter(Boolean);
  const order = { admin: 0, moderator: 1, member: 2 };
  members.sort((a, b) => order[roleOf(group, a.id)] - order[roleOf(group, b.id)] || a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      {isAdmin && requests.length > 0 && (
        <section className="glass p-5" aria-label="Join requests">
          <h3 className="mb-3 font-bold">Join requests <span className="chip ml-1">{requests.length}</span></h3>
          <ul className="space-y-2">
            {requests.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3">
                <Avatar user={u} size={36} />
                <div className="flex-1 text-sm"><UserLink id={u.id} /><div className="text-xs text-slate-400">{u.batch} · {u.dept} · {u.city}</div></div>
                <button className="btn btn-primary" onClick={() => decide(u.id, true)}>Approve</button>
                <button className="btn btn-ghost" onClick={() => decide(u.id, false)}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="glass p-5" aria-label="Members">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">{group.members.length} members</h3>
          <input className="input !w-56 !py-2" type="search" placeholder="Filter members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter members" />
        </div>
        <ul className="divide-y divide-white/5">
          {members.map((u) => {
            const role = roleOf(group, u.id);
            const lastAdmin = isLastAdmin(u.id);
            const why = 'This is the only admin. Make someone else an admin first.';
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar user={u} size={36} />
                <div className="min-w-0 flex-1 text-sm"><UserLink id={u.id} /><div className="truncate text-xs text-slate-400">{u.role}{u.company ? ` · ${u.company}` : ''}</div></div>
                <span className={`chip capitalize ${ROLE_CHIP[role]}`}>{role}</span>
                {isAdmin && u.id !== me.id && (
                  <>
                    <select className="input !w-36 !py-1.5 text-xs" value={role} onChange={(e) => setRole(u.id, e.target.value)} aria-label={`Role for ${u.name}`}
                      disabled={lastAdmin} title={lastAdmin ? why : undefined}>
                      <option value="admin">Admin</option><option value="moderator">Moderator</option><option value="member">Member</option>
                    </select>
                    <button className="btn btn-ghost h-9 !px-3 text-xs text-rose-300" onClick={() => remove(u.id)} disabled={lastAdmin} title={lastAdmin ? why : undefined}>Remove</button>
                    {lastAdmin && <span className="w-full text-right text-xs text-slate-400">{why}</span>}
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
