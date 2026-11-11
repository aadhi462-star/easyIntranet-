// Manage → Members (board S6Members): roles, states and actions, from the server's list. Every
// action that affects a person needs a reason they see (D3). Moderators warn and restrict;
// Admins also remove, block and change roles; nobody acts on someone at or above their role.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityApi, errorText } from '../../lib/communities.js';
import { fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { RANK } from '../groups/helpers.js';
import { Pill } from '../learning/bits.jsx';

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
    if (!confirm(`${what} for ${m.name}?`)) return;
    try { await api(`/communities/${encodeURIComponent(g.id)}/members/${m.id}/lift`, { method: 'POST' }); toast('Done'); load(); } catch (err) { toast(errorText(err), 'error'); }
  };

  if (s.state === 'loading') return <div aria-busy="true" aria-label="Loading members" className="glass h-64 animate-pulse" />;
  if (s.state === 'error') return <p role="alert" className="glass p-5 text-sm text-rose-300">{s.message}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="t-h2 flex-1 text-white">Members</h2>
        <input className="input !w-64" type="search" aria-label="Search members" placeholder="Search by name" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div role="group" aria-label="Show" className="no-scrollbar flex gap-2 overflow-x-auto">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm ${filter === k ? 'bg-[var(--cm-tint)] font-semibold text-white shadow-[inset_0_0_0_1px_var(--cm-line)]' : 'text-2 border border-[var(--az-hairline)] hover:text-white'}`}>{label} · {count(k)}</button>
        ))}
      </div>
      {!perms.canAdmin && <p className="t-small">As a Moderator you can warn and restrict members. Admins change roles, remove and block.</p>}
      <ul className="glass divide-y divide-[var(--az-divider)]">
        {shown.length === 0 && <li className="text-3 p-5 text-sm">Nobody here.</li>}
        {shown.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-[1_1_220px]">
              <Link to={`/people/${m.id}`} className="font-semibold text-white hover:underline">{m.name}</Link>{m.id === me.id && <span className="t-small"> · you</span>}
              <span className="t-small block">Joined {m.joined_at ? fmtDate(Date.parse(m.joined_at), { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} · {m.last_active ? `active ${timeAgo(Date.parse(m.last_active))}` : 'hasn’t posted yet'}</span>
            </span>
            <Pill tone="outline">{m.role === 'member' ? 'Member' : m.role[0].toUpperCase() + m.role.slice(1)}</Pill>
            {m.state !== 'active' && <Pill tone="warn">{m.state === 'restricted' ? (m.restricted_until ? `Restricted until ${fmtDate(Date.parse(m.restricted_until), { day: 'numeric', month: 'short' })}` : 'Restricted') : m.state === 'removed' ? 'Removed' : 'Blocked'}</Pill>}
            {canAct(m) && <Actions m={m} perms={perms} onRole={setRole} onSanction={(kind) => setActing({ member: m, kind })} onLift={() => lift(m)} onHistory={() => setHistory(m)} />}
          </li>
        ))}
      </ul>
      {acting && <SanctionDialog g={g} member={acting.member} kind={acting.kind} onClose={(done) => { setActing(null); if (done) load(); }} />}
      {history && <History g={g} member={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function Actions({ m, perms, onRole, onSanction, onLift, onHistory }) {
  const [open, setOpen] = useState(false);
  const pick = (fn) => () => { setOpen(false); fn(); };
  const items = [
    perms.canAdmin && m.state === 'active' && m.role !== 'moderator' && ['Make Moderator', () => onRole(m, 'moderator')],
    perms.canAdmin && m.state === 'active' && m.role !== 'member' && ['Make Member', () => onRole(m, 'member')],
    m.state === 'active' && ['Warn…', () => onSanction('warn')],
    m.state === 'active' && ['Restrict…', () => onSanction('restrict')],
    (m.state === 'restricted' || (perms.canAdmin && ['removed', 'blocked'].includes(m.state))) && [m.state === 'restricted' ? 'Lift restriction' : m.state === 'blocked' ? 'Unblock' : 'Let them ask again', onLift],
    perms.canAdmin && ['active', 'restricted'].includes(m.state) && ['Remove from community…', () => onSanction('remove'), true],
    perms.canAdmin && m.state !== 'blocked' && ['Block…', () => onSanction('block'), true],
    ['History', onHistory],
  ].filter(Boolean);
  return (
    <span className="relative">
      <button className="btn btn-ghost w-11 !p-0" aria-label={`Actions for ${m.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && (
        <span role="menu" className="glass absolute right-0 z-20 mt-1 flex w-56 flex-col p-1.5 text-sm shadow-xl" onMouseLeave={() => setOpen(false)}>
          {items.map(([label, fn, danger]) => <button key={label} role="menuitem" className={`min-h-11 rounded-lg px-3 text-left hover:bg-white/5 ${danger ? 'text-rose-300' : ''}`} onClick={pick(fn)}>{label}</button>)}
        </span>
      )}
    </span>
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
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
          <button className={`btn ${['remove', 'block'].includes(kind) ? 'btn-ghost text-rose-300' : 'btn-primary'}`} disabled={busy}>{busy ? 'Saving…' : label}</button>
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
              <b className="text-white">{SANCTION[x.kind][0]}</b> <span className="t-small">· {fmtDate(Date.parse(x.created_at), { day: 'numeric', month: 'short', year: 'numeric' })}{x.by ? ` · by ${x.by}` : ''}{x.lifted_at ? ' · lifted' : x.until ? ` · until ${fmtDate(Date.parse(x.until), { day: 'numeric', month: 'short' })}` : ''}</span>
              <span className="text-2 block">“{x.reason}”</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
