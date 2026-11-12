// A community's page (redesign Stage 3): /c/:slug with Overview, Discussions, Learning, Events, Members,
// About and, for its Owners, Admins and Moderators, Manage (Stage 6). Every community has one. The page reads
// the community straight from the server (by slug or id) and re-reads it after every change, so
// what it shows is what the server stored and what this person may see.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { setAdminScope } from '../lib/api.js';
import { isOn, useFeatures } from '../lib/features.js';
import { useStore } from '../lib/store.jsx';
import { accentOf, communityPath, errorText, loadCommunity, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { useServerFeed } from '../lib/feed.js';
import { useEvents } from '../lib/events.js';
import { isUrl, occurrences, whenText } from '../components/events/eventUtils.js';
import { RsvpButtons } from '../components/events/EventCard.jsx';
import { Icon } from '../components/icons.jsx';
import { Avatar, AvatarStack, Empty } from '../components/ui.jsx';
import { CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { ACCESS, permsOf, roleOf } from '../components/groups/helpers.js';
import { useCommunityLifecycle, useCommunityWrite } from '../components/groups/useCommunity.js';
import JoinButton, { useLeaveGroup } from '../components/groups/JoinButton.jsx';
import Composer from '../components/feed/Composer.jsx';
import EventList from '../components/events/EventList.jsx';
import Members from '../components/groups/Members.jsx';
import GroupForm from '../components/groups/GroupForm.jsx';
import AddMembers from '../components/groups/AddMembers.jsx';
import RolePanel from '../components/groups/RolePanel.jsx';
import Resources from '../components/groups/Resources.jsx';
import Discussions from '../components/groups/Discussions.jsx';
import Catalogue from '../components/learning/Catalogue.jsx';
import CoursePage from '../components/learning/CoursePage.jsx';
import Builder from '../components/learning/Builder.jsx';
import Grading from '../components/learning/Grading.jsx';
import Manage, { useQueueCounts } from '../components/manage/Manage.jsx';

const DAY = 864e5;
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'discussions', label: 'Discussions', members: true },
  { id: 'learning', label: 'Learning', members: true },
  { id: 'events', label: 'Events', members: true },
  { id: 'resources', label: 'Resources', members: true },
  { id: 'members', label: 'Members', members: true },
  { id: 'about', label: 'About' },
  // Stage 6: Owners, Admins and Moderators manage the community here (Settings moved inside).
  { id: 'manage', label: 'Manage', mods: true },
];
// Older addresses (/groups/:id/:app) used app names; they map onto these tabs.
export const TAB_FOR_APP = { dashboard: 'overview', feed: 'discussions', events: 'events', members: 'members', settings: 'manage' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Loads one community by slug or id and reloads it whenever it changes. */
function useCommunityPage(key, admin) {
  const { me, dispatch } = useStore();
  const [s, setS] = useState({ status: 'loading' });
  const current = useRef(null);
  const load = useCallback(async () => {
    try {
      const r = await loadCommunity(key, me.id);
      if (!r) setS({ status: 'missing', key });
      else if (r.merged) setS({ status: 'merged', to: r.merged, key });
      else {
        if (r.members.length) dispatch({ type: 'users/merge', users: r.members.map((m) => ({ id: m.id, name: m.name })), silent: true });
        current.current = r.group.id;
        setS({ status: 'ready', group: r.group, key });
      }
    } catch (err) {
      // Keep showing the last good copy if a background reload fails.
      setS((prev) => (prev.group && prev.key === key ? prev : { status: 'error', message: errorText(err), key }));
    }
  }, [key, admin, me.id, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setS({ status: 'loading' }); load(); }, [load]);
  useEffect(() => onCommunityChange((id) => { if (id === current.current) load(); }), [load]);
  return { ...s, reload: load };
}

export default function Community() {
  const { id: key, tab: rawTab, sub: rawSub, mode } = useParams();
  // The old Settings tab now lives at Manage → Settings.
  const sub = rawTab === 'settings' ? 'settings' : rawSub;
  const { me } = useStore();
  const [params] = useSearchParams();
  // Administrative Mode: platform staff open /c/:slug?admin=1 to see a community they aren't in.
  // Set during render, before any request on this page; the server decides and logs every visit.
  const admin = params.get('admin') === '1' && !!me.admin;
  const ids = useRef([]);
  setAdminScope(admin ? [key, ...ids.current] : null);
  useEffect(() => () => setAdminScope(null), []);
  const page = useCommunityPage(key, admin);
  if (page.group) ids.current = [page.group.id, page.group.slug];
  if (admin) setAdminScope([key, ...ids.current]);
  const tab = TAB_FOR_APP[rawTab] ?? rawTab ?? 'overview';

  // Until this address's community has loaded, never draw the previous one under it: its
  // address fix-up would send you back there.
  if (page.status === 'loading' || page.key !== key) return <div className="space-y-4" aria-busy="true" aria-label="Loading community"><div className="glass h-44 animate-pulse" /><div className="glass h-64 animate-pulse" /></div>;
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
  // Re-mounted on entering or leaving Administrative Mode, so nothing loaded as staff lingers.
  return <CommunityView key={admin ? 'admin' : 'member'} g={page.group} tab={tab} sub={sub} mode={mode} admin={admin && page.group.adminMode} />;
}

function CommunityView({ g, tab, sub, mode, admin }) {
  const { me } = useStore();
  const nav = useNavigate();
  const perms = permsOf(g, me.id);
  const role = roleOf(g, me.id);
  const archived = g.status === 'archived';
  const features = useFeatures();
  const tabs = TABS.filter((t) => (!t.members || perms.canView) && (!t.admins || perms.canAdmin) && (!t.mods || perms.canModerate)
    && (t.id !== 'learning' || isOn(features, 'learning')));
  const queue = useQueueCounts(g, perms);
  const current = tabs.some((t) => t.id === tab) ? tab : 'overview';

  // One address per community: an id or an old tab name in the URL becomes the slug and tab.
  // A course (and its builder) lives under the Learning tab: /c/:slug/learning/:course[/edit].
  const rest = (current === 'learning' || current === 'manage') && sub ? `/${encodeURIComponent(sub)}${mode === 'edit' ? '/edit' : ''}` : '';
  const canonical = communityPath(g, current) + rest;
  const q = admin ? '?admin=1' : '';
  // Compared with the real address, so old ones (an id, /groups/…, /settings) are rewritten too.
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (pathname !== canonical) nav(canonical + (search || q), { replace: true });
  }, [canonical, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${g.name} · CommunityOne`; }, [g.name]);

  return (
    <div className={`space-y-6 cm-${accentOf(g)}`}>
      {admin && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm">
          <Icon name="eye" size={18} />
          <span className="min-w-0 flex-1 text-amber-100"><b>Administrative Mode.</b> You’re viewing {g.name} as platform staff, not as a member. Every visit and change is recorded in the activity log.</span>
          <Link to={communityPath(g, current)} className="btn btn-ghost min-h-10">Exit</Link>
        </div>
      )}
      <header className="glass overflow-hidden">
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
            <Link key={t.id} to={communityPath(g, t.id) + q} aria-current={current === t.id ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-3.5 py-3 text-sm transition ${current === t.id ? 'border-[var(--cm)] font-semibold text-white' : 'text-2 border-transparent font-medium hover:text-white'}`}>
              {t.label}
              {t.id === 'manage' && queue.total > 0 && <span className="ml-1.5 rounded-full bg-brand-400 px-1.5 text-[10px] font-bold text-ink-950">{queue.total}</span>}
            </Link>
          ))}
        </nav>
      </header>

      {archived && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100">This community is archived. It’s read-only and hidden from Explore.</p>}
      {!role && perms.canView && !archived && g.accessType === 'public' && (
        <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">You can read this community. Join to post, reply and RSVP.</p>
      )}

      {current === 'overview' && (perms.canView ? <Overview g={g} perms={perms} /> : <MembersOnly g={g} />)}
      {current === 'discussions' && <Discussions g={g} perms={perms} />}
      {current === 'learning' && (!sub ? <Catalogue key={g.id} g={g} /> : sub === 'grading' ? <Grading key={g.id} g={g} />
        : mode === 'edit' ? <Builder key={sub} g={g} id={sub} /> : <CoursePage key={sub} g={g} perms={perms} id={sub} />)}
      {current === 'events' && <EventList groupId={g.id} member={!!role && !archived} />}
      {current === 'resources' && <Resources g={g} />}
      {current === 'members' && <Members group={g} perms={perms} />}
      {current === 'about' && <About g={g} />}
      {current === 'manage' && <Manage g={g} perms={perms} section={sub} />}
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
    perms.canAdmin && !g.allHands && (archived ? ['Restore community', () => lifecycle.archive(g, false)] : ['Archive community', () => lifecycle.archive(g, true), true]),
    me.admin && !g.allHands && ['Delete community', () => lifecycle.remove(g), true],
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
  const { me, user } = useStore();
  const feed = useServerFeed({ view: 'all', community: g.id, enabled: true, keep: (p) => p.status === 'published' });
  const [now] = useState(Date.now);
  const { events, loading: eventsLoading } = useEvents({ community: g.id, from: now, to: now + 120 * DAY });
  const published = feed.posts.filter((p) => p.status === 'published');
  const pinned = published.find((p) => p.pinned);
  const recent = published.filter((p) => p !== pinned).slice(0, 4);
  const upcoming = events.flatMap((e) => occurrences(e, now, now + 120 * DAY).slice(0, 1)).sort((a, b) => a.occStart - b.occStart);
  const [next, ...later] = upcoming;
  const owner = g.ownerId && user(g.ownerId)?.name;
  const admins = g.admins.filter((id) => id !== g.ownerId).map((id) => user(id)?.name).filter(Boolean);
  // New members (first 30 days, nothing posted yet) get a welcome in place of the plain composer.
  const joined = g.myMembership?.joinedAt ? Date.parse(g.myMembership.joinedAt) : null;
  const canPost = perms.canParticipate && !g.announceOnly;
  const loadingFeed = feed.status === 'loading' && !published.length;
  const isNew = canPost && roleOf(g, me.id) === 'member' && joined && now - joined < 30 * DAY && !loadingFeed && !published.some((p) => p.author?.id === me.id);
  // The next event is the screen's one featured item: beside the discussions on wide screens,
  // above them on phones and tablets.
  const nextEvent = (where) => (
        <section aria-labelledby={`next-${where}`} className={next ? 'raised flex flex-col gap-4 p-5' : ''}>
          <span id={`next-${where}`} className={next ? 't-label' : 't-h2 text-white'}>{next ? 'Next event' : 'Events'}</span>
          {eventsLoading && !events.length ? <p className="text-3 text-sm">Loading…</p>
            : !next ? <p className="text-3 mt-2 text-sm">No upcoming events. <Link to={communityPath(g, 'events')} className="text-brand-300 hover:underline">See past events</Link></p>
              : (
                <>
                  <Link to={`/events/${next.id}`} className="flex items-center gap-3 hover:underline">
                    <DateTile at={next.occStart} />
                    <span className="min-w-0"><span className="t-h3 block text-white">{next.title}</span><span className="t-small block">{whenText(next)}{next.location ? ` · ${isUrl(next.location) ? 'Map link' : next.location}` : ''}</span></span>
                  </Link>
                  <RsvpButtons event={next} />
                  {later.length > 0 && (
                    <ul className="list-rows border-t border-[var(--az-divider)] text-sm">
                      {later.slice(0, 2).map((e) => (
                        <li key={`${e.id}-${e.occStart}`}><Link to={`/events/${e.id}`} className="flex justify-between gap-3 py-2.5 hover:underline">
                          <span className="truncate text-white">{e.title}</span><span className="t-small shrink-0">{new Date(e.occStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                        </Link></li>
                      ))}
                    </ul>
                  )}
                  <Link to={communityPath(g, 'events')} className="text-sm text-brand-300 hover:underline">All events</Link>
                </>
              )}
        </section>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        {!g.adminMode && <RolePanel g={g} role={roleOf(g, me.id)} />}
        <div className="lg:hidden">{nextEvent('main')}</div>
        {loadingFeed ? null : isNew ? (
          <section aria-labelledby="welcome-h" className={`cm-${accentOf(g)} flex flex-col gap-3 rounded-2xl border border-[var(--cm-line)] bg-[var(--cm-tint)] p-5 sm:p-6`}>
            <span className="t-label cm-ink">Welcome to {g.name}</span>
            <h2 id="welcome-h" className="t-h2 text-white">Introduce yourself</h2>
            <p className="text-2 text-sm">Say who you are, what you’re working on and what you’d like help with. Introductions are a good way to meet people here.</p>
            <Composer compact communityId={g.id} />
          </section>
        ) : canPost && <Composer compact communityId={g.id} />}
        {pinned && (
          <section aria-labelledby="pin-h" className="band p-5">
            <span id="pin-h" className="t-label">Pinned{pinned.mandatory ? ' · Mandatory Read' : ''}</span>
            <Link to={`/post/${pinned.id}`} className="mt-2 block hover:underline">
              <p className="t-body text-white">{excerpt(pinned.body, 280)}</p>
            </Link>
            <p className="t-small mt-2">{pinned.author?.name}{pinned.mandatory ? (pinned.mandatory.acked ? ' · You’ve acknowledged this' : ' · Open it to acknowledge') : ''}</p>
          </section>
        )}
        <section aria-labelledby="disc-h">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="disc-h" className="t-h2 text-white">Recent discussions</h2>
            <Link to={communityPath(g, 'discussions')} className="text-sm text-brand-300 hover:underline">All discussions</Link>
          </div>
          {feed.status === 'loading' && !published.length ? <p className="text-3 text-sm">Loading…</p>
            : feed.status === 'error' ? <p className="text-sm text-rose-300">{feed.error} <button className="underline" onClick={feed.reload}>Try again</button></p>
              : recent.length === 0 ? <p className="text-3 border-t border-[var(--az-divider)] py-4 text-sm">{pinned ? 'Nothing else yet.' : 'No discussions yet.'} {canPost ? 'Start one above.' : ''}</p>
                : (
                  <ul className="list-rows border-t border-[var(--az-divider)]">
                    {recent.map((p) => (
                      <li key={p.id}>
                        <Link to={`/post/${p.id}`} className="flex gap-3 py-4 hover:bg-white/[.02]">
                          {p.author?.id ? <Avatar user={user(p.author.id) ?? p.author} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--az-sunken)]" />}
                          <span className="min-w-0">
                            <span className="block text-sm"><b className="text-white">{p.author?.name}</b> <span className="text-3">· {TYPE_LABEL[p.type]} · {plural(p.commentCount, 'reply', 'replies')}</span></span>
                            <span className="text-2 mt-0.5 line-clamp-2 block text-[15px] leading-6">{excerpt(p.body)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
        </section>
      </div>
      <aside className="flex min-w-0 flex-col gap-8">
        <div className="hidden lg:block">{nextEvent('side')}</div>
        <section aria-labelledby="ppl-h">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="ppl-h" className="t-h2 text-white">People</h2>
            <Link to={communityPath(g, 'members')} className="text-sm text-brand-300 hover:underline">Directory</Link>
          </div>
          <div className="flex items-center gap-3">
            <AvatarStack ids={g.members} max={5} size={32} />
            <span className="text-2 text-sm">{plural(g.memberCount, 'member')}</span>
          </div>
          {owner && <p className="text-2 mt-3 text-sm leading-6">Run by {owner}{admins.length ? ` with ${listText(admins)}` : ''}.</p>}
        </section>
        <section aria-labelledby="about-h">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="about-h" className="t-h2 text-white">About</h2>
            <Link to={communityPath(g, 'about')} className="text-sm text-brand-300 hover:underline">{g.guidelines ? 'Guidelines' : 'More'}</Link>
          </div>
          <AboutText g={g} short />
        </section>
      </aside>
    </div>
  );
}

const listText = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

function DateTile({ at }) {
  const d = new Date(at);
  return (
    <span className="grid w-14 shrink-0 place-items-center rounded-xl border border-[var(--cm-line,var(--az-hairline))] py-1.5 text-center">
      <span className="cm-ink text-[11px] font-bold uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <span className="text-xl font-bold leading-7 text-white">{d.getDate()}</span>
    </span>
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
