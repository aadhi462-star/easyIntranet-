// The top-bar search box (v2 D9, board V2DShellHome "Search suggestions"). After 2 characters it
// asks GET /api/search?mode=suggest for the top 3 of each kind you can open, grouped by kind, as
// a combobox with a listbox: arrow keys move, Enter opens the highlighted result, Escape closes.
// Enter with nothing highlighted opens the full results page. The server applies each page's
// rules; the page a result opens checks access again (SRC-05).
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { communityPath } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';
import { Avatar } from '../ui.jsx';
import { CommunityTile } from '../public/CommunityCards.jsx';

/** The kinds in the order the box and the results page show them. */
export const SEARCH_KINDS = [
  ['communities', 'Communities'], ['people', 'People'], ['posts', 'Discussions'],
  ['events', 'Events'], ['resources', 'Resources'], ['courses', 'Courses'],
];

/** Where a result opens: its own page, which checks access again. */
export function resultPath(kind, r) {
  switch (kind) {
    case 'communities': return communityPath(r);
    case 'people': return `/people/${encodeURIComponent(r.id)}`;
    case 'posts': return `/post/${encodeURIComponent(r.id)}`;
    case 'events': return `/events/${encodeURIComponent(r.id)}`;
    case 'resources': return communityPath(r.community, 'resources');
    case 'courses': return `${communityPath(r.community, 'learning')}/${encodeURIComponent(r.id)}`;
    default: return '/search';
  }
}

export const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

const DEBOUNCE_MS = 200;

/** GET /api/search?mode=suggest, cancellable. Resolves to the results object. */
async function fetchSuggestions(q, signal) {
  const res = await fetch(`/api/search?mode=suggest&q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' }, credentials: 'same-origin', signal });
  if (res.status === 401) window.dispatchEvent(new CustomEvent('c1-signed-out'));
  if (!res.ok) throw new Error('unavailable');
  return (await res.json()).results;
}

function Lead({ kind, r }) {
  if (kind === 'communities') return <CommunityTile c={r} size={24} />;
  if (kind === 'people') return <Avatar user={{ name: r.name, hue: r.avatarHue ?? 200 }} size={24} />;
  const icon = { posts: 'forums', events: 'events', resources: r.kind === 'file' ? 'doc' : 'link', courses: 'cap' }[kind];
  return <span className="grid h-6 w-6 shrink-0 place-items-center text-[var(--az-text-3)]"><Icon name={icon} size={18} /></span>;
}

const titleOf = (kind, r) => (kind === 'communities' || kind === 'people' ? r.name : kind === 'posts' ? r.excerpt : r.title);
function metaOf(kind, r) {
  if (kind === 'communities') return r.member ? 'Member' : null;
  if (kind === 'people') return r.headline;
  if (kind === 'events') return r.start ? shortDate(r.start) : null;
  return r.community?.name ?? null;
}

export default function SearchBox({ inputRef }) {
  const nav = useNavigate();
  const loc = useLocation();
  const base = useId().replace(/:/g, '');
  const ownRef = useRef(null);
  const ref = inputRef ?? ownRef;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [s, setS] = useState({ status: 'idle', results: null, for: '' });
  const [active, setActive] = useState(-1);
  const abort = useRef(null);

  // Suggestions for the current text, debounced; a newer keystroke cancels the older request.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { abort.current?.abort(); setS({ status: 'idle', results: null, for: '' }); return undefined; }
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setS((prev) => ({ ...prev, status: 'loading' }));
      fetchSuggestions(text, ctrl.signal)
        .then((results) => { if (!ctrl.signal.aborted) setS({ status: 'ready', results, for: text }); })
        .catch(() => { if (!ctrl.signal.aborted) setS({ status: 'error', results: null, for: text }); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => () => abort.current?.abort(), []);
  // A new page closes the box.
  useEffect(() => { setOpen(false); setActive(-1); }, [loc.pathname, loc.search]);

  // Flat list of options, in display order, for arrow keys and aria-activedescendant.
  const groups = s.results ? SEARCH_KINDS.map(([kind, label]) => ({ kind, label, items: s.results[kind] ?? [] })).filter((g) => g.items.length) : [];
  const options = groups.flatMap((g) => g.items.map((r) => ({ kind: g.kind, r, to: resultPath(g.kind, r), id: `${base}-${g.kind}-${r.id}` })));
  useEffect(() => { setActive(-1); }, [s.results]);
  const text = q.trim();
  const showPop = open && text.length >= 2;

  const go = (to) => { setOpen(false); setActive(-1); setQ(''); nav(to); };
  const all = () => { if (text.length >= 2) { setOpen(false); nav(`/search?q=${encodeURIComponent(text)}`); } };
  const onKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i < 0 ? (d > 0 ? 0 : options.length - 1) : (i + d + options.length) % options.length));
    } else if (e.key === 'Escape') {
      if (showPop) { e.preventDefault(); setOpen(false); setActive(-1); } else if (q) { e.preventDefault(); setQ(''); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showPop && active >= 0 && options[active]) go(options[active].to);
      else all();
    }
  };

  const listId = `${base}-list`;
  const activeId = showPop && active >= 0 ? options[active]?.id : undefined;
  useEffect(() => { if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' }); }, [activeId]);

  return (
    <form role="search" className="relative flex min-w-0 max-w-[560px] flex-1 items-center" onSubmit={(e) => { e.preventDefault(); all(); }}>
      <label className="sr-only" htmlFor={`${base}-q`}>Search</label>
      <span className="pointer-events-none absolute left-3 text-[var(--az-text-3)]"><Icon name="search" size={18} /></span>
      <input id={`${base}-q`} ref={ref} type="search" className="input !min-h-10 w-full !py-2 !pl-10 !pr-11 [&::-webkit-search-cancel-button]:hidden" placeholder="Search CommunityOne"
        value={q} maxLength={80} autoComplete="off" spellCheck={false}
        role="combobox" aria-autocomplete="list" aria-expanded={showPop} aria-controls={listId} aria-activedescendant={activeId}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey} />
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 rounded border border-[var(--az-hairline)] bg-[var(--az-sunken)] px-1.5 text-xs leading-[18px] text-[var(--az-text-3)]">/</span>

      {showPop && (
        // Clicks inside keep the focus in the box, so blur doesn't close it before a click lands.
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]"
          onMouseDown={(e) => e.preventDefault()}>
          <div id={listId} role="listbox" aria-label="Suggestions" className="flex flex-col gap-0.5">
            {groups.map((g) => (
              <div key={g.kind} role="group" aria-labelledby={`${base}-${g.kind}-h`}>
                <div id={`${base}-${g.kind}-h`} role="presentation" className="t-label px-3 pb-0.5 pt-2">{g.label}</div>
                {g.items.map((r) => {
                  const o = options.find((x) => x.kind === g.kind && x.r === r);
                  const selected = activeId === o.id;
                  const meta = metaOf(g.kind, r);
                  return (
                    <Link key={r.id} id={o.id} to={o.to} role="option" aria-selected={selected} tabIndex={-1}
                      onClick={(e) => { e.preventDefault(); go(o.to); }} onMouseEnter={() => setActive(options.indexOf(o))}
                      className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-[var(--az-text)] ${selected ? 'bg-[var(--az-sunken)]' : ''}`}>
                      <Lead kind={g.kind} r={r} />
                      <span className="min-w-0 flex-1 truncate">{titleOf(g.kind, r)}</span>
                      {meta && <span className="t-small ml-auto max-w-[45%] shrink-0 truncate">{meta}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
          <p role="status" aria-live="polite" className={groups.length || s.status === 'idle' ? 'sr-only' : 't-small px-3 py-2.5'}>
            {s.status === 'loading' && !s.results ? 'Searching…'
              : s.status === 'error' ? 'Suggestions aren’t available right now. Press Enter to search.'
                : s.status === 'ready' && !groups.length ? `No suggestions for “${s.for}”. Press Enter to search everything.`
                  : s.status === 'ready' ? `${options.length} ${options.length === 1 ? 'suggestion' : 'suggestions'}` : ''}
          </p>
          <Link to={`/search?q=${encodeURIComponent(text)}`} tabIndex={-1} onClick={(e) => { e.preventDefault(); all(); }}
            className="mt-0.5 flex min-h-10 items-center gap-2 border-t border-[var(--az-hairline)] px-3 text-sm font-semibold text-[var(--az-link)]">
            <span className="min-w-0 flex-1 truncate">See all results for “{text}”</span><Icon name="search" size={16} />
          </Link>
        </div>
      )}
    </form>
  );
}
