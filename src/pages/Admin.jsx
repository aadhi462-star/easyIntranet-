// Administration (redesign Stage 7; v2 G boards V2GPlatformAdmin, V2GHealth, V2GPhoneAdmin): a
// separate area for platform staff, never mixed with community navigation. Overview, Users,
// Communities, Category review, Moderation centre, Activity log and Analytics, then the
// platform's own Settings, Roles and permissions, Templates, Announcements, Institutions and
// System health. Everything here reads and writes the server, which checks every permission.
//
// Each section is shown only to staff whose permissions allow it (GET /admin/me/permissions), so
// a Trust & Safety member sees Users and Moderation centre and nothing else. On a phone the menu
// is a list of sections with a search field; each opens full width with a back button.
//
// G8: the older screens that keep their data in this browser (policies, profile fields, user
// labels, branding, workflows, schedulers, data export, security, Smart Assist) are parked: no
// menu entry and no address unless the 'admin.legacy' feature flag is on, like other parked
// modules (P4). Their files stay.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { isOn, useFeatures } from '../lib/features.js';
import { useStore } from '../lib/store.jsx';
import { PasswordGateProvider, useStaffAccess } from '../lib/platform.js';
import { Icon } from '../components/icons.jsx';
import { Badge, Skeleton } from '../components/ui/Controls.jsx';
import UserLabelsAdmin from '../components/admin/UserLabelsAdmin.jsx';
import Overview from '../components/admin/Overview.jsx';
import Branding from '../components/admin/Branding.jsx';
import { Policies, ProfileFields } from '../components/admin/Access.jsx';
import { Schedulers, Workflows } from '../components/admin/Automation.jsx';
import { DataExport, Security, AssistSettings } from '../components/admin/DataSecurity.jsx';
import { PasswordDialog } from '../components/platform/bits.jsx';
import Users from '../components/platform/Users.jsx';
import Communities from '../components/platform/Communities.jsx';
import CategoryReview from '../components/platform/CategoryReview.jsx';
import ModerationCentre from '../components/platform/ModerationCentre.jsx';
import ActivityLog from '../components/platform/ActivityLog.jsx';
import PlatformAnalytics from '../components/platform/PlatformAnalytics.jsx';
import PlatformSettings, { Announcements, Institutions, RolesMatrix } from '../components/platform/PlatformSettings.jsx';
import Templates from '../components/platform/Templates.jsx';
import Health, { healthNeedsAttention } from '../components/platform/Health.jsx';

const PLATFORM = 'Platform';
const OLDER = 'Older tools · this browser only';
export const LEGACY_FLAG = 'admin.legacy';
// `perm`: the platform permission that shows the section (the server checks the same one).
// `keys`: extra words the phone menu's search matches.
const TABS = [
  { id: 'overview', label: 'Overview', el: Overview, perm: 'analytics.platform', keys: 'totals needs attention recent activity' },
  { id: 'users', label: 'Users', el: Users, perm: 'users.view', badge: 'pendingAccounts', keys: 'people accounts approve approval suspend reactivate sign out export roles' },
  { id: 'communities', label: 'Communities', el: Communities, perm: 'communities.manage', badge: 'deletionRequests', keys: 'deletion requests owner suspend restore archived' },
  { id: 'categories', label: 'Category review', el: CategoryReview, perm: 'communities.manage', keys: 'categories' },
  { id: 'moderation', label: 'Moderation centre', el: ModerationCentre, perm: 'moderation.manage', badge: 'moderationCentre', keys: 'appeals reports escalated owners' },
  { id: 'activity', label: 'Activity log', el: ActivityLog, perm: 'audit.view', keys: 'audit history export administrative mode' },
  { id: 'analytics', label: 'Analytics', el: PlatformAnalytics, perm: 'analytics.platform', keys: 'people memberships active export' },
  { id: 'settings', label: 'Settings', el: PlatformSettings, group: PLATFORM, perm: 'settings.platform', keys: 'registration sign-up approval email domains files storage file types features modules' },
  { id: 'roles', label: 'Roles and permissions', el: RolesMatrix, group: PLATFORM, perm: 'settings.platform', keys: 'super admin platform admin staff' },
  // Workstream F (F11): Platform Admins and Community Managers.
  { id: 'templates', label: 'Templates', el: Templates, group: PLATFORM, perm: 'templates.manage', keys: 'community templates questionnaire versions' },
  { id: 'announcements', label: 'Announcements', el: Announcements, group: PLATFORM, perm: 'announcements.manage', keys: 'banner message home' },
  { id: 'institutions', label: 'Institutions', el: Institutions, group: PLATFORM, perm: 'institutions.manage', keys: 'departments universities colleges' },
  { id: 'health', label: 'System health', el: Health, group: PLATFORM, perm: 'health.view', ownHeading: true, keys: 'database migrations jobs email outbox retry storage sessions version environment' },
];
const LEGACY = [
  { id: 'policies', label: 'Policies', el: Policies },
  { id: 'fields', label: 'Profile fields', el: ProfileFields },
  { id: 'labels', label: 'User labels', el: UserLabelsAdmin },
  { id: 'branding', label: 'Branding & navigation', el: Branding },
  { id: 'workflows', label: 'Workflows', el: Workflows },
  { id: 'schedulers', label: 'Schedulers', el: Schedulers },
  { id: 'export', label: 'Data export', el: DataExport },
  { id: 'security', label: 'Security & SSO', el: Security },
  { id: 'assist', label: 'Smart Assist', el: AssistSettings },
].map((t) => ({ ...t, group: OLDER }));
// Addresses from before Stage 7 open their replacement.
const MOVED = { members: 'users', audit: 'activity' };
const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function Admin() {
  const { tab } = useParams();
  const { me } = useStore();
  const access = useStaffAccess();
  const features = useFeatures();
  const wide = useWide();
  const canHealth = access.can('health.view');

  // What's waiting, for the menu's counts; refreshed whenever the section changes.
  const [waiting, setWaiting] = useState({});
  useEffect(() => { if (access.any) api('/admin/waiting').then((d) => setWaiting(d.waiting)).catch(() => {}); }, [access.any, tab]);
  // System health, read once for the menu's "needs attention" and Overview's counts. System
  // health's own page reads it itself and hands its result back.
  const [health, setHealth] = useState(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (canHealth && tabRef.current !== 'health') api('/admin/health').then((data) => setHealth({ data })).catch(() => {});
  }, [canHealth]);
  const onHealth = useCallback((data) => setHealth({ data }), []);

  const legacyOn = !!me?.admin && isOn(features, LEGACY_FLAG);
  const visible = useMemo(() => [...TABS.filter((t) => access.can(t.perm)), ...(legacyOn ? LEGACY : [])], [access, legacyOn]);

  if (access.loading) return <div className="panel p-6"><Skeleton lines={4} label="Loading Administration" /></div>;
  if (!visible.length) {
    return (
      <div className="panel mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 p-8 text-center">
        <Icon name="lock" size={28} className="text-2" />
        <h1 className="t-h2">Administration is for platform staff</h1>
        <p className="text-2 text-sm">You don’t hold a platform role, so there’s nothing to manage here.</p>
        <Link to="/home" className="btn btn-secondary">Back to the app</Link>
      </div>
    );
  }
  if (MOVED[tab]) return <Navigate to={`/admin/${MOVED[tab]}`} replace />;
  const current = tab ? visible.find((t) => t.id === tab) : null;
  if (tab && !current) return <Navigate to="/admin" replace />;
  if (!tab && wide) return <Navigate to={`/admin/${visible[0].id}`} replace />;

  const needsAttention = healthNeedsAttention(health?.data);
  const groups = [...new Set(visible.map((t) => t.group ?? ''))];
  const count = (t) => (t.badge && waiting[t.badge] > 0 ? waiting[t.badge] : 0);
  const Panel = current?.el;

  return (
    <PasswordGateProvider Dialog={PasswordDialog}>
      {/* On phones and tablets an open section hides the header, so the page keeps its h1 here. */}
      {current && <h1 className="sr-only lg:hidden">Administration</h1>}
      <header className={`mb-6 flex flex-wrap items-center justify-between gap-3 ${current ? 'max-lg:hidden' : ''}`}>
        <div className="min-w-0">
          <h1 className="t-h1 max-lg:text-[1.375rem] max-lg:leading-[1.875rem]">Administration</h1>
          <p className="t-small mt-0.5 text-[15px]">CommunityOne platform staff</p>
        </div>
        <Link to="/home" className="btn btn-secondary btn-sm lg:min-h-11 lg:px-4 lg:text-[15px]">Back to the app</Link>
      </header>

      {!current ? (
        <PhoneMenu groups={groups} visible={visible} count={count} needsAttention={needsAttention} />
      ) : (
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
          <nav aria-label="Administration" className="panel hidden h-fit flex-col gap-0.5 p-2 lg:sticky lg:top-24 lg:flex">
            {groups.map((g) => (
              <div key={g || 'main'} className="flex flex-col gap-0.5">
                {g && <span className="t-label px-3 pb-1 pt-4">{g}</span>}
                {visible.filter((t) => (t.group ?? '') === g).map((t) => (
                  <NavLink key={t.id} to={`/admin/${t.id}`}
                    className={({ isActive }) => `flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm ${isActive ? 'bg-[var(--az-sunken)] font-semibold text-[var(--az-text)] shadow-[inset_3px_0_0_var(--az-focus)]' : 'text-2 font-medium hover:bg-[var(--az-sunken)] hover:text-[var(--az-text)]'}`}>
                    <span className="min-w-0 flex-1">{t.label}</span>
                    {count(t) > 0 && <Badge tone="warn">{count(t)}<span className="sr-only"> waiting</span></Badge>}
                    {t.id === 'health' && needsAttention && <><span aria-hidden="true" className="h-2.5 w-2.5 flex-none rounded-full bg-[var(--az-danger)]" /><span className="sr-only">Needs attention</span></>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <section aria-label={current.label} className="min-w-0">
            <div className="mb-4 flex items-center gap-2 lg:hidden">
              <Link to="/admin" className="btn btn-ghost btn-icon flex-none" aria-label="Back to Administration"><Icon name="back" size={20} /></Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="t-h3 truncate">{current.label}</h2>
                <span className="t-small truncate">Administration</span>
              </div>
            </div>
            {!current.ownHeading && <h2 className="t-h2 mb-4 hidden lg:block">{current.label}</h2>}
            {current.group === OLDER && <p className="notice notice-warn mb-4">This older screen keeps its settings in this browser only; it isn’t connected to the server.</p>}
            <Panel health={health} onLoaded={onHealth} />
          </section>
        </div>
      )}
    </PasswordGateProvider>
  );
}

/** Phones and narrow windows: Administration as a list of sections with a search field. */
function PhoneMenu({ groups, visible, count, needsAttention }) {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t) => !words.length || words.every((w) => `${t.label} ${t.group ?? ''} ${t.keys ?? ''}`.toLowerCase().includes(w));
  const shown = visible.filter(matches);
  return (
    <div className="flex flex-col gap-3.5">
      <label><span className="sr-only">Search Administration</span>
        <input type="search" className="input" placeholder="Search sections and settings" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {words.length > 0 && <p className="sr-only" role="status">{shown.length === 1 ? '1 section' : `${shown.length} sections`}</p>}
      {groups.map((g) => {
        const rows = shown.filter((t) => (t.group ?? '') === g);
        if (!rows.length) return null;
        const id = `adm-g-${(g || 'main').replace(/\W+/g, '-').toLowerCase()}`;
        return (
          <section key={g || 'main'} aria-labelledby={g ? id : undefined} aria-label={g ? undefined : 'Administration'} className="panel px-4">
            {g && <h2 id={id} className="t-label mb-0.5 mt-2.5">{g}</h2>}
            <ul className="list-rows">
              {rows.map((t) => (
                <li key={t.id}>
                  <Link to={`/admin/${t.id}`} className="flex min-h-11 items-center gap-3 py-1 text-[15px] text-[var(--az-text)]">
                    <span className="min-w-0 flex-1">{t.label}</span>
                    {count(t) > 0 && <Badge tone="warn">{count(t)}<span className="sr-only"> waiting</span></Badge>}
                    {t.id === 'health' && needsAttention && <Badge tone="bad">Needs attention</Badge>}
                    <Icon name="back" size={18} className="text-2 rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!shown.length && <p className="notice notice-info">No sections match “{q.trim()}”.</p>}
    </div>
  );
}
