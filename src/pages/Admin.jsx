import UserLabelsAdmin from '../components/admin/UserLabelsAdmin.jsx';
import { Glyph } from '../components/icons.jsx';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Empty, PageHeader } from '../components/ui.jsx';
import Analytics from '../components/admin/Analytics.jsx';
import Members from '../components/admin/Members.jsx';
import Moderation from '../components/admin/Moderation.jsx';
import Branding from '../components/admin/Branding.jsx';
import { Policies, ProfileFields, Roles } from '../components/admin/Access.jsx';
import { Schedulers, Workflows } from '../components/admin/Automation.jsx';
import { AuditLog, DataExport, Security, AssistSettings } from '../components/admin/DataSecurity.jsx';

const TABS = [
  { id: 'analytics', label: 'Analytics', icon: '📊', el: Analytics, perm: 'admin.analytics' },
  { id: 'members', label: 'Members', icon: '👤', el: Members },
  { id: 'roles', label: 'Roles & permissions', icon: '🛡️', el: Roles },
  { id: 'policies', label: 'Policies', icon: '📜', el: Policies },
  { id: 'moderation', label: 'Moderation', icon: '🚩', el: Moderation },
  { id: 'fields', label: 'Profile fields', icon: '🪪', el: ProfileFields },
  { id: 'labels', label: 'User labels', icon: '🏷️', el: UserLabelsAdmin },
  { id: 'branding', label: 'Branding & navigation', icon: '🎨', el: Branding },
  { id: 'workflows', label: 'Workflows', icon: '⚡', el: Workflows },
  { id: 'schedulers', label: 'Schedulers', icon: '⏱️', el: Schedulers },
  { id: 'audit', label: 'Audit log', icon: '🧾', el: AuditLog },
  { id: 'export', label: 'Data export', icon: '💾', el: DataExport },
  { id: 'security', label: 'Security & SSO', icon: '🔐', el: Security },
  { id: 'assist', label: 'Smart Assist', icon: '✨', el: AssistSettings },
];

export default function Admin() {
  const { tab } = useParams();
  const { me, can, state } = useStore();
  // Non-admins with a role that grants analytics can see that tab only.
  const visible = TABS.filter((t) => me.admin || (t.perm && can(t.perm)));
  if (!visible.length) return <Empty icon="🔒" title="Admins only">You don’t have permission to manage this network.</Empty>;
  const current = visible.find((t) => t.id === tab);
  if (!current) return <Navigate to={`/admin/${visible[0].id}`} replace />;
  const Panel = current.el;
  const badges = {
    members: state.users.filter((u) => u.status === 'pending').length,
    moderation: (state.flags || []).filter((f) => f.status === 'open').length + state.posts.filter((p) => p.status === 'pending').length,
  };

  return (
    <>
      <PageHeader title="Admin" subtitle={`Manage ${state.settings.networkName}`} />
      <div className="ext-grid grid gap-5 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Admin sections" className="ext-menu glass flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-24 lg:h-fit lg:flex-col lg:overflow-visible scroll-thin">
          {visible.map((t) => (
            <NavLink key={t.id} to={`/admin/${t.id}`}
              className={({ isActive }) => `flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-brand-500/25 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
              <Glyph value={t.icon} size={26} /><span className="flex-1 whitespace-nowrap">{t.label}</span>
              {badges[t.id] > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold">{badges[t.id]}</span>}
            </NavLink>
          ))}
        </nav>
        <section aria-label={current.label} className="min-w-0">
          <h2 className="mb-4 flex items-center gap-3 text-lg font-bold"><Glyph value={current.icon} size={34} />{current.label}</h2>
          <Panel />
        </section>
      </div>
    </>
  );
}
