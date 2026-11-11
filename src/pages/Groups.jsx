// My Communities and the signed-in Explore (redesign Stage 3). Both lists come from the server's
// discovery rules (GET /communities): Public and Private communities, plus Closed ones you're in.
// Each community opens at /c/:slug; the old /groups/:id addresses redirect there.
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { Empty, PageHeader, Tabs } from '../components/ui.jsx';
import { permsOf } from '../components/groups/helpers.js';
import { communityApi, communityPath, errorText, fetchCommunityList, NETWORK_COMMUNITY, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { useCommunityWrite } from '../components/groups/useCommunity.js';
import { CardSkeletons, CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import JoinButton from '../components/groups/JoinButton.jsx';
import GroupForm from '../components/groups/GroupForm.jsx';
import { TAB_FOR_APP } from './Community.jsx';

export default function Groups() {
  const { id, app } = useParams();
  // Old addresses: /groups/:id and /groups/:id/:app → the community page.
  if (id) return <Navigate to={communityPath(id, TAB_FOR_APP[app] ?? app)} replace />;
  return <Directory />;
}

/** Creates a community on the server, then opens it. */
function useCreateGroup() {
  const { refresh } = useCommunityWrite();
  const nav = useNavigate();
  // Errors are rethrown so the form can show them next to the fields.
  return async (values) => {
    const { community } = await communityApi.create({
      name: values.name, description: values.description || null, category: values.type, emoji: values.emoji,
      visibility: visibilityOf(values.accessType),
      settings: { apps: values.apps, dashboard: [{ id: 'w-about', kind: 'about' }, { id: 'w-members', kind: 'members' }] },
    });
    await refresh(community.id);
    toast('Community created');
    nav(communityPath(community));
  };
}

/** The communities this person can see, reloaded whenever one of them changes. */
function useCommunityList() {
  const { me } = useStore();
  const [s, setS] = useState({ status: 'loading', list: [] });
  const load = useCallback(() => {
    fetchCommunityList(me.id).then((list) => setS({ status: 'ready', list }), (err) => setS((prev) => ({ ...prev, status: prev.list.length ? 'ready' : 'error', message: errorText(err) })));
  }, [me.id]);
  useEffect(load, [load]);
  useEffect(() => onCommunityChange(load), [load]);
  return { ...s, retry: () => { setS((prev) => ({ ...prev, status: 'loading' })); load(); } };
}

const isMine = (g) => ['active', 'restricted'].includes(g.myMembership?.state);

function Directory() {
  const { state, me, can } = useStore();
  // ?tab=discover (Explore) and ?new=1 (Create Community) come from the platform navigation.
  const [params, setParams] = useSearchParams();
  const tab = ['mine', 'discover', 'requests'].includes(params.get('tab')) ? params.get('tab') : 'mine';
  const setTab = (t) => setParams(t === 'mine' ? {} : { tab: t });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const creating = params.get('new') === '1' && can('group.create');
  const setCreating = (on) => setParams(on ? { ...Object.fromEntries(params), new: '1' } : (({ new: _n, ...rest }) => rest)(Object.fromEntries(params)));
  const create = useCreateGroup();
  const { status, list, message, retry } = useCommunityList();

  // Join requests come with the full community detail, which only admins' groups carry.
  const managed = state.groups.filter((g) => permsOf(g, me.id).canAdmin && (g.joinRequests || []).length);
  const mine = list.filter(isMine).sort((a, b) => (b.id === NETWORK_COMMUNITY) - (a.id === NETWORK_COMMUNITY) || a.name.localeCompare(b.name));
  const discover = list.filter((g) => !isMine(g) && g.status !== 'archived');
  const base = tab === 'mine' ? mine : tab === 'requests' ? managed : discover;
  const categories = [...new Set(base.map((g) => g.type).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const shown = base.filter((g) => (!category || g.type === category) && `${g.name} ${g.description} ${g.type}`.toLowerCase().includes(needle));

  useEffect(() => { document.title = `${tab === 'discover' ? 'Explore' : tab === 'requests' ? 'Join requests' : 'My Communities'} · CommunityOne`; }, [tab]);
  useEffect(() => { setCategory(''); }, [tab]);

  return (
    <div>
      <PageHeader title={tab === 'discover' ? 'Explore communities' : tab === 'requests' ? 'Join requests' : 'My Communities'}
        subtitle={tab === 'discover' ? 'Public and Private communities you haven’t joined yet. Closed ones are invitation only and aren’t listed.' : 'Communities for your institution, batch, city, profession and interests.'}
        actions={can('group.create') && <button className="btn btn-primary" onClick={() => setCreating(true)}>Create community</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'mine', label: 'My communities', count: status === 'ready' ? mine.length : undefined },
        { id: 'discover', label: 'Explore' },
        ...(managed.length || tab === 'requests' ? [{ id: 'requests', label: 'Requests I manage', count: managed.reduce((n, g) => n + g.joinRequests.length, 0) }] : []),
      ]} />
      <div className="mb-5 flex flex-col gap-3">
        <input className="input sm:max-w-md" type="search" placeholder={tab === 'discover' ? 'Search communities to join' : 'Search your communities'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search communities" />
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {[['', 'All'], ...categories.map((c) => [c, c])].map(([value, label]) => (
              <button key={value || 'all'} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}
                className={`min-h-9 rounded-full px-3.5 text-sm transition ${category === value ? 'bg-[var(--az-text)] font-semibold text-[var(--color-ink-950)]' : 'border border-[var(--az-hairline)] font-medium text-slate-300 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status === 'ready' ? `${shown.length} ${shown.length === 1 ? 'community' : 'communities'}` : ''}</p>
      {status === 'loading' && tab !== 'requests' ? <CardSkeletons n={6} />
        : status === 'error' && tab !== 'requests' ? (
          <div role="alert" className="glass p-6 text-center text-sm">
            <p className="text-rose-300">{message}</p>
            <button className="btn btn-ghost mt-3" onClick={retry}>Try again</button>
          </div>
        ) : shown.length === 0 ? (
          <Empty icon="groups" title={needle || category ? 'No communities match.' : tab === 'mine' ? 'You haven’t joined any communities yet.' : tab === 'requests' ? 'No join requests waiting.' : 'You’ve joined every community listed.'}>
            {needle || category ? 'Try another search or category.' : tab === 'mine' ? <Link to="/groups?tab=discover" className="text-brand-400 underline">Explore communities</Link> : null}
          </Empty>
        ) : <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">{shown.map((g) => <CommunityCard key={g.id} g={g} />)}</div>}
      {creating && <GroupForm onClose={() => setCreating(false)} onSave={(v) => create(v)} />}
    </div>
  );
}

function CommunityCard({ g }) {
  const { me } = useStore();
  const n = g.memberCount;
  const pending = permsOf(g, me.id).canAdmin ? (g.joinRequests?.length ?? 0) : 0;
  return (
    <article className="glass flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <CommunityTile c={g} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white"><Link to={communityPath(g)} className="hover:underline">{g.name}</Link></h3>
          <p className="text-xs text-slate-400">{[g.type, `${n} ${n === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {g.description && <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">{g.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="flex flex-wrap items-center gap-2">
          <VisibilityBadge visibility={visibilityOf(g.accessType)} />
          {g.status === 'archived' && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">Archived</span>}
          {pending > 0 && <Link to={communityPath(g, 'members')} className="text-xs font-semibold text-brand-300 hover:underline">{pending} waiting</Link>}
        </span>
        <JoinButton g={g} className="min-h-10 !px-4 text-sm" />
      </div>
    </article>
  );
}
