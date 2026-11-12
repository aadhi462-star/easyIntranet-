// Small dialogs the app shell and Home share: which community a new post goes to, and the key
// handling that keeps focus inside a dialog (Tab wraps, Escape closes).
import { useEffect, useRef } from 'react';
import { Icon } from '../icons.jsx';
import { CommunityTile } from '../public/CommunityCards.jsx';

/** Keeps Tab inside a dialog, focuses its first control and closes it on Escape. */
export function useDialogKeys(ref, onClose) {
  useEffect(() => {
    const box = ref.current;
    box?.querySelector('button, a')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll('a[href], button:not([disabled]), input, select')];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ref, onClose]);
}

/** Which community something new goes in, when there is more than one. */
export default function CommunityPicker({ title = 'Post in which community?', communities, onClose, onPick }) {
  const ref = useRef(null);
  useDialogKeys(ref, onClose);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-[rgba(23,33,31,.4)]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pick-h" className="panel relative w-full max-w-md p-5 shadow-[var(--az-shadow)]">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pick-h" className="t-h3">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <ul className="mt-3 flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
          {communities.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-[var(--az-sunken)]" onClick={() => onPick(c)}>
                <CommunityTile c={c} size={28} /><span className="truncate">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
