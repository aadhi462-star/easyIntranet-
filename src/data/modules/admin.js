// Admin & platform seed: roles, policies, moderation, workflows, schedulers, custom apps, dashboards.

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

export const PERMS = [
  ['post.create', 'Create posts'],
  ['post.announce', 'Post announcements'],
  ['mandatory.mark', 'Mark mandatory reads'],
  ['group.create', 'Create groups'],
  ['event.create.network', 'Create network events'],
  ['forum.category', 'Manage forum categories'],
  ['channel.create', 'Create channels'],
  ['manual.create', 'Create manuals'],
  ['idea.moderate', 'Moderate ideas'],
  ['townhall.host', 'Host town halls'],
  ['survey.create', 'Create surveys'],
  ['files.upload', 'Upload files'],
  ['admin.analytics', 'View analytics'],
];

const allPerms = PERMS.map(([p]) => p);

export const seed = {
  roles: [
    { id: 'member', name: 'Member', system: true, perms: ['post.create', 'group.create', 'channel.create', 'files.upload', 'survey.create'] },
    { id: 'moderator', name: 'Moderator', system: true, perms: ['post.create', 'post.announce', 'mandatory.mark', 'group.create', 'channel.create', 'forum.category', 'idea.moderate', 'files.upload', 'survey.create'] },
    { id: 'alumni-relations', name: 'Alumni Relations', system: false, perms: allPerms },
    { id: 'external', name: 'External user', system: true, perms: ['post.create'] },
  ],
  policies: {
    groupCreation: 'everyone', // everyone | moderators | admins
    channelCreation: 'everyone',
    allowExternalUsers: true,
    maxFileSizeMb: 30,
    retentionDays: 0, // 0 = keep forever
    profileVisibility: 'members', // members | public | connections
  },
  customFields: [
    { id: 'cf1', label: 'Graduation year', type: 'number', options: [], visibility: 'everyone' },
    { id: 'cf2', label: 'Hostel', type: 'select', options: ['Hostel A', 'Hostel B', 'Hostel C', 'Day scholar'], visibility: 'everyone' },
    { id: 'cf3', label: 'Open to mentoring', type: 'checkbox', options: [], visibility: 'everyone' },
    { id: 'cf4', label: 'Phone number', type: 'text', options: [], visibility: 'admins' },
  ],
  invites: [
    { id: 'inv1', code: 'BATCH2019', email: 'neha@example.com', invitedBy: 'u7', batch: 2019, external: false, status: 'pending', createdAt: now - 2 * day },
    { id: 'inv2', code: 'GUEST2026', email: 'speaker@example.org', invitedBy: 'u7', batch: null, external: true, status: 'pending', createdAt: now - day },
  ],
  flags: [
    { id: 'fl1', kind: 'post', refId: 'p2', reason: 'Promotional content / hiring spam', reporterId: 'u6', status: 'open', createdAt: now - 5 * 3600e3 },
    { id: 'fl2', kind: 'forum', refId: 'f2', reason: 'Off-topic for category', reporterId: 'u5', status: 'open', createdAt: now - day },
    { id: 'fl3', kind: 'comment', refId: 'c3', reason: 'Spoiler', reporterId: 'u4', status: 'dismissed', createdAt: now - 3 * day },
  ],
  workflows: [
    { id: 'wf1', name: 'Welcome new members', enabled: true, trigger: 'signup', condition: { groupId: '', keyword: '' },
      actions: [{ kind: 'notifyAdmins', text: 'A new member joined AlumniZone' }], runs: [] },
    { id: 'wf2', name: 'Flag job posts for moderators', enabled: true, trigger: 'post/create', condition: { groupId: '', keyword: 'hiring' },
      actions: [{ kind: 'createTask', text: 'Review hiring post' }], runs: [] },
    { id: 'wf3', name: 'Badge for first idea', enabled: false, trigger: 'add:ideas', condition: { groupId: '', keyword: '' },
      actions: [{ kind: 'awardBadge', badgeId: 'ideator' }], runs: [] },
  ],
  schedulers: [
    { id: 'sc1', name: 'Weekly digest', kind: 'digest', interval: 'weekly', enabled: true, target: 'network', text: '', lastRun: now - 6 * day, nextRun: now + day },
    { id: 'sc2', name: 'Inactive member reminder', kind: 'inactive', interval: 'monthly', enabled: true, target: 'network', text: '', lastRun: now - 20 * day, nextRun: now + 10 * day },
    { id: 'sc3', name: 'Friday reminder to update profiles', kind: 'announcement', interval: 'weekly', enabled: false, target: 'network',
      text: 'Reminder: keep your career history up to date so juniors can find mentors 🎓', lastRun: null, nextRun: now + 2 * day },
  ],
  badgeAwards: [],
  customApps: [
    { id: 'app1', name: 'Mentorship request', icon: '🤝', description: 'Students and young alumni request a mentor.', ownerId: 'u3', notifyOwner: true,
      fields: [
        { id: 'fa1', label: 'Your name', type: 'text', required: true, options: [] },
        { id: 'fa2', label: 'Area', type: 'select', required: true, options: ['Product', 'Engineering', 'Design', 'Finance', 'Higher studies'] },
        { id: 'fa3', label: 'Preferred mentor', type: 'user', required: false, options: [] },
        { id: 'fa4', label: 'What do you need help with?', type: 'longtext', required: true, options: [] },
      ] },
    { id: 'app2', name: 'Job referral', icon: '💼', description: 'Share openings that alumni can refer for.', ownerId: 'u8', notifyOwner: true,
      fields: [
        { id: 'fb1', label: 'Role', type: 'text', required: true, options: [] },
        { id: 'fb2', label: 'Company', type: 'text', required: true, options: [] },
        { id: 'fb3', label: 'Location', type: 'select', required: false, options: ['Bengaluru', 'Chennai', 'Mumbai', 'Pune', 'Remote'] },
        { id: 'fb4', label: 'Closing date', type: 'date', required: false, options: [] },
        { id: 'fb5', label: 'Referral available', type: 'checkbox', required: false, options: [] },
      ] },
  ],
  appRecords: [
    { id: 'ar1', appId: 'app1', authorId: 'u6', createdAt: now - 2 * day, values: { fa1: 'Rohan Gupta', fa2: 'Product', fa3: 'u3', fa4: 'Moving from analytics to PM.' } },
    { id: 'ar2', appId: 'app1', authorId: 'u4', createdAt: now - day, values: { fa1: 'Daniel Okafor', fa2: 'Higher studies', fa3: '', fa4: 'Considering a PhD in Europe.' } },
    { id: 'ar3', appId: 'app1', authorId: 'u1', createdAt: now - 3600e3, values: { fa1: 'Aisha Raman', fa2: 'Design', fa3: 'u8', fa4: 'Leadership in design teams.' } },
    { id: 'ar4', appId: 'app2', authorId: 'u2', createdAt: now - 3 * day, values: { fb1: 'Firmware Engineer', fb2: 'Torque EV', fb3: 'Chennai', fb4: '', fb5: true } },
    { id: 'ar5', appId: 'app2', authorId: 'u4', createdAt: now - day, values: { fb1: 'ML Engineer', fb2: 'Quanta AI', fb3: 'Bengaluru', fb4: '', fb5: true } },
  ],
  dashboardWidgets: [],
  settings: {
    networkName: 'AlumniZone',
    tagline: 'Your alumni community, in one place.',
    accent: '#84cc16',
    logoText: 'AZ',
    customCss: '',
    landing: '/feed',
    moduleNames: {},
    hiddenModules: ['orgchart'],
    navOrder: [],
    registration: {
      open: true,
      requireApproval: false,
      guidelines: 'Be kind and respectful. Keep conversations relevant to our alumni community. No spam, sales pitches or sharing others’ personal information without consent. Admins may remove content or members that break these guidelines.',
      allowedDomains: [],
    },
    moderation: { requireApproval: false, newMemberHoldDays: 0, bannedWords: [], whitelist: [] },
    security: { sso: { enabled: false, provider: '', entityId: '', ssoUrl: '' }, externalUsers: true, directorySync: false, customDomain: '', mobileAppName: '' },
    assist: { enabled: true, writer: true, summaries: true, translation: true, sentiment: true },
  },
};
