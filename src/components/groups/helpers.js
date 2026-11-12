// Community categories (v2): the server's list, shared with it.
export { CATEGORIES as GROUP_TYPES } from '../../../shared/categories.js';

// Keys are the app's internal names; labels follow CommunityOne's Public / Private / Closed.
export const ACCESS = {
  public: { label: 'Public', icon: 'globe', desc: 'Anyone on CommunityOne can find it, read it and join instantly.' },
  restricted: { label: 'Private', icon: 'lock', desc: 'Anyone can find it and see its card. Content is for members; people request to join and admins approve.' },
  private: { label: 'Closed', icon: 'lock', desc: 'Hidden from search and discovery. Members join only by invitation or when an admin adds them.' },
};

export const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'feed', label: 'Feed', icon: 'feeds' },
  { id: 'forums', label: 'Forums', icon: 'forums' },
  { id: 'events', label: 'Events', icon: 'events' },
  { id: 'files', label: 'Files', icon: 'files' },
  { id: 'manuals', label: 'Manuals', icon: 'manuals' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'ideas', label: 'Ideas', icon: 'ideas' },
  { id: 'townhalls', label: 'Town Halls', icon: 'mic' },
  { id: 'webtabs', label: 'Web Tabs', icon: 'webtabs' },
  { id: 'members', label: 'Members', icon: 'groups' },
];

export const RULE_FIELDS = [['batch', 'Batch'], ['city', 'City'], ['dept', 'Department'], ['company', 'Company']];

export function matchesRule(user, rule) {
  const want = String(rule?.value ?? '').toLowerCase().trim();
  if (!rule?.field || !want) return false;
  const v = String(user[rule.field] ?? '').toLowerCase().trim();
  return rule.op === 'contains' ? v.includes(want) : v === want;
}

export function roleOf(group, userId) {
  if (group.ownerId && group.ownerId === userId) return 'owner';
  if (group.admins?.includes(userId)) return 'admin';
  if (group.moderators?.includes(userId)) return 'moderator';
  if (group.members?.includes(userId)) return 'member';
  return null;
}

export const hueOf = (g) => g.hue ?? ([...g.id].reduce((n, c) => n + c.charCodeAt(0), 0) * 37) % 360;

/**
 * What the viewer may do in a group: the server's answer once communities have synced; before
 * that (or offline) the same rules worked out from the local member lists.
 */
export function permsOf(group, userId) {
  if (group.permissions) return group.permissions;
  const role = roleOf(group, userId);
  const admin = role === 'owner' || role === 'admin';
  return { canView: !!role || group.accessType === 'public', canParticipate: !!role, canComment: !!role, canModerate: admin || role === 'moderator', canAdmin: admin };
}

// Community role ranks (same order as the server's): nobody manages someone at or above their own.
export const RANK = { member: 0, moderator: 2, admin: 3, owner: 4 };
