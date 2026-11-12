// One person in a community's member directory (board V2EModules, Members): avatar, name, job and
// company, when they joined, their role, and one action. Each line shows only what the person's
// profile settings allow: the directory already leaves the rest out.
import { Link } from 'react-router-dom';
import { fmtDate } from '../../lib/store.jsx';
import { Avatar } from '../ui.jsx';
import { Badge } from '../ui/Controls.jsx';

const ROLE_BADGE = {
  owner: { label: 'Owner', className: 'bg-[var(--az-surface)] text-[var(--az-text)] shadow-[inset_0_0_0_1px_var(--az-control)]', icon: 'star' },
  admin: { label: 'Admin', tone: 'ok' },
  moderator: { label: 'Moderator', tone: 'info' },
  member: { label: 'Member', tone: 'neutral' },
};

export function RoleBadge({ role }) {
  const b = ROLE_BADGE[role] ?? ROLE_BADGE.member;
  return <Badge tone={b.tone} icon={b.icon} className={b.className ?? ''}>{b.label}</Badge>;
}

/** A stand-in for someone the local directory doesn't have yet (or who hides their profile). */
export const personOf = (row, profile) => profile ?? { id: row.id, name: row.name || 'Member', hue: 160 };

export const joinedText = (iso) => (iso ? `Joined ${fmtDate(Date.parse(iso), { month: 'short', year: 'numeric' })}` : null);

export function NameLink({ id, name }) {
  return <Link to={`/people/${encodeURIComponent(id)}`} className="block truncate font-semibold text-[var(--az-text)] hit hover:underline">{name}</Link>;
}

export default function MemberCard({ row, person, action, note }) {
  const work = [person.role, person.company].filter(Boolean).join(' · ');
  const joined = joinedText(row.joined_at);
  return (
    <li className="panel flex min-w-0 flex-wrap items-center gap-3 px-4 py-3.5">
      <Avatar user={person} size={44} />
      <span className="flex min-w-0 flex-[1_1_160px] flex-col">
        <NameLink id={row.id} name={person.name} />
        {work && <span className="t-small truncate">{work}</span>}
        {joined && <span className="t-small">{joined}</span>}
        {note && <span className="t-small">{note}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <RoleBadge role={row.role} />
        {action}
      </span>
    </li>
  );
}
