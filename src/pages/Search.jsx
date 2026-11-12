// Global search results (v2 D9): communities, people, discussions, events, resources and courses
// from GET /api/search, with a tab per kind. The server applies each page's own access rules,
// and every result opens a page that checks access again (SRC-05). The query lives in the
// address (?q=&type=), so a failed search can be retried and a search shared or bookmarked.
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { timeAgo } from '../lib/store.jsx';
import { Avatar } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { Button, Skeleton } from '../components/ui/Controls.jsx';
import { CommunityTile, eventWhen, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { resultPath, SEARCH_KINDS } from '../components/search/SearchBox.jsx';

const TABS = [['all', 'All'], ...SEARCH_KINDS];
const LABEL = Object.fromEntries(TABS);
// What the server returns at most: 5 of each kind under All, 20 under one kind.
const CAP_ALL = 5;
const CAP_ONE = 20;

function Highlight({ text, q }) {
  if (!q || !text) return text ?? null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="rounded bg-[var(--az-warn-soft)] px-0.5 text-[var(--az-text)]">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Runs the search for (q, type); `retry` runs it again after an error. Stale answers are dropped. */
function useSearch(q, type) {
  const [s, setS] = useState({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (q.trim().length < 2) { setS({ status: 'idle' }); return undefined; }
    let live = true;
    setS((prev) => ({ ...prev, status: 'loading' }));
    api(`/search?q=${encodeURIComponent(q.trim())}${type === 'all' ? '' : `&type=${type}`}`)
      .then((r) => live && setS({ status: 'ready', results: r.results, for: `${q}|${type}` }))
      .catch((err) => live && setS({ status: 'error', message: err instanceof ApiError && err.status !== 0 && err.status < 500 ? err.message : 'Search isn’t available right now.' }));
    return () => { live = false; };
  }, [q, type, attempt]);
  return { ...s, retry: () => setAttempt((n) => n + 1) };
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const type = TABS.some(([id]) => id === params.get('type')) ? params.get('type') : 'all';
  const [draft, setDraft] = useState(q);
  // Follow a new ?q= (e.g. from the top-bar search) instead of keeping the old text.
  useEffect(() => { setDraft(q); }, [q]);
  const set = (next) => setParams(Object.fromEntries(Object.entries({ q, type, ...next }).filter(([k, v]) => v && !(k === 'type' && v === 'all'))));
  // All is one request; a kind's tab asks for that kind alone (up to 20). The All answer is
  // kept for the other tabs' counts while one kind is open.
  const overview = useSearch(q, 'all');
  const one = useSearch(type === 'all' ? '' : q, type);
  const search = type === 'all' ? overview : one;
  const results = search.results || {};
  const shown = type === 'all' ? SEARCH_KINDS.map(([k]) => k) : [type];
  const total = shown.reduce((n, k) => n + (results[k]?.length ?? 0), 0);
  useEffect(() => { document.title = q ? `${q} · Search · CommunityOne` : 'Search · CommunityOne'; }, [q]);

  const countOf = (k) => {
    if (k === type && type !== 'all' && one.results) { const n = one.results[k]?.length ?? 0; return n >= CAP_ONE ? `${CAP_ONE}+` : String(n); }
    if (!overview.results) return null;
    if (k === 'all') {
      const n = SEARCH_KINDS.reduce((m, [x]) => m + (overview.results[x]?.length ?? 0), 0);
      return SEARCH_KINDS.some(([x]) => (overview.results[x]?.length ?? 0) >= CAP_ALL) ? `${n}+` : String(n);
    }
    const n = overview.results[k]?.length ?? 0;
    return n >= CAP_ALL ? `${CAP_ALL}+` : String(n);
  };

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const tabRefs = useRef({});
  const onTabKey = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + d + TABS.length) % TABS.length;
    set({ type: TABS[j][0] });
    tabRefs.current[TABS[j][0]]?.focus();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="t-h1 text-[var(--az-text)]">Search</h1>
      <p className="mt-1 text-[15px] text-[var(--az-text-2)]">Communities, people, discussions, events, resources and courses you can open.</p>
      <form role="search" className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() }); }}>
        <label htmlFor="search-q" className="sr-only">Search CommunityOne</label>
        <input id="search-q" className="input flex-1" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search CommunityOne" autoFocus={!q} maxLength={80} />
        <Button variant="primary" type="submit" icon="search">Search</Button>
      </form>

      {q.trim().length >= 2 && (
        <div role="tablist" aria-label="Kinds of results" className="no-scrollbar mt-5 flex overflow-x-auto border-b border-[var(--az-hairline)]">
          {TABS.map(([id, label], i) => {
            const n = countOf(id);
            return (
              <button key={id} ref={(el) => { tabRefs.current[id] = el; }} type="button" role="tab" id={`search-tab-${id}`} aria-controls="search-panel"
                aria-selected={type === id} tabIndex={type === id ? 0 : -1} onClick={() => set({ type: id })} onKeyDown={(e) => onTabKey(e, i)}
                className={`min-h-11 shrink-0 border-b-2 px-3.5 text-sm ${type === id ? 'border-[var(--az-text)] font-semibold text-[var(--az-text)]' : 'border-transparent font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
                {label}{n != null && <span className="ml-1.5 tabular-nums text-[var(--az-text-3)]">{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{search.status === 'ready' ? `${total} ${total === 1 ? 'result' : 'results'}` : ''}</p>

      <div id="search-panel" role={q.trim().length >= 2 ? 'tabpanel' : undefined} aria-labelledby={q.trim().length >= 2 ? `search-tab-${type}` : undefined} className="mt-6">
        {search.status === 'idle' ? <p className="t-small">{q ? 'Type at least 2 characters.' : 'Type a name, a place, a skill or a word from a post.'}</p>
          : search.status === 'loading' && !search.results ? <div className="panel p-5"><Skeleton lines={5} label="Searching" /></div>
            : search.status === 'error' ? (
              <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
                <span className="flex-1"><strong>Search didn’t finish. </strong>{search.message}</span>
                <Button size="sm" onClick={search.retry}>Try again</Button>
              </div>
            ) : total === 0 ? (
              <div className="panel p-8 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--az-sunken)] text-[var(--az-text-3)]"><Icon name="search" size={22} /></span>
                <p className="t-h3 mt-3 text-[var(--az-text)]">Nothing found for “{q}”{type !== 'all' && ` in ${LABEL[type]}`}</p>
                <p className="t-small mt-1">Check the spelling or try fewer words.{type !== 'all' && <> Or <button type="button" className="link" onClick={() => set({ type: 'all' })}>search everything</button>.</>} You can also <Link to="/explore" className="link">explore communities</Link>.</p>
              </div>
            ) : (
              <div className="space-y-6" aria-busy={search.status === 'loading' || undefined}>
                {shown.map((kind) => (results[kind]?.length ? (
                  <Group key={kind} title={LABEL[kind]} more={type === 'all' && results[kind].length >= CAP_ALL ? () => set({ type: kind }) : null}>
                    {results[kind].map((r) => <Result key={r.id} kind={kind} r={r} q={q} />)}
                  </Group>
                ) : null))}
              </div>
            )}
      </div>
    </div>
  );
}

function Group({ title, more, children }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="t-label">{title}</h2>
        {more && <button type="button" className="link text-sm" onClick={more}>All {title.toLowerCase()}</button>}
      </div>
      <ul className="panel divide-y divide-[var(--az-hairline)] overflow-hidden">{children}</ul>
    </section>
  );
}

const ICON = { posts: 'forums', events: 'events', courses: 'cap' };

function Result({ kind, r, q }) {
  let lead; let title; let meta; let trail = null;
  if (kind === 'communities') {
    lead = <CommunityTile c={r} size={40} />;
    title = <Highlight text={r.name} q={q} />;
    meta = [r.category, `${r.memberCount} ${r.memberCount === 1 ? 'member' : 'members'}`, r.member && 'You’re a member', r.status === 'archived' && 'Archived'].filter(Boolean).join(' · ');
    trail = <VisibilityBadge visibility={r.visibility} />;
  } else if (kind === 'people') {
    lead = <Avatar user={{ name: r.name, hue: r.avatarHue ?? 200 }} size={40} />;
    title = <Highlight text={r.name} q={q} />;
    meta = [r.headline, r.city].filter(Boolean).join(' · ');
  } else {
    lead = <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--az-sunken)] text-[var(--az-text-2)]"><Icon name={kind === 'resources' ? (r.kind === 'file' ? 'doc' : 'link') : ICON[kind]} size={20} /></span>;
    if (kind === 'posts') {
      title = <span className="font-normal"><Highlight text={r.excerpt} q={q} /></span>;
      meta = [r.author, r.community?.name, r.at && timeAgo(Date.parse(r.at))].filter(Boolean).join(' · ');
    } else if (kind === 'events') {
      title = <Highlight text={r.title} q={q} />;
      meta = [eventWhen(r), r.community?.name].filter(Boolean).join(' · ');
    } else if (kind === 'resources') {
      title = <Highlight text={r.title} q={q} />;
      meta = [r.kind === 'file' ? 'File' : 'Link', r.community?.name, r.description].filter(Boolean).join(' · ');
    } else {
      title = <Highlight text={r.title} q={q} />;
      meta = ['Course', r.community?.name].filter(Boolean).join(' · ');
    }
  }
  return (
    <li>
      <Link to={resultPath(kind, r)} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--az-sunken)]">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--az-text)]">{title}</span>
          {meta && <span className="t-small block truncate">{meta}</span>}
        </span>
        {trail}
      </Link>
    </li>
  );
}
