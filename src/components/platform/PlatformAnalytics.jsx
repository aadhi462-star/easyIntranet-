// Administration → Analytics (board S7Activity): people and memberships counted separately
// (ANL-02), complete days in the reporting time zone, under 5 shown as "fewer than 5" (ANL-08),
// and a logged CSV of what's shown (ANL-07). Replaces the old browser-data Analytics screen.
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { downloadCsv, fewer } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { VisibilityBadge } from '../public/CommunityCards.jsx';
import { Failed, Loading, Stat, Table } from './bits.jsx';

const PERIODS = [7, 30, 90];
const day = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function PlatformAnalytics() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState({ state: 'loading' });
  useEffect(() => {
    setS({ state: 'loading' });
    api(`/admin/analytics?days=${days}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [days]);
  const d = s.d;
  const t = d?.smallThreshold;
  const exportCsv = async () => { try { await downloadCsv(`/admin/analytics.csv?days=${days}`); toast('Export downloaded · recorded in the activity log'); } catch (e) { toast(errorText(e), 'error'); } };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <p className="t-small min-w-0 flex-[1_1_300px]">{d ? `${day(d.since)} to ${day(new Date(new Date(d.until).getTime() - 1))} · days run midnight to midnight, ${d.timeZone} · today’s figures arrive tomorrow` : ' '}</p>
        <div role="group" aria-label="Period" className="flex gap-2">
          {PERIODS.map((p) => <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}
            className={`min-h-11 rounded-full border px-4 text-sm ${days === p ? 'border-[var(--az-hairline)] bg-[var(--az-surface)] font-semibold text-white' : 'text-2 border-[var(--az-hairline)] hover:text-white'}`}>{p} days</button>)}
        </div>
        <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
      </div>
      {s.state === 'loading' ? <Loading label="Loading analytics" h="h-64" /> : s.state === 'error' ? <Failed message={s.message} /> : (
        <>
          <section aria-label="Platform totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] lg:grid-cols-5">
            <Stat label="People" value={d.totals.people.toLocaleString()} note="unique active accounts" />
            <Stat label="Memberships" value={d.totals.memberships.toLocaleString()} note="one person, many communities" />
            <Stat label="Active people" value={fewer(d.totals.activePeople, t)} note={`did something in ${days} days`} />
            <Stat label="Communities" value={d.totals.communities} note={`${d.totals.activeCommunities} active in ${days} days`} />
            <Stat label="Course completions" value={fewer(d.totals.completions, t)} note={`${fewer(d.totals.certificates, t)} certificates`} />
          </section>
          <Table label="Communities" head={['Community', 'Members', 'Active', 'Posts', 'Open reports']}
            rows={d.communities.map((c) => (
              <tr key={c.id} className="border-b border-[var(--az-divider)] last:border-0">
                <td className="px-4 py-3"><span className="flex flex-wrap items-center gap-2 font-semibold text-white">{c.name}{c.visibility !== 'public' && <VisibilityBadge visibility={c.visibility} />}</span></td>
                <td className="text-2 px-4 py-3 tabular-nums">{fewer(c.members, t)}</td>
                <td className="text-2 px-4 py-3 tabular-nums">{fewer(c.active, t)}</td>
                <td className="text-2 px-4 py-3 tabular-nums">{c.posts}</td>
                <td className="text-2 px-4 py-3 tabular-nums">{c.openReports}</td>
              </tr>
            ))} />
          <div className="grid gap-4 md:grid-cols-3">
            <Note title="People vs memberships">Someone in three communities is one person and three memberships; the totals never count them as three people.</Note>
            <Note title="Deleted accounts">Past activity stays in the totals without a name attached; nothing points back to the person.</Note>
            <Note title="Same rules as communities">Under 5 shows as “fewer than 5”; only complete days count; exports are logged with the period shown.</Note>
          </div>
        </>
      )}
    </div>
  );
}

function Note({ title, children }) {
  return <section className="band flex flex-col gap-2 p-4"><h3 className="t-h3 text-white">{title}</h3><p className="text-2 text-sm">{children}</p></section>;
}
