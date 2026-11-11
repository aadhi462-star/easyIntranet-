// CommunityOne app shell (redesign Stage 1, docs/communityone/REDESIGN_BRIEF.md):
// - desktop (≥1024px): a fixed platform sidebar and a top bar with search, Create and account;
// - phone and tablet: a compact top bar and a bottom bar (Home, Explore, Communities, Events, Profile).
// Only platform-level destinations live here; each community keeps its own navigation inside
// its page. Features that aren't re-homed yet (Feed, People, Calendar) sit under "More" until
// Stages 3–4 move them into communities; parked modules (decision D2) are reachable by URL only.
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isRead, useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { fetchMyCommunities } from '../lib/feed.js';
import { communityPath } from '../lib/communities.js';
import { Avatar, Logo, ThemeToggle } from './ui.jsx';
import { Icon } from './icons.jsx';
import Toaster from './Toaster.jsx';
import { CommunityTile } from './public/CommunityCards.jsx';

const PRIMARY = [
  { id: 'home', label: 'Home', icon: 'home', to: '/dashboard', match: (p) => p === '/dashboard' },
  { id: 'explore', label: 'Explore', icon: 'explore', to: '/groups?tab=discover', match: (p, q) => p === '/groups' && q.get('tab') === 'discover' },
  { id: 'communities', label: 'My Communities', short: 'Communities', icon: 'groups', to: '/groups', match: (p, q) => (p.startsWith('/groups') && q.get('tab') !== 'discover') || p.startsWith('/c/') },
  { id: 'events', label: 'Events', icon: 'events', to: '/events', match: (p) => p.startsWith('/events') },
];
const MORE = [
  { id: 'feed', label: 'Feed', icon: 'feeds', to: '/feed', match: (p) => p.startsWith('/feed') || p.startsWith('/post/') },
  { id: 'people', label: 'People', icon: 'people', to: '/people', match: (p) => p === '/people' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', to: '/calendar', match: (p) => p === '/calendar' },
];

/** Page titles: "<section> · CommunityOne". */
// Community pages and the community lists name the tab themselves.
const OWN_TITLE = ['/c/', '/groups', '/search'];
const TITLES = [['/dashboard', 'Home'], ['/events', 'Events'], ['/feed', 'Feed'], ['/post/', 'Post'], ['/people', 'People'],
  ['/calendar', 'Calendar'], ['/notifications', 'Notifications'], ['/search', 'Search'], ['/admin', 'Platform Admin']];

function useMyCommunities(me) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => fetchMyCommunities().then((c) => live && setList(c)).catch(() => {});
    load();
    // Joining or leaving anywhere updates the list (the cache is cleared first in lib/feed.js).
    window.addEventListener('c1-session-changed', load);
    window.addEventListener('c1-community-changed', load);
    return () => { live = false; window.removeEventListener('c1-session-changed', load); window.removeEventListener('c1-community-changed', load); };
  }, [me?.id]);
  return list;
}

function NavItem({ item, active }) {
  return (
    <Link to={item.to} aria-current={active ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${active ? 'bg-white/[0.08] font-semibold text-white' : 'font-medium text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
      <Icon name={item.icon} size={18} className={active ? 'text-brand-300' : ''} />{item.label}
    </Link>
  );
}

// Lettered tile until communities have uploaded logos: "Bengaluru Chapter" → BC, "AlumniZone" → AZ.

export default function Layout() {
  const { state, me, dispatch } = useStore();
  const [menu, setMenu] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const query = new URLSearchParams(loc.search);
  const communities = useMyCommunities(me);
  const unread = state.notifications.filter((n) => !isRead(n, me.id) && (!n.userId || n.userId === me.id) && (!n.adminOnly || me.admin)).length;
  const hidden = me.admin ? [] : (state.settings.hiddenModules || []);
  const more = MORE.filter((m) => !hidden.includes(m.id));
  const mainRef = useRef(null);
  const searchRef = useRef(null);
  const isActive = (item) => item.match(loc.pathname, query);

  // On navigation: close menus, start the new page at the top, name the tab after the section.
  useEffect(() => {
    setMenu(false); setCreateOpen(false);
    window.scrollTo({ top: 0 });
    if (OWN_TITLE.some((p) => loc.pathname.startsWith(p))) return;
    const t = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1];
    document.title = t ? `${t} · CommunityOne` : 'CommunityOne';
  }, [loc.pathname, loc.search]);

  // "/" jumps to search from anywhere except while typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('[aria-modal="true"]')) return; // the search box is behind the dialog
      if (!searchRef.current?.offsetParent) return; // hidden on phones (search is a page there)
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close popovers on an outside click or Escape.
  const accountRef = useRef(null);
  const createRef = useRef(null);
  useEffect(() => {
    if (!menu && !createOpen) return undefined;
    const onDown = (e) => {
      if (!accountRef.current?.contains(e.target)) setMenu(false);
      if (!createRef.current?.contains(e.target)) setCreateOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setCreateOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu, createOpen]);

  const signOut = async () => {
    setMenu(false);
    // The server session is the real one: only show "signed out" once it has ended.
    try { await api('/auth/logout', { method: 'POST' }); } catch (err) { if (err.status !== 401) { toast(`Couldn’t sign you out: ${err.message}`, 'error'); return; } }
    dispatch({ type: 'logout' }); nav('/login');
  };

  const menuLink = 'flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-white/5';
  const createMenu = (
    <div ref={createRef} className="relative">
      <button className="btn btn-ghost h-10 !px-3 sm:!px-4" aria-haspopup="menu" aria-expanded={createOpen} onClick={() => setCreateOpen(!createOpen)}>
        <Icon name="plus" size={18} /><span className="hidden sm:inline">Create</span><span className="sr-only sm:hidden">Create</span>
      </button>
      {createOpen && (
        <div role="menu" className="glass absolute right-0 z-40 mt-2 w-56 p-1.5 text-sm shadow-[var(--az-shadow)]">
          <Link role="menuitem" className={menuLink} to="/events?new=1"><Icon name="events" size={18} />Event</Link>
          <Link role="menuitem" className={menuLink} to="/groups?new=1"><Icon name="groups" size={18} />Community</Link>
          <Link role="menuitem" className={menuLink} to="/feed"><Icon name="pen" size={18} />Post</Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-full">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <Toaster />
      {state.settings.customCss && <style>{state.settings.customCss}</style>}

      <aside aria-label="Platform" className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[var(--az-hairline)] bg-[var(--az-sidebar)] lg:flex">
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 scroll-thin">
          <Link to="/dashboard" className="px-2 py-1" aria-label="CommunityOne home"><Logo size={30} /></Link>
          <div className="flex flex-col gap-0.5">
            {PRIMARY.map((m) => <NavItem key={m.id} item={m} active={isActive(m)} />)}
            <NavItem item={{ label: 'Create Community', icon: 'create', to: '/groups?new=1' }} active={false} />
          </div>
          {communities.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your communities</div>
              {communities.slice(0, 8).map((c) => {
                const to = communityPath(c);
                const active = loc.pathname === to || loc.pathname.startsWith(`${to}/`);
                return (
                  <Link key={c.id} to={to} aria-current={active ? 'page' : undefined}
                    className={`flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm transition ${active ? 'bg-white/[0.07] font-semibold text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
                    <CommunityTile c={c} size={24} />
                    <span className="truncate">{c.name}</span>
                  </Link>
                );
              })}
              {communities.length > 8 && <Link to="/groups" className="px-3 py-1.5 text-xs font-medium text-brand-300 hover:underline">All {communities.length} communities</Link>}
            </div>
          )}
          {more.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">More</div>
              {more.map((m) => <NavItem key={m.id} item={m} active={isActive(m)} />)}
            </div>
          )}
          {me.admin && (
            <div className="flex flex-col gap-0.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Administration</div>
              <NavItem item={{ label: 'Platform Admin', icon: 'admin', to: '/admin' }} active={loc.pathname.startsWith('/admin')} />
            </div>
          )}
        </nav>
        <Link to={`/people/${me.id}`} className="flex items-center gap-3 border-t border-[var(--az-hairline)] px-5 py-3 text-sm font-medium text-slate-300 hover:text-white">
          <Avatar user={me} size={28} /><span className="truncate">{me.name}</span>
        </Link>
      </aside>

      <div className="relative z-10 pb-20 lg:pb-0 lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-[var(--az-hairline)] bg-[var(--color-ink-950)]">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <Link to="/dashboard" className="lg:hidden" aria-label="CommunityOne home"><Logo size={28} withText={false} /></Link>
            <form role="search" className="hidden max-w-xl flex-1 sm:block" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
              <input ref={searchRef} className="input !min-h-10 !py-2" type="search" placeholder="Search communities, people, posts  ( / )" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </form>
            <div className="ml-auto flex items-center gap-1.5">
              <Link to="/search" className="btn btn-ghost h-10 w-10 !p-0 sm:hidden" aria-label="Search"><Icon name="search" /></Link>
              {createMenu}
              <Link to="/notifications" className="btn btn-ghost relative h-10 w-10 !p-0" aria-label={`Notifications, ${unread} unread`}>
                <Icon name="bell" />{unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-400 px-1 text-[10px] font-bold text-ink-950">{unread}</span>}
              </Link>
              <div ref={accountRef} className="relative">
                <button onClick={() => setMenu(!menu)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu} className="grid h-10 w-10 place-items-center rounded-full"><Avatar user={me} size={34} /></button>
                {menu && (
                  <div role="menu" className="glass absolute right-0 z-40 mt-2 w-64 p-1.5 text-sm shadow-[var(--az-shadow)]">
                    <div className="px-3 py-2"><div className="font-semibold">{me.name}</div><div className="text-xs text-slate-400">{me.email}</div></div>
                    <Link role="menuitem" className={menuLink} to={`/people/${me.id}`}>Profile</Link>
                    <Link role="menuitem" className={menuLink} to="/feed/bookmarks">Bookmarks</Link>
                    <div className="lg:hidden">
                      {more.map((m) => <Link key={m.id} role="menuitem" className={menuLink} to={m.to}>{m.label}</Link>)}
                      {me.admin && <Link role="menuitem" className={menuLink} to="/admin">Platform Admin</Link>}
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5"><span>Theme</span><ThemeToggle /></div>
                    <button role="menuitem" className={`${menuLink} w-full text-left`} onClick={() => { setMenu(false); if (confirm('Reset all demo data? Posts, groups and settings go back to the starting demo. Your account stays.')) { dispatch({ type: 'reset' }); nav('/dashboard'); } }}>Reset demo data</button>
                    <button role="menuitem" className={`${menuLink} w-full text-left text-rose-300`} onClick={signOut}>Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1200px] px-3 py-6 outline-none sm:px-6"><Outlet /></main>
      </div>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--az-hairline)] bg-[var(--az-sidebar)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {PRIMARY.map((m) => {
          const active = isActive(m);
          return (
            <Link key={m.id} to={m.to} aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${active ? 'font-semibold text-brand-300' : 'font-medium text-slate-400'}`}>
              <Icon name={m.icon} size={22} />{m.short || m.label}
            </Link>
          );
        })}
        <Link to={`/people/${me.id}`} aria-current={loc.pathname === `/people/${me.id}` ? 'page' : undefined}
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] ${loc.pathname === `/people/${me.id}` ? 'font-semibold text-brand-300' : 'font-medium text-slate-400'}`}>
          <Avatar user={me} size={22} />Profile
        </Link>
      </nav>
    </div>
  );
}
