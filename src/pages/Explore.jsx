// Public Explore (redesign Stage 2): search and browse Public and Private communities without an
// account. Closed communities never appear (the server leaves them out). Signed-in members use
// the in-app Explore instead.
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { PublicFooter, PublicHeader, usePageTitle } from '../components/public/PublicChrome.jsx';
import { CardSkeletons, CommunityCard, LoadError, NoCommunities, usePublicCommunities } from '../components/public/CommunityCards.jsx';

export default function Explore() {
  const { me } = useStore();
  if (me) return <Navigate to="/groups?tab=discover" replace />;
  return <PublicExplore />;
}

function PublicExplore() {
  usePageTitle('Explore Communities');
  // The landing page's search and category buttons open Explore with ?q= or ?category=.
  const [params] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [q, setQ] = useState((params.get('q') ?? '').trim());
  const [category, setCategory] = useState(params.get('category') ?? '');
  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { status, communities, categories, message, retry } = usePublicCommunities({ q, category, limit: 60 });
  const chip = (value, label) => (
    <button key={value || 'all'} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}
      className={`min-h-11 rounded-full px-4 text-sm transition ${category === value ? 'bg-[var(--az-text)] font-semibold text-[var(--color-ink-950)]' : 'border border-[var(--az-hairline)] font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-ink-950)]">
      <PublicHeader />
      <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-12 sm:px-8">
        <h1 className="text-[34px] font-bold tracking-tight text-[var(--az-text)] sm:text-[44px]">Explore communities</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-[var(--az-text-2)]">Public communities are open to everyone. Private ones accept members by request. Closed communities are invitation-only and never listed.</p>

        <div className="mt-8 flex flex-col gap-4">
          <label className="block max-w-xl">
            <span className="sr-only">Search communities</span>
            <input className="input !min-h-11" type="search" placeholder="Search by name, topic or category" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {categories.length > 0 && (
            <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
              {chip('', 'All')}
              {categories.map((c) => chip(c, c))}
            </div>
          )}
        </div>

        {/* Screen readers hear only the outcome, not every card again on each keystroke. */}
        <p className="sr-only" aria-live="polite">{status === 'ready' ? (communities.length ? `${communities.length} ${communities.length === 1 ? 'community' : 'communities'}` : 'No communities match.') : ''}</p>
        <div className="mt-8">
          {status === 'loading' && <CardSkeletons n={6} />}
          {status === 'error' && <LoadError message={message} onRetry={retry} />}
          {status === 'ready' && communities.length === 0 && (
            <NoCommunities>{q || category ? 'Nothing matches that search. Try other words or another category.' : 'No public communities yet. Create an account to start one.'}</NoCommunities>
          )}
          {status === 'ready' && communities.length > 0 && (
            <>
              <p className="mb-4 text-sm text-[var(--az-text-2)]">{communities.length} {communities.length === 1 ? 'community' : 'communities'}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {communities.map((c) => <CommunityCard key={c.id} c={c} />)}
              </div>
            </>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
