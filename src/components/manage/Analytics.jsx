// Manage → Analytics (board S6Analytics, decision D7; restyled on the v2 components in G): complete days in the platform's reporting
// time zone, groups under 5 folded into "fewer than 5" by the server, and a CSV of what's shown.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { Icon } from '../icons.jsx';
import { Skeleton, Stat } from '../ui/Controls.jsx';

const PERIODS = [7, 30, 90];
const day = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const few = (n, t) => (n == null ? `fewer than ${t}` : n);

export default function Analytics({ g }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState({ state: 'loading' });
  useEffect(() => {
    setS({ state: 'loading' });
    api(`/communities/${encodeURIComponent(g.id)}/analytics?days=${days}`).then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [g.id, days]);
  const d = s.d;
  const max = d ? Math.max(1, ...d.weekly.map((w) => w.active)) : 1;
  const totals = d && [
    ['Members', d.totals.members, 'unique people, today'],
    ['New members', d.totals.joined, `${d.totals.left} left`],
    ['Active members', d.totals.active, 'posted, replied, reacted, RSVP’d or learned'],
    ['Posts and replies', d.totals.posts + d.totals.replies, `${d.totals.posts} posts · ${d.totals.replies} replies`],
    ['Event RSVPs', d.totals.rsvps, 'people going'],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-[1_1_300px]">
          <span className="t-label">Manage · Analytics</span>
          <h2 className="t-h2 mt-1">How {g.name} is doing</h2>
          {d && <p className="t-small mt-1">{day(d.since)} to {day(new Date(new Date(d.until).getTime() - 1))} · days run midnight to midnight, {d.timeZone} · today’s figures arrive tomorrow</p>}
        </div>
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {PERIODS.map((p) => <button key={p} type="button" className="filter-chip" aria-pressed={days === p} onClick={() => setDays(p)}>{p} days</button>)}
        </div>
        <a className="btn btn-secondary" href={`/api/communities/${encodeURIComponent(g.id)}/analytics.csv?days=${days}`} download><Icon name="download" size={18} />Export CSV</a>
      </div>
      {s.state === 'loading' ? <div className="panel p-5"><Skeleton lines={5} label="Loading analytics" /></div>
        : s.state === 'error' ? <p role="alert" className="notice notice-bad"><strong>Couldn’t load analytics.</strong> {s.message}</p> : (
          <>
            <section aria-label={`Totals for the last ${days} days`} className="panel grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] overflow-hidden">
              {totals.map(([k, v, hint]) => <div key={k} className="-mb-px -mr-px border-b border-r border-[var(--az-divider)]"><Stat label={k} value={v} note={hint} /></div>)}
            </section>

            <section aria-labelledby="wk-h" className="panel flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 id="wk-h" className="t-h3">Active members per week</h3><span className="t-small">People who did something that week</span></div>
              <div className="no-scrollbar overflow-x-auto">
                <div aria-hidden="true" className="flex h-44 min-w-[420px] items-end gap-3 border-b border-[var(--az-hairline)] pb-1">
                  {d.weekly.map((w) => (
                    <div key={w.start} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="t-small tabular-nums">{w.active}</span>
                      <span className="w-full max-w-16 rounded-t bg-[var(--az-focus)]" style={{ height: `${Math.max(2, (w.active / max) * 130)}px` }} />
                    </div>
                  ))}
                </div>
                <div aria-hidden="true" className="flex min-w-[420px] gap-3 pt-1.5">{d.weekly.map((w) => <span key={w.start} className="t-small flex-1 text-center">{day(w.start)}</span>)}</div>
              </div>
              <table className="sr-only"><caption>Active members per week</caption><thead><tr><th scope="col">Week starting</th><th scope="col">Active members</th></tr></thead>
                <tbody>{d.weekly.map((w) => <tr key={w.start}><td>{day(w.start)}</td><td>{w.active}</td></tr>)}</tbody></table>
              {d.totals.active === 0 && <p className="t-small">No activity in these days yet. Numbers start the day after something happens.</p>}
            </section>

            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
              <Table title="Most-replied discussions" cols={['Post', 'Replies']} empty="No replies in this period."
                rows={d.topDiscussions.map((t) => [<Link key="l" to={`/post/${t.id}`} className="link font-medium">{t.title}</Link>, t.replies])} />
              <Table title="Learning" cols={['Course', 'Enrolled', 'Completed']} empty="No published courses."
                rows={d.learning.map((c) => [c.title, few(c.enrolled, d.smallThreshold), few(c.completed, d.smallThreshold)])} />
              <Table title="Members by batch" cols={['Batch', 'Members']} empty="No members yet."
                rows={d.batches.map((b) => [b.batch, b.members ?? b.note ?? `fewer than ${d.smallThreshold}`])} />
            </div>
            <p className="t-small">Any group under {d.smallThreshold} people shows as “fewer than {d.smallThreshold}”, so nobody can be singled out. Exports use the period shown and are recorded in the activity log.</p>
          </>
        )}
    </div>
  );
}

function Table({ title, cols, rows, empty }) {
  return (
    <section className="panel flex min-w-0 flex-col gap-2 p-4" aria-label={title}>
      <h3 className="t-h3">{title}</h3>
      {rows.length === 0 ? <p className="text-2 text-sm">{empty}</p> : (
        <table className="w-full text-sm">
          <thead><tr>{cols.map((c, i) => <th key={c} scope="col" className={`t-label border-b border-[var(--az-hairline)] py-2 ${i ? 'pl-2 text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-[var(--az-divider)] last:border-0">{r.map((v, j) => <td key={j} className={`py-2 ${j ? 'text-2 pl-2 text-right tabular-nums' : 'break-words pr-2'}`}>{v}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
