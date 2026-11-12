// Community cards for the public pages, fed by GET /api/public/communities. Every number shown
// comes from that response; nothing is estimated (C5).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicCommunities } from '../../lib/public.js';
import { accentOf, communityPath } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';
import { Badge } from '../ui/Controls.jsx';

// Lettered tile until communities have uploaded logos: "Bengaluru Chapter" → BC, "AlumniZone" → AZ.
export const initials = (name) => name.split(/\s+|(?=[A-Z][a-z])/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const members = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;
/** Sign-up first, then on to the community. */
export const joinPath = (id) => `/signup?next=${encodeURIComponent(communityPath(id))}`;
/** Router state for a Join link, so Create account can say which community it returns to. */
export const joinState = (c) => ({ community: c.name });

export function eventWhen(e) {
  const d = new Date(e.start);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return e.allDay ? `${day} · All day` : `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Loads public communities for the given filters; `retry` refetches after an error. */
export function usePublicCommunities({ q = '', category = '', limit = 24 } = {}) {
  const [state, setState] = useState({ status: 'loading', communities: [], categories: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, status: 'loading' }));
    fetchPublicCommunities({ q, category, limit })
      .then((d) => live && setState({ status: 'ready', communities: d.communities, categories: d.categories ?? [] }))
      .catch((err) => live && setState((s) => ({ ...s, status: 'error', message: err.message })));
    return () => { live = false; };
  }, [q, category, limit, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

const VISIBILITY = { public: ['ok', 'globe', 'Public'], private: ['info', 'lock', 'Private'], closed: ['neutral', 'eyeoff', 'Closed'] };
export function VisibilityBadge({ visibility }) {
  const [tone, icon, label] = VISIBILITY[visibility] ?? VISIBILITY.public;
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

export function CommunityTile({ c, size = 44 }) {
  return (
    <span aria-hidden="true" className={`cm-tile cm-${accentOf(c)}`}
      style={{ width: size, height: size, fontSize: size * 0.34, borderRadius: Math.round(size * 0.24) }}>
      {initials(c.name)}
    </span>
  );
}

/** `level` is the heading for the name: h3 under a section heading (Landing), h2 under the page title (Explore). */
export function CommunityCard({ c, level: H = 'h3' }) {
  const label = c.visibility === 'private' ? 'Request to join' : 'Join';
  return (
    <article className="panel flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <CommunityTile c={c} />
        <div className="min-w-0">
          <H className="t-h3 truncate">{c.name}</H>
          <p className="t-small">{[c.category, members(c.memberCount)].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {c.description && <p className="line-clamp-3 text-sm leading-relaxed text-[var(--az-text-2)]">{c.description}</p>}
      {c.upcomingEvents?.[0] && <p className="t-small truncate">Next event · {eventWhen(c.upcomingEvents[0])} · {c.upcomingEvents[0].title}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <VisibilityBadge visibility={c.visibility} />
        <Link className="btn btn-secondary btn-sm" to={joinPath(c.id)} state={joinState(c)} aria-label={`${label}: ${c.name}`}>{label}</Link>
      </div>
    </article>
  );
}

export function CardSkeletons({ n = 6 }) {
  return (
    <div role="status" aria-label="Loading communities" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3"><span className="skeleton h-11 w-11 !rounded-[10px]" /><span className="skeleton h-4 w-1/2" /></div>
          <span className="skeleton h-3 w-11/12" /><span className="skeleton h-3 w-3/4" />
          <span className="skeleton mt-2 h-9 w-24 self-end !rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function LoadError({ onRetry }) {
  return (
    <div role="alert" className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="font-semibold">Couldn’t load communities</p>
        <p className="t-small">Check your connection, then try again.</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function NoCommunities({ title = 'No communities found', children }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-10 text-center">
      <Icon name="search" size={28} className="text-[var(--az-text-2)]" />
      <p className="font-semibold">{title}</p>
      <div className="max-w-md text-sm text-[var(--az-text-2)]">{children}</div>
    </div>
  );
}
