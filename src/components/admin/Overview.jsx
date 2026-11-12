// Platform Admin overview (refined designs, board R1Admin; v2 G board V2GPlatformAdmin): live
// totals, what needs attention, recent activity and every community, most members first, with
// AlumniZone sorted like the rest. Totals come from GET /api/admin/overview, which only returns the
// parts this staff member's role grants; the email and job counts come from System health, for
// those who may see it (passed in by Administration, never fetched twice).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { timeAgo } from '../../lib/store.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';
import { Badge } from '../ui/Controls.jsx';
import { DataTable, Failed, Loading, Stat } from '../platform/bits.jsx';
import { says } from '../platform/ActivityLog.jsx';

const n = (x, one, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
const lower = (t) => t.replace(/^\w/, (c) => c.toLowerCase());

export default function Overview({ health }) {
  const [s, setS] = useState({ status: 'loading' });
  const load = useCallback(() => {
    setS((p) => ({ ...p, status: p.data ? 'ready' : 'loading' }));
    api('/admin/overview').then((data) => setS({ status: 'ready', data })).catch((e) => setS({ status: 'error', message: errorText(e) }));
  }, []);
  useEffect(load, [load]);
  const [waitingNow, setWaitingNow] = useState({});
  useEffect(() => { api('/admin/waiting').then((d) => setWaitingNow(d.waiting)).catch(() => {}); }, []);

  if (s.status === 'loading') return <Loading label="Loading overview" lines={5} />;
  if (s.status === 'error') return <Failed message={s.message} onRetry={load} />;
  const { totals: t, communities, pendingAccounts, activity } = s.data;
  const by = t.accounts.byStatus;
  const accountNote = [`${by.active ?? 0} active`, by.pending_approval ? `${by.pending_approval} waiting` : null, by.suspended ? `${by.suspended} suspended` : null].filter(Boolean).join(' · ');
  // Failed emails: the outbox's failure list when the server sends it, else the 24-hour count.
  const h = health?.data;
  const outbox = h && (h.email || h.outbox) ? { ...(h.email ?? {}), ...(h.outbox ?? {}) } : null;
  const emailsFailed = outbox ? (Array.isArray(outbox.failures) ? outbox.failures.length : outbox.failed24h ?? null) : null;
  const jobsFailed = Array.isArray(h?.jobs) ? h.jobs.reduce((sum, j) => sum + (j.failures24h ?? 0), 0) : null;
  const rows = [
    pendingAccounts != null && { label: 'Accounts waiting for approval', value: pendingAccounts, to: '/admin/users', tone: 'warn' },
    waitingNow.deletionRequests != null && { label: 'Deletion requests', value: waitingNow.deletionRequests, to: '/admin/communities', tone: 'warn' },
    waitingNow.moderationCentre != null && { label: 'Moderation centre', value: waitingNow.moderationCentre, to: '/admin/moderation', tone: 'warn' },
    t.communities.suspended > 0 && { label: 'Suspended communities', value: t.communities.suspended, to: '/admin/communities', tone: 'warn' },
    emailsFailed != null && { label: 'Emails that failed 3 times', value: emailsFailed, to: '/admin/health', tone: 'bad' },
    jobsFailed != null && { label: 'Jobs that failed in 24 hours', value: jobsFailed, to: '/admin/health', tone: 'bad' },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Platform totals" className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Stat label="Accounts" value={t.accounts.total} note={accountNote} />
        <Stat label="Communities" value={t.communities.total} note={`${t.communities.public} Public · ${t.communities.private} Private · ${t.communities.closed} Closed`} />
        <Stat label="Events" value={t.events} note="not deleted" />
        <Stat label="Posts" value={t.posts} note="published" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="att-h" className="panel flex min-w-0 flex-col gap-1 p-5">
          <h3 id="att-h" className="t-h3 pb-2">Needs attention</h3>
          {rows.length ? (
            <ul className="list-rows">
              {rows.map((w) => (
                <li key={w.label}>
                  <Link to={w.to} className="flex min-h-11 items-center gap-3 py-2 text-[15px] text-[var(--az-text)] hover:underline">
                    <span className="min-w-0 flex-1">{w.label}</span>
                    <Badge tone={w.value > 0 ? w.tone : 'neutral'}>{w.value}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-2 text-sm">Nothing needs you right now.</p>}
        </section>
        {activity && (
          <section aria-labelledby="act-h" className="panel flex min-w-0 flex-col gap-1 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <h3 id="act-h" className="t-h3">Recent activity</h3>
              <Link to="/admin/activity" className="link text-sm">Activity log</Link>
            </div>
            {activity.length === 0 ? <p className="text-2 text-sm">No activity recorded yet.</p> : (
              <ul className="list-rows">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-col py-2.5">
                    <span className="break-words text-sm"><b className="font-semibold">{a.actor ?? 'System'}</b> {lower(says(a.action))}</span>
                    <span className="t-small">{timeAgo(Date.parse(a.at))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <CommunityTable list={communities} />
    </div>
  );
}

/** Every community, filterable. A table from 768 px; one card per community below that. */
function CommunityTable({ list }) {
  const [q, setQ] = useState('');
  const [vis, setVis] = useState('');
  const shown = useMemo(() => list.filter((c) => (!vis || c.visibility === vis) && (!q || c.name.toLowerCase().includes(q.trim().toLowerCase()))), [list, q, vis]);
  const columns = [
    { head: 'Community', place: 'title', cell: (c) => <span className="flex min-w-0 items-center gap-2.5"><CommunityTile c={c} size={28} /><b className="min-w-0 break-words font-semibold">{c.name}</b></span> },
    { head: 'Visibility', cell: (c) => <VisibilityBadge visibility={c.visibility} /> },
    { head: 'Members', num: true, cell: (c) => c.memberCount },
    { head: 'Owner', cell: (c) => c.owner ?? <span className="text-2">No active Owner</span> },
    { head: 'Status', place: 'badge', cell: (c) => (c.status === 'suspended' ? <Badge tone="bad">Suspended</Badge> : c.status === 'archived' ? <Badge>Archived</Badge>
      : !c.owner ? <Badge tone="warn">Needs an Owner</Badge> : <Badge tone="ok">Active</Badge>) },
    { head: 'Actions', sr: true, place: 'action', cell: (c) => (
      !c.owner ? <Link to={`/admin/communities?open=${encodeURIComponent(c.id)}`} className="btn btn-secondary btn-sm" aria-label={`Choose an Owner for ${c.name}`}>Choose an Owner</Link>
        : c.canOpen ? <Link to={communityPath(c)} className="btn btn-secondary btn-sm" aria-label={`Open ${c.name}`}>Open</Link>
          : <Link to={`${communityPath(c)}?admin=1`} className="btn btn-secondary btn-sm" aria-label={`Open ${c.name} in Administrative Mode`}>Open in Administrative Mode</Link>
    ) },
  ];
  return (
    <section aria-labelledby="ct-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="ct-h" className="t-h3">Communities</h3>
        <span className="t-small">Most members first. AlumniZone sorts with the rest.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-[1_1_200px]"><span className="sr-only">Search communities</span>
          <input type="search" className="input" placeholder="Search communities" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="min-w-0 flex-[0_1_180px]"><span className="sr-only">Visibility</span>
          <select className="input" value={vis} onChange={(e) => setVis(e.target.value)}>
            <option value="">All visibility</option><option value="public">Public</option><option value="private">Private</option><option value="closed">Closed</option>
          </select></label>
      </div>
      <p className="sr-only" role="status">{n(shown.length, 'community', 'communities')}</p>
      <DataTable label="Communities" columns={columns} rows={shown} cardLabel={(c) => c.name} empty="No communities match." />
      <p className="t-small">A Closed community you aren’t in opens only in Administrative Mode, which is recorded.</p>
    </section>
  );
}
