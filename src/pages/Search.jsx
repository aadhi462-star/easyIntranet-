import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { timeAgo, useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { Empty, PageHeader } from '../components/ui.jsx';
import { GUEST } from '../components/feed/utils.js';
import { TYPES, buildIndex, savedSearchIds, searchIndex, termsOf, typeLabel } from '../lib/searchIndex.js';

function Highlight({ text, terms, max = 180 }) {
  if (!terms.length) return text.slice(0, max);
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = first > 60 ? first - 40 : 0;
  const snippet = (start ? '…' : '') + text.slice(start, start + max) + (text.length > start + max ? '…' : '');
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return snippet.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-leaf-500/30 px-0.5 text-white">{part}</mark> : part));
}

export default function Search() {
  const { state, user, me: current, dispatch } = useStore();
  const me = current ?? GUEST;
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const typeParam = params.get('type') || 'all';
  const type = typeParam === 'all' || TYPES.some(([id]) => id === typeParam) ? typeParam : 'all';
  const setType = (t) => setParams(t === 'all' ? { q } : { q, type: t });
  const [draft, setDraft] = useState(q);
  // Follow a new ?q= (e.g. from the header search) instead of keeping the old text.
  useEffect(() => { setDraft(q); }, [q]);
  const index = useMemo(() => buildIndex(state, user, me), [state, user, me]);
  const terms = termsOf(q);

  const results = useMemo(() => searchIndex(index, q), [index, q]);

  const counts = Object.fromEntries(TYPES.map(([id]) => [id, results.filter((r) => r.type === id).length]));
  const shown = TYPES.filter(([id]) => (type === 'all' || type === id) && counts[id]);
  const typeMeta = TYPES.find(([id]) => id === type);

  const saved = current ? (state.savedSearches || []).filter((x) => x.userId === current.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) : [];
  const norm = (x) => String(x || '').trim().toLowerCase();
  const alreadySaved = saved.find((x) => norm(x.q) === norm(q) && (x.type || 'all') === type);
  const saveSearch = () => {
    if (!current || !q.trim() || alreadySaved) return;
    // Everything that matches right now counts as seen, so alerts only fire for new results.
    const lastSeenIds = savedSearchIds(index, { q, type });
    dispatch({ type: 'add', col: 'savedSearches', item: { userId: current.id, q: q.trim(), type, name: '', lastSeenIds } });
    toast('Search saved. We’ll alert you to new results');
  };

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `${results.length} result${results.length === 1 ? '' : 's'} for “${q}”` : 'Search across the whole network'}
        actions={current && q.trim() ? (alreadySaved
          ? <span className="chip min-h-11 !px-4" role="status">🔖 Saved · alerts on</span>
          : <button type="button" className="btn btn-ghost min-h-11" onClick={saveSearch} aria-label={`Save this search for “${q}”${type !== 'all' ? ` in ${typeLabel(type)}` : ''} and get alerts for new results`}>🔖 Save this search</button>) : null} />
      <form className="mb-4 flex gap-2" role="search" onSubmit={(e) => { e.preventDefault(); setParams(draft.trim() ? { q: draft.trim() } : {}); }}>
        <input className="input min-w-0" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Try “mentorship”, “Bengaluru” or a name" aria-label="Search query" />
        <button className="btn btn-primary min-h-11 shrink-0">Search</button>
      </form>
      <div className={current ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]' : ''}>
        <div className="min-w-0">
          {q && (
            <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
              <button onClick={() => setType('all')} aria-pressed={type === 'all'} className={`chip min-h-9 !px-3 ${type === 'all' ? '!bg-brand-500 !text-white' : ''}`}>All · {results.length}</button>
              {TYPES.filter(([id]) => counts[id] || id === type).map(([id, label, icon]) => (
                <button key={id} onClick={() => setType(id)} aria-pressed={type === id} className={`chip min-h-9 !px-3 ${type === id ? '!bg-brand-500 !text-white' : ''}`}>{icon} {label} · {counts[id]}</button>
              ))}
            </div>
          )}
          {!q ? <Empty icon="🔎" title="What are you looking for?">People, posts, groups, events, forums, manuals, files, ideas, messages, tasks, surveys and town halls.</Empty>
            : results.length === 0 ? <Empty icon="🫥" title="No matches">Try fewer or different words.{current && !alreadySaved ? ' Or save this search to be alerted when something matches.' : ''}</Empty>
            : !shown.length ? (
              <div className="glass p-8 text-center">
                <p className="font-semibold">No {typeMeta?.[1].toLowerCase() ?? 'results'} match “{q}”</p>
                <button type="button" className="btn btn-ghost mt-3 min-h-11" onClick={() => setType('all')}>Show all {results.length} result{results.length === 1 ? '' : 's'}</button>
              </div>
            )
            : shown.map(([id, label, icon]) => (
              <section key={id} className="mb-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{icon} {label}</h2>
                <ul className="glass divide-y divide-white/5">
                  {results.filter((r) => r.type === id).slice(0, type === 'all' ? 5 : 100).map((r) => (
                    <li key={r.id}>
                      <Link to={r.link} className="block p-4 hover:bg-white/5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-semibold text-white"><Highlight text={r.title} terms={terms} /></span>
                          <span className="chip">{label}</span>
                          {r.at && <span className="ml-auto text-xs text-slate-500">{timeAgo(r.at)}</span>}
                        </div>
                        {r.body && <p className="mt-1 break-words text-sm text-slate-400"><Highlight text={r.body} terms={terms} /></p>}
                      </Link>
                    </li>
                  ))}
                </ul>
                {type === 'all' && counts[id] > 5 && <button className="mt-2 min-h-9 text-sm text-brand-400 hover:underline" onClick={() => setType(id)}>See all {counts[id]} {label.toLowerCase()}</button>}
              </section>
            ))}
        </div>
        {current && <SavedSearches saved={saved} activeId={alreadySaved?.id} onRun={(x) => setParams(x.type && x.type !== 'all' ? { q: x.q, type: x.type } : { q: x.q })} />}
      </div>
    </>
  );
}

function SavedSearches({ saved, activeId, onRun }) {
  const { dispatch } = useStore();
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const startRename = (x) => { setEditing(x.id); setName(x.name || x.q); };
  const commit = (x) => {
    const n = name.trim();
    dispatch({ type: 'update', col: 'savedSearches', id: x.id, patch: { name: n && n !== x.q ? n : '' } });
    toast('Saved search renamed');
    setEditing(null);
  };
  return (
    <aside className="glass h-fit p-4 lg:sticky lg:top-4" aria-labelledby="saved-searches-h">
      <h2 id="saved-searches-h" className="text-sm font-bold">🔖 Saved searches</h2>
      <p className="mt-1 text-xs text-slate-400">We’ll notify you when new results match.</p>
      {!saved.length ? (
        <p className="mt-3 text-sm text-slate-400">Nothing saved yet. Search for something, then choose <b className="text-slate-300">Save this search</b>.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {saved.map((x) => {
            const title = x.name || x.q;
            return (
              <li key={x.id} className={`rounded-xl border p-2 ${x.id === activeId ? 'border-brand-500/60 bg-brand-500/10' : 'border-white/10'}`}>
                {editing === x.id ? (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); commit(x); }}>
                    <input ref={inputRef} className="input min-w-0 !py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(null); } }} aria-label={`New name for saved search “${title}”`} />
                    <button className="btn btn-primary min-h-11 shrink-0 !px-3 text-sm">Save</button>
                  </form>
                ) : (
                  <div className="flex items-center gap-1">
                    <button type="button" className="min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left hover:bg-white/5" onClick={() => onRun(x)}
                      aria-label={`Run saved search “${title}”`} aria-current={x.id === activeId ? 'true' : undefined}>
                      <span className="block truncate text-sm font-semibold">{title}</span>
                      <span className="block truncate text-xs text-slate-400">{x.name ? `“${x.q}” · ` : ''}{typeLabel(x.type || 'all')} · saved {timeAgo(x.createdAt)}</span>
                    </button>
                    <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 !p-0" onClick={() => startRename(x)} aria-label={`Rename saved search “${title}”`} title="Rename">✎</button>
                    <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 !p-0 text-rose-300" onClick={() => { dispatch({ type: 'remove', col: 'savedSearches', id: x.id }); toast('Saved search deleted'); }} aria-label={`Delete saved search “${title}”`} title="Delete">✕</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
