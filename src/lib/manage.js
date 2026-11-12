// Community management (redesign Stage 6, v2 workstream G): addresses and the words used across
// the Manage tab.
import { communityPath } from './communities.js';

export const MANAGE_SECTIONS = ['overview', 'queue', 'members', 'analytics', 'settings'];

// G1: the eleven settings sections, each its own page at /c/:slug/manage/settings/:section with
// its own Save. `admins`: Owners and Admins (and Administrative Mode); the server checks again.
export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: 'admin' },
  { id: 'branding', label: 'Branding', icon: 'palette' },
  { id: 'privacy', label: 'Privacy and visibility', icon: 'lock' },
  { id: 'membership', label: 'Membership', icon: 'idcard' },
  { id: 'roles', label: 'Roles and permissions', icon: 'shield' },
  { id: 'content', label: 'Discussions and content', icon: 'forums' },
  { id: 'learning', label: 'Learning', icon: 'cap' },
  { id: 'events-resources', label: 'Events and resources', icon: 'events' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'moderation', label: 'Moderation and safety', icon: 'flag' },
  { id: 'danger', label: 'Danger Zone', icon: 'alert' },
];
export const SETTINGS_IDS = SETTINGS_SECTIONS.map((s) => s.id);

/**
 * /c/<community>/manage[/<section>[/<settings section>]]. Plain /manage opens the role's first
 * section (D5); on a phone it is the Manage list. managePath(g, 'settings', 'privacy') opens one
 * settings section; 'branding' (an older top-level address) is Settings, Branding.
 */
export const managePath = (community, section, sub) => {
  if (section === 'branding') { section = 'settings'; sub = 'branding'; }
  return `${communityPath(community, 'manage')}${section ? `/${section}` : ''}${section === 'settings' && sub ? `/${sub}` : ''}`;
};

// D2: the fixed list of reasons.
export const REASONS = [
  ['spam', 'Spam'], ['harassment', 'Harassment or bullying'], ['hate', 'Hate'],
  ['misleading', 'False or misleading'], ['off_topic', 'Off-topic'], ['other', 'Something else'],
];
export const REASON_LABEL = Object.fromEntries(REASONS);

// D3: decisions, in the words the person affected and the reviewer see.
export const ACTION_LABEL = {
  dismiss: 'Dismissed', remove: 'Removed', warn: 'Warned', restrict: 'Restricted',
  remove_member: 'Removed from the community', block: 'Blocked',
  reported: 'Reported', restored: 'Restored', appealed: 'Appealed',
  appeal_upheld: 'Appeal decided: kept', appeal_overturned: 'Appeal decided: undone', escalated: 'Sent to CommunityOne',
};
export const TARGET_LABEL = { post: 'Post', comment: 'Reply', event: 'Event', member: 'Member' };
