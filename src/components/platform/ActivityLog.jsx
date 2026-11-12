// Administration → Activity log (board S7Activity; PER-10, MOD-10, D4, D6): every recorded action
// with who, what, where and when, filterable, read-only. Export asks for the password again and
// becomes an entry itself.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { dateTimeText, downloadCsv, usePasswordGate } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { Chips, Failed, Loading, Table } from './bits.jsx';

const CATEGORIES = [['', 'Everything'], ['admin_mode', 'Administrative Mode visits'], ['roles', 'Roles and suspensions'], ['moderation', 'Moderation'],
  ['settings', 'Settings'], ['deletions', 'Deletions'], ['exports', 'Exports']];

// What each action says, in plain words. Unknown ones fall back to their name.
const SAYS = {
  'admin_mode.access': 'Opened in Administrative Mode', 'user.suspend': 'Suspended an account', 'user.reactivate': 'Reactivated an account',
  'user.sessions_revoke': 'Signed someone out everywhere', 'user.approve': 'Approved an account', 'user.decline': 'Declined an account',
  'role.grant': 'Granted a platform role', 'role.revoke': 'Removed a platform role', 'settings.update': 'Changed a setting', 'settings.denied': 'Was refused a settings change',
  'feature.update': 'Switched a module', 'community.create': 'Created a community', 'community.delete': 'Deleted a community', 'community.restore': 'Restored a community',
  'community.purged': 'Removed a community for good', 'community.suspend': 'Suspended a community', 'community.unsuspend': 'Lifted a community’s suspension',
  'community.owner_assign': 'Made someone Owner', 'community.deletion_request': 'Asked to delete a community', 'community.deletion_withdraw': 'Withdrew a deletion request',
  'community.deletion_decline': 'Declined a deletion request', 'community.merge': 'Merged communities', 'case.escalate': 'Sent a case to the platform',
  'moderation.dismiss': 'Dismissed a report', 'moderation.remove': 'Removed reported content', 'moderation.warn': 'Warned someone', 'moderation.restrict': 'Restricted someone',
  'moderation.remove_member': 'Removed someone from a community', 'moderation.block': 'Blocked someone', 'moderation.restore': 'Restored removed content',
  'appeal.upheld': 'Kept a decision on appeal', 'appeal.overturned': 'Undid a decision on appeal', 'report.create': 'Reported something',
  'announcement.publish': 'Published an announcement', 'announcement.end': 'Ended an announcement',
  'audit.export': 'Exported the activity log', 'users.export': 'Exported users', 'analytics.export': 'Exported analytics',
};
const says = (a) => SAYS[a] ?? a.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const detail = (e) => {
  const x = e.context ?? {};
  if (x.reason) return `Reason: “${x.reason}”`;
  if (x.note) return `Note: “${x.note}”`;
  if (x.role) return x.role.replace('_', ' ');
  if (x.filters) return `${Object.entries(x.filters).map(([k, v]) => `${k}: ${v}`).join(', ') || 'no filters'} · ${x.rows} rows`;
  if (x.rows != null) return `${x.rows} rows`;
  if (x.path) return x.method && x.method !== 'GET' ? `${x.method} ${x.path}` : x.path;
  return '';
};

export default function ActivityLog() {
  const withPassword = usePasswordGate();
  const [f, setF] = useState({ category: '', who: '', from: '', to: '' });
  const [s, setS] = useState({ state: 'loading', entries: [] });
  const [busy, setBusy] = useState(false);
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const load = useCallback((before) => {
    if (!before) setS((p) => ({ ...p, state: p.entries.length ? 'ready' : 'loading' }));
    api(`/admin/activity?${qs}${before ? `&before=${before}` : ''}`).then((d) => setS((p) => ({ state: 'ready', entries: before ? [...p.entries, ...d.entries] : d.entries, more: d.more })))
      .catch((e) => setS((p) => ({ ...p, state: 'error', message: errorText(e) })));
  }, [qs]);
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load]);
  const exportCsv = async () => {
    setBusy(true);
    try { await withPassword(() => downloadCsv(`/admin/activity.csv?${qs}`)); toast('Export downloaded · recorded as an entry'); load(); } catch (e) { if (e.code !== 'CANCELLED') toast(errorText(e), 'error'); }
    setBusy(false);
  };
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-[1_1_200px]"><span className="t-small mb-1 block">Who</span><input type="search" className="input" placeholder="Name, or “system”" value={f.who} onChange={set('who')} /></label>
        <label><span className="t-small mb-1 block">From</span><input type="date" className="input" value={f.from} onChange={set('from')} /></label>
        <label><span className="t-small mb-1 block">To</span><input type="date" className="input" value={f.to} onChange={set('to')} /></label>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={busy}>{busy ? 'Exporting…' : 'Export CSV…'}</button>
      </div>
      <Chips label="Kind of action" value={f.category} onChange={(v) => setF((p) => ({ ...p, category: v }))} options={CATEGORIES.map(([id, label]) => ({ id, label }))} />
      {s.state === 'loading' ? <Loading label="Loading the activity log" /> : s.state === 'error' ? <Failed message={s.message} onRetry={() => load()} /> : (
        <>
          <div className="hidden md:block">
            <Table label="Activity log" head={['When', 'Who', 'Did', 'Where']} empty="No entries match."
              rows={s.entries.map((e) => (
                <tr key={e.id} className="border-b border-[var(--az-divider)] align-top last:border-0">
                  <td className="text-3 whitespace-nowrap px-4 py-3">{dateTimeText(e.at)}</td>
                  <td className="px-4 py-3 text-white">{e.actor ?? 'System'}</td>
                  <td className="px-4 py-3"><span className="text-white">{says(e.action)}</span>{e.action === 'admin_mode.access' && <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">Admin mode</span>}
                    {detail(e) && <span className="t-small block break-all">{detail(e)}</span>}</td>
                  <td className="text-2 px-4 py-3">{e.community?.name ?? (e.targetName ? `Account · ${e.targetName}` : e.targetType === 'platform' ? 'Platform' : e.targetType ?? '—')}</td>
                </tr>
              ))} />
          </div>
          <ul className="list-rows md:hidden">
            {s.entries.map((e) => (
              <li key={e.id} className="py-3 text-sm"><span className="block text-white">{says(e.action)}</span>
                <span className="t-small block">{e.actor ?? 'System'} · {dateTimeText(e.at)}{e.community ? ` · ${e.community.name}` : e.targetName ? ` · ${e.targetName}` : ''}</span>
                {detail(e) && <span className="t-small block break-all">{detail(e)}</span>}</li>
            ))}
            {!s.entries.length && <li className="text-3 py-3 text-sm">No entries match.</li>}
          </ul>
          {s.more && <button className="btn btn-ghost self-center" onClick={() => load(s.entries[s.entries.length - 1].id)}>Show older</button>}
          <p className="t-small">Every entry records who, what, where and when, with the reason or context. Entries can’t be edited or deleted from the app. Export asks for your password and becomes an entry itself.</p>
        </>
      )}
    </div>
  );
}
