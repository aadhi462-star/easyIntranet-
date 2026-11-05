// Demo network content. All people, places and organisations here are fictional.

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (offsetDays, hour = 18, min = 0) => {
  const d = new Date(now + offsetDays * day);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
};

export const ME_ID = 'u1';

export const users = [
  { id: 'u1', name: 'Aisha Raman', email: 'aisha@example.com', batch: 2016, dept: 'Computer Science', city: 'Bengaluru', role: 'Product Designer', company: 'Lumen Labs', admin: true, hue: 262,
    bio: 'Designing calm software. Ex-president of the design club. Always up for a campus walk.',
    skills: ['Product design', 'Research', 'Figma', 'Mentoring'],
    career: [{ title: 'Product Designer', org: 'Lumen Labs', from: 2021, to: null }, { title: 'UX Intern', org: 'Brightpath', from: 2019, to: 2020 }] },
  { id: 'u2', name: 'Karthik Menon', email: 'karthik@example.com', batch: 2016, dept: 'Mechanical', city: 'Chennai', role: 'Founder', company: 'Torque EV', hue: 20,
    bio: 'Building electric two-wheelers. Hostel B forever.', skills: ['Hardware', 'Fundraising'], career: [{ title: 'Founder', org: 'Torque EV', from: 2022, to: null }] },
  { id: 'u3', name: 'Priya Sharma', email: 'priya@example.com', batch: 2015, dept: 'Electronics', city: 'Pune', role: 'Engineering Manager', company: 'Northwind', hue: 330,
    bio: 'Leading platform teams. Alumni mentorship coordinator.', skills: ['Leadership', 'Distributed systems'], career: [{ title: 'Engineering Manager', org: 'Northwind', from: 2020, to: null }] },
  { id: 'u4', name: 'Daniel Okafor', email: 'daniel@example.com', batch: 2018, dept: 'Computer Science', city: 'Bengaluru', role: 'ML Engineer', company: 'Quanta AI', hue: 190,
    bio: 'Training models by day, playing football by night.', skills: ['Python', 'ML'], career: [{ title: 'ML Engineer', org: 'Quanta AI', from: 2021, to: null }] },
  { id: 'u5', name: 'Meera Iyer', email: 'meera@example.com', batch: 2014, dept: 'Civil', city: 'Mumbai', role: 'Urban Planner', company: 'City Lab', hue: 140,
    bio: 'Making cities walkable. Organiser of the Mumbai chapter.', skills: ['Urban design', 'Policy'], career: [{ title: 'Urban Planner', org: 'City Lab', from: 2018, to: null }] },
  { id: 'u6', name: 'Rohan Gupta', email: 'rohan@example.com', batch: 2017, dept: 'Electrical', city: 'Hyderabad', role: 'Data Analyst', company: 'Finly', hue: 45,
    bio: 'Numbers, cricket and filter coffee.', skills: ['SQL', 'Tableau'], career: [{ title: 'Data Analyst', org: 'Finly', from: 2019, to: null }] },
  { id: 'u7', name: 'Sara Thomas', email: 'sara@example.com', batch: 2016, dept: 'Computer Science', city: 'Kochi', role: 'Alumni Relations Lead', company: 'The Institute', admin: true, hue: 290,
    bio: 'Connecting generations of alumni. Reach out for anything reunion-related.', skills: ['Community', 'Events'], career: [{ title: 'Alumni Relations Lead', org: 'The Institute', from: 2020, to: null }] },
  { id: 'u8', name: 'Vikram Rao', email: 'vikram@example.com', batch: 2012, dept: 'Mechanical', city: 'Bengaluru', role: 'VP Operations', company: 'Helix Motors', hue: 0,
    bio: 'Happy to mentor anyone moving into operations.', skills: ['Operations', 'Supply chain'], career: [{ title: 'VP Operations', org: 'Helix Motors', from: 2019, to: null }] },
  // Community hosts: admins who run the network day to day. Demo accounts with a password
  // set must sign in with it (see DEMO_ACCOUNTS.md); the rest accept any password.
  { id: 'u21', name: 'Neha Kapoor', email: 'neha.host@example.com', batch: 2013, dept: 'Computer Science', city: 'Bengaluru', role: 'Community Host', company: 'AlumniZone', hue: 160, joinedAt: now - 40 * day, admin: true, host: true, password: 'Lime-Host-4821',
    bio: 'Hosts the community: approvals, moderation and the monthly newsletter.', skills: ['Community', 'Moderation', 'Events'], career: [{ title: 'Community Host', org: 'AlumniZone', from: 2015, to: null }] },
  { id: 'u22', name: 'Arjun Nair', email: 'arjun.host@example.com', batch: 2011, dept: 'Electronics', city: 'Kochi', role: 'Community Host', company: 'AlumniZone', hue: 210, joinedAt: now - 38 * day, admin: true, host: true, password: 'Lime-Host-7356',
    bio: 'Co-host. Runs chapters, town halls and the mentorship drive.', skills: ['Chapters', 'Town halls', 'Mentoring'], career: [{ title: 'Community Host', org: 'AlumniZone', from: 2013, to: null }] },
  // Members
  { id: 'u23', name: 'Ishita Verma', email: 'ishita@example.com', batch: 2019, dept: 'Computer Science', city: 'Bengaluru', role: 'Frontend Engineer', company: 'Pixelcraft', hue: 300, joinedAt: now - 1 * day, password: 'Alumni-Member-2093',
    bio: 'Building accessible web apps. New to Bengaluru, say hi!', skills: ['React', 'Accessibility'], career: [{ title: 'Frontend Engineer', org: 'Pixelcraft', from: 2021, to: null }] },
  { id: 'u24', name: 'Varun Shetty', email: 'varun@example.com', batch: 2017, dept: 'Mechanical', city: 'Pune', role: 'Product Manager', company: 'Gearbox', hue: 25, joinedAt: now - 2 * day,
    bio: 'PM for factory software. Weekend trekker.', skills: ['Product', 'Manufacturing'], career: [{ title: 'Product Manager', org: 'Gearbox', from: 2019, to: null }] },
  { id: 'u25', name: 'Meenakshi Iyer', email: 'meenakshi@example.com', batch: 2010, dept: 'Civil', city: 'Chennai', role: 'Structural Engineer', company: 'Arc & Beam', hue: 345, joinedAt: now - 3 * day,
    bio: 'Designing bridges. Happy to talk civil careers.', skills: ['Structures', 'AutoCAD'], career: [{ title: 'Structural Engineer', org: 'Arc & Beam', from: 2012, to: null }] },
  { id: 'u26', name: 'Tenzin Dorje', email: 'tenzin@example.com', batch: 2020, dept: 'Electrical', city: 'Delhi', role: 'Energy Analyst', company: 'SunGrid', hue: 100, joinedAt: now - 4 * day,
    bio: 'Solar, storage and long bike rides.', skills: ['Energy', 'Python'], career: [{ title: 'Energy Analyst', org: 'SunGrid', from: 2022, to: null }] },
  { id: 'u27', name: 'Ritu Agarwal', email: 'ritu@example.com', batch: 2015, dept: 'Computer Science', city: 'Mumbai', role: 'Data Scientist', company: 'Finly', hue: 280, joinedAt: now - 5 * day,
    bio: 'Forecasting things. Mumbai chapter regular.', skills: ['ML', 'Statistics'], career: [{ title: 'Data Scientist', org: 'Finly', from: 2017, to: null }] },
  { id: 'u28', name: 'Pooja Menon', email: 'pooja@example.com', batch: 2009, dept: 'Mechanical', city: 'Kochi', role: 'Plant Head', company: 'Coastal Foods', hue: 35, joinedAt: now - 6 * day,
    bio: 'Twenty years in operations. Ask me about scaling plants.', skills: ['Operations', 'Lean'], career: [{ title: 'Plant Head', org: 'Coastal Foods', from: 2011, to: null }] },
  { id: 'u29', name: 'Ayesha Khan', email: 'ayesha@example.com', batch: 2021, dept: 'Electronics', city: 'Pune', role: 'Embedded Engineer', company: 'Northwind', hue: 315, joinedAt: now - 8 * day,
    bio: 'Firmware for medical devices. Robotics club alum.', skills: ['C', 'Embedded'], career: [{ title: 'Embedded Engineer', org: 'Northwind', from: 2023, to: null }] },
  { id: 'u30', name: 'Aditya Bose', email: 'aditya@example.com', batch: 2014, dept: 'Computer Science', city: 'Kolkata', role: 'Founder', company: 'Bookshelf', hue: 230, joinedAt: now - 10 * day,
    bio: 'Building a reading app. Hiring interns.', skills: ['Startups', 'Mobile'], career: [{ title: 'Founder', org: 'Bookshelf', from: 2016, to: null }] },
  { id: 'u31', name: 'Harsh Patel', email: 'harsh@example.com', batch: 2018, dept: 'Civil', city: 'Hyderabad', role: 'Architect', company: 'Studio Kaya', hue: 120, joinedAt: now - 12 * day,
    bio: 'Sustainable homes. Sketching at every reunion.', skills: ['Architecture', 'Sustainability'], career: [{ title: 'Architect', org: 'Studio Kaya', from: 2020, to: null }] },
  { id: 'u32', name: 'Manoj Das', email: 'manoj@example.com', batch: 2012, dept: 'Electrical', city: 'Bengaluru', role: 'Engineering Director', company: 'Quanta AI', hue: 200, joinedAt: now - 14 * day,
    bio: 'Leads platform engineering. Mentor for career switchers.', skills: ['Leadership', 'Cloud'], career: [{ title: 'Engineering Director', org: 'Quanta AI', from: 2014, to: null }] },
  { id: 'u33', name: 'Zara Sheikh', email: 'zara@example.com', batch: 2022, dept: 'Computer Science', city: 'Mumbai', role: 'Software Engineer', company: 'Lumen Labs', hue: 330, joinedAt: now - 16 * day,
    bio: 'Recent grad. Running the alumni quiz night.', skills: ['Java', 'Quizzing'], career: [{ title: 'Software Engineer', org: 'Lumen Labs', from: 2024, to: null }] },
  { id: 'u34', name: 'Nikhil Joshi', email: 'nikhil@example.com', batch: 2016, dept: 'Mechanical', city: 'Chennai', role: 'Design Engineer', company: 'Torque EV', hue: 60, joinedAt: now - 20 * day,
    bio: 'Designing EV drivetrains with Karthik.', skills: ['CAD', 'EV'], career: [{ title: 'Design Engineer', org: 'Torque EV', from: 2018, to: null }] },
];

export const groups = [
  { id: 'g1', name: 'Class of 2016', description: 'Everything for the 2016 batch: reunions, updates and throwbacks.', type: 'Batch', accessType: 'private', emoji: '🎓',
    members: ['u1', 'u2', 'u7', 'u3'], admins: ['u7'], apps: ['feed', 'forums', 'events', 'members'] },
  { id: 'g2', name: 'Bengaluru Chapter', description: 'Alumni living and working in Bengaluru. Monthly meet-ups.', type: 'City', accessType: 'public', emoji: '🌆',
    members: ['u1', 'u4', 'u8'], admins: ['u8'], apps: ['feed', 'events', 'members'] },
  { id: 'g3', name: 'Founders Circle', description: 'Alumni founders sharing lessons, intros and hiring needs.', type: 'Interest', accessType: 'public', emoji: '🚀',
    members: ['u2', 'u8'], admins: ['u2'], apps: ['feed', 'forums', 'members'] },
  { id: 'g4', name: 'Mentorship Program', description: 'Pairing students with alumni mentors across industries.', type: 'Interest', accessType: 'public', emoji: '🤝',
    members: ['u3', 'u7', 'u1', 'u5'], admins: ['u3'], apps: ['feed', 'forums', 'events', 'members'] },
  { id: 'g5', name: 'Mumbai Chapter', description: 'Mumbai alumni: sea-face walks and startup nights.', type: 'City', accessType: 'public', emoji: '🌊',
    members: ['u5'], admins: ['u5'], apps: ['feed', 'events', 'members'] },
];

export const posts = [
  { id: 'p1', authorId: 'u7', scope: { type: 'network' }, createdAt: now - 2 * 3600e3, type: 'announcement',
    text: 'The Annual Alumni Homecoming is confirmed for next month! Please read the code of conduct and confirm below so we can finalise passes.',
    mandatory: { deadline: at(10), message: 'I have read and agree to the Homecoming code of conduct.', button: 'Acknowledge', acks: ['u2', 'u3'] },
    likes: ['u2', 'u3', 'u4', 'u5'], comments: [{ id: 'c1', authorId: 'u2', text: 'Cannot wait! Booking tickets already.', createdAt: now - 3600e3 }] },
  { id: 'p2', authorId: 'u2', scope: { type: 'network' }, createdAt: now - 5 * 3600e3, type: 'post',
    text: 'Torque EV just closed our seed round 🎉 Huge thanks to the Founders Circle for the intros. We are hiring firmware engineers. Alumni referrals get priority!',
    likes: ['u1', 'u4', 'u8', 'u6', 'u7'], comments: [{ id: 'c2', authorId: 'u8', text: 'Proud of you, Karthik!', createdAt: now - 4 * 3600e3 }] },
  { id: 'p3', authorId: 'u4', scope: { type: 'group', id: 'g2' }, createdAt: now - 26 * 3600e3, type: 'poll',
    text: 'Where should the next Bengaluru meet-up be?',
    poll: { options: [{ id: 'o1', text: 'Cubbon Park picnic', votes: ['u1', 'u8'] }, { id: 'o2', text: 'Brewery in Indiranagar', votes: ['u4'] }, { id: 'o3', text: 'Campus visit', votes: [] }] },
    likes: ['u8'], comments: [] },
  { id: 'p4', authorId: 'u3', scope: { type: 'group', id: 'g4' }, createdAt: now - 2 * day, type: 'post',
    text: 'Mentorship applications for the spring cohort are open. 40 students are waiting for mentors. Even one hour a month helps.',
    likes: ['u1', 'u7'], comments: [] },
  { id: 'p5', authorId: 'u5', scope: { type: 'network' }, createdAt: now - 3 * day, type: 'post',
    text: 'Found this photo from our 2014 convocation. Tag yourself if you can find your younger self 😄',
    likes: ['u7', 'u3', 'u1'], comments: [{ id: 'c3', authorId: 'u7', text: 'Adding this to the alumni archive!', createdAt: now - 2.5 * day }] },
];

export const events = [
  { id: 'e1', title: 'Annual Alumni Homecoming', scope: { type: 'network' }, hostId: 'u7', assistants: ['u1'], start: at(14, 17), end: at(14, 22),
    location: 'Main Campus Auditorium', description: 'An evening of reconnecting, awards and a dinner on the lawns.', rsvpEnabled: true,
    rsvps: { u1: 'going', u2: 'going', u3: 'maybe', u5: 'going' }, invitees: [] },
  { id: 'e2', title: 'Bengaluru Chapter Meet-up', scope: { type: 'group', id: 'g2' }, hostId: 'u8', assistants: [], start: at(5, 18, 30), end: at(5, 21),
    location: 'Cubbon Park, Bengaluru', description: 'Casual picnic. Bring snacks and stories.', rsvpEnabled: true, rsvps: { u4: 'going', u8: 'going' }, invitees: [] },
  { id: 'e3', title: 'Mentor orientation call', scope: { type: 'group', id: 'g4' }, hostId: 'u3', assistants: ['u7'], start: at(2, 19), end: at(2, 20),
    location: 'Online', description: 'A 45-minute walkthrough of how mentorship pairing works.', rsvpEnabled: true, rsvps: { u1: 'going' }, invitees: [] },
  { id: 'e4', title: 'Coffee with Priya', scope: { type: 'private' }, hostId: 'u1', assistants: [], start: at(1, 9, 30), end: at(1, 10, 30),
    location: 'Third Wave, Koramangala', description: 'Catch-up on the mentorship program.', rsvpEnabled: true, rsvps: {}, invitees: ['u3'] },
  { id: 'e5', title: 'Class of 2016 – 10 year reunion planning', scope: { type: 'group', id: 'g1' }, hostId: 'u7', assistants: [], start: at(21, 11), end: at(21, 12),
    location: 'Online', description: 'Help shape our 10-year reunion.', rsvpEnabled: true, rsvps: {}, invitees: [] },
];

export const forumCategories = [
  { id: 'fc1', name: 'Careers & Jobs', autoFollow: true },
  { id: 'fc2', name: 'Higher Studies', autoFollow: false },
  { id: 'fc3', name: 'Campus News', autoFollow: true },
  { id: 'fc4', name: 'Off-topic', autoFollow: false },
];

export const forumPosts = [
  { id: 'f1', authorId: 'u6', title: 'Switching from analytics to product management. Advice?', groupId: null, categories: ['fc1'], status: 'published', commentsDisabled: false,
    body: 'I have 5 years in data analytics and want to move into PM. Did anyone here make that switch? What helped the most?', createdAt: now - 1.5 * day,
    upvotes: ['u1', 'u3'], replies: [{ id: 'r1', authorId: 'u3', text: 'Start owning a metric end to end in your current role. That story sells.', createdAt: now - day }] },
  { id: 'f2', authorId: 'u4', title: 'MS in the US vs Europe in 2026', groupId: null, categories: ['fc2'], status: 'published', commentsDisabled: false,
    body: 'A few juniors asked me this. Would love inputs from alumni who studied abroad recently.', createdAt: now - 3 * day, upvotes: ['u6'], replies: [] },
  { id: 'f3', authorId: 'u7', title: 'New library wing opens to alumni', groupId: null, categories: ['fc3'], status: 'published', commentsDisabled: true,
    body: 'Alumni can now get reading access to the new library wing with their AlumniZone ID. Details at the front desk.', createdAt: now - 4 * day, upvotes: ['u1', 'u5', 'u2'], replies: [] },
  { id: 'f4', authorId: 'u2', title: 'Hardware founders: where do you prototype?', groupId: 'g3', categories: ['fc1'], status: 'published', commentsDisabled: false,
    body: 'Looking for maker spaces in Chennai and Bengaluru with CNC access.', createdAt: now - 2 * day, upvotes: [], replies: [] },
];

export const channels = [
  { id: 'ch1', name: 'general', description: 'Network-wide chatter', groupId: null, members: users.map(u => u.id), admins: ['u7'],
    messages: [
      { id: 'm1', authorId: 'u7', text: 'Welcome to AlumniZone, everyone 👋', createdAt: now - 3 * day },
      { id: 'm2', authorId: 'u4', text: 'Great to be here!', createdAt: now - 3 * day + 600e3 },
      { id: 'm3', authorId: 'u5', text: 'Homecoming passes go live on Monday.', createdAt: now - 3600e3 },
    ] },
  { id: 'ch2', name: 'class-of-2016', description: 'Linked to the Class of 2016 group', groupId: 'g1', members: ['u1', 'u2', 'u7', 'u3'], admins: ['u7'],
    messages: [{ id: 'm4', authorId: 'u2', text: 'Who is coming for the reunion planning call?', createdAt: now - 7200e3 }] },
  { id: 'ch3', name: 'jobs-referrals', description: 'Share openings and referrals', groupId: null, members: ['u1', 'u2', 'u4', 'u6', 'u8'], admins: ['u8'],
    messages: [{ id: 'm5', authorId: 'u2', text: 'Torque EV is hiring firmware engineers. DM me.', createdAt: now - 5 * 3600e3 }] },
];

export const manuals = [
  { id: 'man1', title: 'Alumni Handbook', description: 'How the alumni network works.', admins: ['u7'], published: true,
    chapters: [
      { id: 'ch-a', title: 'Getting started', articles: [
        { id: 'a1', title: 'Welcome to AlumniZone', published: true, updatedAt: now - 10 * day,
          body: 'AlumniZone is the private, invite-only network for graduates of the Institute.\n\nUse the Wall to share updates, Groups for your batch or city, Events for reunions, and Forums for longer discussions.' },
        { id: 'a2', title: 'Completing your profile', published: true, updatedAt: now - 9 * day,
          body: 'Add your batch, department, city and current role so classmates can find you.\n\nYour career history helps students find mentors.' },
      ] },
      { id: 'ch-b', title: 'Community guidelines', articles: [
        { id: 'a3', title: 'Code of conduct', published: true, updatedAt: now - 8 * day,
          body: 'Be kind. Be respectful of privacy. No unsolicited sales pitches.\n\nAdmins may remove content that breaks these guidelines.' },
        { id: 'a4', title: 'Reporting a problem', published: false, updatedAt: now - day,
          body: 'Draft: how to report a post or a member to the alumni relations team.' },
      ] },
    ] },
  { id: 'man2', title: 'Event Organiser Kit', description: 'Templates and checklists for hosting chapter events.', admins: ['u7', 'u8'], published: true,
    chapters: [{ id: 'ch-c', title: 'Planning', articles: [
      { id: 'a5', title: 'Chapter meet-up checklist', published: true, updatedAt: now - 5 * day,
        body: '1. Pick a date at least three weeks out.\n2. Create the event in your chapter group.\n3. Post a poll for the venue.\n4. Send a reminder two days before.' },
    ] }] },
];

export const notifications = [
  { id: 'n1', kind: 'mandatory', text: 'Sara Thomas marked a post as Mandatory Read', link: '/feed/mandatory', createdAt: now - 2 * 3600e3, read: false },
  { id: 'n2', kind: 'event', text: 'You are invited as an Event Assistant for Annual Alumni Homecoming', link: '/events/e1', createdAt: now - 6 * 3600e3, read: false },
  { id: 'n3', kind: 'like', text: 'Priya Sharma and 2 others liked your comment', link: '/feed', createdAt: now - day, read: true },
  { id: 'n4', kind: 'group', text: 'Daniel Okafor posted a poll in Bengaluru Chapter', link: '/groups/g2', createdAt: now - 26 * 3600e3, read: true },
];

export const settings = {
  networkName: 'AlumniZone',
  tagline: 'The open community for every alumnus.',
  accent: '#84cc16',
  customCss: '',
  landing: '/feed',
  moduleNames: {},
  hiddenModules: ['orgchart'],
  navOrder: [],
  // Open community: anyone can join. Admins can require approval or limit email domains.
  registration: {
    open: true,
    requireApproval: false,
    allowedDomains: [],
    guidelines: 'Be kind and respectful. No spam, self-promotion or sales pitches. Respect privacy: don’t share other members’ contact details. Keep discussions relevant to the alumni community.',
  },
  moderation: { requireApproval: false, newMemberHoldDays: 0, bannedWords: [], whitelist: [] },
};

// Feature modules add their own collections in ./modules/*.js (export const seed = {...}).
// A module may also override a base collection; later keys win.
const moduleSeeds = Object.values(import.meta.glob('./modules/*.js', { eager: true })).map((m) => m.seed ?? {});

export function initialState() {
  const base = {
    version: 4,
    session: null,
    users, groups, posts, events, forumCategories, forumPosts, channels, manuals, notifications,
    bookmarks: [], activity: [], settings,
  };
  return structuredClone(Object.assign(base, ...moduleSeeds));
}
