// One registry for navigation and routes. `page` is a file name in src/pages (loaded lazily).
// Admins can rename, hide and reorder entries in Admin → Branding & navigation.

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', path: '/dashboard', page: 'Dashboard', section: 'Home' },
  { id: 'feed', label: 'Feeds', icon: '📰', path: '/feed', page: 'Feed', section: 'Home', routes: ['/feed/:view', '/post/:id'] },
  { id: 'groups', label: 'Groups & Spaces', icon: '👥', path: '/groups', page: 'Groups', section: 'Community', routes: ['/groups/:id', '/groups/:id/:app'] },
  { id: 'events', label: 'Events', icon: '📅', path: '/events', page: 'Events', section: 'Community', routes: ['/events/:id'] },
  { id: 'townhalls', label: 'Town Halls', icon: '🎤', path: '/townhalls', page: 'TownHalls', section: 'Community', routes: ['/townhalls/:id'] },
  { id: 'live', label: 'Live & Meetings', icon: '📡', path: '/live', page: 'Live', section: 'Community', routes: ['/live/:id'] },
  { id: 'forums', label: 'Forums', icon: '🗂️', path: '/forums', page: 'Forums', section: 'Community', routes: ['/forums/:id'] },
  { id: 'ideas', label: 'Ideas', icon: '💡', path: '/ideas', page: 'Ideas', section: 'Community', routes: ['/ideas/:id'] },
  { id: 'channels', label: 'Channels & Chats', icon: '💬', path: '/channels', page: 'Channels', section: 'Communicate', routes: ['/channels/:id', '/messages/:id'] },
  { id: 'surveys', label: 'Surveys', icon: '📋', path: '/surveys', page: 'Surveys', section: 'Communicate', routes: ['/surveys/:id'] },
  { id: 'tasks', label: 'Tasks & Boards', icon: '✅', path: '/tasks', page: 'Tasks', section: 'Collaborate', routes: ['/tasks/:id'] },
  { id: 'files', label: 'Files', icon: '📁', path: '/files', page: 'Files', section: 'Collaborate', routes: ['/files/:id'] },
  { id: 'manuals', label: 'Manuals', icon: '📖', path: '/manuals', page: 'Manuals', section: 'Collaborate', routes: ['/manuals/:id', '/manuals/:id/:articleId'] },
  { id: 'calendar', label: 'Calendar', icon: '🗓️', path: '/calendar', page: 'Calendar', section: 'Collaborate' },
  { id: 'apps', label: 'Custom Apps', icon: '🧩', path: '/apps', page: 'CustomApps', section: 'Collaborate', routes: ['/apps/:id'] },
  { id: 'webtabs', label: 'Web Tabs', icon: '🌐', path: '/webtabs', page: 'WebTabs', section: 'Collaborate', routes: ['/webtabs/:id'] },
  { id: 'people', label: 'People', icon: '🧑‍🤝‍🧑', path: '/people', page: 'People', section: 'People', routes: ['/people/:id'] },
  { id: 'orgchart', label: 'Community structure', icon: '🌳', path: '/orgchart', page: 'OrgChart', section: 'People' },
  { id: 'leaderboard', label: 'Recognition', icon: '🏆', path: '/leaderboard', page: 'Leaderboard', section: 'People' },
  { id: 'admin', label: 'Admin', icon: '⚙️', path: '/admin', page: 'Admin', section: 'Manage', adminOnly: true, routes: ['/admin/:tab'] },
];

// Routes without a nav entry.
export const EXTRA_ROUTES = [
  { path: '/search', page: 'Search' },
  { path: '/c/:id', page: 'Community' },
  { path: '/c/:id/:tab', page: 'Community' },
  { path: '/c/:id/:tab/:sub', page: 'Community' },
  { path: '/c/:id/:tab/:sub/:mode', page: 'Community' },
  { path: '/learning', page: 'MyLearning' },
  { path: '/lessons/:id', page: 'Lesson' },
  { path: '/notices/:id', page: 'Notice' },
  { path: '/notifications', page: 'Notifications' },
  { path: '/saved', page: 'Saved' },
];

export function navFor(settings, me) {
  const order = settings?.navOrder?.length ? settings.navOrder : MODULES.map((m) => m.id);
  return order
    .map((id) => MODULES.find((m) => m.id === id))
    .filter(Boolean)
    .concat(MODULES.filter((m) => !order.includes(m.id)))
    .filter((m) => !(settings?.hiddenModules || []).includes(m.id) && (!m.adminOnly || me?.admin))
    .map((m) => ({ ...m, label: settings?.moduleNames?.[m.id] || m.label }));
}
