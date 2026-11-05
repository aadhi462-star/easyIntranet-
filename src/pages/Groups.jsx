import { Glyph } from '../components/icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { AvatarStack, Empty, PageHeader, Tabs } from '../components/ui.jsx';
import { ACCESS, APPS, GROUP_TYPES, hueOf, roleOf } from '../components/groups/helpers.js';
import GroupForm from '../components/groups/GroupForm.jsx';
import AddMembers from '../components/groups/AddMembers.jsx';
import SpaceDashboard from '../components/groups/SpaceDashboard.jsx';
import Members from '../components/groups/Members.jsx';
import Settings from '../components/groups/Settings.jsx';
import Embed from '../components/groups/Embed.jsx';

export default function Groups() {
  const { id } = useParams();
  return id ? <GroupView id={id} /> : <Directory />;
}

const cover = (g) => ({ background: `linear-gradient(135deg, hsl(${hueOf(g)} 70% 45%), hsl(${(hueOf(g) + 50) % 360} 70% 35%))` });

/** Creates a group (and optionally its channel) and returns the new id. */
function useCreateGroup() {
  const { state, dispatch } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  return (values, { createChannel }) => {
    const before = new Set(stateRef.current.groups.map((g) => g.id));
    dispatch({ type: 'group/create', group: { moderators: [], joinRequests: [], dashboard: [{ id: 'w-about', kind: 'about' }, { id: 'w-members', kind: 'members' }], ...values } });
    return { before, createChannel, name: values.name };
  };
}

function Directory() {
  const { state, me, can } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState('mine');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [access, setAccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(null);
  const create = useCreateGroup();
  const { dispatch } = useStore();

  // After group/create lands, find the new group, add its channel, and open it.
  useEffect(() => {
    if (!pending) return;
    const g = state.groups.find((x) => !pending.before.has(x.id));
    if (!g) return;
    if (pending.createChannel) {
      dispatch({ type: 'channel/create', channel: { name: g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), description: `Linked to the ${g.name} group`, groupId: g.id } });
    }
    setPending(null);
    nav(`/groups/${g.id}`);
  }, [state.groups, pending, dispatch, nav]);

  const managed = state.groups.filter((g) => g.admins.includes(me.id) && (g.joinRequests || []).length);
  const base = tab === 'mine' ? state.groups.filter((g) => g.members.includes(me.id))
    : tab === 'requests' ? managed
    : state.groups.filter((g) => !g.members.includes(me.id) && g.accessType !== 'private');
  const list = base.filter((g) => (!type || g.type === type) && (!access || g.accessType === access)
    && `${g.name} ${g.description}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Groups & Spaces" subtitle="Spaces for your batch, city, department and interests."
        actions={can('group.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ New group</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'mine', label: 'My groups', count: state.groups.filter((g) => g.members.includes(me.id)).length },
        { id: 'discover', label: 'Discover' },
        ...(managed.length || tab === 'requests' ? [{ id: 'requests', label: 'Requests I manage', count: managed.reduce((n, g) => n + g.joinRequests.length, 0) }] : []),
      ]} />
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input className="input" type="search" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search groups" />
        <select className="input sm:!w-40" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>{GROUP_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input sm:!w-40" value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Filter by access">
          <option value="">Any access</option>{Object.entries(ACCESS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </select>
      </div>
      {list.length === 0
        ? <Empty icon="👥" title={tab === 'mine' ? 'You haven’t joined any groups that match.' : 'No groups match.'}>Try another filter or Discover new groups.</Empty>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((g) => <GroupCard key={g.id} g={g} />)}</div>}
      {creating && <GroupForm onClose={() => setCreating(false)} onSave={(v, opts) => { setPending(create(v, opts)); setCreating(false); }} />}
    </div>
  );
}

function JoinButton({ g, className = '' }) {
  const { dispatch, me, user } = useStore();
  const role = roleOf(g, me.id);
  const requested = (g.joinRequests || []).includes(me.id);
  if (g.allHands && role) return null;
  if (role) {
    if (role === 'admin' && g.admins.length === 1) return null;
    return <button className={`btn btn-ghost ${className}`} onClick={() => confirm(`Leave ${g.name}?`) && dispatch({ type: 'group/join', id: g.id })}>Leave</button>;
  }
  if (g.accessType === 'public') return <button className={`btn btn-primary ${className}`} onClick={() => dispatch({ type: 'group/join', id: g.id })}>Join</button>;
  if (g.accessType === 'restricted') {
    const toggle = () => {
      dispatch({ type: 'update', col: 'groups', id: g.id, patch: (x) => ({ ...x, joinRequests: requested ? x.joinRequests.filter((u) => u !== me.id) : [...(x.joinRequests || []), me.id] }) });
      if (!requested) g.admins.forEach((a) => dispatch({ type: 'notify', silent: true, notification: { userId: a, kind: 'group', link: `/groups/${g.id}/members`, text: `${me.name} asked to join ${g.name}` } }));
    };
    return <button className={`btn ${requested ? 'btn-ghost' : 'btn-primary'} ${className}`} onClick={toggle}>{requested ? 'Cancel request' : 'Request to join'}</button>;
  }
  return <span className={`chip ${className}`} title={`Ask ${user(g.admins[0])?.name} to add you`}><Glyph value="🔒" tile={false} size={16} /> Invite only</span>;
}

function GroupCard({ g }) {
  return (
    <article className="glass flex flex-col overflow-hidden">
      <Link to={`/groups/${g.id}`} className="block h-20" style={cover(g)} aria-hidden="true" tabIndex={-1}>
        <span className="block p-4 text-3xl">{g.emoji}</span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap gap-1.5">
          <span className="chip">{g.type}</span>
          <span className="chip !bg-white/5 !text-slate-300"><Glyph value={ACCESS[g.accessType]?.icon} tile={false} size={14} /> {ACCESS[g.accessType]?.label}</span>
          {g.dynamicRule && <span className="chip !bg-emerald-500/15 !text-emerald-200" title="Members added automatically"><Glyph value="⚡" tile={false} size={16} /> Auto</span>}
        </div>
        <h3 className="mt-3 font-bold"><Link to={`/groups/${g.id}`} className="hover:underline">{g.name}</Link></h3>
        <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-400">{g.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs text-slate-400"><AvatarStack ids={g.members} max={3} size={24} />{g.members.length}</span>
          <JoinButton g={g} className="h-10" />
        </div>
      </div>
    </article>
  );
}

function GroupView({ id }) {
  const { state, me, dispatch } = useStore();
  const { app } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const g = state.groups.find((x) => x.id === id);

  if (!g) return <Empty icon="🔎" title="Group not found">It may have been deleted. <Link to="/groups" className="text-brand-400 underline">Back to groups</Link></Empty>;

  const role = roleOf(g, me.id);
  const isAdmin = role === 'admin' || me.admin;
  const canSee = role || g.accessType !== 'private' || me.admin;
  const apps = APPS.filter((a) => g.apps.includes(a.id));
  const tabs = [...apps, ...(isAdmin ? [{ id: 'settings', label: 'Settings', icon: '⚙️' }] : [])];
  const current = tabs.find((t) => t.id === app)?.id ?? tabs[0]?.id;
  const go = (t) => nav(`/groups/${g.id}/${t}`);
  const del = () => { if (confirm(`Delete ${g.name}?`)) { dispatch({ type: 'remove', col: 'groups', id: g.id }); nav('/groups'); } };

  return (
    <div>
      <div className="glass overflow-hidden">
        <div className="h-28 sm:h-36" style={cover(g)} />
        <div className="flex flex-wrap items-end gap-4 p-5 pt-0">
          <span className="-mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-ink-850 text-3xl ring-4 ring-ink-900" aria-hidden="true">{g.emoji}</span>
          <div className="min-w-0 flex-1 pt-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{g.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="chip">{g.type}</span>
              <span><Glyph value={ACCESS[g.accessType]?.icon} tile={false} size={14} /> {ACCESS[g.accessType]?.label}</span>
              <span>· {g.members.length} members</span>
              {role && <span className="chip capitalize !bg-white/5 !text-slate-300">You: {role}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <JoinButton g={g} className="h-10" />
            {(role || me.admin) && (
              <div className="relative">
                <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => setMenu(!menu)} aria-label="Group actions" aria-expanded={menu}>⋯</button>
                {menu && (
                  <div className="glass glass-strong absolute right-0 z-20 mt-2 w-52 p-2 text-sm" onClick={() => setMenu(false)}>
                    {isAdmin && <MenuItem onClick={() => setModal('add')}>Add members</MenuItem>}
                    {isAdmin && <MenuItem onClick={() => setModal('edit')}>Edit group</MenuItem>}
                    {isAdmin && <MenuItem onClick={() => go('settings')}>Settings</MenuItem>}
                    <MenuItem onClick={() => go('members')}>View members</MenuItem>
                    {role && !g.allHands && !(role === 'admin' && g.admins.length === 1) && <MenuItem onClick={() => dispatch({ type: 'group/join', id: g.id })}>Leave group</MenuItem>}
                    {isAdmin && !g.allHands && <MenuItem danger onClick={del}>Delete group</MenuItem>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!canSee ? (
        <div className="mt-5"><Empty icon="🔒" title="This is a private group">Only members can see its content. Ask an admin to add you.</Empty></div>
      ) : (
        <>
          <nav aria-label="Group apps" className="mt-5 -mx-1 overflow-x-auto pb-1">
            <div className="flex gap-1 px-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => go(t.id)} aria-current={current === t.id ? 'page' : undefined}
                  className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition ${current === t.id ? 'bg-brand-500 text-white shadow' : 'text-slate-300 hover:bg-white/5'}`}>
                  <Glyph value={t.icon} size={24} />{t.label}
                  {t.id === 'members' && isAdmin && g.joinRequests?.length > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10px]">{g.joinRequests.length}</span>}
                </button>
              ))}
            </div>
          </nav>
          {!role && !me.admin && g.accessType === 'restricted' && (
            <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-300">You can browse this group. Request to join to post and take part.</p>
          )}
          <div className="mt-5">
            {current === 'dashboard' && <SpaceDashboard group={g} isAdmin={isAdmin} />}
            {current === 'members' && <Members group={g} isAdmin={isAdmin} />}
            {current === 'settings' && isAdmin && <Settings key={g.id} group={g} />}
            {current && !['dashboard', 'members', 'settings'].includes(current) && <Embed app={current} group={g} />}
          </div>
        </>
      )}

      {modal === 'add' && <AddMembers group={g} onClose={() => setModal(null)} />}
      {modal === 'edit' && (
        <GroupForm initial={{ name: g.name, description: g.description, type: g.type, accessType: g.accessType, emoji: g.emoji, apps: g.apps }}
          onClose={() => setModal(null)}
          onSave={(v) => { dispatch({ type: 'update', col: 'groups', id: g.id, patch: v }); setModal(null); }} />
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return <button className={`block min-h-10 w-full rounded-lg px-3 text-left hover:bg-white/5 ${danger ? 'text-rose-300' : ''}`} onClick={onClick}>{children}</button>;
}
