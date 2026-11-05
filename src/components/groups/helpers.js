export const GROUP_TYPES = ['Batch', 'City', 'Interest', 'Department', 'Project'];

export const ACCESS = {
  public: { label: 'Public', icon: '🌍', desc: 'Anyone in the network can see and join.' },
  restricted: { label: 'Restricted', icon: '🔐', desc: 'Visible to everyone. Members join by request, approved by admins.' },
  private: { label: 'Private', icon: '🔒', desc: 'Hidden content. Members join only when added by an admin.' },
};

export const APPS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'feed', label: 'Feed', icon: '📰' },
  { id: 'forums', label: 'Forums', icon: '🗂️' },
  { id: 'events', label: 'Events', icon: '📅' },
  { id: 'files', label: 'Files', icon: '📁' },
  { id: 'manuals', label: 'Manuals', icon: '📖' },
  { id: 'tasks', label: 'Tasks', icon: '✅' },
  { id: 'ideas', label: 'Ideas', icon: '💡' },
  { id: 'townhalls', label: 'Town Halls', icon: '🎤' },
  { id: 'webtabs', label: 'Web Tabs', icon: '🌐' },
  { id: 'members', label: 'Members', icon: '👥' },
];

export const RULE_FIELDS = [['batch', 'Batch'], ['city', 'City'], ['dept', 'Department'], ['company', 'Company']];

export function matchesRule(user, rule) {
  if (!rule?.field || rule.value === '' || rule.value == null) return false;
  const v = String(user[rule.field] ?? '').toLowerCase();
  const want = String(rule.value).toLowerCase().trim();
  return rule.op === 'contains' ? v.includes(want) : v === want;
}

export function roleOf(group, userId) {
  if (group.admins?.includes(userId)) return 'admin';
  if (group.moderators?.includes(userId)) return 'moderator';
  if (group.members?.includes(userId)) return 'member';
  return null;
}

export const hueOf = (g) => g.hue ?? ([...g.id].reduce((n, c) => n + c.charCodeAt(0), 0) * 37) % 360;
