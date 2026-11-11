// Header and footer shared by the public pages (landing, Explore, About, Help, Privacy, Terms,
// Contact). Signed-in visitors see "Open CommunityOne" instead of Sign In / Join free.
import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Logo, ThemeToggle } from '../ui.jsx';
import { Icon } from '../icons.jsx';

/** Sets the tab title to "<page> · CommunityOne". */
export function usePageTitle(title) {
  // "About CommunityOne" → "About · CommunityOne", not the name twice.
  useEffect(() => { const t = title?.replace(/\s*CommunityOne$/, ''); document.title = t ? `${t} · CommunityOne` : 'CommunityOne'; }, [title]);
}

/**
 * "How It Works" lives on the landing page. There it scrolls (hash routing owns the URL
 * fragment, so no href="#how"); elsewhere it goes to the landing page and asks it to scroll.
 */
function useHowItWorks() {
  const loc = useLocation();
  const nav = useNavigate();
  return () => {
    const el = document.getElementById('how');
    if (loc.pathname === '/' && el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else nav('/', { state: { scrollTo: 'how' } });
  };
}

const linkCls = 'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-slate-300 hover:text-white';

export function PublicHeader() {
  const { me } = useStore();
  const [open, setOpen] = useState(false);
  const howItWorks = useHowItWorks();
  const loc = useLocation();
  const menuId = useId();
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  const links = (onPick = () => {}) => (
    <>
      <Link className={linkCls} to="/explore" onClick={onPick}>Explore Communities</Link>
      <Link className={linkCls} to="/about" onClick={onPick}>About</Link>
      <button type="button" className={linkCls} onClick={() => { onPick(); howItWorks(); }}>How It Works</button>
    </>
  );
  const actions = me
    ? <Link className="btn btn-primary min-h-11" to="/dashboard">Open CommunityOne</Link>
    : (
      <>
        <Link className={linkCls} to="/login">Sign In</Link>
        <Link className="btn btn-ghost min-h-11" to="/signup">Join free</Link>
      </>
    );

  return (
    <header className="relative z-20 border-b border-[var(--az-hairline)]">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
        <Link to="/" aria-label="CommunityOne home"><Logo size={32} /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links()}
          <ThemeToggle />
          {actions}
        </nav>
        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost h-11 w-11 !p-0" aria-expanded={open} aria-controls={menuId}
            aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
      {open && (
        <nav id={menuId} aria-label="Main" className="border-t border-[var(--az-hairline)] px-4 pb-4 pt-2 lg:hidden">
          <div className="flex flex-col">{links(() => setOpen(false))}</div>
          <div className="mt-3 flex flex-col gap-2 [&>a]:justify-center">{actions}</div>
        </nav>
      )}
    </header>
  );
}

export function PublicFooter() {
  const f = 'inline-flex min-h-11 items-center text-sm text-slate-400 hover:text-white';
  return (
    <footer className="border-t border-[var(--az-hairline)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Logo size={28} />
          <span className="text-sm text-slate-400">One Platform. Every Community.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
          <Link className={f} to="/about">About</Link>
          <Link className={f} to="/explore">Explore Communities</Link>
          <Link className={f} to="/help">Help and Support</Link>
          <Link className={f} to="/privacy">Privacy Policy</Link>
          <Link className={f} to="/terms">Terms of Service</Link>
          <Link className={f} to="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Page frame for the text pages (About, Help, Privacy, Terms, Contact). */
export function PublicPage({ title, lede, children }) {
  usePageTitle(title);
  return (
    <div className="flex min-h-full flex-col bg-[var(--color-ink-950)]">
      <PublicHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <h1 className="text-[36px] font-bold leading-tight tracking-tight text-white sm:text-[44px]">{title}</h1>
        {lede && <p className="mt-4 text-[17px] leading-relaxed text-slate-300">{lede}</p>}
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
      <h2 id={hid} className="text-xl font-semibold text-white">{title}</h2>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}
