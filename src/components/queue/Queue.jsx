// Manage → Queue as one place (v2 board V2GDashboards "Moderator: the queue", V2GPhoneQueue):
// Reports, Held posts, Join requests, Appeals and Decided, with counts. Moderators see Reports,
// Held posts and Decided; Owners and Admins all five. The kind shown is in the address
// (?show=reports|posts|requests|appeals|resolved) and a notification can open one report
// (?case=<id>). Counts come from Manage's useQueueCounts.
import { useSearchParams } from 'react-router-dom';
import Cases, { Appeals } from '../manage/Cases.jsx';
import { RequestQueue, ReviewQueue } from '../groups/RolePanel.jsx';

export default function Queue({ g, perms, counts }) {
  const [params, setParams] = useSearchParams();
  const kinds = [
    ['reports', 'Reports', counts.reports], ['posts', 'Held posts', counts.posts],
    ...(perms.canAdmin ? [['requests', 'Join requests', counts.requests], ['appeals', 'Appeals', counts.appeals]] : []),
    ['resolved', 'Decided', null],
  ];
  const show = kinds.some(([k]) => k === params.get('show')) ? params.get('show') : 'reports';
  const caseId = params.get('case');
  const pick = (k) => { setParams({ show: k }, { replace: true }); counts.reload?.(); };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 className="sr-only">Queue</h2>
      <div role="group" aria-label="Show" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {kinds.map(([k, label, n]) => (
          <button key={k} type="button" className="filter-chip shrink-0" aria-pressed={show === k} onClick={() => pick(k)}>
            {label}{n != null ? ` · ${n}` : ''}
          </button>
        ))}
      </div>
      {show === 'reports' && <Cases key="open" g={g} initial={caseId} onChange={counts.reload} />}
      {show === 'resolved' && <Cases key="resolved" g={g} resolved />}
      {show === 'posts' && <ReviewQueue g={g} />}
      {show === 'requests' && <RequestQueue g={g} />}
      {show === 'appeals' && <Appeals g={g} onChange={counts.reload} />}
      {!perms.canAdmin && <p className="t-small">Join requests and appeals are for Owners and Admins.</p>}
    </div>
  );
}
