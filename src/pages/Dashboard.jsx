// Home (refined design system, board R1Home): what needs you first, as the one featured item,
// then what's new in your communities, what's coming up and communities you might join.
// Everything comes from GET /api/dashboard, which applies the same access and block rules as
// the full screens, so Home never shows more than the pages it links to.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, timeAgo, useStore } from '../lib/store.jsx';
import { accentOf, communityApi, communityPath } from '../lib/communities.js';
import { isUrl, whenText } from '../components/events/eventUtils.js';
import { fetchDashboard } from '../lib/events.js';
import { acknowledge, errorText } from '../lib/feed.js';
import { useCommunityWrite } from '../components/groups/useCommunity.js';
import { Avatar } from '../components/ui.jsx';
import { CommunityTile } from '../components/public/CommunityCards.jsx';

/**
 * The dashboard summary from the server: one request on mount, refreshed when the window regains
 * focus and when a different person signs in. The server decides what this member may see.
 */
function useDashboard() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fetchDashboard()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ data: s.data, error, loading: false })));
  }, []);
  useEffect(() => {
    load();
    const onFocus = () => load();
    const onSession = () => { setState({ data: null, error: null, loading: true }); load(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('c1-session-changed', onSession);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('c1-session-changed', onSession); };
  }, [load]);
  // Acknowledged reads leave the list straight away; the next refresh confirms it.
  const dropRead = (id) => setState((s) => ({ ...s, data: s.data && { ...s.data, mandatoryReads: s.data.mandatoryReads.filter((p) => p.id !== id) } }));
  return { ...state, reload: load, dropRead };
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const startOf = (e) => e.nextStart ?? e.start;

/** One line under the greeting that says what needs you, from the same data as the page. */
function summary(d) {
  const parts = [];
  const replies = d.replies.reduce((n, r) => n + r.count, 0);
  if (replies) parts.push(`${count(replies, 'reply', 'replies')} to your posts`);
  if (d.mandatoryReads.length) parts.push(`${count(d.mandatoryReads.length, 'Mandatory Read')} to acknowledge`);
  if (d.connectionRequests) parts.push(count(d.connectionRequests, 'connection request'));
  return parts.length ? `You have ${parts.join(', ')}.` : 'You’re all caught up. Here’s what’s new across your communities.';
}

export default function Dashboard() {
  const { me } = useStore();
  const dash = useDashboard();
  const d = dash.data;
  useEffect(() => { document.title = 'Home · CommunityOne'; }, []);

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-8">
      <div>
        <h1 className="t-h1 text-white">{greeting()}, {me.name.split(' ')[0]}</h1>
        <p className="text-2 mt-1">{d ? summary(d) : 'Here’s what’s happening across your communities.'}</p>
      </div>
      {dash.error && (
        <div role="alert" className="glass flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="flex-1 text-rose-200">{d ? 'Couldn’t refresh Home. ' : 'Couldn’t load Home. '}{errorText(dash.error)}</span>
          <button className="btn btn-ghost" onClick={dash.reload} disabled={dash.loading}>{dash.loading ? 'Retrying…' : 'Try again'}</button>
        </div>
      )}
      {!d && dash.loading && (
        <div aria-busy="true" aria-label="Loading Home" className="grid gap-4 md:grid-cols-[3fr_2fr]">
          <div className="raised h-48 animate-pulse" /><div className="band h-48 animate-pulse" />
        </div>
      )}
      {d && (
        <>
          <NeedsYou d={d} onAcked={dash.dropRead} />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WhatsNew posts={d.recentPosts} />
            <aside className="flex flex-col gap-8">
              <ComingUp events={d.upcomingEvents} />
              <MightJoin list={d.suggested} onJoined={dash.reload} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The featured item: replies to you if there are any, otherwise the first Mandatory Read,
 * otherwise the next event. Up to two other things that need you sit beside it.
 */
function NeedsYou({ d, onAcked }) {
  const items = [
    ...d.replies.map((r) => ({ kind: 'replies', key: `r-${r.postId}`, r })),
    ...d.mandatoryReads.map((p) => ({ kind: 'read', key: `m-${p.id}`, p })),
    ...(d.connectionRequests ? [{ kind: 'connections', key: 'c', n: d.connectionRequests }] : []),
    ...d.upcomingEvents.slice(0, 1).map((e) => ({ kind: 'event', key: `e-${e.id}`, e })),
  ];
  if (!items.length) {
    return (
      <section aria-label="Getting started" className="band flex flex-wrap items-center gap-4 p-6">
        <p className="text-2 min-w-0 flex-[1_1_320px]">Nothing needs you right now. Find more communities to join, or say hello in one of yours.</p>
        <Link to="/groups?tab=discover" className="btn btn-ghost">Explore communities</Link>
      </section>
    );
  }
  const [lead, ...rest] = items;
  return (
    <section aria-label="Needs you" className={`grid gap-4 ${rest.length ? 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'max-w-[720px]'}`}>
      <Featured item={lead} onAcked={onAcked} />
      {rest.length > 0 && <div className="flex flex-col gap-3">{rest.slice(0, 2).map((it) => <Small key={it.key} item={it} />)}</div>}
    </section>
  );
}

function Featured({ item, onAcked }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (item.kind === 'replies') {
    const { r } = item;
    return (
      <article className="raised flex flex-col gap-3 p-6">
        <span className="t-label">{count(r.count, 'reply', 'replies')} to your post · {r.community.name}</span>
        <p className="t-h3 line-clamp-2 text-white">“{r.excerpt}”</p>
        <ul className="list-rows text-2 text-sm">
          {r.latest.map((c) => <li key={c.id} className="py-2"><b className="text-white">{c.author}</b> · <span className="line-clamp-2 inline">{c.excerpt}</span></li>)}
        </ul>
        <Link to={`/post/${r.postId}`} className="btn btn-primary self-start">Read and reply</Link>
      </article>
    );
  }
  if (item.kind === 'read') {
    const { p } = item;
    const ack = async () => {
      setBusy(true); setError('');
      try { await acknowledge(p.id); onAcked(p.id); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
    };
    return (
      <article className="raised flex flex-col gap-3 p-6">
        <span className="t-label">Mandatory Read · {p.community.name}</span>
        <Link to={`/post/${p.id}`} className="t-h3 line-clamp-3 text-white hover:underline">{p.excerpt}</Link>
        <span className="t-small">{p.author}{p.deadline ? ` · Due ${fmtDate(Date.parse(p.deadline), { day: 'numeric', month: 'short' })}` : ''}</span>
        <button className="btn btn-primary self-start" disabled={busy} onClick={ack}>{busy ? 'Saving…' : p.button || 'Acknowledge'}</button>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      </article>
    );
  }
  if (item.kind === 'connections') {
    return (
      <article className="raised flex flex-col gap-3 p-6">
        <span className="t-label">People</span>
        <p className="t-h3 text-white">{count(item.n, 'person wants', 'people want')} to connect with you</p>
        <Link to="/people" className="btn btn-primary self-start">Review requests</Link>
      </article>
    );
  }
  const { e } = item;
  return (
    <article className="raised flex flex-col gap-3 p-6">
      <span className="t-label">Next event{e.community ? ` · ${e.community.name}` : ''}</span>
      <p className="t-h3 text-white">{e.title}</p>
      <span className="t-small">{eventLine(e)}</span>
      <Link to={`/events/${e.id}`} className="btn btn-primary self-start">{e.myRsvp ? `You’re ${e.myRsvp === 'yes' ? 'going' : e.myRsvp}` : 'Are you going?'}</Link>
    </article>
  );
}

function Small({ item }) {
  const cls = 'glass flex min-h-[72px] flex-col justify-center gap-1 p-4 hover:border-[var(--color-ink-700)]';
  if (item.kind === 'replies') return <Link to={`/post/${item.r.postId}`} className={cls}><span className="t-label">{count(item.r.count, 'reply', 'replies')} · {item.r.community.name}</span><span className="line-clamp-1 font-semibold text-white">“{item.r.excerpt}”</span></Link>;
  if (item.kind === 'read') return <Link to={`/post/${item.p.id}`} className={cls}><span className="t-label">Mandatory Read · {item.p.community.name}</span><span className="line-clamp-1 font-semibold text-white">{item.p.excerpt}</span><span className="t-small">Open it to acknowledge</span></Link>;
  if (item.kind === 'connections') return <Link to="/people" className={cls}><span className="t-label">People</span><span className="font-semibold text-white">{count(item.n, 'connection request')}</span></Link>;
  const start = new Date(startOf(item.e));
  return (
    <Link to={`/events/${item.e.id}`} className={`${cls} !flex-row items-center gap-3`}>
      <DateBadge d={start} />
      <span className="min-w-0"><span className="block truncate font-semibold text-white">{item.e.title}</span><span className="t-small">{item.e.myRsvp ? `RSVP: ${item.e.myRsvp}` : 'Are you going?'}{item.e.community ? ` · ${item.e.community.name}` : ''}</span></span>
    </Link>
  );
}

function DateBadge({ d }) {
  return (
    <span className="grid w-12 shrink-0 place-items-center rounded-lg border border-[var(--az-hairline)] py-1 text-center">
      <span className="text-[11px] font-bold uppercase text-brand-300">{d.toLocaleString(undefined, { month: 'short' })}</span>
      <span className="text-lg font-bold leading-6 text-white">{d.getDate()}</span>
    </span>
  );
}

const eventLine = (e) => {
  const start = startOf(e);
  return [whenText(e, start, start + (e.end - e.start)), e.location && (isUrl(e.location) ? 'Map link' : e.location)].filter(Boolean).join(' · ');
};

/** What's new: a list, not cards. Each post shows its community in that community's colour. */
function WhatsNew({ posts }) {
  const { user } = useStore();
  return (
    <section aria-labelledby="new-h">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="new-h" className="t-h2 text-white">New in your communities</h2>
        <Link to="/feed" className="text-sm text-brand-300 hover:underline">All activity</Link>
      </div>
      {posts.length === 0
        ? <p className="text-3 border-t border-[var(--az-divider)] py-4 text-sm">No new posts yet. When members of your communities post, they’ll show here.</p>
        : (
          <ul className="list-rows border-t border-[var(--az-divider)]">
            {posts.map((p) => (
              <li key={p.id}>
                <Link to={`/post/${p.id}`} className="flex gap-3 py-4 hover:bg-white/[.02]">
                  {p.author.id ? <Avatar user={user(p.author.id) ?? p.author} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--az-sunken)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm"><b className="text-white">{p.author.name}</b> <span className="text-3">in</span> <span className={`cm-${accentOf(p.community)} cm-ink font-medium`}>{p.community.name}</span> <span className="text-3">· {timeAgo(Date.parse(p.publishedAt))}</span></span>
                    <span className="text-2 mt-0.5 line-clamp-2 block text-[15px] leading-6">{p.excerpt}</span>
                    {(p.likes > 0 || p.replies > 0) && <span className="t-small mt-1 block">{[p.likes && count(p.likes, 'like'), p.replies && count(p.replies, 'reply', 'replies')].filter(Boolean).join(' · ')}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Coming up: a short timeline. */
function ComingUp({ events }) {
  const list = events.slice(0, 4);
  return (
    <section aria-labelledby="up-h">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="up-h" className="t-h2 text-white">Coming up</h2>
        <Link to="/calendar" className="text-sm text-brand-300 hover:underline">Calendar</Link>
      </div>
      {list.length === 0
        ? <p className="text-3 text-sm">No upcoming events in your communities.</p>
        : (
          <ol className="flex flex-col border-l border-[var(--az-hairline)] pl-5">
            {list.map((e) => (
              <li key={e.id} className="relative pb-5 last:pb-0">
                <span aria-hidden="true" className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-ink-950)] bg-brand-400" />
                <Link to={`/events/${e.id}`} className="group block">
                  <span className="t-small block">{whenText(e, startOf(e), startOf(e) + (e.end - e.start))}</span>
                  <span className="block font-semibold text-white group-hover:underline">{e.title}</span>
                  <span className="t-small block">{[e.community?.name, e.location && (isUrl(e.location) ? 'Map link' : e.location)].filter(Boolean).join(' · ')}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}

/** Public communities you aren't in, most members first. Shown only when there are some. */
function MightJoin({ list, onJoined }) {
  const { run } = useCommunityWrite();
  const [busy, setBusy] = useState(null);
  if (!list.length) return null;
  const join = async (c) => {
    setBusy(c.id);
    try { if (await run(c.id, () => communityApi.join(c.id), { ok: `You joined ${c.name}` })) onJoined(); } finally { setBusy(null); }
  };
  return (
    <section aria-labelledby="join-h">
      <h2 id="join-h" className="t-h2 mb-3 text-white">You might join</h2>
      <ul className="list-rows">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <CommunityTile c={c} size={40} />
            <Link to={communityPath(c)} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate font-semibold text-white">{c.name}</span>
              <span className="t-small">{[c.category, count(c.memberCount, 'member')].filter(Boolean).join(' · ')}</span>
            </Link>
            <button className="btn btn-ghost" disabled={busy === c.id} onClick={() => join(c)} aria-label={`Join ${c.name}`}>{busy === c.id ? 'Joining…' : 'Join'}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
