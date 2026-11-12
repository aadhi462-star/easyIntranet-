// Administration → Analytics (board S7Activity): people and memberships counted separately
// (ANL-02), complete days in the reporting time zone, under 5 shown as "fewer than 5" (ANL-08),
// and a logged CSV of what's shown (ANL-07). Replaces the old browser-data Analytics screen.
// Restyled for v2 G (board V2GPlatformAdmin; cards on phones).
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { downloadCsv, fewer } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { VisibilityBadge } from '../public/CommunityCards.jsx';
import { Button } from '../ui/Controls.jsx';
import { DataTable, Failed, Loading, Note, Stat } from './bits.jsx';

const PERIODS = [7, 30, 90];
const day = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function PlatformAnalytics() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState({ state: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setS({ state: 'loading' });
    api(`/admin/analytics?days=${days}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [days, tick]);
  const d = s.d;
  const t = d?.smallThreshold;
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try { await downloadCsv(`/admin/analytics.csv?days=${days}`); toast('Export downloaded · recorded in the activity log'); } catch (e) { toast(errorText(e), 'error'); }
    setExporting(false);
  };
  const columns = [
    { head: 'Community', place: 'title', cell: (c) => <span className="flex flex-wrap items-center gap-2 font-semibold">{c.name}{c.visibility !== 'public' && <VisibilityBadge visibility={c.visibility} />}</span> },
    { head: 'Members', num: true, cell: (c) => fewer(c.members, t) },
    { head: 'Active', num: true, cell: (c) => fewer(c.active, t) },
    { head: 'Posts', num: true, cell: (c) => c.posts },
    { head: 'Open reports', num: true, cell: (c) => c.openReports },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="t-small min-w-0 flex-[1_1_300px]">{d ? `${day(d.since)} to ${day(new Date(new Date(d.until).getTime() - 1))} · days run midnight to midnight, ${d.timeZone} · today’s figures arrive tomorrow` : ' '}</p>
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {PERIODS.map((p) => <button key={p} type="button" className="filter-chip" aria-pressed={days === p} onClick={() => setDays(p)}>{p} days</button>)}
        </div>
        <Button icon="download" onClick={exportCsv} busy={exporting}>Export CSV</Button>
      </div>
      {s.state === 'loading' ? <Loading label="Loading analytics" lines={5} /> : s.state === 'error' ? <Failed message={s.message} onRetry={() => setTick((x) => x + 1)} /> : (
        <>
          <section aria-label="Platform totals" className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] min-[420px]:grid-cols-2 lg:grid-cols-5">
            <Stat label="People" value={d.totals.people.toLocaleString()} note="unique active accounts" />
            <Stat label="Memberships" value={d.totals.memberships.toLocaleString()} note="one person, many communities" />
            <Stat label="Active people" value={fewer(d.totals.activePeople, t)} note={`did something in ${days} days`} />
            <Stat label="Communities" value={d.totals.communities} note={`${d.totals.activeCommunities} active in ${days} days`} />
            <Stat label="Course completions" value={fewer(d.totals.completions, t)} note={`${fewer(d.totals.certificates, t)} certificates`} />
          </section>
          <DataTable label="Communities" columns={columns} rows={d.communities} cardLabel={(c) => c.name} empty="No communities yet." />
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
