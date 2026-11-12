// Role views on a community's Overview (refined designs, board R1Roles). Each role opens on its
// own first job instead of a retitled copy of the member view:
//   Owner: is the community healthy and set up? (live numbers and a setup checklist)
//   Admin: people and content waiting for a decision (join requests, posts to approve)
//   Moderator: the review queue, one held post at a time
// Instructors get theirs with Learning (Stage 5). Everything here is live data from the server.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityApi, communityPath, errorText } from '../../lib/communities.js';
import { managePath } from '../../lib/manage.js';
import { approvePost, removePost, useServerFeed } from '../../lib/feed.js';
import { timeAgo } from '../../lib/store.jsx';
import { useCommunityWrite } from './useCommunity.js';
import { Icon } from '../icons.jsx';

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function RolePanel({ g, role }) {
  if (role === 'owner') return <><OwnerHealth g={g} /><DecisionQueue g={g} hideWhenEmpty /></>;
  if (role === 'admin') return <DecisionQueue g={g} />;
  if (role === 'moderator') return <ReviewQueue g={g} framed />;
  return null;
}

function useHealth(g) {
  const [s, setS] = useState({ status: 'loading' });
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/health`)
    .then((data) => setS({ status: 'ready', data })).catch((e) => setS({ status: 'error', message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load, g.serverVersion, g.memberCount]);
  return s;
}

/** Owner: three live numbers and what's left to set up. The checklist disappears when done. */
function OwnerHealth({ g }) {
  const h = useHealth(g);
  if (h.status === 'loading') return <div aria-busy="true" aria-label="Loading community health" className="skeleton h-28 !rounded-2xl" />;
  if (h.status === 'error') return <p role="alert" className="notice notice-bad">{h.message}</p>;
  const d = h.data;
  const steps = [
    ['Write a description', !!g.description, managePath(g, 'settings')],
    ['Write community guidelines', !!g.guidelines, managePath(g, 'settings')],
    ['Invite your first members', g.memberCount > 1, communityPath(g, 'members')],
    ['Create your first event', d.events > 0, communityPath(g, 'events')],
    ['Pin a welcome post', d.pinned > 0, communityPath(g, 'discussions')],
    // v2 E7: the checklist is the one setup guide; branding is part of it.
    ['Add a logo and cover', !!(g.logoUrl && g.coverUrl), managePath(g, 'branding')],
  ];
  const done = steps.filter(([, ok]) => ok).length;
  return (
    <section aria-labelledby="own-h" className="panel flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="own-h" className="t-h2">Your community</h2>
        <span className="t-label">You’re the owner</span>
      </div>
      <dl className="grid grid-cols-3 gap-4">
        {[['Members', g.memberCount], ['Joined in 30 days', d.joined30], ['Posts in 30 days', d.posts30]].map(([k, v]) => (
          <div key={k}><dt className="t-small">{k}</dt><dd className="text-[26px] font-bold leading-8 tabular-nums">{v}</dd></div>
        ))}
      </dl>
      {done < steps.length && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">Finish setting up</span>
            <span className="t-small">{done} of {steps.length} done</span>
          </div>
          <div aria-hidden="true" className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--az-sunken)]"><div className="h-full bg-[var(--az-ok)]" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <ul className="flex flex-wrap gap-2">
            {steps.map(([label, ok, to]) => (ok
              ? <li key={label} className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm text-[var(--az-text-2)]"><Icon name="check" size={16} className="text-[var(--az-ok)]" />{label}<span className="sr-only">, done</span></li>
              : <li key={label}><Link to={to} className="inline-flex min-h-10 items-center rounded-full border border-[var(--az-control)] px-3 text-sm hover:bg-[var(--az-sunken)]">{label}</Link></li>))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Admin: join requests and posts held for approval, as tabs. */
function DecisionQueue({ g, hideWhenEmpty = false }) {
  const { run } = useCommunityWrite();
  const [reqs, setReqs] = useState(null);
  const [tab, setTab] = useState('requests');
  const [busy, setBusy] = useState(null);
  const held = useServerFeed({ view: 'pending', community: g.id, keep: (p) => p.status === 'pending' });
  const loadReqs = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/requests`).then((r) => setReqs(r.requests)).catch(() => setReqs([])), [g.id]);
  useEffect(() => { loadReqs(); }, [loadReqs, g.joinRequests?.length]);
  const posts = held.posts.filter((p) => p.status === 'pending');
  const nReq = reqs?.length ?? 0;
  if (reqs === null) return null;
  if (hideWhenEmpty && !nReq && !posts.length) return null;
  const decide = async (r, approve) => {
    setBusy(r.id);
    try { if (await run(g.id, () => communityApi.decide(g.id, r.id, approve), { ok: approve ? `${r.name} can now take part` : 'Request declined' })) await loadReqs(); }
    finally { setBusy(null); }
  };
  const tabs = [['requests', 'Join requests', nReq], ['posts', 'Posts to approve', posts.length]];
  return (
    <section aria-labelledby="queue-h" className="panel flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <h2 id="queue-h" className="t-h2">Waiting for a decision</h2>
      </div>
      <div role="tablist" aria-label="Kinds of decision" className="no-scrollbar mt-2 flex overflow-x-auto border-b border-[var(--az-divider)] px-3">
        {tabs.map(([id, label, n]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`shrink-0 border-b-2 px-3 py-3 text-sm ${tab === id ? 'border-[var(--cm-ink)] font-semibold' : 'border-transparent font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
            {label} <span className="tabular-nums text-[var(--az-text-2)]">· {n}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="px-5 py-3">
        {tab === 'requests' && <JoinRequests reqs={reqs} busy={busy} decide={decide} />}
        {tab === 'posts' && <ReviewQueue g={g} feed={held} />}
      </div>
    </section>
  );
}

/** Moderator: held posts in a split view: the list, and the selected post in full with its actions. */
export function ReviewQueue({ g, feed, framed = false }) {
  const own = useServerFeed({ view: 'pending', community: g.id, keep: (p) => p.status === 'pending', enabled: !feed });
  const f = feed ?? own;
  const posts = f.posts.filter((p) => p.status === 'pending');
  const [sel, setSel] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = posts.find((p) => p.id === sel) ?? posts[0];
  useEffect(() => { setReason(''); setError(''); }, [current?.id]);
  const act = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const body = f.status === 'loading' && !posts.length ? <p className="t-small py-3">Loading…</p>
    : f.status === 'error' ? <p className="notice notice-bad my-3">{f.error} <button type="button" className="link" onClick={f.reload}>Try again</button></p>
      : !current ? <p className="t-small py-3">Nothing to review. Posts held for approval show here; reports are in Manage → Queue.</p>
        : (
          <div className="grid gap-4 py-2 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ul aria-label="Held posts" className="list-rows">
              {posts.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setSel(p.id)} aria-current={p.id === current.id ? 'true' : undefined}
                    className={`block w-full rounded-lg px-3 py-2.5 text-left ${p.id === current.id ? 'bg-[var(--az-sunken)] shadow-[inset_3px_0_0_var(--az-ok)]' : 'hover:bg-[var(--az-sunken)]'}`}>
                    <span className="block text-sm font-semibold">{p.author?.name ?? 'Member'}</span>
                    <span className="t-small">Held for approval · {timeAgo(typeof p.createdAt === 'string' ? Date.parse(p.createdAt) : p.createdAt ?? Date.now())}</span>
                  </button>
                </li>
              ))}
            </ul>
            <article aria-label="Selected post" className="sunken flex flex-col gap-3 p-4">
              <span className="t-label">Held for approval</span>
              <p className="t-body whitespace-pre-line">{current.body}</p>
              <label className="text-sm font-semibold">Reason if you remove it <span className="font-normal text-[var(--az-text-2)]">(the author sees this)</span>
                <textarea className="input mt-1 min-h-20" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </label>
              {error && <p role="alert" className="field-error">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => act(() => removePost(current.id, reason.trim()))}
                  title={reason.trim() ? undefined : 'Give the author a reason first'}>Remove</button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => approvePost(current.id))}>Approve and publish</button>
              </div>
            </article>
          </div>
        );
  if (!framed) return body;
  return (
    <section aria-labelledby="rev-h" className="panel flex flex-col px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rev-h" className="t-h2">Review queue</h2>
        <span className="t-label">You’re a moderator · {count(posts.length, 'item')}</span>
      </div>
      {body}
    </section>
  );
}

function JoinRequests({ reqs, busy, decide }) {
  if (!reqs.length) return <p className="t-small py-3">Nothing waiting. New requests show here and in your notifications.</p>;
  return (
    <ul className="list-rows">
      {reqs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-[1_1_220px]">
            <Link to={`/people/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
            <span className="t-small"> · asked {timeAgo(Date.parse(r.updated_at))}</span>
            {r.message && <span className="mt-0.5 block text-sm text-[var(--az-text-2)]">“{r.message}”</span>}
            {r.answer && <span className="mt-0.5 block text-sm text-[var(--az-text-2)]"><b className="font-semibold text-[var(--az-text)]">{r.joinQuestion ?? 'Answer'}</b> {r.answer}</span>}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy === r.id} onClick={() => decide(r, false)} aria-label={`Decline ${r.name}`}>Decline</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => decide(r, true)} aria-label={`Approve ${r.name}`}>Approve</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Join requests on their own, for Manage → Queue (Stage 6). */
export function RequestQueue({ g }) {
  const { run } = useCommunityWrite();
  const [reqs, setReqs] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/requests`).then((r) => setReqs(r.requests)).catch(() => setReqs([])), [g.id]);
  useEffect(() => { load(); }, [load]);
  const decide = async (r, approve) => {
    setBusy(r.id);
    try { if (await run(g.id, () => communityApi.decide(g.id, r.id, approve), { ok: approve ? `${r.name} can now take part` : 'Request declined' })) await load(); }
    finally { setBusy(null); }
  };
  if (reqs === null) return <div aria-busy="true" aria-label="Loading requests" className="skeleton h-32 !rounded-2xl" />;
  return <section aria-label="Join requests" className="panel px-5 py-2"><JoinRequests reqs={reqs} busy={busy} decide={decide} /></section>;
}
