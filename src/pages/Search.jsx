// Global search (redesign Stage 3): communities, people, events and posts from GET /api/search.
// The server applies each screen's own access rules, and every result opens a page that checks
// access again (SRC-05). The query lives in the address (?q=&type=), so a failed search can be
// retried and a search can be shared or bookmarked.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { timeAgo } from '../lib/store.jsx';
import { communityPath, NETWORK_COMMUNITY } from '../lib/communities.js';
import { Avatar, Empty, PageHeader } from '../components/ui.jsx';
import { CommunityTile, eventWhen, VisibilityBadge } from '../components/public/CommunityCards.jsx';

const TYPES = [['all', 'All'], ['communities', 'Communities'], ['people', 'People'], ['events', 'Events'], ['posts', 'Posts']];
const LABEL = Object.fromEntries(TYPES);

function Highlight({ text, q }) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="rounded bg-brand-400/25 px-0.5 text-white">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Runs the search for (q, type); `retry` runs it again after an error. */
function useSearch(q, type) {
  const [s, setS] = useState({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (q.trim().length < 2) { setS({ status: 'idle' }); return; }
    let live = true;
    setS((prev) => ({ ...prev, status: 'loading' }));
    api(`/search?q=${encodeURIComponent(q.trim())}&type=${type}`)
      .then((r) => live && setS({ status: 'ready', results: r.results }))
      .catch((err) => live && setS({ status: 'error', message: err instanceof ApiError ? err.message : 'Search isn’t available right now.' }));
    return () => { live = false; };
  }, [q, type, attempt]);
  return { ...s, retry: () => setAttempt((n) => n + 1) };
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const type = TYPES.some(([id]) => id === params.get('type')) ? params.get('type') : 'all';
  const [draft, setDraft] = useState(q);
  // Follow a new ?q= (e.g. from the top-bar search) instead of keeping the old text.
  useEffect(() => { setDraft(q); }, [q]);
  const search = useSearch(q, type);
  const set = (next) => setParams(Object.fromEntries(Object.entries({ q, type, ...next }).filter(([k, v]) => v && !(k === 'type' && v === 'all'))));
  const results = search.results || {};
  const total = Object.values(results).reduce((n, list) => n + list.length, 0);
  useEffect(() => { document.title = q ? `${q} · Search · CommunityOne` : 'Search · CommunityOne'; }, [q]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" subtitle="Communities, people, events and posts you’re allowed to see." />
      <form role="search" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() }); }}>
        <input className="input flex-1" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search CommunityOne" aria-label="Search CommunityOne" autoFocus={!q} maxLength={80} />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show">
        {TYPES.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={type === id} onClick={() => set({ type: id })}
            className={`min-h-9 rounded-full px-3.5 text-sm transition ${type === id ? 'bg-[var(--az-text)] font-semibold text-[var(--color-ink-950)]' : 'border border-[var(--az-hairline)] font-medium text-slate-300 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{search.status === 'ready' ? `${total} ${total === 1 ? 'result' : 'results'}` : ''}</p>

      <div className="mt-6">
        {search.status === 'idle' ? <p className="text-sm text-slate-400">{q ? 'Type at least 2 characters.' : 'Type a name, a place, a skill or a word from a post.'}</p>
          : search.status === 'loading' && !search.results ? <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-16 animate-pulse" />)}</div>
            : search.status === 'error' ? (
              <div role="alert" className="glass p-6 text-center text-sm">
                <p className="text-rose-300">{search.message}</p>
                <button className="btn btn-ghost mt-3" onClick={search.retry}>Try again</button>
              </div>
            ) : total === 0 ? (
              <Empty icon="search" title={`Nothing found for “${q}”`}>Check the spelling, try fewer words, or <Link to="/groups?tab=discover" className="text-brand-400 underline">explore communities</Link>.</Empty>
            ) : (
              <div className="space-y-6">
                {results.communities?.length > 0 && <Group title="Communities" kind="communities" type={type} n={results.communities.length} onMore={() => set({ type: 'communities' })}>
                  {results.communities.map((c) => (
                    <Row key={c.id} to={communityPath(c)} lead={<CommunityTile name={c.name} size={40} accent={c.id === NETWORK_COMMUNITY} />}
                      title={<Highlight text={c.name} q={q} />}
                      meta={<>{[c.category, `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'}`, c.member && 'You’re a member', c.status === 'archived' && 'Archived'].filter(Boolean).join(' · ')}</>}
                      trail={<VisibilityBadge visibility={c.visibility} />} />
                  ))}
                </Group>}
                {results.people?.length > 0 && <Group title="People" kind="people" type={type} n={results.people.length} onMore={() => set({ type: 'people' })}>
                  {results.people.map((p) => (
                    <Row key={p.id} to={`/people/${p.id}`} lead={<Avatar user={{ name: p.name, hue: p.avatarHue ?? 200 }} size={40} />}
                      title={<Highlight text={p.name} q={q} />} meta={[p.headline, p.city].filter(Boolean).join(' · ')} />
                  ))}
                </Group>}
                {results.events?.length > 0 && <Group title="Events" kind="events" type={type} n={results.events.length} onMore={() => set({ type: 'events' })}>
                  {results.events.map((e) => (
                    <Row key={e.id} to={`/events/${e.id}`} title={<Highlight text={e.title} q={q} />}
                      meta={[eventWhen(e), e.community?.name].filter(Boolean).join(' · ')} />
                  ))}
                </Group>}
                {results.posts?.length > 0 && <Group title="Posts" kind="posts" type={type} n={results.posts.length} onMore={() => set({ type: 'posts' })}>
                  {results.posts.map((p) => (
                    <Row key={p.id} to={`/post/${p.id}`} title={<span className="font-normal text-slate-200"><Highlight text={p.excerpt} q={q} /></span>}
                      meta={[p.author, p.community?.name, timeAgo(Date.parse(p.at))].filter(Boolean).join(' · ')} />
                  ))}
                </Group>}
              </div>
            )}
      </div>
    </div>
  );
}

function Group({ title, kind, type, n, onMore, children }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
        {type === 'all' && n >= 5 && <button className="text-sm text-brand-400 hover:underline" onClick={onMore}>All {LABEL[kind].toLowerCase()}</button>}
      </div>
      <ul className="glass divide-y divide-[var(--az-hairline)]">{children}</ul>
    </section>
  );
}

function Row({ to, lead, title, meta, trail }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[.03]">
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{title}</span>
          {meta && <span className="block truncate text-xs text-slate-400">{meta}</span>}
        </span>
        {trail}
      </Link>
    </li>
  );
}
