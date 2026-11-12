// The queue's split view (v2 boards V2GDashboards "Moderator: the queue", V2GPhoneQueue and
// V2GPhoneCase). Wide: the list beside the selected item in full. Narrow (a phone, or Manage's
// column when it's tight): the list, then the item full-width with a Back that returns to the
// list where it was. Width is measured on the queue itself, not the window, because Manage's own
// menu takes space beside it on some screens.
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { IconButton } from '../ui/Controls.jsx';

/** True when the element is at least `min` px wide. */
export function useWide(min = 672) {
  const ref = useRef(null);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= min + 360);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWide(el.getBoundingClientRect().width >= min);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, wide];
}

/**
 * items: the list; rowTitle/rowMeta(item) describe a row; detail(item, { wide }) draws it in full.
 * selected: the id the person chose (null for none); onSelect(id | null).
 * On wide screens the first item shows when nothing is chosen.
 */
export default function Split({ label, items, selected, onSelect, rowTitle, rowMeta, rowNote, detail, note, extra = null, backLabel = 'Back to the queue', itemMeta }) {
  const [ref, wide] = useWide();
  const scroll = useRef(null); // where the list was, to come back to it
  const lastOpened = useRef(null);
  const chosen = items.find((x) => x.id === selected) ?? extra;
  const current = chosen ?? (wide ? items[0] : null);
  const phoneItem = !wide && !!chosen;

  useLayoutEffect(() => {
    if (wide) return;
    if (phoneItem) { ref.current?.scrollIntoView?.({ block: 'start' }); return; }
    if (scroll.current != null) {
      window.scrollTo(0, scroll.current);
      ref.current?.querySelector(`[data-row="${CSS.escape(String(lastOpened.current))}"]`)?.focus();
      scroll.current = null;
    }
  }, [phoneItem, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id) => {
    if (!wide) { scroll.current = window.scrollY; lastOpened.current = id; }
    onSelect(id);
  };

  let body;
  if (phoneItem) {
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <IconButton icon="back" label={backLabel} onClick={() => onSelect(null)} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="t-h3 truncate">{rowTitle(chosen)}</span>
            {itemMeta && <span className="t-small truncate">{itemMeta}</span>}
          </span>
        </div>
        {detail(chosen, { wide: false })}
      </div>
    );
  } else if (!wide) {
    body = (
      <div className="flex flex-col gap-3">
        <nav aria-label={label}>
          <ul className="flex flex-col gap-2">
            {items.map((x) => (
              <li key={x.id}>
                <button type="button" data-row={x.id} onClick={() => open(x.id)}
                  className="panel flex min-h-16 w-full items-center gap-3 !rounded-[10px] px-3.5 py-2.5 text-left hover:bg-[var(--az-sunken)]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold leading-snug break-words">{rowTitle(x)}</span>
                    <span className="t-small">{rowMeta(x)}</span>
                    {rowNote?.(x) && <span className="text-[13px] font-medium text-[var(--az-warning)]">{rowNote(x)}</span>}
                  </span>
                  <Icon name="back" size={18} className="rotate-180 text-[var(--az-text-3)]" />
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {note && <p className="t-small">{note}</p>}
      </div>
    );
  } else {
    body = (
    <div className="panel flex min-h-[520px] overflow-hidden">
      <nav aria-label={label} className="flex w-[17rem] shrink-0 flex-col gap-0.5 border-r border-[var(--az-hairline)] p-2">
        <ul className="flex flex-col gap-0.5">
          {items.map((x) => {
            const on = current?.id === x.id;
            return (
              <li key={x.id}>
                <button type="button" data-row={x.id} onClick={() => open(x.id)} aria-current={on ? 'true' : undefined}
                  className={`block w-full rounded-lg px-3 py-2.5 text-left ${on ? 'bg-[var(--az-ok-soft)] shadow-[inset_3px_0_0_var(--az-focus)]' : 'hover:bg-[var(--az-sunken)]'}`}>
                  <span className="block text-sm font-semibold break-words">{rowTitle(x)}</span>
                  <span className="t-small block">{rowMeta(x)}</span>
                  {rowNote?.(x) && <span className="block text-[13px] font-medium text-[var(--az-warning)]">{rowNote(x)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {note && <p className="t-small mt-auto p-3">{note}</p>}
      </nav>
      <div className="min-w-0 flex-1 p-6">{current && detail(current, { wide: true })}</div>
    </div>
    );
  }
  return <div ref={ref} className="min-w-0 scroll-mt-24">{body}</div>;
}

/** The bar that holds Apply: pinned above the phone's bottom bar on narrow screens. */
export function ActionBar({ pinned, children }) {
  return (
    <div role={pinned ? 'region' : undefined} aria-label={pinned ? 'Decision' : undefined}
      className={pinned
        ? 'sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-3 shadow-[var(--az-shadow)] lg:bottom-4'
        : 'flex flex-wrap items-center gap-3'}>
      {children}
    </div>
  );
}
