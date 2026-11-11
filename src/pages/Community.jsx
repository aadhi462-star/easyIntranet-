// A community's page (redesign Stage 3): /c/:slug with Overview, Discussions, Events, Members,
// About and, for admins, Settings. Every community has one, AlumniZone included. The page reads
// the community straight from the server (by slug or id) and re-reads it after every change, so
// what it shows is what the server stored and what this person may see.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { accentOf, communityPath, errorText, loadCommunity, NETWORK_COMMUNITY, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { useServerFeed } from '../lib/feed.js';
import { useEvents } from '../lib/events.js';
import { occurrences, whenText } from '../components/events/eventUtils.js';
import { Icon } from '../components/icons.jsx';
import { AvatarStack, Empty } from '../components/ui.jsx';
import { CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { ACCESS, permsOf, roleOf } from '../components/groups/helpers.js';
import { useCommunityLifecycle, useCommunityWrite } from '../components/groups/useCommunity.js';
import JoinButton, { useLeaveGroup } from '../components/groups/JoinButton.jsx';
import FeedList from '../components/feed/FeedList.jsx';
import Composer from '../components/feed/Composer.jsx';
import EventList from '../components/events/EventList.jsx';
import Members from '../components/groups/Members.jsx';
import Settings from '../components/groups/Settings.jsx';
import GroupForm from '../components/groups/GroupForm.jsx';
import AddMembers from '../components/groups/AddMembers.jsx';

const DAY = 864e5;
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'discussions', label: 'Discussions', members: true },
  { id: 'events', label: 'Events', members: true },
  { id: 'members', label: 'Members', members: true },
  { id: 'about', label: 'About' },
  { id: 'settings', label: 'Settings', admins: true },
];
// Older addresses (/groups/:id/:app) used app names; they map onto these tabs.
export const TAB_FOR_APP = { dashboard: 'overview', feed: 'discussions', events: 'events', members: 'members', settings: 'settings' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Loads one community by slug or id and reloads it whenever it changes. */
function useCommunityPage(key) {
  const { me, dispatch } = useStore();
  const [s, setS] = useState({ status: 'loading' });
  const current = useRef(null);
  const load = useCallback(async () => {
    try {
      const r = await loadCommunity(key, me.id);
      if (!r) setS({ status: 'missing' });
      else if (r.merged) setS({ status: 'merged', to: r.merged });
      else {
        if (r.members.length) dispatch({ type: 'users/merge', users: r.members.map((m) => ({ id: m.id, name: m.name })), silent: true });
        current.current = r.group.id;
        setS({ status: 'ready', group: r.group });
      }
    } catch (err) {
      // Keep showing the last good copy if a background reload fails.
      setS((prev) => (prev.group ? prev : { status: 'error', message: errorText(err) }));
    }
  }, [key, me.id, dispatch]);
  useEffect(() => { setS({ status: 'loading' }); load(); }, [load]);
  useEffect(() => onCommunityChange((id) => { if (id === current.current) load(); }), [load]);
  return { ...s, reload: load };
}

export default function Community() {
  const { id: key, tab: rawTab } = useParams();
  const page = useCommunityPage(key);
  const tab = TAB_FOR_APP[rawTab] ?? rawTab ?? 'overview';

  if (page.status === 'loading') return <div className="space-y-4" aria-busy="true" aria-label="Loading community"><div className="glass h-44 animate-pulse" /><div className="glass h-64 animate-pulse" /></div>;
  if (page.status === 'merged') return <Navigate to={communityPath(page.to.slug || page.to.id, tab)} replace />;
  if (page.status === 'missing') {
    return <Empty icon="search" title="Community not found">It may have been deleted, or it’s Closed and you’re not a member. <Link to="/groups?tab=discover" className="text-brand-400 underline">Explore communities</Link></Empty>;
  }
  if (page.status === 'error') {
    return (
      <div role="alert" className="glass p-6 text-center text-sm">
        <p className="text-rose-300">{page.message}</p>
        <button className="btn btn-ghost mt-3" onClick={page.reload}>Try again</button>
      </div>
    );
  }
  return <CommunityView g={page.group} tab={tab} keyInUrl={key} />;
}

function CommunityView({ g, tab, keyInUrl }) {
  const { me } = useStore();
  const nav = useNavigate();
  const perms = permsOf(g, me.id);
  const role = roleOf(g, me.id);
  const archived = g.status === 'archived';
  const tabs = TABS.filter((t) => (!t.members || perms.canView) && (!t.admins || perms.canAdmin));
  const current = tabs.some((t) => t.id === tab) ? tab : 'overview';

  // One address per community: an id or an old tab name in the URL becomes the slug and tab.
  const canonical = communityPath(g, current);
  useEffect(() => {
    if (`/c/${encodeURIComponent(keyInUrl)}${tab && tab !== 'overview' ? `/${tab}` : ''}` !== canonical) nav(canonical, { replace: true });
  }, [canonical]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${g.name} · CommunityOne`; }, [g.name]);

  return (
    <div className="space-y-5">
      <header className={`glass overflow-hidden cm-${accentOf(g)}`}>
        <div aria-hidden="true" className="cm-cover h-20 sm:h-24" />
        <div className="-mt-9 flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
          <span className="rounded-[18px] border-4 border-[var(--az-surface)]"><CommunityTile c={g} size={72} /></span>
          <div className="min-w-0 flex-1 basis-60">
            <p className="t-small">A community on CommunityOne</p>
            <h1 className="t-h1">{g.name}</h1>
            {g.description && <p className="text-2 mt-1 line-clamp-2 text-sm">{g.description}</p>}
            <p className="text-3 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {g.type && <span>{g.type}</span>}
              <VisibilityBadge visibility={visibilityOf(g.accessType)} />
              <span>{plural(g.memberCount, 'member')}</span>
              {role && <span className="capitalize">· You: {role}</span>}
              {archived && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-200">Archived</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <JoinButton g={g} className="min-h-10" />
            <ActionsMenu g={g} perms={perms} role={role} />
          </div>
        </div>
        <nav aria-label="Community sections" className="no-scrollbar flex overflow-x-auto border-t border-[var(--az-hairline)] px-2 sm:px-4">
          {tabs.map((t) => (
            <Link key={t.id} to={communityPath(g, t.id)} aria-current={current === t.id ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-3.5 py-3 text-sm transition ${current === t.id ? 'border-[var(--cm)] font-semibold text-white' : 'text-2 border-transparent font-medium hover:text-white'}`}>
              {t.label}
              {t.id === 'members' && perms.canAdmin && g.joinRequests?.length > 0 && <span className="ml-1.5 rounded-full bg-brand-400 px-1.5 text-[10px] font-bold text-ink-950">{g.joinRequests.length}</span>}
            </Link>
          ))}
        </nav>
      </header>

      {archived && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100">This community is archived. It’s read-only and hidden from Explore.</p>}
      {!role && perms.canView && !archived && g.accessType === 'public' && (
        <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">You can read this community. Join to post, reply and RSVP.</p>
      )}

      {current === 'overview' && (perms.canView ? <Overview g={g} perms={perms} /> : <MembersOnly g={g} />)}
      {current === 'discussions' && <FeedList scope={{ type: 'group', id: g.id }} groupId={g.id} readOnly={g.announceOnly} />}
      {current === 'events' && <EventList groupId={g.id} member={!!role && !archived} />}
      {current === 'members' && <Members group={g} perms={perms} />}
      {current === 'about' && <About g={g} />}
      {current === 'settings' && <Settings key={g.id} group={g} />}
    </div>
  );
}

function ActionsMenu({ g, perms, role }) {
  const { me } = useStore();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const leave = useLeaveGroup();
  const lifecycle = useCommunityLifecycle();
  const { patch } = useCommunityWrite();
  const archived = g.status === 'archived';
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const items = [
    perms.canAdmin && !archived && ['Add members', () => setModal('add')],
    perms.canAdmin && ['Edit community', () => setModal('edit')],
    role && !g.allHands && ['Leave community', () => leave(g)],
    perms.canAdmin && !g.allHands && g.id !== NETWORK_COMMUNITY && (archived ? ['Restore community', () => lifecycle.archive(g, false)] : ['Archive community', () => lifecycle.archive(g, true), true]),
    me.admin && !g.allHands && g.id !== NETWORK_COMMUNITY && ['Delete community', () => lifecycle.remove(g), true],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => setOpen(!open)} aria-label="Community actions" aria-expanded={open} aria-haspopup="menu">
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 z-20 mt-2 w-52 p-1.5 text-sm shadow-xl">
          {items.map(([label, fn, danger]) => (
            <button key={label} role="menuitem" onClick={() => { setOpen(false); fn(); }}
              className={`block min-h-10 w-full rounded-lg px-3 text-left hover:bg-white/5 ${danger ? 'text-rose-300' : ''}`}>{label}</button>
          ))}
        </div>
      )}
      {modal === 'add' && <AddMembers group={g} onClose={() => setModal(null)} />}
      {modal === 'edit' && (
        <GroupForm initial={{ name: g.name, description: g.description, type: g.type, accessType: g.accessType, emoji: g.emoji, apps: g.apps }}
          onClose={() => setModal(null)}
          onSave={async (v) => {
            const res = await patch(g, { name: v.name, description: v.description || null, category: v.type, emoji: v.emoji,
              visibility: visibilityOf(v.accessType), settings: { apps: v.apps } }, { ok: 'Community saved', inline: true });
            if (res) setModal(null);
          }} />
      )}
    </div>
  );
}

function MembersOnly({ g }) {
  const closed = g.accessType === 'private';
  return (
    <Empty icon="lock" title="Discussions and events are for members">
      {closed ? 'This community is Closed. Members join by invitation.' : 'Request to join to read its discussions and take part. An admin reviews requests.'}
    </Empty>
  );
}

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`glass flex min-w-0 flex-col gap-3 p-5 ${className}`} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const excerpt = (body, n = 140) => (body.length > n ? `${body.slice(0, n).trimEnd()}…` : body);
const TYPE_LABEL = { announcement: 'announcement', question: 'question', poll: 'poll', post: 'post' };

function Overview({ g, perms }) {
  const feed = useServerFeed({ view: 'all', community: g.id, enabled: true, keep: (p) => p.status === 'published' });
  const [now] = useState(Date.now);
  const { events, loading: eventsLoading } = useEvents({ community: g.id, from: now, to: now + 120 * DAY });
  const published = feed.posts.filter((p) => p.status === 'published');
  const pinned = published.find((p) => p.pinned);
  const recent = published.filter((p) => p !== pinned).slice(0, 3);
  const upcoming = events.flatMap((e) => occurrences(e, now, now + 120 * DAY).slice(0, 1)).sort((a, b) => a.occStart - b.occStart).slice(0, 3);
  const admins = g.admins.filter((id) => id !== g.ownerId).length;
  const { user } = useStore();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {pinned && (
          <Card title="Pinned">
            <Link to={`/post/${pinned.id}`} className="block rounded-lg hover:bg-white/[.03]">
              <p className="text-xs text-slate-400">{pinned.author?.name} · {TYPE_LABEL[pinned.type]}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-200">{excerpt(pinned.body, 280)}</p>
              {pinned.mandatory && <p className="mt-2 text-xs font-semibold text-amber-200">{pinned.mandatory.acked ? 'Mandatory read · you’ve acknowledged it' : 'Mandatory read · open it to acknowledge'}</p>}
            </Link>
          </Card>
        )}
        {perms.canParticipate && !g.announceOnly && <Composer compact communityId={g.id} />}
        <Card title="Recent discussions" action={<Link to={communityPath(g, 'discussions')} className="text-sm text-brand-400 hover:underline">All discussions</Link>}>
          {feed.status === 'loading' && !published.length ? <p className="text-sm text-slate-400">Loading…</p>
            : feed.status === 'error' ? <p className="text-sm text-rose-300">{feed.error} <button className="underline" onClick={feed.reload}>Try again</button></p>
              : recent.length === 0 ? <p className="text-sm text-slate-400">{pinned ? 'Nothing else yet.' : 'No discussions yet.'} {perms.canParticipate && !g.announceOnly ? 'Start one above.' : ''}</p>
                : (
                  <ul className="divide-y divide-[var(--az-hairline)]">
                    {recent.map((p) => (
                      <li key={p.id}>
                        <Link to={`/post/${p.id}`} className="block py-3 first:pt-0 hover:bg-white/[.03]">
                          <p className="text-xs text-slate-400">{p.author?.name} · {TYPE_LABEL[p.type]}</p>
                          <p className="mt-0.5 text-sm text-slate-200">{excerpt(p.body)}</p>
                          <p className="mt-1 text-xs text-slate-500">{plural(p.commentCount, 'reply', 'replies')}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Card title="Upcoming events" action={<Link to={communityPath(g, 'events')} className="text-sm text-brand-400 hover:underline">All</Link>}>
          {eventsLoading && !events.length ? <p className="text-sm text-slate-400">Loading…</p>
            : upcoming.length === 0 ? <p className="text-sm text-slate-400">No upcoming events.</p>
              : (
                <ul className="space-y-3">
                  {upcoming.map((e) => {
                    const d = new Date(e.occStart);
                    return (
                      <li key={`${e.id}-${e.occStart}`}>
                        <Link to={`/events/${e.id}`} className="flex items-center gap-3 rounded-lg hover:bg-white/[.03]">
                          <span className="grid w-11 shrink-0 place-items-center rounded-lg border border-[var(--az-hairline)] py-1 text-center leading-tight">
                            <span className="text-[10px] font-semibold uppercase text-brand-300">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                            <span className="text-base font-bold text-white">{d.getDate()}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-white">{e.title}</span>
                            <span className="block truncate text-xs text-slate-400">{whenText(e)}{e.location ? ` · ${e.location}` : ''}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
        </Card>
        <Card title="Members" action={<Link to={communityPath(g, 'members')} className="text-sm text-brand-400 hover:underline">Directory</Link>}>
          <div className="flex items-center gap-3">
            <AvatarStack ids={g.members} max={5} size={32} />
            <span className="text-sm text-slate-300">{plural(g.memberCount, 'member')}</span>
          </div>
          {g.ownerId && <p className="text-xs text-slate-400">Owner: {user(g.ownerId)?.name ?? 'unknown'}{admins ? ` · ${plural(admins, 'admin')}` : ''}</p>}
        </Card>
        <Card title="About" action={<Link to={communityPath(g, 'about')} className="text-sm text-brand-400 hover:underline">More</Link>}>
          <AboutText g={g} short />
        </Card>
      </div>
    </div>
  );
}

function AboutText({ g, short = false }) {
  const access = ACCESS[g.accessType];
  return (
    <>
      {g.description ? <p className={`text-sm leading-relaxed text-slate-300 ${short ? 'line-clamp-4' : 'whitespace-pre-line'}`}>{g.description}</p>
        : <p className="text-sm text-slate-400">No description yet.</p>}
      {access && <p className="text-xs text-slate-400"><span className="font-semibold text-slate-300">{access.label}:</span> {access.desc}</p>}
    </>
  );
}

function About({ g }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={`About ${g.name}`}>
        <AboutText g={g} />
        {g.type && <p className="text-xs text-slate-400"><span className="font-semibold text-slate-300">Category:</span> {g.type}</p>}
        {g.announceOnly && <p className="text-xs text-slate-400">Only admins post here; members can read, react and reply.</p>}
      </Card>
      <Card title="Community guidelines">
        {g.guidelines ? <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{g.guidelines}</p>
          : <p className="text-sm text-slate-400">This community hasn’t written its own guidelines. CommunityOne’s <Link to="/terms" className="text-brand-400 underline">terms</Link> apply.</p>}
      </Card>
    </div>
  );
}
