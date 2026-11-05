import { useEffect, useRef, useState } from 'react';
import { useMenus } from '../lib/menus.js';

/**
 * Chevron that opens a popover to hide or show the main menu, the page's extended menu, or
 * both. `docked` renders it as the sidebar's footer row; otherwise (sidebar hidden) it floats
 * in the bottom-left corner so there's always a way back. Desktop only.
 */
export default function MenuVisibility({ hasExt, docked = false }) {
  const { mainHidden, extHidden, toggleMain, toggleExt, setAll } = useMenus();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const allHidden = mainHidden && (!hasExt || extHidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (fn) => () => { fn(); setOpen(false); };
  const items = [
    { label: mainHidden ? 'Show main menu' : 'Hide main menu', run: toggleMain },
    hasExt && { label: extHidden ? 'Show extended menu' : 'Hide extended menu', run: toggleExt },
    { label: allHidden ? 'Show all menus' : 'Hide all menus', run: () => setAll(!allHidden) },
  ].filter(Boolean);

  return (
    <div ref={ref} className={docked ? 'relative shrink-0 border-t border-[color:var(--az-hairline)] px-4 py-3' : 'fixed bottom-5 left-5 z-40 hidden lg:block'}>
      {open && (
        <div role="menu" aria-label="Menu visibility" className={`absolute bottom-full mb-3 w-60 rounded-2xl bg-ink-900 p-2 shadow-2xl ring-1 ring-[color:var(--az-hairline)] ${docked ? 'left-3' : 'left-0'}`}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" onClick={pick(it.run)}
              className="block min-h-11 w-full rounded-xl px-4 text-left text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-white">
              {it.label}
            </button>
          ))}
          <span aria-hidden="true" className="menu-tail" />
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu visibility"
        title="Hide or show menus"
        className="grid h-9 w-9 place-items-center rounded-lg bg-ink-800 text-slate-200 shadow-sm ring-1 ring-[color:var(--az-hairline)] transition hover:bg-ink-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${mainHidden ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
    </div>
  );
}
