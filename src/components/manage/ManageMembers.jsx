// Manage → Members (board S6Members): roles, states and actions, from the server's list. Every
// action that affects a person needs a reason they see (D3). Moderators warn and restrict;
// Admins also remove, block and change roles; nobody acts on someone at or above their role.
// Owners and Admins also get Invitations (v2 workstream F, F9; board V2FInvites), ?view=invitations.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityApi, errorText } from '../../lib/communities.js';
import { fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { RANK } from '../groups/helpers.js';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import Field from '../events/FormField.jsx';
import Menu from '../resources/Menu.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import ManageInvitations from '../invitations/ManageInvitations.jsx';
import { useInvitations } from '../invitations/useInvitations.js';

const FILTERS = [['all', 'Everyone'], ['staff', 'Owners, Admins, Moderators'], ['restricted', 'Restricted'], ['out', 'Removed or blocked']];
const STAFF = ['owner', 'admin', 'moderator'];
const SANCTION = {
  warn: ['Warn', 'A message only they see. It stays on their record here.'],
  restrict: ['Restrict', 'They can read but not post, reply, RSVP or enrol.'],
  remove: ['Remove from the community', 'They can ask to join again after 7 days.'],
  block: ['Block', 'They can’t see or rejoin the community until unblocked.'],
};

export default function ManageMembers({ g, perms }) {
  const { me } = useStore();
  const [s, setS] = useState({ state: 'loading', list: [] });
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [acting, setActing] = useState(null); // { member, kind }
  const [history, setHistory] = useState(null);
  const [params, setParams] = useSearchParams();
  const view = perms.canAdmin && params.get('view') === 'invitations' ? 'invitations' : 'members';
  const invites = useInvitations(g.id, { enabled: !!perms.canAdmin });
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/members`).then((d) => setS({ state: 'ready', list: d.members }))
    .catch((e) => setS({ state: 'error', list: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load]);
  const myRank = g.adminMode ? 9 : RANK[s.list.find((m) => m.id === me.id)?.role] ?? 0;
  const canAct = (m) => m.id !== me.id && m.role !== 'owner' && (g.adminMode || (RANK[m.role] ?? 0) < myRank);
  const q = text.trim().toLowerCase();
  const shown = s.list.filter((m) => (!q || m.name.toLowerCase().includes(q))
    && (filter === 'all' ? ['active', 'restricted'].includes(m.state) : filter === 'staff' ? STAFF.includes(m.role) && m.state === 'active'
      : filter === 'restricted' ? m.state === 'restricted' : ['removed', 'blocked'].includes(m.state)));
  const count = (k) => s.list.filter((m) => (k === 'all' ? ['active', 'restricted'].includes(m.state) : k === 'staff' ? STAFF.includes(m.role) && m.state === 'active'
    : k === 'restricted' ? m.state === 'restricted' : ['removed', 'blocked'].includes(m.state))).length;

  const setRole = async (m, role) => {
    try { await communityApi.setMember(g.id, m.id, { role }); toast(`${m.name} is now ${role === 'admin' ? 'an Admin' : `a ${role === 'member' ? 'Member' : 'Moderator'}`}`); load(); } catch (err) { toast(errorText(err), 'error'); }
  };
  const lift = async (m) => {
    const what = m.state === 'restricted' ? 'Lift the restriction' : m.state === 'blocked' ? 'Unblock' : 'Let them ask to join again';
    if (!(await confirmAction(`${what} for ${m.name}?`))) return;
    try { await api(`/communities/${encodeURIComponent(g.id)}/members/${m.id}/lift`, { method: 'POST' }); toast('Done'); load(); } catch (err) { toast(errorText(err), 'error'); }
  };

  const myRole = g.adminMode ? 'admin' : s.list.find((m) => m.id === me.id)?.role ?? 'member';
  const show = (v) => setParams((p) => { const next = new URLSearchParams(p); if (v === 'invitations') next.set('view', v); else next.delete('view'); return next; }, { replace: true });
  const tab = (k, label) => (
    <button type="button" role="tab" id={`mm-tab-${k}`} aria-selected={view === k} aria-controls={`mm-panel-${k}`} onClick={() => show(k)}
      className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-1 text-[15px] ${view === k ? 'border-[var(--az-focus)] font-semibold text-[var(--az-text)]' : 'border-transparent text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>{label}</button>
  );

  if (s.state === 'loading') return <div className="panel p-5"><Skeleton lines={5} label="Loading members" /></div>;
  if (s.state === 'error') return <p role="alert" className="notice notice-bad">{s.message}</p>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 className="t-h2">Members</h2>
      {perms.canAdmin && (
        <div role="tablist" aria-label="Members and invitations" className="flex flex-wrap gap-x-5 border-b border-[var(--az-hairline)]">
          {tab('members', `Members · ${count('all')}`)}
          {tab('invitations', `Invitations${invites.status === 'ready' ? ` · ${invites.pending} pending` : ''}`)}
        </div>
      )}
      {view === 'invitations' ? (
        <div role="tabpanel" id="mm-panel-invitations" aria-labelledby="mm-tab-invitations">
          <ManageInvitations g={g} me={me} myRole={myRole} members={s.list} invites={invites} />
        </div>
      ) : (
      <div role={perms.canAdmin ? 'tabpanel' : undefined} id="mm-panel-members" aria-labelledby={perms.canAdmin ? 'mm-tab-members' : undefined} className="flex min-w-0 flex-col gap-4">
      <label className="relative block min-w-0 sm:max-w-sm">
        <span className="sr-only">Search members</span>
        <span aria-hidden="true" className="text-3 pointer-events-none absolute inset-y-0 left-3 flex items-center"><Icon name="search" size={16} /></span>
        <input className="input pl-9" type="search" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div role="group" aria-label="Show" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className="filter-chip shrink-0">{label} · {count(k)}</button>
        ))}
      </div>
      {!perms.canAdmin && <p className="t-small">As a Moderator you can warn and restrict members. Admins change roles, remove and block.</p>}
      <ul className="panel divide-y divide-[var(--az-divider)]">
        {shown.length === 0 && <li className="t-small p-5">Nobody here.</li>}
        {shown.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-[1_1_220px]">
              <Link to={`/people/${m.id}`} className="font-semibold text-[var(--az-text)] hit hover:underline">{m.name}</Link>{m.id === me.id && <span className="t-small"> · you</span>}
              <span className="t-small block">Joined {m.joined_at ? fmtDate(Date.parse(m.joined_at), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} · {m.last_active ? `active ${timeAgo(Date.parse(m.last_active))}` : 'hasn’t posted yet'}</span>
            </span>
            <Badge>{m.role === 'member' ? 'Member' : m.role[0].toUpperCase() + m.role.slice(1)}</Badge>
            {m.state !== 'active' && <Badge tone={m.state === 'restricted' ? 'warn' : 'bad'}>{m.state === 'restricted' ? (m.restricted_until ? `Restricted until ${fmtDate(Date.parse(m.restricted_until), { day: 'numeric', month: 'short' })}` : 'Restricted') : m.state === 'removed' ? 'Removed' : 'Blocked'}</Badge>}
            {canAct(m) && <Actions m={m} perms={perms} onRole={setRole} onSanction={(kind) => setActing({ member: m, kind })} onLift={() => lift(m)} onHistory={() => setHistory(m)} />}
          </li>
        ))}
      </ul>
      </div>
      )}
      {acting && <SanctionDialog g={g} member={acting.member} kind={acting.kind} onClose={(done) => { setActing(null); if (done) load(); }} />}
      {history && <History g={g} member={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Actions({ m, perms, onRole, onSanction, onLift, onHistory }) {
  const items = [
    perms.canAdmin && m.state === 'active' && m.role !== 'moderator' && ['Make Moderator', () => onRole(m, 'moderator')],
    perms.canAdmin && m.state === 'active' && m.role !== 'member' && ['Make Member', () => onRole(m, 'member')],
    m.state === 'active' && ['Warn…', () => onSanction('warn')],
    m.state === 'active' && ['Restrict…', () => onSanction('restrict')],
    (m.state === 'restricted' || (perms.canAdmin && ['removed', 'blocked'].includes(m.state))) && [m.state === 'restricted' ? 'Lift restriction' : m.state === 'blocked' ? 'Unblock' : 'Let them ask again', onLift],
    perms.canAdmin && ['active', 'restricted'].includes(m.state) && ['Remove from community…', () => onSanction('remove'), true],
    perms.canAdmin && m.state !== 'blocked' && ['Block…', () => onSanction('block'), true],
    ['History', onHistory],
  ].filter(Boolean).map(([label, onSelect, danger]) => ({ label, onSelect, danger }));
  return (
    <Menu label={`Actions for ${m.name}`} width={224} items={items}
      trigger={({ props }) => (
        <button type="button" {...props} aria-label={`Actions for ${m.name}`} className="btn btn-ghost btn-icon btn-sm"><Icon name="more" size={18} /></button>
      )} />
  );
}

function SanctionDialog({ g, member, kind, onClose }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [label, hint] = SANCTION[kind];
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/communities/${encodeURIComponent(g.id)}/members/${member.id}/sanction`, { method: 'POST', body: { kind, reason, days: kind === 'restrict' ? (days === 'lifted' ? null : Number(days)) : null } });
      toast(`${label}: done. ${member.name} has been told.`);
      onClose(true);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <Modal title={`${label} ${member.name}`} onClose={() => onClose(false)}>
      <form className="flex flex-col gap-4" onSubmit={send}>
        <p className="text-2 text-sm">{hint}</p>
        {kind === 'restrict' && <Field label="For how long"><select className="input" value={days} onChange={(e) => setDays(e.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="lifted">Until lifted</option></select></Field>}
        <Field label="Reason" hint={`${member.name} sees this.`}><textarea className="input min-h-20" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button type="submit" variant={['remove', 'block'].includes(kind) ? 'danger' : 'primary'} busy={busy}>{label}</Button>
        </div>
      </form>
    </Modal>
  );
}

function History({ g, member, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => { api(`/communities/${encodeURIComponent(g.id)}/members/${member.id}/sanctions`).then((d) => setList(d.sanctions)).catch(() => setList([])); }, [g.id, member.id]);
  return (
    <Modal title={`${member.name}: moderation history`} onClose={onClose}>
      {!list ? <p className="t-small">Loading…</p> : !list.length ? <p className="text-2 text-sm">No warnings, restrictions or removals here.</p> : (
        <ul className="list-rows text-sm">
          {list.map((x, i) => (
            <li key={i} className="py-2.5">
              <b className="text-[var(--az-text)]">{SANCTION[x.kind][0]}</b> <span className="t-small">· {fmtDate(Date.parse(x.created_at), { day: 'numeric', month: 'short', year: 'numeric' })}{x.by ? ` · by ${x.by}` : ''}{x.lifted_at ? ' · lifted' : x.until ? ` · until ${fmtDate(Date.parse(x.until), { day: 'numeric', month: 'short' })}` : ''}</span>
              <span className="text-2 block">“{x.reason}”</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
