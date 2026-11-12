// Header, footer and text-page frame shared by the public pages (landing, Explore, About, Help,
// Privacy, Terms, Contact), on the v2 tokens (board V2CLanding). Signed-in visitors see one
// button, Open CommunityOne, instead of Sign In and Get Started (C4).
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { useTheme } from '../../lib/theme.js';
import { Logo } from '../ui.jsx';
import { Icon } from '../icons.jsx';

/** Sets the tab title to "<page> · CommunityOne". */
export function usePageTitle(title) {
  // "About CommunityOne" → "About · CommunityOne", not the name twice.
  useEffect(() => { const t = title?.replace(/\s*CommunityOne$/, ''); document.title = t ? `${t} · CommunityOne` : 'CommunityOne'; }, [title]);
}

/**
 * Features, Learning and How it works are sections of the landing page (C1). There a link
 * scrolls (hash routing owns the URL fragment, so no href="#features"); elsewhere it opens the
 * landing page and asks it to scroll.
 */
export function useSectionLink() {
  const loc = useLocation();
  const nav = useNavigate();
  return (id) => {
    const el = document.getElementById(id);
    if (loc.pathname === '/' && el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.focus({ preventScroll: true }); }
    else nav('/', { state: { scrollTo: id } });
  };
}

const linkCls = 'inline-flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]';

export function PublicHeader() {
  const { me } = useStore();
  const [open, setOpen] = useState(false);
  const goTo = useSectionLink();
  const loc = useLocation();
  const menuId = useId();
  const buttonRef = useRef(null);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = (onPick = () => {}) => (
    <>
      <Link className={linkCls} to="/about" onClick={onPick}>About</Link>
      <Link className={linkCls} to="/explore" onClick={onPick}>Explore Communities</Link>
      <button type="button" className={linkCls} onClick={() => { onPick(); goTo('features'); }}>Features</button>
      <button type="button" className={linkCls} onClick={() => { onPick(); goTo('learning'); }}>Learning</button>
    </>
  );
  const actions = me
    ? <Link className="btn btn-primary" to="/dashboard">Open CommunityOne</Link>
    : (
      <>
        <Link className="btn btn-ghost" to="/login">Sign In</Link>
        <Link className="btn btn-primary" to="/signup">Get Started</Link>
      </>
    );

  return (
    <header className="relative z-20 border-b border-[var(--az-hairline)] bg-[var(--az-surface)]">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" aria-label="CommunityOne home" className="rounded-lg"><Logo size={32} /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links()}
          <span className="ml-3 flex items-center gap-2">{actions}</span>
        </nav>
        <button ref={buttonRef} type="button" className="btn btn-ghost lg:hidden" aria-expanded={open} aria-controls={menuId}
          onClick={() => setOpen(!open)}>
          <Icon name={open ? 'x' : 'menu'} size={18} />Menu
        </button>
      </div>
      {open && (
        <nav id={menuId} aria-label="Main" className="border-t border-[var(--az-hairline)] px-4 pb-4 pt-2 lg:hidden">
          <div className="flex flex-col items-start">{links(() => setOpen(false))}</div>
          <div className="mt-3 flex flex-col gap-2 [&>a]:w-full">{actions}</div>
        </nav>
      )}
    </header>
  );
}

const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match my device']];

/** Light, Dark or Match my device, as one choice (moved here from the header). */
export function ThemeChoice() {
  const [pref, , setPref] = useTheme();
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={id} className="t-small">Theme</span>
      <div role="radiogroup" aria-labelledby={id} className="inline-flex rounded-full border border-[var(--az-control)] p-0.5">
        {THEMES.map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={pref === value} onClick={() => setPref(value)}
            className={`min-h-10 rounded-full px-3 text-[13px] font-semibold ${pref === value ? 'bg-[var(--az-text)] text-[var(--az-page)]' : 'text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const FOOTER_LINKS = [['/about', 'About'], ['/explore', 'Explore Communities'], ['/help', 'Help and Support'], ['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/contact', 'Contact']];

export function PublicFooter() {
  const f = 'inline-flex min-h-11 items-center text-sm text-[var(--az-text-2)] hover:text-[var(--az-text)]';
  return (
    <footer className="border-t border-[var(--az-hairline)] bg-[var(--az-surface)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-8 sm:px-8">
        <Logo size={36} tagline />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
          {FOOTER_LINKS.map(([to, label]) => <Link key={to} className={f} to={to}>{label}</Link>)}
        </nav>
        <ThemeChoice />
      </div>
    </footer>
  );
}

/** Page frame for the text pages (About, Help, Privacy, Terms, Contact). */
export function PublicPage({ title, lede, children }) {
  usePageTitle(title);
  return (
    <div className="flex min-h-full flex-col bg-[var(--az-page)] text-[var(--az-text)]">
      <PublicHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <h1 className="t-h1 sm:text-[44px] sm:leading-[52px]">{title}</h1>
        {lede && <p className="mt-4 text-[17px] leading-7 text-[var(--az-text-2)]">{lede}</p>}
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

/** A titled section of a text page. */
export function Section({ title, id, children }) {
  const hid = `${id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-h`;
  return (
    <section id={id} aria-labelledby={hid} className="flex flex-col gap-3">
      <h2 id={hid} className="t-h2">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-[var(--az-text-2)]">{children}</div>
    </section>
  );
}
