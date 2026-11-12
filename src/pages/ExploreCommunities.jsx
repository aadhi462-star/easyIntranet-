// Explore, signed in (v2 workstream D, D5): Public and Private communities from
// GET /communities?scope=discover, yours included and marked, with the nine categories as
// filters, three sorts and pages of 24 (Show more). Closed communities never appear (VIS-04).
// Search, category and sort live in the address so links like /explore?category=Alumni work and
// Back returns to the same list; "Hide ones I'm in" is remembered per browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories.js';
import { api } from '../lib/api.js';
import { communityPath, errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';
import { Icon } from '../components/icons.jsx';
import { Button } from '../components/ui/Controls.jsx';
import { CardSkeletons, CommunityTile, members, NoCommunities, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import MembershipAction, { MembershipBadge } from '../components/groups/MembershipAction.jsx';

const SORTS = [['members', 'Most members'], ['newest', 'Newest'], ['name', 'A to Z']];
// Shorter chip labels where the full name is long (the board's strip).
const CHIP_LABEL = { 'General Community': 'General' };
const HIDE_KEY = 'c1-explore-hide-mine';
const readHide = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
const saveHide = (on) => { try { localStorage.setItem(HIDE_KEY, on ? '1' : '0'); } catch { /* private window */ } };
const categoryOf = (c) => (CATEGORIES.includes(c) ? c : 'Other');

function discoverUrl({ q, category, sort, hideMine, page }) {
  const p = new URLSearchParams({ scope: 'discover', page: String(page) });
  if (q) p.set('q', q);
  if (category) p.set('category', category);
  if (sort) p.set('sort', sort);
  if (hideMine) p.set('hideMine', '1');
  return `/communities?${p}`;
}

export default function ExploreCommunities() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = CATEGORIES.includes(params.get('category')) ? params.get('category') : '';
  const sort = SORTS.some(([v]) => v === params.get('sort')) ? params.get('sort') : 'members';
  const [hideMine, setHideMine] = useState(readHide);
  const [text, setText] = useState(q);
  const [s, setS] = useState({ status: 'loading', communities: [], total: 0, page: 1, counts: null });
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => { document.title = 'Explore · CommunityOne'; }, []);

  const setParam = useCallback((key, value, { replace = false } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace });
  }, [setParams]);

  // Search as you type, after a 250 ms pause (no request per key).
  // The address changed (Back, a link, Clear): show its search, keeping what's typed when it matches.
  useEffect(() => { setText((t) => (t.trim() === q ? t : q)); }, [q]);
  useEffect(() => {
    const t = text.trim();
    if (t === q) return undefined;
    const id = setTimeout(() => setParam('q', t, { replace: true }), 250);
    return () => clearTimeout(id);
  }, [text, q, setParam]);

  // First page whenever the filters change; Show more appends the next one.
  const load = useCallback(async (page) => {
    const mine = ++seq.current;
    const d = await api(discoverUrl({ q, category, sort: sort === 'members' ? '' : sort, hideMine, page }));
    if (mine !== seq.current) return null;
    return d;
  }, [q, category, sort, hideMine]);

  useEffect(() => {
    let live = true;
    setS((prev) => ({ ...prev, status: 'loading' }));
    load(1).then((d) => {
      if (live && d) setS({ status: 'ready', communities: d.communities, total: d.total, page: d.page, counts: d.categoryCounts });
    }, (err) => live && setS((prev) => ({ ...prev, status: 'error', message: errorText(err) })));
    return () => { live = false; };
  }, [load, attempt]);

  const showMore = async () => {
    setMore(true);
    try {
      const d = await load(s.page + 1);
      if (d) setS((prev) => ({ ...prev, communities: [...prev.communities, ...d.communities.filter((c) => !prev.communities.some((x) => x.id === c.id))], total: d.total, page: d.page, counts: d.categoryCounts }));
    } catch (err) { toast(errorText(err), 'error'); } finally { setMore(false); }
  };

  // After a join or withdraw, reload what is shown so far (statuses and counts change).
  const refresh = useCallback(async () => {
    try {
      const pages = await Promise.all(Array.from({ length: s.page }, (_, i) => api(discoverUrl({ q, category, sort: sort === 'members' ? '' : sort, hideMine, page: i + 1 }))));
      const last = pages[pages.length - 1];
      setS({ status: 'ready', communities: pages.flatMap((p) => p.communities), total: last.total, page: last.page, counts: last.categoryCounts });
    } catch { /* the action already said what happened */ }
  }, [s.page, q, category, sort, hideMine]);

  const toggleHide = () => { setHideMine((on) => { saveHide(!on); return !on; }); };
  const clearAll = () => { setText(''); setParams({}, { replace: false }); };
  const all = s.counts ? Object.values(s.counts).reduce((n, x) => n + x, 0) : null;
  const filtered = !!(q || category);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
      <header>
        <h1 className="t-h1">Explore communities</h1>
        <p className="mt-1 max-w-2xl text-[var(--az-text-2)]">
          Public communities are open to everyone. Private ones accept members by request. Closed communities are invitation only and never listed.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="relative min-w-0 flex-[1_1_260px] sm:max-w-md">
            <span className="sr-only">Search communities</span>
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--az-text-2)]" />
            <input className="input w-full !pl-10" type="search" placeholder="Search communities" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            Sort
            <select className="input !w-auto" value={sort} onChange={(e) => setParam('sort', e.target.value === 'members' ? '' : e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button type="button" role="switch" aria-checked={hideMine} onClick={toggleHide}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-1 text-sm font-medium text-[var(--az-text)]">
            <span aria-hidden="true" className={`relative inline-block h-6 w-10 rounded-full border transition ${hideMine ? 'border-[var(--az-fill)] bg-[var(--az-fill)]' : 'border-[var(--az-control)] bg-[var(--az-sunken)]'}`}>
              <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-[var(--az-surface)] shadow transition-all ${hideMine ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            Hide ones I’m in
          </button>
        </div>

        <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {[['', 'All', all], ...CATEGORIES.map((k) => [k, CHIP_LABEL[k] ?? k, s.counts?.[k]])].map(([value, label, n]) => (
            <button key={value || 'all'} type="button" className="filter-chip shrink-0" aria-pressed={category === value} onClick={() => setParam('category', value)}>
              {label}{n != null && <span className="ml-1.5 font-normal opacity-75">{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <p className="t-small" role="status" aria-live="polite">
        {s.status === 'ready' ? `${s.total} ${s.total === 1 ? 'community' : 'communities'}` : s.status === 'loading' ? 'Loading communities' : ''}
      </p>

      {s.status === 'loading' && !s.communities.length ? <CardSkeletons n={6} />
        : s.status === 'error' ? (
          <div role="alert" className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">Couldn’t load communities. {s.message}</p>
              <p className="t-small">Your search and filters stay as they were.</p>
            </div>
            <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          </div>
        ) : s.communities.length === 0 ? (
          <NoCommunities title={q ? `No communities match “${q}”` : filtered ? 'No communities in this category yet' : 'No communities to explore yet'}>
            <p>{filtered ? 'Try other words or another category. Closed communities are never listed.' : hideMine ? 'You’re in every community listed. Switch off “Hide ones I’m in” to see them.' : 'Closed communities are never listed.'}</p>
            {filtered && <Button className="mt-3" onClick={clearAll}>Clear search and filters</Button>}
          </NoCommunities>
        ) : (
          <>
            <ul className={`grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4 ${s.status === 'loading' ? 'opacity-60' : ''}`} aria-busy={s.status === 'loading' || undefined}>
              {s.communities.map((c) => <li key={c.id} className="flex"><ExploreCard c={c} onChange={refresh} /></li>)}
            </ul>
            {s.communities.length < s.total && (
              <div className="flex flex-col items-center gap-2">
                <Button busy={more} onClick={showMore}>Show more</Button>
                <span className="t-small">Showing {s.communities.length} of {s.total}</span>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function ExploreCard({ c, onChange }) {
  return (
    <article className="panel flex w-full min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <CommunityTile c={c} />
        <div className="min-w-0">
          <h2 className="t-h3 truncate"><Link to={communityPath(c)} className="hover:underline">{c.name}</Link></h2>
          <p className="t-small">{categoryOf(c.category)} · {members(c.memberCount ?? 0)}</p>
        </div>
      </div>
      {c.description && <p className="line-clamp-3 text-sm leading-relaxed text-[var(--az-text-2)]">{c.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <span className="flex flex-wrap items-center gap-2">
          <VisibilityBadge visibility={c.visibility} />
          <MembershipBadge c={c} />
          {c.visibility === 'private' && !c.membership?.state && <span className="t-small">Admins approve requests</span>}
        </span>
        <MembershipAction c={c} onChange={onChange} />
      </div>
    </article>
  );
}
