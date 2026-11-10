import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { AvatarStack, Empty, PageHeader, Tabs } from '../components/ui.jsx';
import { ACCESS, APPS, GROUP_TYPES, hueOf, permsOf, roleOf } from '../components/groups/helpers.js';
import { communityApi, visibilityOf } from '../lib/communities.js';
import { useChannelSync, useCommunityLifecycle, useCommunityWrite } from '../components/groups/useCommunity.js';
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

const memberCount = (g) => g.memberCount ?? g.members.length;

/** Creates a community on the server (and optionally a linked channel), then opens it. */
function useCreateGroup() {
  const { dispatch } = useStore();
  const { refresh } = useCommunityWrite();
  const nav = useNavigate();
  // Errors are rethrown so the form can show them next to the fields.
  return async (values, { createChannel }) => {
    const { community } = await communityApi.create({
      name: values.name, description: values.description || null, category: values.type, emoji: values.emoji,
      visibility: visibilityOf(values.accessType),
      settings: { apps: values.apps, dashboard: [{ id: 'w-about', kind: 'about' }, { id: 'w-members', kind: 'members' }] },
    });
    const g = await refresh(community.id);
    if (createChannel) {
      const name = (g?.name ?? values.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      dispatch({ type: 'channel/create', channel: { name, description: `Linked to the ${g?.name ?? values.name} group`, groupId: community.id } });
    }
    toast('Community created');
    nav(`/groups/${community.id}`);
  };
}

function Directory() {
  const { state, me, can } = useStore();
  // ?tab=discover (Explore) and ?new=1 (Create Community) come from the platform navigation.
  const [params, setParams] = useSearchParams();
  const tab = ['mine', 'discover', 'requests'].includes(params.get('tab')) ? params.get('tab') : 'mine';
  const setTab = (t) => setParams(t === 'mine' ? {} : { tab: t });
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [access, setAccess] = useState('');
  const creating = params.get('new') === '1' && can('group.create');
  const setCreating = (on) => setParams(on ? { ...Object.fromEntries(params), new: '1' } : (({ new: _n, ...rest }) => rest)(Object.fromEntries(params)));
  const create = useCreateGroup();

  const managed = state.groups.filter((g) => permsOf(g, me.id).canAdmin && (g.joinRequests || []).length);
  const base = tab === 'mine' ? state.groups.filter((g) => g.members.includes(me.id))
    : tab === 'requests' ? managed
    : state.groups.filter((g) => !g.members.includes(me.id) && g.accessType !== 'private' && g.status !== 'archived');
  const list = base.filter((g) => (!type || g.type === type) && (!access || g.accessType === access)
    && `${g.name} ${g.description}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title={tab === 'discover' ? 'Explore communities' : 'My Communities'} subtitle="Communities for your institution, batch, city, profession and interests."
        actions={can('group.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}>Create community</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'mine', label: 'My communities', count: state.groups.filter((g) => g.members.includes(me.id)).length },
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
        ? <Empty icon="👥" title={tab === 'mine' ? 'You haven’t joined any communities that match.' : 'No communities match.'}>Try another filter, or discover new communities.</Empty>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((g) => <GroupCard key={g.id} g={g} />)}</div>}
      {creating && <GroupForm onClose={() => setCreating(false)} onSave={(v, opts) => create(v, opts)} />}
    </div>
  );
}

/** Shared leave flow: confirm, then leave on the server (which refuses an owner or the last admin). */
function useLeaveGroup() {
  const { me } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  return async (g) => {
    if (!confirm(`Leave ${g.name}?`)) return;
    if (await run(g.id, () => communityApi.leave(g.id), { ok: `You left ${g.name}` })) channels.drop(g.id, me.id);
  };
}

function JoinButton({ g, className = '' }) {
  const { dispatch, me, user } = useStore();
  const leave = useLeaveGroup();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  const [busy, setBusy] = useState(false);
  const role = roleOf(g, me.id);
  const requested = (g.joinRequests || []).includes(me.id);
  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (g.allHands && role) return null;
  if (role) {
    return <button className={`btn btn-ghost ${className}`} disabled={busy} onClick={() => act(() => leave(g))}>Leave</button>;
  }
  if (g.status === 'archived') return <span className={`chip ${className}`}>Archived</span>;
  const join = () => act(async () => {
    const res = await run(g.id, () => communityApi.join(g.id));
    if (!res) return;
    if (res.membership?.state === 'active') { toast(`You joined ${g.name}`); channels.add(g.id, [me.id]); }
    else if (res.membership?.state === 'pending') {
      toast('Request sent');
      g.admins.forEach((a) => dispatch({ type: 'notify', silent: true, notification: { userId: a, kind: 'group', link: `/groups/${g.id}/members`, text: `${me.name} asked to join ${g.name}` } }));
    }
  });
  if (g.accessType === 'public') return <button className={`btn btn-primary ${className}`} disabled={busy} onClick={join}>Join</button>;
  if (g.accessType === 'restricted') {
    const cancel = () => act(() => run(g.id, () => communityApi.leave(g.id), { ok: 'Request withdrawn' }));
    return <button className={`btn ${requested ? 'btn-ghost' : 'btn-primary'} ${className}`} disabled={busy} onClick={requested ? cancel : join}>{requested ? 'Cancel request' : 'Request to join'}</button>;
  }
  return <span className={`chip ${className}`} title={user(g.admins[0])?.name ? `Ask ${user(g.admins[0]).name} to add you` : 'Ask a community admin to add you'}><Glyph value="🔒" tile={false} size={16} /> Invite only</span>;
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
          {g.status === 'archived' && <span className="chip !bg-amber-500/15 !text-amber-200">Archived</span>}
          {g.dynamicRule && <span className="chip !bg-emerald-500/15 !text-emerald-200" title="Members added automatically"><Glyph value="⚡" tile={false} size={16} /> Auto</span>}
        </div>
        <h3 className="mt-3 font-bold"><Link to={`/groups/${g.id}`} className="hover:underline">{g.name}</Link></h3>
        <p className="mt-1 line-clamp-2 flex-1 text-sm text-slate-400">{g.description}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs text-slate-400"><AvatarStack ids={g.members} max={3} size={24} />{memberCount(g)}</span>
          <JoinButton g={g} className="h-10" />
        </div>
      </div>
    </article>
  );
}

function GroupView({ id }) {
  const { state, me } = useStore();
  const leave = useLeaveGroup();
  const { patch } = useCommunityWrite();
  const lifecycle = useCommunityLifecycle();
  const { app } = useParams();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null);
  const g = state.groups.find((x) => x.id === id);

  if (!g) return <Empty icon="🔎" title="Group not found">It may have been deleted. <Link to="/groups" className="text-brand-400 underline">Back to groups</Link></Empty>;

  const role = roleOf(g, me.id);
  const perms = permsOf(g, me.id);
  const isAdmin = perms.canAdmin;
  const canSee = perms.canView;
  const archived = g.status === 'archived';
  const apps = APPS.filter((a) => g.apps.includes(a.id));
  const tabs = [...apps, ...(isAdmin ? [{ id: 'settings', label: 'Settings', icon: '⚙️' }] : [])];
  const current = tabs.find((t) => t.id === app)?.id ?? tabs[0]?.id;
  const go = (t) => nav(`/groups/${g.id}/${t}`);

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
              <span>· {memberCount(g)} members</span>
              {archived && <span className="chip !bg-amber-500/15 !text-amber-200">Archived</span>}
              {role && <span className="chip capitalize !bg-white/5 !text-slate-300">You: {role}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <JoinButton g={g} className="h-10" />
            {(role || isAdmin || me.admin) && (
              <div className="relative">
                <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => setMenu(!menu)} aria-label="Group actions" aria-expanded={menu}>⋯</button>
                {menu && (
                  <div className="glass glass-strong absolute right-0 z-20 mt-2 w-52 p-2 text-sm" onClick={() => setMenu(false)}>
                    {isAdmin && !archived && <MenuItem onClick={() => setModal('add')}>Add members</MenuItem>}
                    {isAdmin && <MenuItem onClick={() => setModal('edit')}>Edit group</MenuItem>}
                    {isAdmin && <MenuItem onClick={() => go('settings')}>Settings</MenuItem>}
                    {canSee && <MenuItem onClick={() => go('members')}>View members</MenuItem>}
                    {role && !g.allHands && <MenuItem onClick={() => leave(g)}>Leave group</MenuItem>}
                    {isAdmin && !g.allHands && (archived
                      ? <MenuItem onClick={() => lifecycle.archive(g, false)}>Restore community</MenuItem>
                      : <MenuItem danger onClick={() => lifecycle.archive(g, true)}>Archive community</MenuItem>)}
                    {me.admin && !g.allHands && <MenuItem danger onClick={() => lifecycle.remove(g)}>Delete community</MenuItem>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {archived && (
        <p className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100">
          <span className="flex-1">This community is archived. It’s read-only and hidden from Discover.</span>
          {isAdmin && <button className="btn btn-ghost h-9 !px-3 text-xs" onClick={() => lifecycle.archive(g, false)}>Restore</button>}
        </p>
      )}
      {!canSee ? (
        <div className="mt-5"><Empty icon="🔒" title={g.accessType === 'restricted' ? 'Content is for members' : 'This is a private group'}>
          {g.accessType === 'restricted' ? 'Request to join to see its posts and take part.' : 'Only members can see its content. Ask an admin to add you.'}</Empty></div>
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
          {!role && g.accessType === 'public' && !archived && (
            <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-300">You can browse this group. Join to post and take part.</p>
          )}
          <div className="mt-5">
            {current === 'dashboard' && <SpaceDashboard group={g} isAdmin={isAdmin} />}
            {current === 'members' && <Members group={g} perms={perms} />}
            {current === 'settings' && isAdmin && <Settings key={g.id} group={g} />}
            {current && !['dashboard', 'members', 'settings'].includes(current) && <Embed app={current} group={g} />}
          </div>
        </>
      )}

      {modal === 'add' && <AddMembers group={g} onClose={() => setModal(null)} />}
      {modal === 'edit' && (
        <GroupForm initial={{ name: g.name, description: g.description, type: g.type, accessType: g.accessType, emoji: g.emoji, apps: g.apps }}
          onClose={() => setModal(null)}
          onSave={async (v) => {
            const res = await patch(g, { name: v.name, description: v.description || null, category: v.type, emoji: v.emoji,
              visibility: visibilityOf(v.accessType), settings: { apps: v.apps } }, { ok: 'Group saved', inline: true });
            if (res) setModal(null);
          }} />
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return <button className={`block min-h-10 w-full rounded-lg px-3 text-left hover:bg-white/5 ${danger ? 'text-rose-300' : ''}`} onClick={onClick}>{children}</button>;
}
