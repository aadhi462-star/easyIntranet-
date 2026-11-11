// Platform Admin overview (refined designs, board R1Admin): live totals, what's waiting, recent
// activity and a table of every community. All of it comes from GET /api/admin/overview, which
// only returns the parts this staff member's role grants.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath } from '../../lib/communities.js';
import { timeAgo } from '../../lib/store.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';

const ACTIONS = {
  'community.create': 'Community created', 'community.merge': 'Community merged', 'community.merge_undone': 'Merge undone',
  'community.update': 'Community edited', 'community.archive': 'Community archived', 'community.delete': 'Community deleted',
  'admin_mode.access': 'Administrative Mode visit', 'settings.update': 'Setting changed', 'user.suspend': 'Account suspended',
  'user.reactivate': 'Account reactivated', 'user.approve': 'Account approved', 'user.decline': 'Account declined', 'user.roles': 'Roles changed',
};
const actionText = (a) => ACTIONS[a] ?? a.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const n = (x, one, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;

export default function Overview() {
  const [s, setS] = useState({ status: 'loading' });
  const load = useCallback(() => {
    setS((p) => ({ ...p, status: p.data ? 'ready' : 'loading' }));
    api('/admin/overview').then((data) => setS({ status: 'ready', data })).catch((e) => setS({ status: 'error', message: e.message }));
  }, []);
  useEffect(load, [load]);

  if (s.status === 'loading') return <div aria-busy="true" aria-label="Loading overview" className="glass h-40 animate-pulse" />;
  if (s.status === 'error') {
    return <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{s.message}</p><button className="btn btn-ghost mt-3" onClick={load}>Try again</button></div>;
  }
  const { totals, communities, pendingAccounts, activity } = s.data;
  const t = totals;
  const otherStatuses = Object.entries(t.accounts.byStatus).filter(([k, v]) => k !== 'active' && v);
  const waiting = [
    pendingAccounts != null && { label: 'Accounts waiting for approval', value: pendingAccounts, to: '/admin/members' },
    t.communities.suspended > 0 && { label: 'Suspended communities', value: t.communities.suspended },
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <p className="t-small -mt-2">Counts are live from the database.</p>
      <section aria-label="Platform totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] lg:grid-cols-4">
        <Stat label="Accounts" value={t.accounts.total} note={otherStatuses.length ? otherStatuses.map(([k, v]) => `${v} ${k}`).join(' · ') : 'all active'} />
        <Stat label="Communities" value={t.communities.total} note={`${t.communities.public} Public · ${t.communities.private} Private · ${t.communities.closed} Closed`} />
        <Stat label="Events" value={t.events} note="across all communities" />
        <Stat label="Published posts" value={t.posts} note="across all communities" />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="att-h">
          <h2 id="att-h" className="t-h2 mb-3 text-white">Needs attention</h2>
          {waiting.some((w) => w.value > 0)
            ? (
              <ul className="band list-rows px-4">
                {waiting.filter((w) => w.value > 0).map((w) => (
                  <li key={w.label} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="text-white">{w.label}</span>
                    {w.to ? <Link to={w.to} className="font-semibold text-brand-300 hover:underline">{w.value} · Review</Link> : <span className="text-2">{w.value}</span>}
                  </li>
                ))}
              </ul>
            )
            : <p className="band text-2 p-4 text-sm">Nothing needs you right now.</p>}
        </section>
        {activity && (
          <section aria-labelledby="act-h">
            <h2 id="act-h" className="t-h2 mb-3 text-white">Recent activity</h2>
            {activity.length === 0 ? <p className="text-3 text-sm">No activity recorded yet.</p> : (
              <ol className="flex flex-col border-l border-[var(--az-hairline)] pl-5">
                {activity.map((a) => (
                  <li key={a.id} className="relative pb-4 last:pb-0">
                    <span aria-hidden="true" className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-ink-950)] bg-[var(--az-text-3)]" />
                    <span className="block text-sm text-white">{actionText(a.action)}{a.targetId ? <span className="text-3"> · {a.targetType} {a.targetId}</span> : null}</span>
                    <span className="t-small">{a.actor ?? 'System'} · {timeAgo(Date.parse(a.at))}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>

      <CommunityTable list={communities} />
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="bg-[var(--az-surface)] p-5">
      <div className="t-small">{label}</div>
      <div className="mt-1 text-[28px] font-bold leading-9 text-white">{value}</div>
      <div className="t-small">{note}</div>
    </div>
  );
}

/** Every community, filterable. A table on wide screens; a list of rows on phones. */
function CommunityTable({ list }) {
  const [q, setQ] = useState('');
  const [vis, setVis] = useState('');
  const shown = useMemo(() => list.filter((c) => (!vis || c.visibility === vis) && (!q || c.name.toLowerCase().includes(q.trim().toLowerCase()))), [list, q, vis]);
  return (
    <section aria-labelledby="ct-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="ct-h" className="t-h2 text-white">Communities</h2>
        <div className="flex flex-wrap gap-2">
          <input type="search" className="input !w-56" placeholder="Filter communities" aria-label="Filter communities" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-40" aria-label="Visibility" value={vis} onChange={(e) => setVis(e.target.value)}>
            <option value="">All visibility</option><option value="public">Public</option><option value="private">Private</option><option value="closed">Closed</option>
          </select>
        </div>
      </div>
      <p className="sr-only" role="status">{n(shown.length, 'community', 'communities')}</p>
      {shown.length === 0 ? <p className="text-3 text-sm">No communities match.</p> : (
        <>
          <div className="glass hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead><tr className="bg-[var(--az-band)] text-left">
                {['Community', 'Visibility', 'Members', 'Owner', 'Status'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
                <th scope="col" className="border-b border-[var(--az-hairline)] px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--az-divider)] last:border-0">
                    <td className="px-4 py-3"><span className="flex items-center gap-3"><CommunityTile c={c} size={28} /><span className="font-semibold text-white">{c.name}</span></span></td>
                    <td className="px-4 py-3"><VisibilityBadge visibility={c.visibility} /></td>
                    <td className="text-2 px-4 py-3 tabular-nums">{c.memberCount}</td>
                    <td className="text-2 px-4 py-3">{c.owner ?? <span className="text-3">No owner</span>}</td>
                    <td className="text-2 px-4 py-3 capitalize">{c.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {c.canOpen && <Link to={communityPath(c)} className="text-brand-300 hover:underline" aria-label={`View ${c.name}`}>View</Link>}
                      <Link to={`${communityPath(c)}?admin=1`} className="text-2 ml-4 hover:text-white hover:underline" aria-label={`Open ${c.name} in Administrative Mode`}>Admin Mode</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="list-rows md:hidden">
            {shown.map((c) => (
              <li key={c.id}>
                <Row c={c} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Row({ c }) {
  const body = (
    <>
      <CommunityTile c={c} size={36} />
      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-white">{c.name}</span>
        <span className="t-small">{n(c.memberCount, 'member')}{c.owner ? ` · ${c.owner}` : ''}{c.status !== 'active' ? ` · ${c.status}` : ''}</span></span>
      <VisibilityBadge visibility={c.visibility} />
    </>
  );
  return <Link to={c.canOpen ? communityPath(c) : `${communityPath(c)}?admin=1`} className="flex items-center gap-3 py-3">{body}</Link>;
}

