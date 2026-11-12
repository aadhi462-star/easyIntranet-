import { useEffect, useState } from 'react';

/** Bottom-centre confirmations from lib/toast.js. Announced politely to screen readers. */
export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      // Collapse repeats (e.g. several RSVPs in a row) into the latest one.
      setItems((list) => [...list.filter((x) => x.text !== t.text), t].slice(-3));
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 2600);
    };
    window.addEventListener('az-toast', onToast);
    return () => window.removeEventListener('az-toast', onToast);
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div key={t.id} className="toast-in flex items-center gap-2 rounded-xl bg-ink-800 px-4 py-2.5 text-sm font-medium text-[var(--az-text)] shadow-2xl ring-1 ring-[color:var(--az-hairline)]">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${t.tone === 'error' ? 'bg-[var(--az-danger)]' : 'bg-brand-400'}`} />{t.text}
        </div>
      ))}
    </div>
  );
}
