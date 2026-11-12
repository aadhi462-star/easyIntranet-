// A community's settings (v2 workstream G, G1): one page per section under Manage, at
// /c/:slug/manage/settings/:section, each with its own Save. The page reads the community as the
// server stores it once and hands it to the section; Branding is E's editor, unchanged.
import { SETTINGS_IDS } from '../../lib/manage.js';
import { Button, Skeleton } from '../ui/Controls.jsx';
import Branding from '../manage/Branding.jsx';
import General from './General.jsx';
import Privacy from './Privacy.jsx';
import Membership from './Membership.jsx';
import Roles from './Roles.jsx';
import Content from './Content.jsx';
import Learning from './Learning.jsx';
import EventsResources from './EventsResources.jsx';
import Notifications from './Notifications.jsx';
import Moderation from './Moderation.jsx';
import DangerZone from './DangerZone.jsx';
import { useSettingsSource } from './shared.jsx';

const PAGES = { general: General, privacy: Privacy, membership: Membership, roles: Roles, content: Content, learning: Learning, 'events-resources': EventsResources, notifications: Notifications };

export default function CommunitySettings({ g, section = 'general', isOwner = false }) {
  const id = SETTINGS_IDS.includes(section) ? section : 'general';
  const src = useSettingsSource(g);
  if (id === 'branding') return <Branding key={g.id} g={g} />;
  if (id === 'moderation') return <Moderation g={g} />;
  if (id === 'danger') return <DangerZone g={g} isOwner={isOwner} />;
  if (src.status === 'loading') return <div className="panel p-5"><Skeleton lines={5} label="Loading the settings" /></div>;
  if (src.status === 'error') {
    return (
      <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-[1_1_240px]">Couldn’t load the settings. {src.message}</span>
        <Button size="sm" onClick={src.reload}>Try again</Button>
      </div>
    );
  }
  const Page = PAGES[id];
  // Keyed by section, so switching sections starts from what the server says.
  return <Page key={`${g.id}-${id}`} g={g} src={src} />;
}
