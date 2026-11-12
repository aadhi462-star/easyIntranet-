// A community's page (v2 workstream E, boards V2EOverview, V2EPhone and V2EPhoneVisitor): /c/:slug
// with the header (cover, logo, name, facts, one primary action, the actions menu) and the
// sections the community has switched on (E1): Overview, Discussions, Learning, Events,
// Resources, Members, About and, for Owners, Admins and Moderators, Manage. The page reads the
// community from the server (by slug or id) and re-reads it after every change, so what it shows
// is what the server stored and what this person may see.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, setAdminScope } from '../lib/api.js';
import { isOn, useFeatures } from '../lib/features.js';
import { timeAgo, useStore } from '../lib/store.jsx';
import { accentOf, communityPath, errorText, loadCommunity, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { managePath } from '../lib/manage.js';
import { useServerFeed } from '../lib/feed.js';
import { useEvents } from '../lib/events.js';
import { coursePath, lessonPath, useCatalogue } from '../lib/learning.js';
import { toast } from '../lib/toast.js';
import { isUrl, occurrences, whenText } from '../components/events/eventUtils.js';
import { RsvpButtons } from '../components/events/EventCard.jsx';
import { Icon } from '../components/icons.jsx';
import { AvatarStack } from '../components/ui.jsx';
import { Badge } from '../components/ui/Controls.jsx';
import { CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { ACCESS, permsOf, roleOf } from '../components/groups/helpers.js';
import { useCommunityLifecycle } from '../components/groups/useCommunity.js';
import JoinButton, { useLeaveGroup } from '../components/groups/JoinButton.jsx';
import Composer from '../components/feed/Composer.jsx';
import EventList from '../components/events/EventList.jsx';
import Members from '../components/groups/Members.jsx';
import AddMembers from '../components/groups/AddMembers.jsx';
import RolePanel from '../components/groups/RolePanel.jsx';
import Resources from '../components/groups/Resources.jsx';
import Discussions from '../components/groups/Discussions.jsx';
import Catalogue from '../components/learning/Catalogue.jsx';
import CoursePage from '../components/learning/CoursePage.jsx';
import Builder from '../components/learning/Builder.jsx';
import Grading from '../components/learning/Grading.jsx';
import Teaching from '../components/teaching/Teaching.jsx';
import Manage, { useQueueCounts } from '../components/manage/Manage.jsx';
import { Progress } from '../components/learning/bits.jsx';

const DAY = 864e5;
// `section`: switched on or off by the community (E1); Overview, Members and About always show.
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'discussions', label: 'Discussions', members: true, section: 'discussions' },
  { id: 'learning', label: 'Learning', members: true, section: 'learning' },
  { id: 'events', label: 'Events', members: true, section: 'events' },
  { id: 'resources', label: 'Resources', members: true, section: 'resources' },
  { id: 'members', label: 'Members', members: true },
  { id: 'about', label: 'About' },
  // Stage 6: Owners, Admins and Moderators manage the community here (Settings moved inside).
  { id: 'manage', label: 'Manage', mods: true },
];
// Older addresses (/groups/:id/:app) used app names; they map onto these tabs.
export const TAB_FOR_APP = { dashboard: 'overview', feed: 'discussions', events: 'events', members: 'members', settings: 'manage' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', instructor: 'Instructor', teaching_assistant: 'Teaching assistant', member: 'Member' };
/** Whether a section is on: no stored list means every section is on. */
const sectionOn = (g, id) => !g.sections || g.sections[id] !== false;

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
  if (page.status === 'loading' || page.key !== key) {
    return <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading community"><span className="skeleton h-44 !rounded-2xl" /><span className="skeleton h-64 !rounded-2xl" /></div>;
  }
  if (page.status === 'merged') return <Navigate to={communityPath(page.to.slug || page.to.id, tab)} replace />;
  if (page.status === 'missing') {
    return (
      <div className="panel flex flex-col items-center gap-2 p-10 text-center">
        <Icon name="search" size={28} className="text-[var(--az-text-2)]" />
        <h1 className="t-h2">Community not found</h1>
        <p className="max-w-md text-sm text-[var(--az-text-2)]">It may have been deleted, or it’s Closed and you’re not a member.</p>
        <Link to="/explore" className="btn btn-secondary mt-2">Explore communities</Link>
      </div>
    );
  }
  if (page.status === 'error') {
    return (
      <div role="alert" className="panel flex flex-col items-center gap-3 p-6 text-center">
        <p>{page.message}</p>
        <button type="button" className="btn btn-secondary" onClick={page.reload}>Try again</button>
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
  const tabs = TABS.filter((t) => (!t.members || perms.canView) && (!t.mods || perms.canModerate)
    && (!t.section || sectionOn(g, t.section)) && (t.id !== 'learning' || isOn(features, 'learning')));
  const queue = useQueueCounts(g, perms);
  // A switched-off section's address goes to Overview (E1).
  const current = tabs.some((t) => t.id === tab) ? tab : 'overview';

  // One address per community: an id or an old tab name in the URL becomes the slug and tab.
  // A course (and its builder) lives under the Learning tab: /c/:slug/learning/:course[/edit].
  // Manage keeps a settings section too: /c/:slug/manage/settings/:section (G1).
  const tail = current === 'manage' ? (mode ? `/${encodeURIComponent(mode)}` : '') : mode === 'edit' ? '/edit' : '';
  const rest = (current === 'learning' || current === 'manage') && sub ? `/${encodeURIComponent(sub)}${tail}` : '';
  const canonical = communityPath(g, current) + rest;
  const q = admin ? '?admin=1' : '';
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (pathname !== canonical) nav(canonical + (search || q), { replace: true });
  }, [canonical, pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${g.name} · CommunityOne`; }, [g.name]);

  return (
    <div className={`flex flex-col gap-6 cm-${accentOf(g)}`}>
      <PhoneBar g={g} perms={perms} role={role} />
      {admin && (
        <div role="status" className="notice notice-warn flex flex-wrap items-center gap-3">
          <Icon name="eye" size={18} />
          <span className="min-w-0 flex-1"><b>Administrative Mode.</b> You’re viewing {g.name} as platform staff, not as a member. Every visit and change is recorded in the activity log.</span>
          <Link to={communityPath(g, current)} className="btn btn-secondary btn-sm">Exit</Link>
        </div>
      )}
      <Header g={g} perms={perms} role={role} tabs={tabs} current={current} queue={queue} q={q} />

      {archived && <p className="notice notice-warn">This community is archived. It’s read-only and hidden from Explore.</p>}
      {!role && perms.canView && !archived && g.accessType === 'public' && (
        <p className="notice notice-info">You can read this community. Join to post, reply and RSVP.</p>
      )}

      {current === 'overview' && (perms.canView ? <Overview g={g} perms={perms} /> : <MembersOnly g={g} />)}
      {current === 'discussions' && <Discussions g={g} perms={perms} />}
      {current === 'learning' && (!sub ? <Catalogue key={g.id} g={g} /> : sub === 'grading' ? <Grading key={g.id} g={g} />
        : sub === 'teaching' ? <Teaching key={g.id} g={g} perms={perms} />
        : mode === 'edit' ? <Builder key={sub} g={g} id={sub} /> : <CoursePage key={sub} g={g} perms={perms} id={sub} />)}
      {current === 'events' && <EventList groupId={g.id} member={!!role && !archived} />}
      {current === 'resources' && <Resources g={g} />}
      {current === 'members' && <Members group={g} perms={perms} />}
      {current === 'about' && <About g={g} />}
      {current === 'manage' && <Manage g={g} perms={perms} section={sub} sub={mode} />}
    </div>
  );
}

/**
 * The header shared by every section: cover (or a flat accent band), logo (or the lettered
 * tile), name, description, facts, one primary action at most and the actions menu (E12).
 */
function Header({ g, perms, role, tabs, current, queue, q }) {
  const archived = g.status === 'archived';
  const requested = (g.joinRequests || []).length > 0 && !role;
  return (
    <header className="panel overflow-hidden" aria-labelledby="c-name">
      {g.coverUrl
        ? <img src={g.coverUrl} alt={`${g.name} cover image`} className="aspect-[4/1] w-full object-cover max-sm:aspect-[390/96]" />
        : <div aria-hidden="true" className="cm-cover h-16 sm:h-24" />}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 pb-4 sm:px-6 sm:pb-5">
        <span className="-mt-8 rounded-[18px] border-[3px] border-[var(--az-surface)] bg-[var(--az-surface)] sm:-mt-10">
          {g.logoUrl
            ? <img src={g.logoUrl} alt={`${g.name} logo`} className="h-[60px] w-[60px] rounded-2xl object-cover sm:h-[72px] sm:w-[72px]" />
            : <span role="img" aria-label={`${g.name} logo`} className="block"><CommunityTile c={g} size={72} /></span>}
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h1 id="c-name" className="t-h1 max-sm:!text-[22px] max-sm:!leading-[30px]">{g.name}</h1>
          {g.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--az-text-2)]">{g.description}</p>}
          <p className="t-small mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            {g.type && <span>{g.type}</span>}
            <VisibilityBadge visibility={visibilityOf(g.accessType)} />
            <span>{plural(g.memberCount, 'member')}</span>
            {role && <Badge tone="ok" icon="check">{role === 'member' ? 'Member' : `Member · ${ROLE_LABEL[role] ?? role}`}</Badge>}
            {requested && <Badge tone="info">Requested</Badge>}
            {archived && <Badge tone="warn">Read-only</Badge>}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {/* One primary action, only for people who aren't members (E12). */}
          {!role && <JoinButton g={g} className="max-sm:flex-1" />}
          <span className="max-lg:hidden"><ActionsMenu g={g} perms={perms} role={role} /></span>
        </div>
        {!role && g.accessType === 'restricted' && !requested && <p className="t-small w-full sm:hidden">An admin reviews your request. You’ll get a notification when they decide.</p>}
      </div>
      {/* No section tabs before joining a Private or Closed community: only what its card shows (VIS-01). */}
      {tabs.length > 1 && perms.canView && (
        <nav aria-label="Community sections" className="no-scrollbar flex overflow-x-auto border-t border-[var(--az-hairline)] px-2 sm:px-4">
          {tabs.map((t) => (
            <Link key={t.id} to={communityPath(g, t.id) + q} aria-current={current === t.id ? 'page' : undefined}
              ref={current === t.id ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm ${current === t.id ? 'border-[var(--cm-ink)] font-semibold text-[var(--az-text)]' : 'border-transparent font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
              {t.label}
              {t.id === 'manage' && queue.total > 0 && <span className="relative grid h-5 min-w-5 place-items-center rounded-full bg-[var(--az-ok)] px-1.5 text-xs font-bold text-[var(--az-on-fill)]"><span className="sr-only">waiting: </span>{queue.total}</span>}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/**
 * Phones: inside a community the page has its own top bar (Back, the community's name, Search,
 * Actions) in place of the app's (V2EPhone). The app's bar comes back on leaving the community.
 */
function PhoneBar({ g, perms, role }) {
  const back = role ? ['/communities', 'Back to My Communities'] : ['/explore', 'Back to Explore'];
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-6 flex h-14 items-center gap-1 border-b border-[var(--az-hairline)] bg-[var(--az-surface)] px-2 sm:-mx-6 lg:hidden">
      <Link to={back[0]} className="btn btn-ghost btn-icon" aria-label={back[1]}><Icon name="back" size={22} /></Link>
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{g.name}</span>
      <Link to="/search" className="btn btn-ghost btn-icon" aria-label="Search"><Icon name="search" size={20} /></Link>
      <ActionsMenu g={g} perms={perms} role={role} />
    </div>
  );
}

/** Rare actions, built from what this person may do (E12). */
function ActionsMenu({ g, perms, role }) {
  const { me } = useStore();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const leave = useLeaveGroup();
  const lifecycle = useCommunityLifecycle();
  const archived = g.status === 'archived';
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${communityPath(g)}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  };
  const leaveIt = async () => {
    if (role === 'owner') { toast('Transfer ownership in Manage, Members before you leave.', 'error'); return; }
    leave(g);
  };
  const admin = perms.canAdmin && !g.allHands ? [
    !archived && ['Invite people', () => setAdding(true)],
    ['Community settings', () => nav(managePath(g, 'settings'))],
    ['Branding', () => nav(managePath(g, 'branding'))],
    archived ? ['Restore community', () => lifecycle.archive(g, false)] : ['Archive community', () => lifecycle.archive(g, true)],
  ].filter(Boolean) : [];
  const general = [
    role && !g.allHands && ['Leave community', leaveIt, 'danger'],
    me.admin && !g.allHands && ['Delete community', () => lifecycle.remove(g), 'danger'],
  ].filter(Boolean);
  const item = ([label, fn, tone]) => (
    <button key={label} type="button" role="menuitem" onClick={() => { setOpen(false); fn(); }}
      className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-[var(--az-sunken)] ${tone === 'danger' ? 'text-[var(--az-danger)]' : ''}`}>{label}</button>
  );
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn btn-ghost btn-icon" onClick={() => setOpen(!open)} aria-label="Community actions" aria-expanded={open} aria-haspopup="menu">
        <Icon name="more" size={20} />
      </button>
      {open && (
        <div role="menu" aria-label="Community actions" className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]">
          {item(['Copy link', copyLink])}
          {admin.length > 0 && <div role="group" aria-label="Admin" className="mt-1.5 border-t border-[var(--az-hairline)] pt-1.5"><div className="t-label px-3 py-1">Admin</div>{admin.map(item)}</div>}
          {general.length > 0 && <div className="mt-1.5 border-t border-[var(--az-hairline)] pt-1.5">{general.map(item)}</div>}
        </div>
      )}
      {adding && <AddMembers group={g} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** A visitor to a Private or Closed community sees only what its card shows (VIS-01). */
function MembersOnly({ g }) {
  const closed = g.accessType === 'private';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="mo-h" className="panel flex gap-3 p-5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--az-sunken)] text-[var(--az-text-2)]"><Icon name="lock" size={18} /></span>
        <span className="min-w-0">
          <h2 id="mo-h" className="t-h3">For members only</h2>
          <span className="block text-sm text-[var(--az-text-2)]">{closed ? 'This community is Closed. Members join by invitation.' : 'Discussions, events, resources and the member list open once your request is approved.'}</span>
        </span>
      </section>
      <section aria-labelledby="mo-about" className="panel flex flex-col gap-2 p-5">
        <h2 id="mo-about" className="t-h3">About</h2>
        <AboutText g={g} />
      </section>
    </div>
  );
}

function Section({ id, title, link, children, className = '' }) {
  return (
    <section aria-labelledby={id} className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="t-h2">{title}</h2>
        {link}
      </div>
      {children}
    </section>
  );
}

function Failed({ what, onRetry }) {
  return (
    <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-2">
      <span>{what} didn’t load. The rest of the page still works.</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>
    </div>
  );
}

const excerpt = (body, n = 140) => (body.length > n ? `${body.slice(0, n).trimEnd()}…` : body);
const at = (v) => (typeof v === 'number' ? v : Date.parse(v));
const dayText = (v) => new Date(at(v)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Overview (E7): the next event is the one featured item (beside the content on wide screens,
 * first on phones); then announcements (an unacknowledged Mandatory Read first), featured
 * discussions (pinned, up to three), recent activity, learning and people. A section with
 * nothing in it is left out for everyone. Each loads on its own; one failing never blanks the page.
 */
function Overview({ g, perms }) {
  const { me } = useStore();
  const features = useFeatures();
  const feed = useServerFeed({ view: 'all', community: g.id, enabled: sectionOn(g, 'discussions'), keep: (p) => p.status === 'published' });
  const [now] = useState(Date.now);
  const showEvents = sectionOn(g, 'events');
  const showLearning = sectionOn(g, 'learning') && isOn(features, 'learning');
  const events = useEvents({ community: g.id, from: now - 60 * DAY, to: now + 120 * DAY, skip: !showEvents });
  const published = feed.posts.filter((p) => p.status === 'published');
  const canPost = perms.canParticipate && !g.announceOnly && sectionOn(g, 'discussions');
  const upcoming = events.events.flatMap((e) => occurrences(e, now, now + 120 * DAY).slice(0, 1)).sort((a, b) => a.occStart - b.occStart);

  const next = showEvents && <NextEvent g={g} upcoming={upcoming} loading={events.loading} />;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-8">
        {!g.adminMode && <RolePanel g={g} role={roleOf(g, me.id)} />}
        {next && <div className="lg:hidden">{next}</div>}
        {feed.status === 'error' && <Failed what="Discussions" onRetry={feed.reload} />}
        <Announcements g={g} posts={published} />
        {canPost && <Composer compact communityId={g.id} />}
        <Featured g={g} posts={published} />
        <Activity g={g} posts={published} events={showEvents ? events.events : []} learning={showLearning} feedReady={feed.status !== 'loading'} />
      </div>
      <aside className="flex min-w-0 flex-col gap-8">
        {next && <div className="hidden lg:block">{next}</div>}
        {showLearning && <LearningCard g={g} />}
        <People g={g} />
        <Section id="ov-about" title="About" link={<Link to={communityPath(g, 'about')} className="link text-sm">{g.guidelines ? 'Guidelines' : 'More'}</Link>}>
          <AboutText g={g} short />
        </Section>
      </aside>
    </div>
  );
}

function DateTile({ at: when }) {
  const d = new Date(when);
  return (
    <span className="grid w-14 flex-none place-items-center rounded-xl border border-[var(--cm-line)] bg-[var(--az-surface)] py-1.5 text-center">
      <b className="cm-ink text-xs font-bold uppercase tracking-wide">{d.toLocaleDateString(undefined, { month: 'short' })}</b>
      <span className="text-[15px] font-bold leading-6">{d.getDate()}</span>
    </span>
  );
}

/** The page's one featured item, with RSVP in place. */
function NextEvent({ g, upcoming, loading }) {
  const [next, ...later] = upcoming;
  if (loading && !next) return <span className="skeleton block h-40 !rounded-2xl" aria-busy="true" aria-label="Loading events" />;
  if (!next) return null;
  return (
    <section aria-labelledby="next-h" className="panel flex flex-col gap-4 p-5 shadow-[var(--az-shadow)]">
      <span id="next-h" className="t-label cm-ink">Next event</span>
      <Link to={`/events/${next.id}`} className="flex items-center gap-3 hover:underline">
        <DateTile at={next.occStart} />
        <span className="min-w-0"><span className="t-h3 block">{next.title}</span><span className="t-small block">{whenText(next)}{next.location ? ` · ${isUrl(next.location) ? 'Map link' : next.location}` : ''}</span></span>
      </Link>
      {next.description && <p className="line-clamp-2 text-sm text-[var(--az-text-2)]">{next.description}</p>}
      <RsvpButtons event={next} />
      {later.length > 0 && (
        <ul className="divide-y divide-[var(--az-hairline)] border-t border-[var(--az-hairline)] text-sm">
          {later.slice(0, 2).map((e) => (
            <li key={`${e.id}-${e.occStart}`}><Link to={`/events/${e.id}`} className="flex justify-between gap-3 py-2.5 hover:underline">
              <span className="truncate">{e.title}</span><span className="t-small flex-none">{dayText(e.occStart)}</span>
            </Link></li>
          ))}
        </ul>
      )}
      <Link to={communityPath(g, 'events')} className="link text-sm">All events</Link>
    </section>
  );
}

/** Announcements and Mandatory Reads: an unacknowledged one leads. Hidden when there are none. */
function Announcements({ g, posts }) {
  const list = posts.filter((p) => p.type === 'announcement' || p.mandatory)
    .sort((a, b) => (Number(!!b.mandatory && !b.mandatory.acked) - Number(!!a.mandatory && !a.mandatory.acked)) || at(b.createdAt) - at(a.createdAt));
  if (!list.length) return null;
  const [lead, ...earlier] = list;
  const m = lead.mandatory;
  return (
    <Section id="ann-h" title="Announcements" link={<Link to={communityPath(g, 'discussions')} className="link text-sm">All announcements</Link>}>
      <article className="panel flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {m && <Badge tone="warn" icon="alert">Mandatory read</Badge>}
          <span className="t-small">{lead.author?.name} · {timeAgo(at(lead.createdAt))}</span>
        </div>
        <Link to={`/post/${lead.id}`} className="line-clamp-3 text-[15px] leading-6 hover:underline">{lead.body}</Link>
        {m && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="t-small">
              {m.deadline ? `Due ${dayText(m.deadline)} · ` : ''}{m.acked ? 'You’ve acknowledged this' : 'You haven’t acknowledged it yet'}
              {m.ackCount != null && ` · ${m.ackCount} of ${g.memberCount} have acknowledged`}
            </span>
            {!m.acked && <Link to={`/post/${lead.id}`} className="btn btn-primary btn-sm">Read and acknowledge</Link>}
          </div>
        )}
      </article>
      {earlier.length > 0 && (
        <div>
          <h3 className="t-label mb-1">Earlier</h3>
          <ul className="divide-y divide-[var(--az-hairline)]">
            {earlier.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link to={`/post/${p.id}`} className="min-w-0 truncate hover:underline">{excerpt(p.body, 90)}</Link>
                <span className="t-small flex-none">{dayText(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** Featured discussions are the pinned posts, up to three (E8). */
function Featured({ g, posts }) {
  const pinned = posts.filter((p) => p.pinned && p.type !== 'announcement' && !p.mandatory).slice(0, 3);
  if (!pinned.length) return null;
  return (
    <Section id="feat-h" title="Featured discussions" link={<Link to={communityPath(g, 'discussions')} className="link text-sm">All discussions</Link>}>
      <ul className="panel divide-y divide-[var(--az-hairline)]">
        {pinned.map((p) => (
          <li key={p.id} className="flex flex-col gap-1.5 px-5 py-4">
            <span className="flex flex-wrap gap-2"><Badge tone="neutral" icon="pinned">Pinned</Badge>{p.type === 'poll' && <Badge tone="neutral" icon="poll">Poll</Badge>}{p.topic && <Badge tone="neutral">{p.topic.name}</Badge>}</span>
            <Link to={`/post/${p.id}`} className="t-h3 line-clamp-2 hover:underline">{excerpt(p.body, 160)}</Link>
            <span className="t-small">{p.author?.name} · {plural(p.commentCount, 'reply', 'replies')}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * Recent activity, built from the existing lists (no activity table): the first page of
 * discussions, events, resources and courses this viewer can open, merged by time, newest 8.
 */
function Activity({ g, posts, events, learning, feedReady }) {
  const showResources = sectionOn(g, 'resources');
  const [res, setRes] = useState({ status: showResources ? 'loading' : 'off', list: [] });
  const loadRes = useCallback(() => {
    if (!showResources) return;
    setRes((s) => ({ ...s, status: 'loading' }));
    api(`/communities/${encodeURIComponent(g.id)}/resources?sort=newest`).then((d) => setRes({ status: 'ready', list: d.resources ?? [] }), () => setRes({ status: 'error', list: [] }));
  }, [g.id, showResources]);
  useEffect(() => { loadRes(); }, [loadRes]);
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    if (!learning) return;
    api(`/communities/${encodeURIComponent(g.id)}/courses`).then((d) => setCourses(d.courses ?? []), () => setCourses([]));
  }, [g.id, learning]);

  const items = [
    ...posts.map((p) => ({ key: `p${p.id}`, when: at(p.createdAt), who: p.author?.name, verb: 'started a discussion:', text: excerpt(p.body, 80), to: `/post/${p.id}`, where: p.topic?.name, icon: 'channels' })),
    ...events.filter((e) => e.createdAt).map((e) => ({ key: `e${e.id}`, when: at(e.createdAt), who: e.host?.name, verb: 'scheduled', text: e.title, to: `/events/${e.id}`, where: 'Events', icon: 'events' })),
    ...res.list.map((r) => ({ key: `r${r.id}`, when: at(r.createdAt), who: r.addedBy?.name, verb: 'added a resource:', text: r.title, to: communityPath(g, 'resources'), where: 'Resources', icon: 'doc' })),
    ...courses.filter((c) => c.status === 'published' && c.publishedAt).map((c) => ({ key: `c${c.id}`, when: at(c.publishedAt), who: c.instructors?.[0]?.name, verb: 'published a course:', text: c.title, to: coursePath(g, c.id), where: 'Learning', icon: 'cap' })),
  ].filter((x) => Number.isFinite(x.when)).sort((a, b) => b.when - a.when).slice(0, 8);
  if (!feedReady && !items.length) return <span className="skeleton block h-48 !rounded-2xl" aria-busy="true" aria-label="Loading recent activity" />;
  if (!items.length) return res.status === 'error' ? <Failed what="Recent activity" onRetry={loadRes} /> : null;
  const more = [['discussions', 'Discussions'], ['events', 'Events'], ['resources', 'Resources'], ...(learning ? [['learning', 'Learning']] : [])].filter(([id]) => sectionOn(g, id));
  return (
    <Section id="act-h" title="Recent activity">
      <ul className="panel divide-y divide-[var(--az-hairline)]">
        {items.map((x) => (
          <li key={x.key} className="flex gap-3 px-5 py-3.5">
            <Icon name={x.icon} size={18} className="mt-0.5 text-[var(--az-text-2)]" />
            <span className="min-w-0 text-sm leading-6">
              {x.who && <b className="font-semibold">{x.who}</b>} {x.verb} <Link to={x.to} className="link">{x.text}</Link>
              <span className="t-small block">{timeAgo(x.when)}{x.where ? ` · ${x.where}` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="t-small">More in {more.map(([id, label], i) => <span key={id}>{i ? ' · ' : ''}<Link to={communityPath(g, id)} className="link">{label}</Link></span>)}</p>
    </Section>
  );
}

/** Learning: shown only when the section is on; Continue appears for an enrolled learner. */
function LearningCard({ g }) {
  const cat = useCatalogue(g.id);
  if (cat.status !== 'ready' || !cat.courses.length) return null;
  const going = cat.courses.find((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt);
  const published = cat.courses.filter((c) => c.status === 'published').length;
  return (
    <Section id="ov-learn" title="Learning" link={<Link to={communityPath(g, 'learning')} className="link text-sm">All courses</Link>}>
      {going && (
        <div className="panel flex flex-col gap-2 p-4">
          <span className="t-label">Continue where you left off</span>
          <Link to={coursePath(g, going.id)} className="t-h3 hover:underline">{going.title}</Link>
          {going.progress && <><Progress p={going.progress} label={`${going.title} progress`} /><span className="t-small">{going.progress.done} of {going.progress.total} lessons</span></>}
          {going.nextLessonId && <Link to={lessonPath(going.nextLessonId)} className="btn btn-secondary btn-sm self-start">Continue</Link>}
        </div>
      )}
      <p className="t-small">{plural(published, 'course')} in {g.name}</p>
    </Section>
  );
}

const listText = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** People: members only; who runs it comes from the Owner and Admin roles. */
function People({ g }) {
  const { user } = useStore();
  const owner = g.ownerId && user(g.ownerId)?.name;
  const admins = g.admins.filter((id) => id !== g.ownerId).map((id) => user(id)?.name).filter(Boolean);
  return (
    <Section id="ov-ppl" title="People" link={<Link to={communityPath(g, 'members')} className="link text-sm">Directory</Link>}>
      <div className="flex items-center gap-3">
        <AvatarStack ids={g.members} max={5} size={32} />
        <span className="text-sm text-[var(--az-text-2)]">{plural(g.memberCount, 'member')}</span>
      </div>
      {owner && <p className="text-sm leading-6 text-[var(--az-text-2)]">Run by {owner}{admins.length ? ` with ${listText(admins)}` : ''}.</p>}
    </Section>
  );
}

function AboutText({ g, short = false }) {
  const access = ACCESS[g.accessType];
  return (
    <>
      {g.description ? <p className={`text-sm leading-relaxed ${short ? 'line-clamp-4' : 'whitespace-pre-line'}`}>{g.description}</p>
        : <p className="t-small">No description yet.</p>}
      {g.audience && <p className="t-small"><b className="font-semibold text-[var(--az-text)]">Who this is for:</b> {g.audience}</p>}
      {access && <p className="t-small"><b className="font-semibold text-[var(--az-text)]">{access.label}:</b> {access.desc}</p>}
    </>
  );
}

function About({ g }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="about-h" className="panel flex flex-col gap-3 p-5">
        <h2 id="about-h" className="t-h2">About {g.name}</h2>
        <AboutText g={g} />
        {g.type && <p className="t-small"><b className="font-semibold text-[var(--az-text)]">Category:</b> {g.type}</p>}
        {g.announceOnly && <p className="t-small">Only admins start discussions here; members can read, react and reply.</p>}
      </section>
      <section aria-labelledby="guide-h" className="panel flex flex-col gap-3 p-5">
        <h2 id="guide-h" className="t-h2">Community guidelines</h2>
        {g.guidelines ? <p className="whitespace-pre-line text-sm leading-relaxed">{g.guidelines}</p>
          : <p className="t-small">This community hasn’t written its own guidelines. CommunityOne’s <Link to="/terms" className="link">Terms of Service</Link> apply.</p>}
      </section>
    </div>
  );
}

