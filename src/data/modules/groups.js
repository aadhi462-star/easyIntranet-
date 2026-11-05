// Groups & Spaces seed. Keeps core ids g1–g5 and adds an All Hands group plus a few more.
const ALL = Array.from({ length: 34 }, (_, i) => `u${i + 1}`);
const ALL_APPS = ['dashboard', 'feed', 'forums', 'events', 'files', 'manuals', 'tasks', 'ideas', 'townhalls', 'webtabs', 'members'];

const dash = (extra = []) => [
  { id: 'w-about', kind: 'about' },
  { id: 'w-events', kind: 'events' },
  { id: 'w-members', kind: 'members' },
  ...extra,
];

export const seed = {
  groups: [
    { id: 'g0', name: 'All Hands', description: 'Network-wide announcements from the alumni relations team. Everyone is a member.', type: 'Department', accessType: 'public', emoji: '📢', hue: 230,
      members: ALL, admins: ['u7'], moderators: [], joinRequests: [], apps: ['dashboard', 'feed', 'events', 'townhalls', 'members'], announceOnly: true, allHands: true,
      dashboard: dash([{ id: 'w-stats', kind: 'stats' }]), guidelines: 'Only admins post here. Comment and react freely.' },
    { id: 'g1', name: 'Class of 2016', description: 'Everything for the 2016 batch: reunions, updates and throwbacks.', type: 'Batch', accessType: 'private', emoji: '🎓', hue: 262,
      members: ['u1', 'u2', 'u7', 'u3', 'u34'], admins: ['u7'], moderators: ['u1'], joinRequests: [], apps: ['dashboard', 'feed', 'forums', 'events', 'files', 'members'],
      dynamicRule: { field: 'batch', op: 'eq', value: '2016' },
      dashboard: dash([{ id: 'w-rules', kind: 'rules' }, { id: 'w-links', kind: 'links', links: [{ label: 'Reunion photo album', url: 'https://example.com/album' }] }]),
      guidelines: 'Keep it friendly. Reunion logistics go in the Events tab.' },
    { id: 'g2', name: 'Bengaluru Chapter', description: 'Alumni living and working in Bengaluru. Monthly meet-ups.', type: 'City', accessType: 'public', emoji: '🌆', hue: 190,
      members: ['u1', 'u4', 'u8', 'u21', 'u23', 'u32'], admins: ['u8', 'u21'], moderators: [], joinRequests: [], apps: ['dashboard', 'feed', 'events', 'files', 'webtabs', 'members'],
      dynamicRule: { field: 'city', op: 'eq', value: 'Bengaluru' },
      dashboard: dash([{ id: 'w-stats', kind: 'stats' }]), guidelines: 'Be on time for meet-ups. Share photos after!' },
    { id: 'g3', name: 'Founders Circle', description: 'Alumni founders sharing lessons, intros and hiring needs.', type: 'Interest', accessType: 'restricted', emoji: '🚀', hue: 20,
      members: ['u2', 'u8', 'u30'], admins: ['u2'], moderators: [], joinRequests: ['u4'], apps: ['dashboard', 'feed', 'forums', 'ideas', 'members'],
      dashboard: dash([{ id: 'w-rules', kind: 'rules' }]), guidelines: 'Founders and early employees only. What is shared here stays here.' },
    { id: 'g4', name: 'Mentorship Program', description: 'Pairing students with alumni mentors across industries.', type: 'Interest', accessType: 'public', emoji: '🤝', hue: 330,
      members: ['u3', 'u7', 'u1', 'u5', 'u22', 'u28', 'u32', 'u26'], admins: ['u3', 'u22'], moderators: ['u7'], joinRequests: [], apps: ['dashboard', 'feed', 'forums', 'events', 'manuals', 'tasks', 'members'],
      dashboard: dash([{ id: 'w-html', kind: 'html', html: '<h3 style="margin:0 0 6px">Become a mentor</h3><p style="margin:0">One hour a month changes a student\'s year.</p>' }]),
      guidelines: 'Respect mentee privacy. Log sessions in Tasks.' },
    { id: 'g5', name: 'Mumbai Chapter', description: 'Mumbai alumni: sea-face walks and startup nights.', type: 'City', accessType: 'public', emoji: '🌊', hue: 140,
      members: ['u5', 'u27', 'u33'], admins: ['u5'], moderators: [], joinRequests: [], apps: ['dashboard', 'feed', 'events', 'members'],
      dynamicRule: { field: 'city', op: 'eq', value: 'Mumbai' }, dashboard: dash(), guidelines: '' },
    { id: 'g6', name: 'Homecoming 2026 Committee', description: 'Volunteers planning this year\'s homecoming.', type: 'Project', accessType: 'private', emoji: '🏛️', hue: 290,
      members: ['u7', 'u1', 'u3'], admins: ['u7'], moderators: [], joinRequests: [], apps: ALL_APPS, dashboard: dash([{ id: 'w-stats', kind: 'stats' }]),
      guidelines: 'Decisions go in Tasks. Vendors and budgets in Files.' },
    { id: 'g7', name: 'Computer Science Alumni', description: 'CS grads across all batches: tech talks, jobs and research.', type: 'Department', accessType: 'public', emoji: '💻', hue: 210,
      members: ['u1', 'u4', 'u7'], admins: ['u4'], moderators: [], joinRequests: [], apps: ['dashboard', 'feed', 'forums', 'ideas', 'events', 'members'],
      dynamicRule: { field: 'dept', op: 'eq', value: 'Computer Science' }, dashboard: dash(), guidelines: '' },
  ],
};
