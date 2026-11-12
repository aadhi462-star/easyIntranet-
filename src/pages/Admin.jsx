// Administration (redesign Stage 7, board S7Plan): a separate area for platform staff, never
// mixed with community navigation. Overview, Users, Communities, Moderation centre, Activity log
// and Analytics, then the platform's own Settings, Roles and permissions, Announcements and
// Institutions. Everything here reads and writes the server, which checks every permission.
//
// The older screens under "Older tools" still keep their data in this browser (they predate the
// server). They stay reachable so nothing is lost, and say so.
import UserLabelsAdmin from '../components/admin/UserLabelsAdmin.jsx';
import { Glyph } from '../components/icons.jsx';
import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { PasswordGateProvider } from '../lib/platform.js';
import { Empty, PageHeader } from '../components/ui.jsx';
import Overview from '../components/admin/Overview.jsx';
import Branding from '../components/admin/Branding.jsx';
import { Policies, ProfileFields } from '../components/admin/Access.jsx';
import { Schedulers, Workflows } from '../components/admin/Automation.jsx';
import { DataExport, Security, AssistSettings } from '../components/admin/DataSecurity.jsx';
import { PasswordDialog } from '../components/platform/bits.jsx';
import Users from '../components/platform/Users.jsx';
import Communities from '../components/platform/Communities.jsx';
import ModerationCentre from '../components/platform/ModerationCentre.jsx';
import ActivityLog from '../components/platform/ActivityLog.jsx';
import PlatformAnalytics from '../components/platform/PlatformAnalytics.jsx';
import PlatformSettings, { Announcements, Institutions, RolesMatrix } from '../components/platform/PlatformSettings.jsx';

const OLDER = 'Older tools · this browser only';
const TABS = [
  { id: 'overview', label: 'Overview', el: Overview, perm: 'admin.analytics' },
  { id: 'users', label: 'Users', el: Users, badge: 'pendingAccounts' },
  { id: 'communities', label: 'Communities', el: Communities, badge: 'deletionRequests' },
  { id: 'moderation', label: 'Moderation centre', el: ModerationCentre, badge: 'moderationCentre' },
  { id: 'activity', label: 'Activity log', el: ActivityLog },
  { id: 'analytics', label: 'Analytics', el: PlatformAnalytics, perm: 'admin.analytics' },
  { id: 'settings', label: 'Settings', el: PlatformSettings, group: 'Platform' },
  { id: 'roles', label: 'Roles and permissions', el: RolesMatrix, group: 'Platform' },
  { id: 'announcements', label: 'Announcements', el: Announcements, group: 'Platform' },
  { id: 'institutions', label: 'Institutions', el: Institutions, group: 'Platform' },
  { id: 'policies', label: 'Policies', icon: 'list', el: Policies, group: OLDER },
  { id: 'fields', label: 'Profile fields', icon: 'idcard', el: ProfileFields, group: OLDER },
  { id: 'labels', label: 'User labels', icon: 'label', el: UserLabelsAdmin, group: OLDER },
  { id: 'branding', label: 'Branding & navigation', icon: 'palette', el: Branding, group: OLDER },
  { id: 'workflows', label: 'Workflows', icon: 'bolt', el: Workflows, group: OLDER },
  { id: 'schedulers', label: 'Schedulers', icon: 'clock', el: Schedulers, group: OLDER },
  { id: 'export', label: 'Data export', icon: 'download', el: DataExport, group: OLDER },
  { id: 'security', label: 'Security & SSO', icon: 'lock', el: Security, group: OLDER },
  { id: 'assist', label: 'Smart Assist', icon: 'sparkle', el: AssistSettings, group: OLDER },
];
// Addresses from before Stage 7 open their replacement.
const MOVED = { members: 'users', audit: 'activity' };

export default function Admin() {
  const { tab } = useParams();
  const { me, can } = useStore();
  // What's waiting, for the menu's counts; refreshed whenever the section changes.
  const [waiting, setWaiting] = useState({});
  useEffect(() => { if (me.admin) api('/admin/waiting').then((d) => setWaiting(d.waiting)).catch(() => {}); }, [me.admin, tab]);
  // Non-admins with a role that grants analytics can see those tabs only.
  const visible = TABS.filter((t) => me.admin || (t.perm && can(t.perm)));
  if (!visible.length) return <Empty icon="lock" title="Admins only">You don’t have permission to manage this platform.</Empty>;
  if (MOVED[tab]) return <Navigate to={`/admin/${MOVED[tab]}`} replace />;
  const current = visible.find((t) => t.id === tab);
  if (!current) return <Navigate to={`/admin/${visible[0].id}`} replace />;
  const Panel = current.el;
  const groups = [...new Set(visible.map((t) => t.group ?? ''))];

  return (
    <PasswordGateProvider Dialog={PasswordDialog}>
      <PageHeader title="Administration" subtitle="CommunityOne platform staff" actions={<Link to="/dashboard" className="btn btn-ghost">Back to the app</Link>} />
      <div className="ext-grid grid gap-5 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Administration" className="ext-menu glass flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-24 lg:h-fit lg:flex-col lg:overflow-visible scroll-thin">
          {groups.map((g) => (
            <div key={g || 'main'} className="contents lg:flex lg:flex-col lg:gap-1">
              {g && <span className="t-label hidden px-3 pb-1 pt-4 lg:block">{g}</span>}
              {visible.filter((t) => (t.group ?? '') === g).map((t) => (
                <NavLink key={t.id} to={`/admin/${t.id}`}
                  className={({ isActive }) => `flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-[var(--az-surface)] font-semibold text-white shadow-[inset_3px_0_0_var(--color-brand-400)]' : 'text-2 hover:bg-white/5 hover:text-white'}`}>
                  {t.icon && <Glyph value={t.icon} size={22} />}<span className="flex-1 whitespace-nowrap">{t.label}</span>
                  {t.badge && waiting[t.badge] > 0 && <span aria-label={`${waiting[t.badge]} waiting`} className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-ink-950">{waiting[t.badge]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <section aria-label={current.label} className="min-w-0">
          <h2 className="t-h1 mb-4 text-white">{current.label}</h2>
          {current.group === OLDER && <p className="band text-2 mb-4 p-3 text-sm">This older screen keeps its settings in this browser only; it isn’t connected to the server yet.</p>}
          <Panel />
        </section>
      </div>
    </PasswordGateProvider>
  );
}
