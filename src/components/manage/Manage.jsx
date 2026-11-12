// A community's Manage tab (Stage 6; v2 workstream G, boards V2GDashboards, V2GSettings, V2GPhone):
// Overview · Queue · Members · Analytics, then a Settings group of eleven sections, each its own
// page (G1). Each role opens on its first job (D5): Owners on Overview, Admins and Moderators on
// the Queue. Moderators get Overview, the Queue and a read-only Members list; Analytics and
// Settings are for Owners and Admins. The server checks every one of these again.
// On phones (G12) plain /manage is a list: what's waiting first, then the sections as rows that
// open full-width pages with a Back link.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath, errorText } from '../../lib/communities.js';
import { managePath, MANAGE_SECTIONS, SETTINGS_IDS, SETTINGS_SECTIONS } from '../../lib/manage.js';
import { useServerFeed } from '../../lib/feed.js';
import { useStore } from '../../lib/store.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Stat } from '../ui/Controls.jsx';
import { roleOf } from '../groups/helpers.js';
import ManageMembers from './ManageMembers.jsx';
import Queue from '../queue/Queue.jsx';
import Analytics from './Analytics.jsx';
import CommunitySettings from '../settings/CommunitySettings.jsx';
import { useDeletionRequest } from '../settings/DangerZone.jsx';
import { VISIBILITY } from '../settings/Privacy.jsx';
import { useNarrow } from '../settings/shared.jsx';

const MAIN = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'queue', label: 'Queue', icon: 'inbox', count: true },
  { id: 'members', label: 'Members', icon: 'people' },
  { id: 'analytics', label: 'Analytics', icon: 'chart', admins: true },
];
const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator' };
const VIS_OF = { public: 'public', restricted: 'private', private: 'closed' };

/** What's waiting: reports, held posts, join requests and appeals, for this person's role. */
export function useQueueCounts(g, perms) {
  const [n, setN] = useState({ reports: 0, requests: 0, appeals: 0 });
  const held = useServerFeed({ view: 'pending', community: g.id, keep: (p) => p.status === 'pending', enabled: !!perms.canModerate });
  const load = useCallback(async () => {
    if (!perms.canModerate) return;
    const [cases, reqs, appeals] = await Promise.all([
      api(`/communities/${encodeURIComponent(g.id)}/cases`).then((d) => d.cases.length).catch(() => 0),
      perms.canAdmin ? api(`/communities/${encodeURIComponent(g.id)}/requests`).then((d) => d.requests.length).catch(() => 0) : 0,
      perms.canAdmin ? api(`/communities/${encodeURIComponent(g.id)}/appeals`).then((d) => d.appeals.length).catch(() => 0) : 0,
    ]);
    setN({ reports: cases, requests: reqs, appeals });
  }, [g.id, perms.canModerate, perms.canAdmin]);
  useEffect(() => { load(); }, [load]);
  const posts = held.posts.filter((p) => p.status === 'pending').length;
  return { ...n, posts, total: n.reports + n.requests + n.appeals + posts, reload: load };
}

/** The rows of "Waiting for a decision": Moderators see reports and held posts only. */
const waitingRows = (counts, perms) => [
  ['reports', 'Reports', counts.reports],
  ...(perms.canAdmin ? [['requests', 'Join requests', counts.requests]] : []),
  ['posts', 'Posts held for approval', counts.posts],
  ...(perms.canAdmin ? [['appeals', 'Appeals', counts.appeals]] : []),
];

export default function Manage({ g, perms, section, sub }) {
  const { me } = useStore();
  const narrow = useNarrow();
  const realRole = roleOf(g, me.id);
  const role = g.adminMode ? 'admin' : realRole;
  const counts = useQueueCounts(g, perms);
  if (!perms.canModerate) return <Notice icon="lock" title="Manage is for this community’s Owners, Admins and Moderators" />;

  // 'branding' was a top-level address before G; it is Settings, Branding now.
  let current = section === 'branding' ? 'settings' : MANAGE_SECTIONS.includes(section) ? section : null;
  const settingsSub = section === 'branding' ? 'branding' : SETTINGS_IDS.includes(sub) ? sub : 'general';
  // D5: each role opens on its first job; on a phone, plain /manage is the list.
  if (!current && !narrow) current = role === 'owner' ? 'overview' : 'queue';
  const adminsOnly = (current === 'analytics' || current === 'settings') && !perms.canAdmin;

  const body = !current ? null : adminsOnly ? (
    <Notice icon="lock" title={current === 'settings' ? 'Settings are for this community’s Owners and Admins' : 'Analytics are for this community’s Owners and Admins'}>
      As a Moderator you have the Queue and Members.
    </Notice>
  ) : (
    <>
      {current === 'overview' && <Overview g={g} perms={perms} role={role} counts={counts} />}
      {current === 'queue' && <Queue g={g} perms={perms} counts={counts} />}
      {current === 'members' && <ManageMembers g={g} perms={perms} />}
      {current === 'analytics' && <Analytics g={g} />}
      {current === 'settings' && <CommunitySettings g={g} section={settingsSub} isOwner={realRole === 'owner'} />}
    </>
  );

  if (narrow) {
    if (!current) return <PhoneIndex g={g} perms={perms} role={role} counts={counts} />;
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Link to={managePath(g)} className="link inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold">
          <Icon name="back" size={18} />Manage
        </Link>
        {body}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-7">
      <ManageNav g={g} perms={perms} current={current} settingsSub={settingsSub} counts={counts} />
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

function Notice({ icon, title, children }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-10 text-center">
      <Icon name={icon} size={28} className="text-[var(--az-text-2)]" />
      <p className="t-h3">{title}</p>
      {children && <p className="t-small">{children}</p>}
    </div>
  );
}

function NavItem({ to, icon, label, on, danger = false, count }) {
  return (
    <Link to={to} aria-current={on ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm ${on ? 'bg-[var(--az-surface)] font-semibold text-[var(--az-text)] shadow-[inset_3px_0_0_var(--az-ok)]'
        : `font-medium hover:bg-[var(--az-sunken)] ${danger ? 'text-[var(--az-danger)]' : 'text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}`}>
      <Icon name={icon} size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-[var(--az-ok-soft)] px-1.5 text-xs font-bold text-[var(--az-link)]"><span className="sr-only">waiting: </span>{count}</span>}
    </Link>
  );
}

/** Desktop: the Manage menu, with the Settings group under it (G1). */
function ManageNav({ g, perms, current, settingsSub, counts }) {
  return (
    <nav aria-label="Manage" className="sticky top-24 flex w-56 shrink-0 flex-col gap-0.5">
      <span className="t-label px-3 pb-1.5 pt-1">Manage</span>
      {MAIN.filter((s) => !s.admins || perms.canAdmin).map((s) => (
        <NavItem key={s.id} to={managePath(g, s.id)} icon={s.icon} label={s.label} on={current === s.id} count={s.count ? counts.total : 0} />
      ))}
      {perms.canAdmin ? (
        <>
          <span className="t-label px-3 pb-1.5 pt-4">Settings</span>
          {SETTINGS_SECTIONS.map((s) => (
            <NavItem key={s.id} to={managePath(g, 'settings', s.id)} icon={s.icon} label={s.label} danger={s.id === 'danger'} on={current === 'settings' && settingsSub === s.id} />
          ))}
        </>
      ) : <p className="t-small px-3 pt-4">Analytics and Settings are for Owners and Admins.</p>}
    </nav>
  );
}

function Row({ to, label, value, danger = false }) {
  return (
    <li>
      <Link to={to} className="flex min-h-12 items-center gap-3 border-t border-[var(--az-divider)] px-4 text-[15px] hover:bg-[var(--az-sunken)]">
        <span className={`min-w-0 flex-1 truncate font-medium ${danger ? 'text-[var(--az-danger)]' : 'text-[var(--az-text)]'}`}>{label}</span>
        {value}
        <Icon name="back" size={18} className="shrink-0 rotate-180 text-[var(--az-text-3)]" />
      </Link>
    </li>
  );
}

function RowList({ title, children }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="t-label px-1">{title}</h3>
      <ul className="panel overflow-hidden [&>li:first-child>a]:border-t-0">{children}</ul>
    </section>
  );
}

/** Phone: what's waiting first, then Manage and Settings as rows (board V2GPhone). */
function PhoneIndex({ g, perms, role, counts }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <h2 className="t-h2">Manage</h2>
        <p className="t-small">{g.name} · {ROLE_LABEL[role] ?? 'Moderator'}</p>
      </header>
      <RowList title="Waiting for a decision">
        {waitingRows(counts, perms).map(([k, label, n]) => (
          <Row key={k} to={`${managePath(g, 'queue')}?show=${k}`} label={label} value={<Badge tone={n ? 'warn' : 'neutral'}>{n}</Badge>} />
        ))}
        <Row to={`${managePath(g, 'queue')}?show=resolved`} label="Decided" />
      </RowList>
      <RowList title="Manage">
        {MAIN.filter((s) => s.id !== 'queue' && (!s.admins || perms.canAdmin)).map((s) => <Row key={s.id} to={managePath(g, s.id)} label={s.label} />)}
      </RowList>
      {perms.canAdmin ? (
        <RowList title="Settings">
          {SETTINGS_SECTIONS.map((s) => (
            <Row key={s.id} to={managePath(g, 'settings', s.id)} label={s.label} danger={s.id === 'danger'}
              value={s.id === 'privacy' ? <span className="t-small shrink-0">{VISIBILITY[VIS_OF[g.accessType] ?? 'public'].label}</span> : null} />
          ))}
        </RowList>
      ) : <p className="t-small px-1">Analytics and Settings are for Owners and Admins.</p>}
    </div>
  );
}

function useHealth(g, enabled) {
  const [s, setS] = useState({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return;
    api(`/communities/${encodeURIComponent(g.id)}/health`).then((data) => setS({ status: 'ready', data })).catch((e) => setS({ status: 'error', message: errorText(e) }));
  }, [g.id, enabled, g.serverVersion, g.memberCount]);
  return s;
}

/** Overview (board V2GDashboards): live numbers, the setup checklist (Owner), what's waiting. */
function Overview({ g, perms, role, counts }) {
  const health = useHealth(g, !!perms.canAdmin);
  const owner = role === 'owner';
  const d = health.data;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <span className="t-label">Manage · {ROLE_LABEL[role] ?? 'Moderator'}</span>
        <h2 className="t-h2 mt-1">{owner ? `Is ${g.name} healthy and set up?` : 'What needs you'}</h2>
      </header>
      {owner && <DeletionBanner g={g} />}
      {perms.canAdmin && (health.status === 'error' ? <p role="alert" className="notice notice-bad">{health.message}</p> : (
        <section aria-label="Live numbers" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] xl:grid-cols-4">
          {[['Members', g.memberCount ?? 0, 'active accounts'], ['Joined in 30 days', d?.joined30, 'new members'], ['Posts in 30 days', d?.posts30, 'published'], ['Restricted', d?.restricted, 'read-only for now']].map(([label, value, note]) => (
            <Stat key={label} label={label} note={note} value={value ?? <span aria-label="Loading" className="skeleton inline-block h-7 w-10 align-middle" />} />
          ))}
        </section>
      ))}
      <div className={`grid min-w-0 gap-6 ${owner ? 'xl:grid-cols-2' : ''}`}>
        {owner && d && <Checklist g={g} d={d} />}
        <Waiting g={g} perms={perms} counts={counts} />
      </div>
      {perms.canAdmin && (
        <section aria-labelledby="sc-h" className="flex flex-col gap-2">
          <h3 id="sc-h" className="t-label">Shortcuts</h3>
          <div className="flex flex-wrap gap-2">
            <Link to={managePath(g, 'analytics')} className="btn btn-secondary btn-sm"><Icon name="chart" size={18} />Analytics, last 30 days</Link>
            <Link to={`${managePath(g, 'members')}?view=invitations`} className="btn btn-secondary btn-sm"><Icon name="share" size={18} />Invite people</Link>
            <a href={`/api/communities/${encodeURIComponent(g.id)}/analytics.csv?days=30`} download className="btn btn-secondary btn-sm"><Icon name="download" size={18} />Export CSV</a>
          </div>
        </section>
      )}
    </div>
  );
}

/** Owner: five setup steps; the checklist goes away once all five are done. */
function Checklist({ g, d }) {
  const steps = [
    ['Write a description', !!g.description, managePath(g, 'settings', 'general')],
    ['Write community guidelines', !!g.guidelines, managePath(g, 'settings', 'general')],
    ['Invite your first members', (g.memberCount ?? 0) > 1, `${managePath(g, 'members')}?view=invitations`],
    ['Create your first event', d.events > 0, communityPath(g, 'events')],
    ['Pin a welcome post', d.pinned > 0, communityPath(g, 'discussions')],
  ];
  const done = steps.filter(([, ok]) => ok).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby="fs-h" className="panel flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="fs-h" className="t-h3">Finish setting up</h3>
        <span className="t-small">{done} of {steps.length} done</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--az-sunken)]"><div className="h-full bg-[var(--az-ok)]" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="flex flex-col">
        {steps.map(([label, ok, to]) => (
          <li key={label} className="flex min-h-11 items-center gap-3 border-t border-[var(--az-divider)] first:border-t-0">
            {ok ? (
              <>
                <Icon name="check" size={18} className="shrink-0 text-[var(--az-ok)]" />
                <span className="min-w-0 flex-1 text-sm text-[var(--az-text-2)]">{label}</span>
                <span className="t-small">Done</span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[var(--az-control)]" />
                <Link to={to} className="link min-w-0 flex-1 text-sm font-semibold">{label}</Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="t-small">The checklist goes away once all five are done.</p>
    </section>
  );
}

function Waiting({ g, perms, counts }) {
  return (
    <section aria-labelledby="wait-h" className="panel flex min-w-0 flex-col p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-2">
        <h3 id="wait-h" className="t-h3">Waiting for a decision</h3>
        <Link to={managePath(g, 'queue')} className="link text-sm font-semibold">Open the queue</Link>
      </div>
      <ul className="flex flex-col">
        {waitingRows(counts, perms).map(([kind, label, n]) => (
          <li key={kind}>
            <Link to={`${managePath(g, 'queue')}?show=${kind}`} className="-mx-2 flex min-h-12 items-center justify-between gap-3 rounded-lg border-t border-[var(--az-divider)] px-2 text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)]">
              <span>{label}</span><Badge tone={n ? 'warn' : 'neutral'}>{n}</Badge>
            </Link>
          </li>
        ))}
      </ul>
      {counts.total === 0 && <p className="t-small pt-3">Nothing needs a decision. New requests and reports show here and in your notifications.</p>}
    </section>
  );
}

/** The queue (Stage 6): one filter at a time; Cases draws the reports themselves. */
function DeletionBanner({ g }) {
  const [req] = useDeletionRequest(g);
  if (req?.status !== 'open') return null;
  return (
    <p role="status" className="notice notice-warn flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="min-w-0 flex-[1_1_260px]">You asked for {g.name} to be deleted on {new Date(req.createdAt).toLocaleDateString()}. A Platform Admin will decide.</span>
      <Link to={managePath(g, 'settings', 'danger')} className="link font-semibold">Withdraw request</Link>
    </p>
  );
}
