import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { navFor } from '../lib/modules.js';
import { statsFor } from '../lib/gamify.js';
import { useMenus } from '../lib/menus.js';
import { Avatar, Logo, ThemeToggle } from './ui.jsx';
import { Glyph, Icon } from './icons.jsx';
import MenuVisibility from './MenuVisibility.jsx';
import Toaster from './Toaster.jsx';
import { useEffectsPref } from '../lib/effects.js';

// Background behaviour (scheduled posts, workflows, schedulers, reminders). Any module can
// add one by creating src/lib/runners/<name>.jsx with a default-exported component.
const runners = Object.values(import.meta.glob('../lib/runners/*.jsx', { eager: true })).map((m) => m.default).filter(Boolean);

export default function Layout() {
  const { state, me, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();
  const items = navFor(state.settings, me);
  const sections = [...new Set(items.map((m) => m.section))];
  const unread = state.notifications.filter((n) => !n.read && (!n.userId || n.userId === me.id) && (!n.adminOnly || me.admin)).length;
  const { points, level } = statsFor(state, me.id);
  const { mainHidden } = useMenus();
  const mainRef = useRef(null);
  const [hasExt, setHasExt] = useState(false);

  const [effectsPref, effectsMode, setEffectsPref] = useEffectsPref();
  const searchRef = useRef(null);

  // On navigation: close menus, start the new page at the top, name the tab after the module.
  useEffect(() => {
    setOpen(false); setMenu(false);
    window.scrollTo({ top: 0 });
    const mod = items.find((m) => loc.pathname === m.path || loc.pathname.startsWith(`${m.path}/`));
    document.title = mod ? `${mod.label} · ${state.settings.networkName || 'AlumniZone'}` : (state.settings.networkName || 'AlumniZone');
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // "/" jumps to search from anywhere except while typing.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close the account menu on an outside click or Escape.
  const accountRef = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (!accountRef.current?.contains(e.target)) setMenu(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  // Pages mark their extended (second-column) menu with `.ext-menu`; pages load lazily,
  // so watch the main area instead of checking once.
  useEffect(() => {
    const check = () => setHasExt(!!mainRef.current?.querySelector('.ext-menu'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(mainRef.current, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  const sidebar = (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 scroll-thin">
      <Link to={state.settings.landing || '/feed'} className="px-2 py-1"><Logo size={36} /></Link>
      {sections.map((sec) => (
        <div key={sec}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{sec}</div>
          {items.filter((m) => m.section === sec).map((m) => (
            <NavLink key={m.id} to={m.path}
              className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${isActive ? 'bg-brand-500/20 text-white ring-1 ring-brand-500/40' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
              <Glyph value={m.icon} size={28} />{m.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="relative min-h-full">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <div className="aurora" />
      <Toaster />
      {state.settings.customCss && <style>{state.settings.customCss}</style>}
      {runners.map((R, i) => <R key={i} />)}

      {mainHidden && <MenuVisibility hasExt={hasExt} />}
      {!mainHidden && (
        <aside className="glass glass-strong fixed inset-y-3 left-3 z-30 hidden w-64 flex-col !rounded-2xl lg:flex">
          {sidebar}
          <MenuVisibility hasExt={hasExt} docked />
        </aside>
      )}
      {open && (
        // With the main menu hidden, the drawer also works on desktop.
        <div className={`fixed inset-0 z-40 bg-black/60 ${mainHidden ? '' : 'lg:hidden'}`} onClick={() => setOpen(false)}>
          <aside className="glass glass-strong flex h-full w-72 flex-col !rounded-none" onClick={(e) => e.stopPropagation()}>{sidebar}</aside>
        </div>
      )}

      <div className={`relative z-10 transition-[padding] ${mainHidden ? '' : 'lg:pl-[17.5rem]'}`}>
        <header className="sticky top-0 z-20 px-3 pt-3">
          <div className="glass glass-strong flex items-center gap-2 !rounded-2xl px-3 py-2">
            <button className={`btn btn-ghost h-10 w-10 !p-0 ${mainHidden ? '' : 'lg:hidden'}`} onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <form className="flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); }}>
              <input ref={searchRef} className="input !py-2" type="search" placeholder="Search people, posts, groups, files…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </form>
            <Link to="/leaderboard" className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-white/5 sm:flex" title="Your points">
              <Glyph value="medal" tile={false} size={16} /> {points} · {level.name}
            </Link>
            <ThemeToggle />
            <Link to="/notifications" className="btn btn-ghost relative h-10 w-10 !p-0" aria-label={`Notifications, ${unread} unread`}>
              <Icon name="bell" />{unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold">{unread}</span>}
            </Link>
            <div ref={accountRef} className="relative">
              <button onClick={() => setMenu(!menu)} aria-label="Account menu" aria-expanded={menu} className="rounded-full"><Avatar user={me} size={38} /></button>
              {menu && (
                <div className="glass glass-strong absolute right-0 mt-2 w-56 p-2 text-sm">
                  <div className="px-3 py-2"><div className="font-semibold">{me.name}</div><div className="text-xs text-slate-400">{me.email}</div></div>
                  <Link className="block rounded-lg px-3 py-2 hover:bg-white/5" to={`/people/${me.id}`}>My profile</Link>
                  <Link className="block rounded-lg px-3 py-2 hover:bg-white/5" to="/feed/bookmarks">Bookmarks</Link>
                  <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-white/5" role="menuitemcheckbox" aria-checked={effectsMode === 'lite'}
                    title={effectsPref === 'auto' ? 'Chosen automatically for this device' : undefined}
                    onClick={() => setEffectsPref(effectsMode === 'lite' ? 'full' : 'lite')}>
                    Reduce effects<span className={`ml-2 inline-flex h-5 w-9 items-center rounded-full p-0.5 transition ${effectsMode === 'lite' ? 'bg-brand-400' : 'bg-white/15'}`}>
                      <span className={`h-4 w-4 rounded-full bg-ink-950 shadow transition ${effectsMode === 'lite' ? 'translate-x-4' : ''}`} /></span>
                  </button>
                  <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-white/5" onClick={() => { setMenu(false); if (confirm('Reset all demo data? Posts, groups and settings go back to the starting demo. Your account stays.')) { dispatch({ type: 'reset' }); nav('/feed'); } }}>Reset demo data</button>
                  <button className="block w-full rounded-lg px-3 py-2 text-left text-rose-300 hover:bg-white/5" onClick={() => { setMenu(false); dispatch({ type: 'logout' }); nav('/login'); }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-3 py-6 outline-none sm:px-6"><Outlet /></main>
      </div>
    </div>
  );
}
