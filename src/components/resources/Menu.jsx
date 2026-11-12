// A small action menu on the v2 tokens (Resources rows and the phone Add menu). It is drawn with
// fixed positioning from its button, so a table that scrolls sideways doesn't clip it. Escape,
// a click outside or scrolling closes it; arrow keys move between items.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

/**
 * `trigger({ open, toggle, ref, props })` renders the button: spread `props` onto it.
 * `items`: [{ label, onSelect, icon?, danger? }]. `label` names the menu for screen readers.
 */
export default function Menu({ label, items, trigger, width = 200 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = items.length * 44 + 12;
    const up = r.bottom + h + 8 > window.innerHeight && r.top > h + 8;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPos({ left, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }, [open, items.length, width]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const shut = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  // Focus the first item once the menu is placed (it renders after its position is known).
  const placed = !!pos;
  useEffect(() => { if (open && placed) menu.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true }); }, [open, placed]);
  useEffect(() => { if (!open) setPos(null); }, [open]);

  const move = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const list = [...(menu.current?.querySelectorAll('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };

  const toggle = () => setOpen((o) => !o);
  return (
    <>
      {trigger({ open, toggle, props: { ref: btn, onClick: toggle, 'aria-haspopup': 'menu', 'aria-expanded': open } })}
      {open && pos && (
        <div ref={menu} role="menu" aria-label={label} onKeyDown={move} style={{ position: 'fixed', width, ...pos }}
          className="z-50 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-[var(--az-sunken)] focus:bg-[var(--az-sunken)] ${it.danger ? 'text-[var(--az-danger)]' : 'text-[var(--az-text)]'}`}>
              {it.icon && <Icon name={it.icon} size={16} />}{it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
