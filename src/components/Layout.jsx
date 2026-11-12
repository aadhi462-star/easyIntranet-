// CommunityOne app shell (v2 workstream D, boards V2DShellHome, V2DPhone and V2DPhoneMenu):
// - desktop (1024 px and wider): a fixed 248 px sidebar with the brief's eight destinations, then
//   your communities, Create Community and, for platform staff, Administration (D1); a top bar
//   with global search, Create and the account menu (D12);
// - phone and tablet: a top bar with Menu, the logo, Search and Create, and a bottom bar with
//   Home, Explore, Communities, Notifications and Profile; Menu opens a sheet with the rest (D2).
// Each community keeps its own navigation inside its page. A lesson is focus mode (no bottom bar).
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isOn, useFeatures } from '../lib/features.js';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { fetchMyCommunities } from '../lib/feed.js';
import { communityPath } from '../lib/communities.js';
import { useTheme } from '../lib/theme.js';
import { useUnread } from '../lib/engage.js';
import { sidebarOrder, useCanCreateCommunity, useComposeTargets } from '../lib/shell.js';
import { Avatar, Logo } from './ui.jsx';
import { Icon } from './icons.jsx';
import Toaster from './Toaster.jsx';
import { CommunityTile } from './public/CommunityCards.jsx';
import { confirmAction } from './ui/Confirm.jsx';
import CommunityPicker, { useDialogKeys } from './shell/CommunityPicker.jsx';

// The search box with suggestions (D9) lives in components/search; until it is there, a plain
// box that opens the results page stands in.
const searchBoxes = import.meta.glob('./search/SearchBox.jsx', { eager: true });
const SearchBox = searchBoxes['./search/SearchBox.jsx']?.default ?? PlainSearch;

const is = (prefixes) => (p) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));
// The brief's eight, in order (D1). `learning` shows only while Learning is switched on.
const PLACES = [
  { id: 'home', label: 'Home', icon: 'home', to: '/home', match: is(['/home']) },
  { id: 'explore', label: 'Explore', icon: 'explore', to: '/explore', match: is(['/explore']) },
  { id: 'communities', label: 'My Communities', short: 'Communities', icon: 'groups', to: '/communities', match: (p) => is(['/communities', '/c'])(p) },
  { id: 'learning', label: 'My Learning', icon: 'cap', to: '/learning', match: is(['/learning', '/lessons']) },
  { id: 'events', label: 'Events', icon: 'events', to: '/events', match: is(['/events', '/calendar']) },
  { id: 'saved', label: 'Saved', icon: 'bookmarks', to: '/saved', match: is(['/saved']) },
  { id: 'notifications', label: 'Notifications', icon: 'bell', to: '/notifications', match: is(['/notifications']) },
  { id: 'profile', label: 'Profile', icon: 'user', to: '/profile', match: is(['/profile']) },
];
const BOTTOM = ['home', 'explore', 'communities', 'notifications', 'profile'];
const SHEET = ['learning', 'events', 'saved'];

/** Page titles: "<section> · CommunityOne". Community pages and lists name the tab themselves. */
const OWN_TITLE = ['/c/', '/explore', '/communities', '/search', '/people', '/profile'];
const TITLES = [['/home', 'Home'], ['/events', 'Events'], ['/post/', 'Post'], ['/calendar', 'Calendar'], ['/learning', 'My Learning'],
  ['/notifications', 'Notifications'], ['/saved', 'Saved'], ['/admin', 'Platform Admin']];
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my device']];

function useMyCommunities(me) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => fetchMyCommunities().then((c) => live && setList(sidebarOrder(c))).catch(() => {});
    load();
    // Joining or leaving anywhere updates the list (the cache is cleared first in lib/feed.js).
    window.addEventListener('c1-session-changed', load);
    window.addEventListener('c1-community-changed', load);
    return () => { live = false; window.removeEventListener('c1-session-changed', load); window.removeEventListener('c1-community-changed', load); };
  }, [me?.id]);
  return list;
}

const navCls = (active) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${active
  ? 'bg-[var(--az-sunken)] font-semibold text-[var(--az-text)]' : 'font-medium text-[var(--az-text)] hover:bg-[var(--az-sunken)]'}`;

function Count({ n, label = 'unread' }) {
  if (!n) return null;
  return <span className="ml-auto grid h-5 min-w-[22px] place-items-center rounded-full bg-[var(--az-ok)] px-1.5 text-xs font-bold text-[var(--az-on-fill)]"><span className="sr-only">{label}: </span>{n > 99 ? '99+' : n}</span>;
}

function NavItem({ item, active, unread, onPick }) {
  return (
    <Link to={item.to} aria-current={active ? 'page' : undefined} onClick={onPick} className={navCls(active)}>
      <Icon name={item.icon} size={20} className={active ? 'text-[var(--az-link)]' : 'text-[var(--az-text-2)]'} />
      <span className="truncate">{item.label}</span>
      {item.id === 'notifications' && <Count n={unread} />}
    </Link>
  );
}

function GroupLabel({ children, id }) {
  return <div id={id} className="t-label px-3 pb-1.5">{children}</div>;
}

/** Your communities: managed first, then A to Z; the first 8, then a link to all of them. */
function CommunityList({ communities, path, onPick }) {
  if (!communities.length) return <p className="t-small px-3">Communities you join appear here.</p>;
  return (
    <>
      {communities.slice(0, 8).map((c) => {
        const to = communityPath(c);
        const active = path === to || path.startsWith(`${to}/`);
        return (
          <Link key={c.id} to={to} onClick={onPick} aria-current={active ? 'page' : undefined} className={navCls(active)}>
            <CommunityTile c={c} size={24} /><span className="truncate">{c.name}</span>
          </Link>
        );
      })}
      {communities.length > 8 && <Link to="/communities" onClick={onPick} className="link px-3 py-2 text-sm">All {communities.length} communities</Link>}
    </>
  );
}

/** A plain search box: Enter opens the results page. */
function PlainSearch({ inputRef }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form role="search" className="relative w-full" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label htmlFor="top-search" className="sr-only">Search</label>
      <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--az-text-2)]" />
      <input id="top-search" ref={inputRef} className="input !min-h-10 !pl-10" type="search" placeholder="Search CommunityOne" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

/** Close a popover on an outside press or Escape. */
function useDismiss(open, ref, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, ref, close]);
}

const menuItem = 'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)]';
const popover = 'absolute right-0 z-40 mt-2 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]';

export default function Layout() {
  const { me, dispatch } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const features = useFeatures();
  const communities = useMyCommunities(me);
  const unread = useUnread(!!me);
  const canCreate = useCanCreateCommunity(me.id);
  const targets = useComposeTargets(me.id);
  const [pref, , setPref] = useTheme();
  const [account, setAccount] = useState(false);
  const [create, setCreate] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState(null); // community choice for a new post
  const mainRef = useRef(null);
  const searchRef = useRef(null);
  const accountRef = useRef(null);
  const createRef = useRef(null);
  const sheetButtonRef = useRef(null);
  const path = loc.pathname;
  const places = PLACES.filter((p) => p.id !== 'learning' || isOn(features, 'learning'));
  const place = (id) => places.find((p) => p.id === id);
  // A lesson is focus mode: no bottom bar, its own actions are pinned (S5Mobile).
  const focus = path.startsWith('/lessons/');
  const postIn = communities.filter((c) => targets.post.includes(c.id));
  const eventIn = communities.filter((c) => targets.event.includes(c.id));

  // On navigation: close menus, start the new page at the top, name the tab after the section.
  useEffect(() => {
    setAccount(false); setCreate(false); setSheet(false);
    window.scrollTo({ top: 0 });
    if (OWN_TITLE.some((p) => path.startsWith(p))) return;
    const t = TITLES.find(([p]) => path.startsWith(p))?.[1];
    document.title = t ? `${t} · CommunityOne` : 'CommunityOne';
  }, [path, loc.search]);

  // "/" focuses the search box from anywhere except while typing; on phones it opens Search.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      if (searchRef.current?.offsetParent) searchRef.current.focus();
      else nav('/search');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav]);

  useDismiss(account, accountRef, () => setAccount(false));
  useDismiss(create, createRef, () => setCreate(false));

  const signOut = async () => {
    setAccount(false); setSheet(false);
    // The server session is the real one: only show "signed out" once it has ended.
    try { await api('/auth/logout', { method: 'POST' }); } catch (err) { if (err.status !== 401) { toast(`Couldn’t sign you out: ${err.message}`, 'error'); return; } }
    dispatch({ type: 'logout' }); nav('/login');
  };
  const startPost = () => {
    setCreate(false);
    if (postIn.length === 1) nav(communityPath(postIn[0], 'discussions'));
    else setPicker(postIn);
  };

  const createMenu = (postIn.length > 0 || eventIn.length > 0 || canCreate) && (
    <div ref={createRef} className="relative">
      <button type="button" className="btn btn-ghost max-lg:!px-3" aria-haspopup="menu" aria-expanded={create} onClick={() => setCreate(!create)}>
        <Icon name="plus" size={20} /><span className="max-lg:sr-only">Create</span>
      </button>
      {create && (
        <div role="menu" className={`${popover} w-64`}>
          {postIn.length > 0 && <button type="button" role="menuitem" className={menuItem} onClick={startPost}><Icon name="pen" size={18} className="text-[var(--az-text-2)]" /><span>Post<span className="t-small block">in a community</span></span></button>}
          {eventIn.length > 0 && <Link role="menuitem" className={menuItem} to="/events?new=1"><Icon name="events" size={18} className="text-[var(--az-text-2)]" /><span>Event<span className="t-small block">where you may</span></span></Link>}
          {canCreate && <Link role="menuitem" className={menuItem} to="/communities?new=1"><Icon name="groups" size={18} className="text-[var(--az-text-2)]" />Community</Link>}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-full bg-[var(--az-page)] text-[var(--az-text)]">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <Toaster />

      <aside aria-label="Platform" className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-[var(--az-hairline)] bg-[var(--az-sidebar)] lg:flex">
        <Link to="/home" className="mx-3 mt-4 rounded-lg px-2 py-1" aria-label="CommunityOne home"><Logo size={30} /></Link>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 scroll-thin">
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {places.map((p) => <NavItem key={p.id} item={p} active={p.match(path)} unread={unread} />)}
          </nav>
          <nav aria-labelledby="side-communities" className="flex flex-col gap-0.5">
            <GroupLabel id="side-communities">Your communities</GroupLabel>
            <CommunityList communities={communities} path={path} />
          </nav>
          {canCreate && <Link to="/communities?new=1" className={navCls(false)}><Icon name="create" size={20} className="text-[var(--az-text-2)]" />Create Community</Link>}
          {me.admin && (
            <nav aria-labelledby="side-admin" className="flex flex-col gap-0.5">
              <GroupLabel id="side-admin">Administration</GroupLabel>
              <NavItem item={{ id: 'admin', label: 'Platform Admin', icon: 'shield', to: '/admin' }} active={path.startsWith('/admin')} />
            </nav>
          )}
        </div>
      </aside>

      <div className={`relative z-10 lg:pb-0 lg:pl-[248px] ${focus ? '' : 'pb-20'}`}>
        <header className="sticky top-0 z-20 border-b border-[var(--az-hairline)] bg-[var(--az-surface)]">
          <div className="flex h-14 items-center gap-1 px-2 sm:px-4 lg:h-[60px] lg:gap-2 lg:px-6">
            <button ref={sheetButtonRef} type="button" className="btn btn-ghost btn-icon lg:hidden" aria-label="Menu" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
              <Icon name="menu" size={22} />
            </button>
            <Link to="/home" className="rounded-lg lg:hidden" aria-label="CommunityOne home"><Logo size={28} /></Link>
            <div className="hidden max-w-[560px] flex-1 md:block"><SearchBox inputRef={searchRef} /></div>
            <div className="ml-auto flex items-center gap-1">
              <Link to="/search" className="btn btn-ghost btn-icon md:hidden" aria-label="Search"><Icon name="search" size={22} /></Link>
              {createMenu}
              <div ref={accountRef} className="relative max-lg:hidden">
                <button type="button" onClick={() => setAccount(!account)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={account} className="grid h-11 w-11 place-items-center rounded-full">
                  <Avatar user={me} size={34} />
                </button>
                {account && (
                  <div role="menu" aria-label="Account" className={`${popover} w-72`}>
                    <div className="px-3 py-2"><div className="font-semibold">{me.name}</div><div className="t-small truncate">{me.email}</div></div>
                    <Link role="menuitem" className={menuItem} to="/profile">Profile</Link>
                    <Link role="menuitem" className={menuItem} to="/notifications?settings=1">Notification settings</Link>
                    <div role="group" aria-label="Theme" className="border-t border-[var(--az-hairline)] pt-1.5 mt-1.5">
                      <div className="t-label px-3 py-1">Theme</div>
                      {THEMES.map(([value, label]) => (
                        <button key={value} type="button" role="menuitemradio" aria-checked={pref === value} className={menuItem} onClick={() => setPref(value)}>
                          <span className="grid w-5 place-items-center">{pref === value && <Icon name="check" size={16} className="text-[var(--az-link)]" />}</span>{label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 border-t border-[var(--az-hairline)] pt-1.5">
                      {import.meta.env.DEV && (
                        <button type="button" role="menuitem" className={menuItem} onClick={async () => { setAccount(false); if (await confirmAction('Reset all demo data? Posts, groups and settings go back to the starting demo. Your account stays.')) { dispatch({ type: 'reset' }); nav('/home'); } }}>Reset demo data</button>
                      )}
                      <button type="button" role="menuitem" className={`${menuItem} !text-[var(--az-danger)]`} onClick={signOut}><Icon name="logout" size={18} />Sign out</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1080px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-7"><Outlet /></main>
      </div>

      {!focus && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--az-hairline)] bg-[var(--az-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
          {BOTTOM.map((id) => {
            const p = place(id);
            const active = p.match(path);
            return (
              <Link key={id} to={p.to} aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] text-xs ${active ? 'font-semibold text-[var(--az-link)]' : 'font-medium text-[var(--az-text-2)]'}`}>
                <Icon name={p.icon} size={22} />
                <span className="max-w-full truncate px-0.5 tracking-[-0.02em]">{p.short || p.label}</span>
                {id === 'notifications' && unread > 0 && (
                  <span className="absolute left-[calc(50%+4px)] top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--az-ok)] px-1.5 text-xs font-bold text-[var(--az-on-fill)]"><span className="sr-only">unread: </span>{unread > 99 ? '99+' : unread}</span>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      {sheet && (
        <MenuSheet onClose={() => { setSheet(false); sheetButtonRef.current?.focus(); }}>
          <nav aria-labelledby="sheet-more" className="flex flex-col gap-0.5">
            <GroupLabel id="sheet-more">More places</GroupLabel>
            {SHEET.map(place).filter(Boolean).map((p) => <NavItem key={p.id} item={p} active={p.match(path)} onPick={() => setSheet(false)} />)}
            <p className="t-small px-3 pt-1">Home, Explore, Communities, Notifications and Profile are in the bar below.</p>
          </nav>
          <nav aria-labelledby="sheet-communities" className="flex flex-col gap-0.5">
            <GroupLabel id="sheet-communities">Your communities</GroupLabel>
            <CommunityList communities={communities} path={path} onPick={() => setSheet(false)} />
          </nav>
          {canCreate && <Link to="/communities?new=1" onClick={() => setSheet(false)} className={navCls(false)}><Icon name="create" size={20} className="text-[var(--az-text-2)]" />Create Community</Link>}
          {me.admin && (
            <nav aria-labelledby="sheet-admin" className="flex flex-col gap-0.5">
              <GroupLabel id="sheet-admin">Administration</GroupLabel>
              <NavItem item={{ id: 'admin', label: 'Platform Admin', icon: 'shield', to: '/admin' }} active={path.startsWith('/admin')} onPick={() => setSheet(false)} />
            </nav>
          )}
          <div className="border-t border-[var(--az-hairline)] pt-3">
            <div id="sheet-theme" className="t-label px-3 pb-1.5">Theme</div>
            <div role="radiogroup" aria-labelledby="sheet-theme" className="flex gap-1.5 px-1">
              {THEMES.map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={pref === value} aria-label={label} className="filter-chip flex-1 justify-center !px-2" aria-pressed={pref === value} onClick={() => setPref(value)}>
                  {value === 'system' ? 'Device' : label}
                </button>
              ))}
            </div>
            <button type="button" className={`${navCls(false)} mt-1.5 w-full !text-[var(--az-danger)]`} onClick={signOut}><Icon name="logout" size={20} />Sign out</button>
          </div>
        </MenuSheet>
      )}

      {picker && <CommunityPicker communities={picker} onClose={() => setPicker(null)} onPick={(c) => { setPicker(null); nav(communityPath(c, 'discussions')); }} />}
    </div>
  );
}

/** The phone Menu sheet (D2): the rest of the sidebar, in its order. */
function MenuSheet({ onClose, children }) {
  const ref = useRef(null);
  useDialogKeys(ref, onClose);
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(23,33,31,.4)]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="sheet-h"
        className="absolute inset-y-0 left-0 flex w-[320px] max-w-[86%] flex-col border-r border-[var(--az-hairline)] bg-[var(--az-surface)] shadow-[var(--az-shadow)]">
        <div className="flex h-14 flex-none items-center justify-between border-b border-[var(--az-hairline)] pl-5 pr-2">
          <h2 id="sheet-h" className="t-h3">Menu</h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close menu" onClick={onClose}><Icon name="x" size={22} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-3">{children}</div>
      </div>
    </div>
  );
}
