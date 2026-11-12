// Settings, Roles and permissions (G3, board V2GSettings): six fixed roles shown as a read-only
// matrix, the four switches that adjust them (each kept in its own section), who holds each role,
// and the optional roles this community uses. People are given roles from Members.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { managePath } from '../../lib/manage.js';
import { Icon } from '../icons.jsx';
import { Group, InfoRow, SectionForm, useMemberList, useSectionDraft } from './shared.jsx';
import { CheckRow } from '../events/FormField.jsx';

const ROLES = ['Member', 'TA', 'Instructor', 'Moderator', 'Admin', 'Owner'];
const Y = 'Yes'; const N = 'No'; const C = 'Their course';
const MATRIX = [
  ['Post, reply, RSVP, enrol', [`${Y}*`, Y, Y, Y, Y, Y]],
  ['Grade and see learners', [N, C, C, N, Y, Y]],
  ['Build and publish a course', [N, N, C, N, Y, Y]],
  ['Review reports, warn, restrict', [N, N, N, Y, Y, Y]],
  ['Restrict, remove or block members below them', [N, N, N, Y, Y, Y]],
  ['Approve join requests and give roles below theirs', [N, N, N, N, Y, Y]],
  ['Settings and analytics', [N, N, N, N, Y, Y]],
  ['Transfer, request deletion', [N, N, N, N, N, Y]],
];
const OPTIONAL = [['moderator', 'Moderator', 'Reviews reports and held posts in the Queue.'], ['instructor', 'Instructor', 'Builds and teaches the courses they’re added to.'], ['teaching_assistant', 'Teaching Assistant', 'Grades and sees learners in their course; doesn’t edit it.']];

function Cell({ v }) {
  const yes = v.startsWith(Y);
  return (
    <td className="px-3 py-2.5 text-sm">
      <span className={`inline-flex items-center gap-1 whitespace-nowrap ${yes ? 'font-semibold text-[var(--az-text)]' : 'text-[var(--az-text-2)]'}`}>
        {yes && <Icon name="check" size={16} className="text-[var(--az-ok)]" />}{v.replace('*', '')}{v.endsWith('*') && <sup aria-label="see note 1">1</sup>}
      </span>
    </td>
  );
}

export default function Roles({ g, src }) {
  const s = src.settings;
  const base = useMemo(() => ({ roles: Array.isArray(s.roles) ? s.roles : OPTIONAL.map(([k]) => k) }), [s.roles]);
  const d = useSectionDraft(src, base);
  const members = useMemberList(g);
  const count = (role) => members.list.filter((m) => m.role === role && ['active', 'restricted'].includes(m.state ?? 'active')).length;
  const owner = members.list.find((m) => m.role === 'owner');
  const toggle = (k, on) => d.set('roles', OPTIONAL.map(([x]) => x).filter((x) => (x === k ? on : d.value.roles.includes(x))));
  const save = () => d.submit({ settings: { roles: d.value.roles } });
  const sw = [
    ['Who can start discussions', s.whoCanPost === 'admins' || s.announceOnly ? 'Only Owners and Admins' : 'Members', 'content'],
    ['New posts wait for approval', s.requireApproval ? 'On' : 'Off', 'content'],
    ['Who can create events', s.whoCanCreateEvents === 'admins' ? 'Only Owners and Admins' : 'Members', 'events-resources'],
    ['Members can add resources', s.membersAddResources ? 'Yes' : 'No', 'events-resources'],
  ];
  return (
    <SectionForm title="Roles and permissions" draft={d} onSave={save} summary={d.dirty ? 'You changed the roles in use.' : ''}
      lede="Six roles with fixed permissions. Roles are given from Members; the switches that adjust them live in their own sections.">
      <Group title="What each community role can do">
        <div className="-mx-5 overflow-x-auto px-5" role="region" aria-label="Role permissions" tabIndex={0}>
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">What each community role can do</caption>
            <thead>
              <tr className="border-b border-[var(--az-divider)]">
                <th scope="col" className="t-label px-3 py-2">Can</th>
                {ROLES.map((r) => <th key={r} scope="col" className="t-label px-3 py-2">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([what, cells]) => (
                <tr key={what} className="border-b border-[var(--az-divider)] last:border-b-0">
                  <th scope="row" className="px-3 py-2.5 text-sm font-medium text-[var(--az-text)]">{what}</th>
                  {cells.map((v, i) => <Cell key={ROLES[i]} v={v} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small">1 Unless Discussions and content says only Owners and Admins post, or Events and resources limits events.</p>
      </Group>

      <Group title="Switches that adjust them" hint="Each is changed in its own section.">
        <div>
          {sw.map(([title, value, to]) => <InfoRow key={title} title={title} to={managePath(g, 'settings', to)} action="Change">{value}</InfoRow>)}
        </div>
      </Group>

      <Group title="Who holds each role" aside={<Link to={managePath(g, 'members')} className="link text-sm font-semibold">Manage in Members</Link>}>
        {members.status === 'loading' ? <div className="skeleton h-16" aria-label="Loading the members" />
          : members.status === 'error' ? <p role="alert" className="notice notice-bad">{members.message}</p> : (
            <ul className="flex flex-wrap gap-2 text-sm">
              <li className="badge badge-neutral">Owner · {owner?.name ?? 'None'}</li>
              <li className="badge badge-neutral">Admins · {count('admin')}</li>
              <li className="badge badge-neutral">Moderators · {count('moderator')}</li>
              <li className="badge badge-neutral">Instructors · {count('instructor')}</li>
              <li className="badge badge-neutral">Teaching Assistants · {count('teaching_assistant')}</li>
            </ul>
          )}
      </Group>

      <Group title="Roles in use" hint="Owner, Admin and Member always are. Switching one off changes nobody’s role: people who hold it keep it.">
        <div className="flex flex-col">
          {OPTIONAL.map(([k, label, hint]) => (
            <CheckRow key={k} checked={d.value.roles.includes(k)} onChange={(on) => toggle(k, on)}>
              <span><span className="font-semibold">{label}</span><span className="t-small block">{hint}</span></span>
            </CheckRow>
          ))}
        </div>
      </Group>
    </SectionForm>
  );
}
