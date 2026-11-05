// Seed data for the Collaborate modules: ideas, boards and tasks, files, article templates, web tabs.
// All content is fictional.

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

export const seed = {
  forumFollows: { u1: ['fc1', 'fc3'] },

  ideas: [
    { id: 'i1', authorId: 'u4', title: 'Alumni-run coding bootcamp for final-year students', category: 'Mentorship', groupId: 'g4', status: 'planned',
      description: 'A six-week weekend bootcamp taught by alumni engineers, ending in a demo day with recruiters from alumni companies.',
      votes: { u1: 1, u3: 1, u7: 1, u2: 1 }, comments: [{ id: 'ic1', authorId: 'u3', text: 'I can run the system design week.', createdAt: now - 2 * day }], createdAt: now - 6 * day },
    { id: 'i2', authorId: 'u5', title: 'City chapter starter kit', category: 'Chapters', groupId: null, status: 'under-review',
      description: 'A template group, event checklist and welcome post that anyone can use to start a chapter in a new city.',
      votes: { u8: 1, u7: 1 }, comments: [], createdAt: now - 4 * day },
    { id: 'i3', authorId: 'u6', title: 'Quarterly alumni salary & career survey', category: 'Careers', groupId: null, status: 'new',
      description: 'Anonymous survey so students and juniors can see realistic career paths.', votes: { u4: 1, u2: -1 }, comments: [], createdAt: now - day },
    { id: 'i4', authorId: 'u7', title: 'Digitise the convocation photo archive', category: 'Campus', groupId: null, status: 'implemented',
      description: 'Scan and tag the old convocation albums into Files so alumni can find themselves.', votes: { u1: 1, u5: 1, u3: 1, u8: 1, u6: 1 },
      comments: [{ id: 'ic2', authorId: 'u5', text: 'Found my 2014 photo already!', createdAt: now - 3 * day }], createdAt: now - 20 * day },
  ],
  ideaCategories: ['Mentorship', 'Chapters', 'Careers', 'Campus', 'Events', 'Platform'],

  boards: [
    { id: 'b1', name: 'Homecoming 2026', scope: 'network', groupId: null, members: ['u1', 'u7', 'u3', 'u5'], ownerId: 'u7', createdAt: now - 12 * day,
      sections: [{ id: 's1', name: 'To do' }, { id: 's2', name: 'In progress' }, { id: 's3', name: 'Review' }, { id: 's4', name: 'Done', done: true }],
      labels: ['Venue', 'Comms', 'Finance', 'Logistics'],
      customFields: [{ id: 'cf1', name: 'Budget (₹)', type: 'number' }, { id: 'cf2', name: 'Vendor', type: 'text' }, { id: 'cf3', name: 'Stage', type: 'select', options: ['Idea', 'Confirmed', 'Booked'] }] },
    { id: 'b2', name: 'Bengaluru meet-up', scope: 'group', groupId: 'g2', members: ['u1', 'u4', 'u8'], ownerId: 'u8', createdAt: now - 5 * day,
      sections: [{ id: 's5', name: 'To do' }, { id: 's6', name: 'Doing' }, { id: 's7', name: 'Done', done: true }], labels: ['Food', 'Venue'], customFields: [] },
  ],
  tasks: [
    { id: 't1', boardId: 'b1', title: 'Book the main auditorium', status: 's4', order: 0, assigneeId: 'u7', dueAt: now - 3 * day, priority: 'high', labels: ['Venue'],
      description: 'Confirm with the facilities office.', custom: { cf3: 'Booked', cf1: 0 }, blockedBy: [], checklist: [{ id: 'k1', text: 'Email facilities', done: true }], comments: [], createdAt: now - 10 * day },
    { id: 't2', boardId: 'b1', title: 'Finalise catering vendor', status: 's2', order: 0, assigneeId: 'u5', dueAt: now + 4 * day, priority: 'high', labels: ['Finance', 'Logistics'],
      description: 'Compare three quotes.', custom: { cf1: 180000, cf2: 'Green Leaf Caterers', cf3: 'Confirmed' }, blockedBy: ['t1'],
      checklist: [{ id: 'k2', text: 'Collect quotes', done: true }, { id: 'k3', text: 'Taste test', done: false }], comments: [{ id: 'tc1', authorId: 'u7', text: 'Keep a vegan option.', createdAt: now - day }], createdAt: now - 8 * day },
    { id: 't3', boardId: 'b1', title: 'Design passes and badges', status: 's1', order: 0, assigneeId: 'u1', dueAt: now + 7 * day, priority: 'medium', labels: ['Comms'],
      description: '', custom: {}, blockedBy: [], checklist: [], comments: [], createdAt: now - 6 * day },
    { id: 't4', boardId: 'b1', title: 'Send save-the-date email', status: 's3', order: 0, assigneeId: 'u3', dueAt: now + day, priority: 'low', labels: ['Comms'],
      description: '', custom: {}, blockedBy: ['t3'], checklist: [], comments: [], createdAt: now - 5 * day },
    { id: 't5', boardId: 'b2', title: 'Pick a picnic spot', status: 's6', order: 0, assigneeId: 'u4', dueAt: now + 2 * day, priority: 'medium', labels: ['Venue'],
      description: 'See the poll on the group wall.', custom: {}, blockedBy: [], checklist: [], comments: [], createdAt: now - 2 * day },
  ],

  folders: [
    { id: 'fo1', name: 'Event photos', parentId: null, groupId: null, createdAt: now - 30 * day },
    { id: 'fo2', name: 'Templates', parentId: null, groupId: null, createdAt: now - 30 * day },
    { id: 'fo3', name: 'Meet-up notes', parentId: null, groupId: 'g2', createdAt: now - 7 * day },
  ],
  files: [
    { id: 'fl1', name: 'Homecoming run-of-show', kind: 'doc', type: 'text/html', size: 0, folderId: 'fo2', groupId: null, authorId: 'u7', sharedWith: [], createdAt: now - 6 * day, updatedAt: now - 2 * day, versions: [],
      content: '<h2>Homecoming run-of-show</h2><p><b>17:00</b> Registration and welcome drinks</p><p><b>18:00</b> Address by the alumni president</p><p><b>19:00</b> Awards</p><p><b>20:00</b> Dinner on the lawns</p>' },
    { id: 'fl2', name: 'Meet-up budget', kind: 'sheet', type: 'application/x-sheet', size: 0, folderId: 'fo3', groupId: 'g2', authorId: 'u8', sharedWith: [], createdAt: now - 4 * day, updatedAt: now - day, versions: [],
      content: { cells: { A1: 'Item', B1: 'Cost', A2: 'Snacks', B2: '2400', A3: 'Mats', B3: '800', A4: 'Drinks', B4: '1500', A5: 'Total', B5: '=SUM(B2:B4)' } } },
    { id: 'fl3', name: 'Mentorship program intro', kind: 'slides', type: 'application/x-slides', size: 0, folderId: null, groupId: null, authorId: 'u3', sharedWith: [], createdAt: now - 9 * day, updatedAt: now - 9 * day, versions: [],
      content: { slides: [{ id: 'sl1', title: 'Mentorship Program', body: 'Pairing students with alumni across industries' }, { id: 'sl2', title: 'How it works', body: '1. Students apply\n2. We match by interest\n3. Meet once a month' }, { id: 'sl3', title: 'Join us', body: 'Sign up in the Mentorship Program group' }] } },
  ],

  articleTemplates: [
    { id: 'at1', name: 'Blank', body: '' },
    { id: 'at2', name: 'How-to guide', body: '## Overview\nWhat this guide helps you do.\n\n## Before you begin\n- Requirement\n\n## Steps\n1. First step\n2. Second step\n\n## Need help?\nContact the alumni relations team.' },
    { id: 'at3', name: 'Policy', body: '## Purpose\n\n## Scope\nWho this policy applies to.\n\n## Policy\n\n## Exceptions\n\n## Contact' },
    { id: 'at4', name: 'Event recap', body: '## Event\nName, date and place.\n\n## Highlights\n- \n\n## Attendance\n\n## What we learned\n' },
    { id: 'at5', name: 'FAQ', body: '## Question one?\nAnswer.\n\n## Question two?\nAnswer.' },
  ],

  webTabs: [
    { id: 'w1', name: 'Campus map', url: 'https://www.openstreetmap.org/export/embed.html?bbox=77.56%2C12.96%2C77.62%2C13.0&layer=mapnik', scope: 'network', groupId: null, ownerId: 'u7', createdAt: now - 10 * day },
    { id: 'w2', name: 'Wikipedia: Alumni association', url: 'https://en.wikipedia.org/wiki/Alumni_association', scope: 'network', groupId: null, ownerId: 'u7', createdAt: now - 9 * day },
  ],
};
