// A community's Members tab (v2 E11, board V2EModules): a directory with search by name, job,
// company or city and a role filter, Owners and staff first. Admins see join requests at the top.
// Changing a role and transferring ownership live in Manage, Members; here staff get a Manage link
// beside people below their own role, and everyone else can Report. The server decides who may
// see the list (VIS-11) and the directory shows only what each person allows.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { managePath } from '../../lib/manage.js';
import ReportDialog from '../manage/Report.jsx';
import { Icon } from '../icons.jsx';
import { Button, IconButton, Skeleton } from '../ui/Controls.jsx';
import { RANK, roleOf } from './helpers.js';
import JoinRequests from '../members/JoinRequests.jsx';
import MemberCard, { personOf } from '../members/MemberCard.jsx';
import { useMembers } from '../members/useMembers.js';

const ROLES = [['', 'Everyone'], ['owner', 'Owner'], ['admin', 'Admins'], ['moderator', 'Moderators'], ['member', 'Members']];

export default function Members({ group, perms }) {
  const { user, me } = useStore();
  const list = useMembers(group.id, { enabled: !!perms.canView });
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [reporting, setReporting] = useState(null);

  if (!perms.canView) {
    return (
      <section className="panel flex flex-col items-start gap-2 p-6">
        <h3 className="t-h3">Members only</h3>
        <p className="text-2 text-sm">Only members of {group.name} can see who’s in it.</p>
      </section>
    );
  }

  const myRole = list.members.find((m) => m.id === me.id)?.role ?? roleOf(group, me.id);
  const isOwner = myRole === 'owner';
  const archived = group.status === 'archived';
  // Same rule as the server: you manage only people below your own role (the owner: everyone else).
  const canManage = (row) => perms.canModerate && !archived && row.id !== me.id && row.role !== 'owner'
    && (isOwner || (RANK[row.role] ?? 0) < (RANK[myRole] ?? 0));

  const needle = q.trim().toLowerCase();
  const rows = list.members.map((row) => ({ row, person: personOf(row, user(row.id)) }));
  const shown = rows.filter(({ row, person }) => (!roleFilter || row.role === roleFilter)
    && (!needle || [person.name, person.role, person.company, person.city].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  const total = list.status === 'ready' ? list.members.length : (group.memberCount ?? list.members.length);
  const filtered = !!(needle || roleFilter);
  const clear = () => { setQ(''); setRoleFilter(''); };

  const actionFor = (row, person) => {
    if (row.id === me.id) return <span className="t-small">You</span>;
    if (canManage(row)) return <Link to={managePath(group, 'members')} className="btn btn-secondary btn-sm" aria-label={`Manage ${person.name}`}>Manage</Link>;
    return <IconButton icon="flag" size="sm" label={`Report ${person.name}`} onClick={() => setReporting(row.id)} />;
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {perms.canAdmin && <JoinRequests group={group} />}

      <section aria-labelledby="mem-h" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="mem-h" className="t-h3">
            {total} {total === 1 ? 'member' : 'members'}
            {filtered && list.status === 'ready' && <span className="text-3 font-normal"> · {shown.length} shown</span>}
          </h3>
          {perms.canModerate && <Link to={managePath(group, 'members')} className="link text-sm">Manage members</Link>}
        </div>
        <label className="relative block min-w-0">
          <span className="sr-only">Search members</span>
          <span aria-hidden="true" className="text-3 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><Icon name="search" size={16} /></span>
          <input className="input pl-9" type="search" placeholder="Search by name, job, company or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div role="group" aria-label="Role" className="flex flex-wrap gap-2">
          {ROLES.map(([id, label]) => (
            <button key={id || 'all'} type="button" className="filter-chip" aria-pressed={roleFilter === id} onClick={() => setRoleFilter(id)}>{label}</button>
          ))}
        </div>

        {list.status === 'loading' && (
          <ul aria-busy="true" aria-label="Loading members" className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-3">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="panel flex items-center gap-3 px-4 py-3.5">
                <span className="skeleton h-11 w-11 shrink-0 rounded-full" />
                <Skeleton lines={2} label="Loading" className="flex-1" />
              </li>
            ))}
          </ul>
        )}
        {list.status === 'error' && (
          <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
            <span><strong>Couldn’t load the members.</strong> {list.message}</span>
            <Button size="sm" onClick={list.reload}>Try again</Button>
          </div>
        )}
        {(list.status === 'ready' || list.status === 'refreshing') && (shown.length === 0 ? (
          <div className="sunken flex flex-col items-start gap-2 p-5">
            <p className="font-semibold">{filtered ? 'Nobody matches' : 'No members yet'}</p>
            <p className="text-2 text-sm">{filtered ? 'Try another name, job, company or city, or another role.' : `When people join ${group.name}, they’re listed here.`}</p>
            {filtered && <Button size="sm" onClick={clear}>Clear filters</Button>}
          </div>
        ) : (
          <ul aria-busy={list.status === 'refreshing' || undefined} className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-3">
            {shown.map(({ row, person }) => (
              <MemberCard key={row.id} row={row} person={person} action={actionFor(row, person)}
                note={perms.canModerate && row.state === 'restricted' ? 'Restricted' : null} />
            ))}
          </ul>
        ))}
        <p className="t-small">Each person shows only what their profile settings allow.</p>
      </section>

      {reporting && <ReportDialog targetType="member" targetId={reporting} communityId={group.id} communityName={group.name} onClose={() => setReporting(null)} />}
    </div>
  );
}
