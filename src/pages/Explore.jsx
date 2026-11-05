import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useStore, fmtDate, timeAgo } from '../lib/store.jsx';
import { AvatarStack, Logo, ThemeToggle } from '../components/ui.jsx';

// The public wall comes from the Feed module; render it only if that module is present.
const feedMods = import.meta.glob('../components/feed/PublicFeed.jsx');
const PublicFeed = feedMods['../components/feed/PublicFeed.jsx'] ? lazy(feedMods['../components/feed/PublicFeed.jsx']) : null;

/** Read-only look at the open community for visitors who haven't signed in. */
export default function Explore() {
  const { state, me } = useStore();
  const publicGroups = state.groups.filter((g) => (g.accessType ?? 'public') === 'public');
  const publicGroupIds = new Set(publicGroups.map((g) => g.id));
  const events = state.events
    .filter((e) => e.start > Date.now() && (e.scope?.type === 'network' || (e.scope?.type === 'group' && publicGroupIds.has(e.scope.id))))
    .sort((a, b) => a.start - b.start).slice(0, 4);
  const threads = state.forumPosts.filter((f) => f.status === 'published' && (!f.groupId || publicGroupIds.has(f.groupId))).slice(0, 4);

  return (
    <div className="relative min-h-full">
      <div className="aurora" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link to="/" aria-label="AlumniZone home"><Logo /></Link>
        {me ? <nav className="flex gap-2"><ThemeToggle /><Link to="/feed" className="btn btn-primary">Open my feed</Link></nav> : (
          <nav className="flex gap-2">
            <ThemeToggle />
            <Link to="/login" className="btn btn-ghost">Sign in</Link>
            <Link to="/signup" className="btn btn-primary">Join free</Link>
          </nav>
        )}
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <section className="glass flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Explore the community</h1>
            <p className="mt-1 text-sm text-slate-400">You’re looking around as a visitor. Join to post, comment, RSVP and message other alumni.</p>
          </div>
          {!me && <Link to="/signup" className="btn btn-primary h-11 px-5">Join the community</Link>}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <section aria-labelledby="wall-h">
            <h2 id="wall-h" className="mb-3 text-lg font-bold">On the wall</h2>
            {PublicFeed ? <Suspense fallback={<div className="glass h-40 animate-pulse" />}><PublicFeed limit={8} /></Suspense>
              : <div className="glass p-6 text-sm text-slate-400">The public wall is loading.</div>}
          </section>

          <aside className="space-y-6">
            <section aria-labelledby="spaces-h" className="glass p-5">
              <h2 id="spaces-h" className="font-bold">Public spaces</h2>
              <ul className="mt-3 space-y-3">
                {publicGroups.map((g) => (
                  <li key={g.id} className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-xl" aria-hidden="true">{g.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{g.name}</div>
                      <div className="text-xs text-slate-400">{g.members.length} members</div>
                    </div>
                    <Link to={me ? `/groups/${g.id}` : '/signup'} className="btn btn-ghost !px-3 !py-1.5 text-xs">{me ? 'Open' : 'Join'}</Link>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="events-h" className="glass p-5">
              <h2 id="events-h" className="font-bold">Upcoming events</h2>
              {events.length === 0 ? <p className="mt-2 text-sm text-slate-400">No public events coming up.</p> : (
                <ul className="mt-3 space-y-3">
                  {events.map((e) => (
                    <li key={e.id}>
                      <div className="text-sm font-semibold">{e.title}</div>
                      <div className="text-xs text-slate-400">{fmtDate(e.start)} · {e.location}</div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                        <AvatarStack ids={Object.keys(e.rsvps || {}).filter((k) => e.rsvps[k] === 'going')} size={22} />
                        {Object.values(e.rsvps || {}).filter((v) => v === 'going').length} going
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="forum-h" className="glass p-5">
              <h2 id="forum-h" className="font-bold">Discussions</h2>
              <ul className="mt-3 space-y-3">
                {threads.map((f) => (
                  <li key={f.id}>
                    <Link to={me ? `/forums/${f.id}` : '/signup'} className="text-sm font-semibold hover:underline">{f.title}</Link>
                    <div className="text-xs text-slate-400">{(f.replies || []).length} replies · {timeAgo(f.createdAt)}</div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
