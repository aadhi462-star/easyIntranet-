// Home (v2 workstream D, boards V2DShellHome and V2DPhone). A welcome line with quick actions,
// then groups in a fixed priority order (D3): needs you, coming up, continue learning, new in
// your communities, recommended Public communities. A group with nothing in it is left out.
// Someone in no communities gets the first-run Home instead (D4): nothing was joined for them.
// Everything comes from GET /api/dashboard, which applies the same access and block rules as the
// full screens, so Home never shows more than the pages it links to (NTF-10, CNT-15).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories.js';
import { fmtDate, timeAgo, useStore } from '../lib/store.jsx';
import { accentOf, communityApi, communityPath } from '../lib/communities.js';
import { isUrl, whenText } from '../components/events/eventUtils.js';
import { fetchDashboard } from '../lib/events.js';
import { acknowledge, errorText } from '../lib/feed.js';
import { useCommunityWrite } from '../components/groups/useCommunity.js';
import { Avatar } from '../components/ui.jsx';
import { Badge } from '../components/ui/Controls.jsx';
import { Icon } from '../components/icons.jsx';
import { CommunityTile, members, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { Progress } from '../components/learning/bits.jsx';
import { AnnouncementBar } from '../components/platform/bits.jsx';
import CommunityPicker from '../components/shell/CommunityPicker.jsx';
import { api } from '../lib/api.js';
import { useCanCreateCommunity } from '../lib/shell.js';
import { toast } from '../lib/toast.js';
import { coursePath, lessonPath, useMyLearning } from '../lib/learning.js';

const DAY = 864e5;

/**
 * The dashboard summary from the server: one request on mount, refreshed when the window regains
 * focus, when a different person signs in and when a membership changes.
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
    const onSession = () => { setState({ data: null, error: null, loading: true }); load(); };
    window.addEventListener('focus', load);
    window.addEventListener('c1-session-changed', onSession);
    window.addEventListener('c1-community-changed', load);
    return () => { window.removeEventListener('focus', load); window.removeEventListener('c1-session-changed', onSession); window.removeEventListener('c1-community-changed', load); };
  }, [load]);
  // Acknowledged reads and accepted invitations leave at once; the next refresh confirms it.
  const drop = (key, id) => setState((s) => ({ ...s, data: s.data && { ...s.data, [key]: (s.data[key] ?? []).filter((x) => x.id !== id) } }));
  return { ...state, reload: load, drop };
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const startOf = (e) => e.nextStart ?? e.start;
const day = (iso) => fmtDate(Date.parse(iso), { day: 'numeric', month: 'short' });
const RSVP = { yes: 'Going', going: 'Going', maybe: 'Maybe', no: 'Not going', not_going: 'Not going' };

/** One line under the greeting, from the same data as the page. */
function summary(d) {
  const parts = [];
  const replies = d.replies.reduce((n, r) => n + r.count, 0);
  if (replies) parts.push(`${count(replies, 'reply', 'replies')} to your posts`);
  if (d.mandatoryReads.length) parts.push(`${count(d.mandatoryReads.length, 'Mandatory Read')} to acknowledge`);
  if (d.invitations?.length) parts.push(count(d.invitations.length, 'invitation'));
  if (d.connectionRequests) parts.push(count(d.connectionRequests, 'connection request'));
  if (!parts.length) return 'You’re all caught up.';
  const last = parts.pop();
  return `You have ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}

export default function Dashboard() {
  const { me } = useStore();
  const dash = useDashboard();
  const d = dash.data;
  useEffect(() => { document.title = 'Home · CommunityOne'; }, []);
  // A platform announcement (Stage 7, D7) sits above the welcome until it ends or is dismissed.
  const [notice, setNotice] = useState(null);
  useEffect(() => { api('/announcements/current').then((x) => setNotice(x.announcement)).catch(() => {}); }, []);
  const dismiss = () => { const id = notice.id; setNotice(null); api(`/announcements/${id}/dismiss`, { method: 'POST' }).catch(() => {}); };
  const firstRun = d && d.communities.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {notice && <AnnouncementBar a={notice} onDismiss={dismiss} />}
      {dash.error && (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
          <span className="flex-1">{d ? 'Couldn’t refresh Home. ' : 'Couldn’t load Home. '}{errorText(dash.error)}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={dash.reload} disabled={dash.loading}>{dash.loading ? 'Trying again…' : 'Try again'}</button>
        </div>
      )}
      {!d && dash.loading && (
        <div aria-busy="true" aria-label="Loading Home" className="flex flex-col gap-4">
          <span className="skeleton h-9 w-2/3" /><span className="skeleton h-5 w-1/2" /><span className="skeleton h-40" /><span className="skeleton h-32" />
        </div>
      )}
      {d && (firstRun ? <FirstRun me={me} d={d} /> : <Populated me={me} d={d} dash={dash} />)}
    </div>
  );
}

function Populated({ me, d, dash }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h1">{greeting()}, {me.name.split(' ')[0]}</h1>
          <p className="mt-1 text-[15px] leading-6 text-[var(--az-text-2)]">{summary(d)}</p>
        </div>
        <QuickActions d={d} />
      </div>
      <NeedsYou d={d} onDrop={dash.drop} onChanged={dash.reload} />
      {/* Side by side on wide screens; either fills the row when the other has nothing to show. */}
      <div className="flex flex-col gap-8 lg:flex-row [&>*]:min-w-0 [&>*]:flex-1">
        <ComingUp d={d} />
        <ContinueLearning />
      </div>
      <WhatsNew posts={d.recentPosts} />
      <Recommended list={d.suggested} onJoined={dash.reload} />
    </>
  );
}

/** Start a discussion and Create an event only where you may; Find communities always (D3). */
function QuickActions({ d }) {
  const nav = useNavigate();
  const [picking, setPicking] = useState(false);
  const postIn = d.communities.filter((c) => (d.canPostIn ?? []).includes(c.id));
  const eventIn = d.communities.filter((c) => (d.canCreateEventsIn ?? []).includes(c.id));
  const startPost = () => (postIn.length === 1 ? nav(communityPath(postIn[0], 'discussions')) : setPicking(true));
  return (
    <div role="group" aria-label="Quick actions" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {postIn.length > 0 && <button type="button" className="btn btn-primary btn-sm flex-none" onClick={startPost}><Icon name="pen" size={16} />Start a discussion</button>}
      {eventIn.length > 0 && <Link to="/events?new=1" className="btn btn-secondary btn-sm flex-none"><Icon name="events" size={16} />Create an event</Link>}
      <Link to="/explore" className="btn btn-secondary btn-sm flex-none"><Icon name="explore" size={16} />Find communities</Link>
      {picking && <CommunityPicker communities={postIn} onClose={() => setPicking(false)} onPick={(c) => { setPicking(false); nav(communityPath(c, 'discussions')); }} />}
    </div>
  );
}

function Section({ id, title, link, note, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="t-h2">{title}</h2>
        {link}
      </div>
      {note && <p className="t-small -mt-2">{note}</p>}
      {children}
    </section>
  );
}

/**
 * Replies to your posts first; then Mandatory Reads, soonest due first; invitations to Closed
 * communities; connection requests. Each opens its own page, which checks access again.
 */
function NeedsYou({ d, onDrop, onChanged }) {
  const reads = [...d.mandatoryReads].sort((a, b) => (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity));
  const invitations = d.invitations ?? [];
  if (!d.replies.length && !reads.length && !invitations.length && !d.connectionRequests) return null;
  return (
    <Section id="needs-h" title="Needs you">
      <div className="grid gap-3 md:grid-cols-2">
        {d.replies.map((r) => <Replies key={r.postId} r={r} />)}
        {reads.map((p) => <MandatoryRead key={p.id} p={p} onAcked={() => onDrop('mandatoryReads', p.id)} />)}
        {invitations.map((i) => <Invitation key={i.id} inv={i} onAccepted={() => { onDrop('invitations', i.id); onChanged(); }} />)}
        {d.connectionRequests > 0 && (
          <Link to="/profile" className="panel flex min-h-11 items-center gap-3 px-4 py-3 hover:bg-[var(--az-sunken)]">
            <Icon name="people" size={20} className="text-[var(--az-link)]" />
            <span className="flex-1 font-semibold">{count(d.connectionRequests, 'person wants', 'people want')} to connect with you</span>
            <span className="link text-sm">Review</span>
          </Link>
        )}
      </div>
    </Section>
  );
}

function Replies({ r }) {
  return (
    <article className="panel flex flex-col gap-3 p-4 sm:p-5">
      <span className="t-label flex items-center gap-2"><Icon name="channels" size={16} className="text-[var(--az-link)]" />{count(r.count, 'reply', 'replies')} to your post · {r.community.name}</span>
      <p className="t-h3 line-clamp-2">“{r.excerpt}”</p>
      <ul className="flex flex-col gap-2 text-sm text-[var(--az-text-2)]">
        {r.latest.map((c) => <li key={c.id} className="line-clamp-2"><b className="font-semibold text-[var(--az-text)]">{c.author}</b> · {timeAgo(Date.parse(c.at))} · {c.excerpt}</li>)}
      </ul>
      <Link to={`/post/${r.postId}`} className="btn btn-primary btn-sm self-start">Read and reply</Link>
    </article>
  );
}

function MandatoryRead({ p, onAcked }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ack = async () => {
    setBusy(true); setError('');
    try { await acknowledge(p.id); onAcked(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <article className="panel flex flex-col gap-2.5 p-4 sm:p-5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="t-label flex items-center gap-2"><Icon name="mandatory" size={16} className="text-[var(--az-link)]" />Mandatory Read · {p.community.name}</span>
        {p.deadline && <Badge tone="warn" className="ml-auto">Due {day(p.deadline)}</Badge>}
      </span>
      <Link to={`/post/${p.id}`} className="line-clamp-3 text-[15px] leading-6 hover:underline">{p.excerpt}</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-small">{p.author} · {day(p.publishedAt)}</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={ack}><Icon name="check" size={16} />{busy ? 'Saving…' : p.button || 'Acknowledge'}</button>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
    </article>
  );
}

/** An invitation to a Closed community (workstream F's route): Accept here, or let it expire. */
function Invitation({ inv, onAccepted }) {
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try { await api(`/me/invitations/${encodeURIComponent(inv.id)}/accept`, { method: 'POST' }); toast(`You joined ${inv.community.name}`); onAccepted(); }
    catch (e) { toast(errorText(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <article className="panel flex flex-col gap-2.5 p-4 sm:p-5">
      <span className="t-label flex items-center gap-2"><Icon name="inbox" size={16} className="text-[var(--az-link)]" />Invitation</span>
      <p className="t-h3">{inv.invitedBy ? `${inv.invitedBy} invited you to ${inv.community.name}` : `You’re invited to ${inv.community.name}`}</p>
      <p className="t-small">{inv.community.visibility === 'closed' ? 'Closed community' : 'Community'}{inv.expiresAt ? ` · expires ${day(inv.expiresAt)}` : ''}</p>
      <button type="button" className="btn btn-primary btn-sm self-start" disabled={busy} onClick={accept}>{busy ? 'Accepting…' : 'Accept'}</button>
    </article>
  );
}

function DateTile({ at }) {
  const d = new Date(at);
  return (
    <span className="grid w-[52px] flex-none place-items-center rounded-[10px] border border-[var(--az-hairline)] bg-[var(--az-surface)] py-1 text-center">
      <b className="text-xs font-bold uppercase tracking-wide text-[var(--az-link)]">{d.toLocaleString(undefined, { month: 'short' })}</b>
      <span className="text-sm font-semibold">{d.getDate()}</span>
    </span>
  );
}

/** Events in the next 14 days, ones you haven't answered first. */
function ComingUp({ d }) {
  const soon = Date.now() + 14 * DAY;
  const list = (d.comingUp ?? d.upcomingEvents.filter((e) => startOf(e) <= soon)).slice(0, 5);
  if (!list.length) return null;
  return (
    <Section id="up-h" title="Coming up" link={<Link to="/events" className="link text-sm">All events</Link>}>
      <ul className="panel divide-y divide-[var(--az-hairline)]">
        {list.map((e) => {
          const start = startOf(e);
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <DateTile at={start} />
              <span className="min-w-0 flex-1">
                <Link to={`/events/${e.id}`} className="block truncate font-semibold hover:underline">{e.title}</Link>
                <span className="t-small block">{[e.location && (isUrl(e.location) ? 'Map link' : e.location), e.community?.name, whenText(e, start, start + (e.end - e.start))].filter(Boolean).join(' · ')}</span>
              </span>
              {e.myRsvp ? <Badge tone="ok">{RSVP[e.myRsvp] ?? 'Answered'}</Badge> : <Link to={`/events/${e.id}`} className="btn btn-secondary btn-sm">Are you going?</Link>}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Courses you're enrolled in and haven't finished. Hidden when there are none. */
function ContinueLearning() {
  const my = useMyLearning();
  const list = my.courses.filter((c) => c.enrollment?.status === 'active' && !c.enrollment.completedAt).slice(0, 3);
  if (!list.length) return null;
  return (
    <Section id="learn-h" title="Continue learning" link={<Link to="/learning" className="link text-sm">My Learning</Link>}>
      <ul className="panel divide-y divide-[var(--az-hairline)]">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <CommunityTile c={c.community} size={36} />
            <span className="min-w-0 flex-1 basis-40">
              <Link to={coursePath(c.community, c.id)} className="block truncate font-semibold hover:underline">{c.title}</Link>
              <span className="t-small">{c.community.name} · {c.progress.done} of {c.progress.total} lessons</span>
              <Progress p={c.progress} label={`${c.title} progress`} className="mt-1.5" />
            </span>
            {c.nextLessonId && <Link to={lessonPath(c.nextLessonId)} className="btn btn-secondary btn-sm">Continue</Link>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Other people's posts in your communities, newest first; announcements are marked. */
function WhatsNew({ posts }) {
  const { user } = useStore();
  if (!posts.length) return null;
  return (
    <Section id="new-h" title="New in your communities">
      <ul className="panel divide-y divide-[var(--az-hairline)]">
        {posts.map((p) => (
          <li key={p.id}>
            <Link to={`/post/${p.id}`} className="flex gap-3 px-4 py-4 hover:bg-[var(--az-sunken)]">
              {p.author.id ? <Avatar user={user(p.author.id) ?? p.author} size={36} /> : <span className="h-9 w-9 flex-none rounded-full bg-[var(--az-sunken)]" />}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm">
                  <b className="font-semibold">{p.author.name}</b><span className="text-[var(--az-text-2)]">in</span>
                  <span className={`cm-${accentOf(p.community)} cm-ink font-medium`}>{p.community.name}</span>
                  {p.type === 'announcement' && <Badge tone="info">Announcement</Badge>}
                  <span className="text-[var(--az-text-2)]">· {timeAgo(Date.parse(p.publishedAt))}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[15px] leading-6">{p.excerpt}</span>
                {(p.likes > 0 || p.replies > 0) && <span className="t-small mt-1 block">{[p.replies && count(p.replies, 'reply', 'replies'), p.likes && count(p.likes, 'like')].filter(Boolean).join(' · ')}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Join from Home: the server decides; the sidebar and Home refresh from the change event. */
function useJoin(onJoined) {
  const { run } = useCommunityWrite();
  const [busy, setBusy] = useState(null);
  const join = async (c) => {
    setBusy(c.id);
    try { if (await run(c.id, () => communityApi.join(c.id), { ok: `You joined ${c.name}` })) onJoined?.(); } finally { setBusy(null); }
  };
  return [busy, join];
}

/** Public, active communities you're not in, most members first (SRC-04, SRC-08). */
function Recommended({ list, onJoined }) {
  const [busy, join] = useJoin(onJoined);
  if (!list.length) return null;
  return (
    <Section id="rec-h" title="Public communities you might join" note="Public and open to join. Picked by size, not by tracking you."
      link={<Link to="/explore" className="link text-sm">Explore all communities</Link>}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <li key={c.id} className="panel flex items-center gap-3 p-4">
            <CommunityTile c={c} size={40} />
            <Link to={communityPath(c)} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate font-semibold">{c.name}</span>
              <span className="t-small">{[c.category, members(c.memberCount)].filter(Boolean).join(' · ')}</span>
            </Link>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy === c.id} onClick={() => join(c)} aria-label={`Join ${c.name}`}>{busy === c.id ? 'Joining…' : 'Join'}</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * First-run Home (D4): says plainly that nothing was joined, offers the categories as ways into
 * Explore, up to 6 Public communities with Join, Create Community (when allowed) and the profile.
 * It turns into the normal Home as soon as the person joins one.
 */
function FirstRun({ me, d }) {
  const canCreate = useCanCreateCommunity(me.id);
  const [discover, setDiscover] = useState({ status: 'loading', communities: [], counts: {} });
  useEffect(() => {
    api('/communities?scope=discover&sort=members').then(
      (r) => setDiscover({ status: 'ready', communities: r.communities ?? [], counts: r.categoryCounts ?? {} }),
      () => setDiscover({ status: 'error', communities: [], counts: {} }));
  }, []);
  const [busy, join] = useJoin();
  const starters = discover.communities.filter((c) => c.visibility === 'public' && !c.membership).slice(0, 6);
  const fallback = discover.status === 'error' ? d.suggested : [];
  const shown = starters.length ? starters : fallback;
  const pending = d.pendingRequests ?? [];

  return (
    <>
      <div>
        <h1 className="t-h1">Welcome to CommunityOne, {me.name.split(' ')[0]}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[var(--az-text-2)]">You haven’t joined any communities yet, and none were joined for you. Pick the ones that fit; you can leave any of them at any time.</p>
      </div>
      {pending.length > 0 && (
        <div className="notice notice-info">You’ve asked to join {pending.map((p) => p.community.name).join(', ')}. Their admins will decide; you’ll get a notification.</div>
      )}
      <Section id="cat-h" title="Browse by category">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {CATEGORIES.filter((c) => c !== 'Other').map((cat) => (
            <li key={cat}>
              <Link to={`/explore?${new URLSearchParams({ category: cat })}`} className="panel flex min-h-[76px] flex-col justify-center gap-0.5 p-4 hover:bg-[var(--az-sunken)]">
                <span className="font-semibold">{cat}</span>
                {discover.status === 'ready' && <span className="t-small">{count(discover.counts[cat] ?? 0, 'community', 'communities')}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="start-h" title="Public communities to start with" link={<Link to="/explore" className="link text-sm">Explore all</Link>}>
        {discover.status === 'loading' && <div aria-busy="true" aria-label="Loading communities" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-36" />)}</div>}
        {discover.status !== 'loading' && shown.length === 0 && <p className="t-small">No public communities yet.</p>}
        {shown.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((c) => (
              <li key={c.id} className="panel flex min-w-0 flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <CommunityTile c={c} size={40} />
                  <div className="min-w-0">
                    <Link to={communityPath(c)} className="block truncate font-semibold hover:underline">{c.name}</Link>
                    <span className="t-small">{[c.category, members(c.memberCount ?? 0)].filter(Boolean).join(' · ')}</span>
                  </div>
                </div>
                {c.description && <p className="line-clamp-2 text-sm text-[var(--az-text-2)]">{c.description}</p>}
                <div className="mt-auto flex items-center justify-between gap-3">
                  <VisibilityBadge visibility="public" />
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => join(c)} aria-label={`Join ${c.name}`}>{busy === c.id ? 'Joining…' : 'Join'}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="grid gap-3 md:grid-cols-2">
        {canCreate && (
          <section aria-labelledby="own-h" className="panel flex flex-col items-start gap-2 p-5">
            <h2 id="own-h" className="t-h3">Start your own community</h2>
            <p className="text-sm text-[var(--az-text-2)]">Choose its name, category and who can join. You become its Owner.</p>
            <Link to="/communities/new" className="btn btn-secondary btn-sm mt-1">Create Community</Link>
          </section>
        )}
        <section aria-labelledby="prof-h" className="panel flex flex-col items-start gap-2 p-5">
          <h2 id="prof-h" className="t-h3">Complete your profile</h2>
          <p className="text-sm text-[var(--az-text-2)]">A headline, your city and a few skills help members of the communities you join find you.</p>
          <Link to="/profile" className="btn btn-secondary btn-sm mt-1">Edit profile</Link>
        </section>
      </div>
    </>
  );
}
