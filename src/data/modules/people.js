// People, recognition, chats and surveys. All people and content are fictional.
// `managerId` models community structure (chapter leads and mentor circles), not employment.
// seed.js imports this module eagerly, so base `users` is read lazily in a getter
// (evaluated when initialState() runs, after both modules have finished loading).
import { users as baseUsers } from '../seed.js';

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

// Birthdays are "MM-DD" only (no year, for privacy). Two fall in the next few days relative
// to when the demo data is created, so the "Celebrate classmates" widget has something to show.
const pad = (n) => String(n).padStart(2, '0');
const monthDayIn = (days) => { const d = new Date(now + days * day); return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
// A join date `years` ago, `days` from today's month/day: a work anniversary coming up.
const yearsAgoIn = (years, days) => { const d = new Date(now + days * day); d.setFullYear(d.getFullYear() - years); return d.getTime(); };
const birthdays = {
  u2: monthDayIn(1), u3: monthDayIn(2), u4: '03-14', u5: '07-22', u7: '12-09', u8: '02-29', u9: '01-19', u13: '09-05', u17: '06-30',
};
// Founding members whose community anniversary falls within the coming week.
const joinedOverride = { u7: yearsAgoIn(3, 4), u8: yearsAgoIn(2, 6) };

const extra = {
  u1: { managerId: 'u3', title: 'Mentor · Design', customFields: { linkedin: 'aisha-raman', mentor: 'Yes', hostel: 'Hostel C' } },
  u2: { managerId: 'u8', title: 'Founders Circle Lead', customFields: { linkedin: 'karthik-menon', mentor: 'Yes', hostel: 'Hostel B' } },
  u3: { managerId: 'u7', title: 'Mentorship Coordinator', customFields: { linkedin: 'priya-sharma', mentor: 'Yes', hostel: 'Hostel A' } },
  u4: { managerId: 'u8', title: 'Bengaluru Chapter Volunteer', customFields: { mentor: 'No', hostel: 'Hostel D' } },
  u5: { managerId: 'u7', title: 'Mumbai Chapter Lead', customFields: { mentor: 'Yes', hostel: 'Hostel A' } },
  u6: { managerId: 'u5', title: 'Hyderabad Volunteer', customFields: { mentor: 'No', hostel: 'Hostel B' } },
  u7: { managerId: null, title: 'Head of Alumni Relations', customFields: { linkedin: 'sara-thomas', mentor: 'Yes', hostel: 'Hostel C' } },
  u8: { managerId: 'u7', title: 'Bengaluru Chapter Lead', customFields: { linkedin: 'vikram-rao', mentor: 'Yes', hostel: 'Hostel B' } },
};

const more = [
  ['u9', 'Ananya Das', 2019, 'Computer Science', 'Kolkata', 'Software Engineer', 'Northwind', 210, 'u3', ['React', 'TypeScript']],
  ['u10', 'Farhan Siddiqui', 2013, 'Electronics', 'Delhi', 'Product Manager', 'Brightpath', 30, 'u7', ['Product', 'Strategy']],
  ['u11', 'Lakshmi Nair', 2020, 'Civil', 'Kochi', 'Site Engineer', 'BuildRight', 160, 'u5', ['AutoCAD', 'Project planning']],
  ['u12', 'Arjun Pillai', 2017, 'Mechanical', 'Chennai', 'Design Engineer', 'Torque EV', 10, 'u2', ['CAD', 'Prototyping']],
  ['u13', 'Neha Kulkarni', 2018, 'Electrical', 'Pune', 'Data Scientist', 'Quanta AI', 300, 'u3', ['Python', 'Statistics']],
  ['u14', 'Joseph Mathew', 2011, 'Mechanical', 'Bengaluru', 'Plant Head', 'Helix Motors', 80, 'u8', ['Manufacturing', 'Lean']],
  ['u15', 'Divya Reddy', 2021, 'Computer Science', 'Hyderabad', 'Frontend Developer', 'Finly', 240, 'u6', ['CSS', 'Accessibility']],
  ['u16', 'Imran Khan', 2015, 'Electronics', 'Mumbai', 'Consultant', 'City Lab', 120, 'u5', ['Consulting', 'IoT']],
  ['u17', 'Kavya Srinivasan', 2016, 'Computer Science', 'Bengaluru', 'Researcher', 'Institute Labs', 280, 'u1', ['HCI', 'Research']],
  ['u18', 'Tomás Fernandes', 2019, 'Civil', 'Goa', 'Architect', 'Studio Laterite', 50, 'u5', ['Architecture', 'Sketching']],
  ['u19', 'Sneha Joshi', 2022, 'Electrical', 'Pune', 'Graduate Engineer', 'GridWorks', 340, 'u13', ['Power systems']],
  ['u20', 'Rahul Verma', 2014, 'Computer Science', 'Delhi', 'CTO', 'Kiteboard', 200, 'u10', ['Engineering leadership', 'Go']],
].map(([id, name, batch, dept, city, role, company, hue, managerId, skills], i) => ({
  id, name, email: `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@example.com`, batch, dept, city, role, company, hue, managerId,
  title: role, skills, bio: `${role} at ${company}. Class of ${batch}.`,
  career: [{ title: role, org: company, from: Math.min(2025, batch + 3), to: null }],
  customFields: { mentor: i % 3 === 0 ? 'Yes' : 'No' },
  joinedAt: now - (40 + i * 9) * day, lastActiveAt: now - (i % 5) * day,
}));

export const seed = {
  get users() {
    return [
      ...baseUsers.map((u, i) => ({ ...u, ...extra[u.id], joinedAt: joinedOverride[u.id] ?? now - (200 - i * 15) * day, lastActiveAt: now - (i % 3) * 3600e3 })),
      ...more,
    ].map((u) => (birthdays[u.id] && !u.birthday ? { ...u, birthday: birthdays[u.id] } : u));
  },

  customFields: [
    { id: 'linkedin', label: 'LinkedIn handle', type: 'text' },
    { id: 'mentor', label: 'Open to mentoring', type: 'select', options: ['Yes', 'No'] },
    { id: 'hostel', label: 'Hostel', type: 'text' },
  ],

  follows: [
    { id: 'fo1', authorId: 'u1', targetId: 'u3' }, { id: 'fo2', authorId: 'u1', targetId: 'u7' },
    { id: 'fo3', authorId: 'u2', targetId: 'u1' }, { id: 'fo4', authorId: 'u4', targetId: 'u1' },
    { id: 'fo5', authorId: 'u3', targetId: 'u7' }, { id: 'fo6', authorId: 'u9', targetId: 'u3' },
    { id: 'fo7', authorId: 'u17', targetId: 'u1' }, { id: 'fo8', authorId: 'u8', targetId: 'u2' },
  ],

  dms: [
    { id: 'dm1', members: ['u1', 'u3'], messages: [
      { id: 'dm1m1', authorId: 'u3', text: 'Hey Aisha! Are you free to mentor two design students this cohort?', createdAt: now - 5 * 3600e3 },
      { id: 'dm1m2', authorId: 'u1', text: 'Absolutely, send their details over.', createdAt: now - 4 * 3600e3 },
    ] },
    { id: 'dm2', members: ['u1', 'u2', 'u4'], name: 'Bengaluru hike crew', messages: [
      { id: 'dm2m1', authorId: 'u4', text: 'Nandi Hills on Sunday? 5 AM start', createdAt: now - day },
    ] },
  ],

  praise: [
    { id: 'pr1', authorId: 'u7', fromId: 'u7', toId: 'u3', badge: 'mentor', message: 'For pairing 40 students with mentors in record time!', createdAt: now - 2 * day },
    { id: 'pr2', authorId: 'u2', fromId: 'u2', toId: 'u8', badge: 'helper', message: 'Thanks for the investor intros.', createdAt: now - 4 * day },
    { id: 'pr3', authorId: 'u3', fromId: 'u3', toId: 'u1', badge: 'rockstar', message: 'Your portfolio review session was brilliant.', createdAt: now - 6 * day },
  ],
  // Birthday / anniversary wishes sent: {id, fromId, toId, kind: 'birthday'|'anniversary', year}.
  wishes: [],
  // Saved searches with alerts: {id, userId, q, type, name, createdAt, lastSeenIds: []}.
  savedSearches: [],
  badgeAwards: [{ id: 'ba1', toId: 'u7', badgeId: 'first-post' }],
  blocks: [],

  surveyTemplates: [
    { id: 'tpl1', title: 'Engagement pulse', description: 'A quick monthly check on how connected alumni feel.', questions: [
      { id: 'q1', type: 'rating', text: 'How connected do you feel to the alumni community?' },
      { id: 'q2', type: 'single', text: 'How often do you visit AlumniZone?', options: ['Daily', 'Weekly', 'Monthly', 'Rarely'] },
      { id: 'q3', type: 'long', text: 'What would make you more active?' },
    ] },
    { id: 'tpl2', title: 'Event feedback', description: 'Collect feedback after a reunion or meet-up.', questions: [
      { id: 'q1', type: 'rating', text: 'Overall, how was the event?' },
      { id: 'q2', type: 'multi', text: 'What did you enjoy?', options: ['Venue', 'Food', 'Networking', 'Talks', 'Activities'] },
      { id: 'q3', type: 'short', text: 'One thing we should change' },
    ] },
    { id: 'tpl3', title: 'Alumni NPS', description: 'Net Promoter Score for the alumni network.', questions: [
      { id: 'q1', type: 'nps', text: 'How likely are you to recommend AlumniZone to a fellow graduate?' },
      { id: 'q2', type: 'long', text: 'What is the main reason for your score?' },
    ] },
  ],

  surveys: [
    { id: 's1', authorId: 'u7', title: 'Homecoming 2026 planning', description: 'Help us shape this year’s homecoming.', status: 'active', anonymous: false,
      audience: { type: 'network' }, deadline: now + 9 * day, createdAt: now - 2 * day, questions: [
        { id: 'q1', type: 'single', text: 'Which day works best?', options: ['Friday evening', 'Saturday', 'Sunday'] },
        { id: 'q2', type: 'multi', text: 'Which sessions interest you?', options: ['Career panel', 'Campus tour', 'Sports meet', 'Cultural night'] },
        { id: 'q3', type: 'rating', text: 'How was last year’s homecoming?' },
        { id: 'q4', type: 'short', text: 'Any suggestions?' },
      ] },
    { id: 's2', authorId: 'u3', title: 'Alumni NPS – Q3', description: 'Quarterly NPS pulse.', status: 'closed', anonymous: true,
      audience: { type: 'network' }, deadline: now - 3 * day, createdAt: now - 20 * day, questions: [
        { id: 'q1', type: 'nps', text: 'How likely are you to recommend AlumniZone to a fellow graduate?' },
        { id: 'q2', type: 'long', text: 'What is the main reason for your score?' },
      ] },
  ],
  surveyResponses: [
    { id: 'sr1', surveyId: 's1', authorId: 'u2', answers: { q1: 'Saturday', q2: ['Career panel', 'Sports meet'], q3: 4, q4: 'More time for networking' }, createdAt: now - day },
    { id: 'sr2', surveyId: 's1', authorId: 'u3', answers: { q1: 'Saturday', q2: ['Campus tour'], q3: 5, q4: '' }, createdAt: now - day },
    { id: 'sr3', surveyId: 's1', authorId: 'u5', answers: { q1: 'Friday evening', q2: ['Cultural night', 'Career panel'], q3: 3, q4: 'Better food stalls' }, createdAt: now - 20 * 3600e3 },
    ...[10, 9, 9, 7, 8, 6, 10, 4, 9].map((n, i) => ({ id: `sr-n${i}`, surveyId: 's2', authorId: null, anonymous: true,
      answers: { q1: n, q2: ['Great network', 'Helpful mentors', 'Too few events in my city', 'Love the forums', 'Good', 'Needs more jobs content', 'Brilliant', 'Hard to find people', 'Events!'][i] }, createdAt: now - (10 + i) * day })),
  ],
};
