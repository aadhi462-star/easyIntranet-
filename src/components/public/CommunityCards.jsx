// Community cards for the public pages, fed by GET /api/public/communities. Every number shown
// comes from that response; nothing is estimated.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicCommunities } from '../../lib/public.js';
import { accentOf, communityPath } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';

// Lettered tile until communities have uploaded logos: "Bengaluru Chapter" → BC, "AlumniZone" → AZ.
export const initials = (name) => name.split(/\s+|(?=[A-Z][a-z])/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const members = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;
/** Sign-up first, then on to the community. */
export const joinPath = (id) => `/signup?next=${encodeURIComponent(communityPath(id))}`;

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

export function VisibilityBadge({ visibility }) {
  if (visibility === 'closed') return <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white/10 px-2.5 text-xs font-semibold text-slate-200"><Icon name="eyeoff" size={13} />Closed</span>;
  return visibility === 'private'
    ? <span className="inline-flex h-6 items-center gap-1 rounded-full bg-sky-500/15 px-2.5 text-xs font-semibold text-sky-300"><Icon name="lock" size={13} />Private</span>
    : <span className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-400/15 px-2.5 text-xs font-semibold text-brand-300"><Icon name="globe" size={13} />Public</span>;
}

export function CommunityTile({ c, size = 44 }) {
  return (
    <span aria-hidden="true" className={`cm-tile cm-${accentOf(c)}`}
      style={{ width: size, height: size, fontSize: size * 0.34, borderRadius: Math.round(size * 0.24) }}>
      {initials(c.name)}
    </span>
  );
}

export function CommunityCard({ c }) {
  return (
    <article className="glass flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <CommunityTile c={c} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{c.name}</h3>
          <p className="text-xs text-slate-400">{[c.category, members(c.memberCount)].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {c.description && <p className="text-2 line-clamp-3 text-sm leading-relaxed">{c.description}</p>}
      {c.upcomingEvents?.[0] && <p className="t-small truncate">Next event · {eventWhen(c.upcomingEvents[0])} · {c.upcomingEvents[0].title}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <VisibilityBadge visibility={c.visibility} />
        {c.visibility === 'private'
          ? <Link className="btn btn-ghost min-h-11 !px-4 text-sm" to={joinPath(c.id)} aria-label={`Request to join ${c.name}`}>Request to join</Link>
          : <Link className="btn btn-ghost min-h-11 !px-4 text-sm" to={joinPath(c.id)} aria-label={`Join ${c.name}`}>Join</Link>}
      </div>
    </article>
  );
}

export function CardSkeletons({ n = 6 }) {
  return (
    <div role="status" aria-label="Loading communities" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="glass flex animate-pulse flex-col gap-3 p-5">
          <div className="flex items-center gap-3"><div className="h-11 w-11 rounded-[10px] bg-white/5" /><div className="h-4 w-1/2 rounded bg-white/5" /></div>
          <div className="h-3 w-11/12 rounded bg-white/5" /><div className="h-3 w-3/4 rounded bg-white/5" />
          <div className="mt-2 h-8 w-24 self-end rounded-lg bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="glass flex flex-wrap items-center justify-between gap-3 border-rose-400/30 p-5 text-sm">
      <span className="text-rose-200">Couldn’t load communities. {message}</span>
      <button type="button" className="btn btn-ghost min-h-11" onClick={onRetry}>Try again</button>
    </div>
  );
}

export function NoCommunities({ children }) {
  return (
    <div className="glass flex flex-col items-center gap-2 p-10 text-center">
      <Icon name="search" size={28} className="text-slate-400" />
      <p className="font-semibold text-white">No communities found</p>
      <p className="max-w-md text-sm text-slate-400">{children}</p>
    </div>
  );
}
