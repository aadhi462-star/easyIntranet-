// A community's Members tab (v2 E11, board V2EModules): a directory with search by name, job,
// company or city and a role filter, Owners and staff first. Admins see join requests at the top.
// Changing a role and transferring ownership live in Manage, Members; here staff get a Manage link
// beside people below their own role, and everyone else can Report. The server decides who may
// see the list (VIS-11) and the directory shows only what each person allows. Communities in
// the Alumni category also filter by graduation year and department (v2 F, from workstream A),
// with the options taken from what the members' profiles show.
import { useRef, useState } from 'react';
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

/** A member's graduation year and department, from the list row or, failing that, their profile. */
const yearOf = (row, person) => String(row.gradYear ?? row.batch ?? person?.batch ?? '') || null;
const deptOf = (row, person) => {
  const d = row.department ?? person?.dept ?? null;
  if (!d) return null;
  return typeof d === 'object' ? { value: String(d.id ?? d.name), label: d.name ?? String(d.id) } : { value: d, label: d };
};

const ROLES = [['', 'Everyone'], ['owner', 'Owner'], ['admin', 'Admins'], ['moderator', 'Moderators'], ['member', 'Members']];

export default function Members({ group, perms }) {
  const { user, me } = useStore();
  const alumni = group.type === 'Alumni';
  const [year, setYear] = useState('');
  const [dept, setDept] = useState('');
  const list = useMembers(group.id, { enabled: !!perms.canView, filters: alumni ? { gradYear: year, department: dept } : {} });
  const options = useRef({ years: [], depts: [] });
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
  // The filter options come from the whole list (the last load without a year or department).
  if (alumni && list.status === 'ready' && !year && !dept) {
    const depts = new Map();
    rows.forEach(({ row, person }) => { const d = deptOf(row, person); if (d) depts.set(d.value, d.label); });
    options.current = {
      years: [...new Set(rows.map(({ row, person }) => yearOf(row, person)).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
      depts: [...depts].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }
  const shown = rows.filter(({ row, person }) => (!roleFilter || row.role === roleFilter)
    && (!year || yearOf(row, person) === year) && (!dept || deptOf(row, person)?.value === dept)
    && (!needle || [person.name, person.role, person.company, person.city].filter(Boolean).join(' ').toLowerCase().includes(needle)));
  const total = !year && !dept && list.status === 'ready' ? list.members.length : (group.memberCount ?? list.members.length);
  const filtered = !!(needle || roleFilter || year || dept);
  const clear = () => { setQ(''); setRoleFilter(''); setYear(''); setDept(''); };

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
          <span aria-hidden="true" className="text-3 pointer-events-none absolute inset-y-0 left-3 flex items-center"><Icon name="search" size={16} /></span>
          <input className="input pl-9" type="search" placeholder="Search by name, job, company or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {alumni && (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-semibold text-[var(--az-text)]">Graduation year</span>
              <select className="input" value={year} onChange={(e) => setYear(e.target.value)} aria-describedby="mem-filter-hint">
                <option value="">Any year</option>
                {options.current.years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-semibold text-[var(--az-text)]">Department</span>
              <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} aria-describedby="mem-filter-hint">
                <option value="">Any department</option>
                {options.current.depts.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            <p id="mem-filter-hint" className="t-small sm:col-span-2">Only people whose profile shows their year or department are matched.</p>
          </div>
        )}
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
            <p className="text-2 text-sm">{filtered ? `Try another name, job, company or city, or another role${alumni ? ', year or department' : ''}.` : `When people join ${group.name}, they’re listed here.`}</p>
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
