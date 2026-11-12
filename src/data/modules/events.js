// Events, town halls, broadcasts and meetings. All content is fictional.

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (offsetDays, hour = 18, min = 0) => {
  const d = new Date(now + offsetDays * day);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
};
const none = { freq: 'none' };

export const seed = {
  events: [
    { id: 'e1', title: 'Annual Alumni Homecoming', eventType: 'Reunion', scope: { type: 'network' }, hostId: 'u7', assistants: ['u1'], start: at(14, 17), end: at(14, 22), allDay: false,
      location: 'Main Campus Auditorium', description: 'An evening of reconnecting, awards and a dinner on the lawns.', rsvpEnabled: true,
      rsvps: { u1: 'going', u2: 'going', u3: 'maybe', u5: 'going' }, invitees: [], recurrence: none, reminders: [1440, 60], attachments: [{ name: 'homecoming-schedule.pdf', size: 482000 }],
      comments: [{ id: 'ec1', authorId: 'u2', text: 'Is there parking on campus for alumni?', createdAt: now - 5 * 3600e3 }, { id: 'ec2', authorId: 'u7', text: 'Yes, Gate 3 lot is reserved for us.', createdAt: now - 4 * 3600e3 }] },
    { id: 'e2', title: 'Bengaluru Chapter Meet-up', eventType: 'Meetup', scope: { type: 'group', id: 'g2' }, hostId: 'u8', assistants: [], start: at(5, 18, 30), end: at(5, 21), allDay: false,
      location: 'https://maps.app.goo.gl/cubbonpark', description: 'Casual picnic. Bring snacks and stories.', rsvpEnabled: true, rsvps: { u4: 'going', u8: 'going' }, invitees: [],
      recurrence: none, reminders: [120], attachments: [], comments: [] },
    { id: 'e3', title: 'Mentor orientation call', eventType: 'Webinar', scope: { type: 'group', id: 'g4' }, hostId: 'u3', assistants: ['u7'], start: at(2, 19), end: at(2, 20), allDay: false,
      location: 'Online', description: 'A 45-minute walkthrough of how mentorship pairing works.', rsvpEnabled: true, rsvps: { u1: 'going' }, invitees: [],
      recurrence: none, reminders: [30], attachments: [], comments: [] },
    { id: 'e4', title: 'Coffee with Priya', eventType: 'Meeting', scope: { type: 'private' }, hostId: 'u1', assistants: [], start: at(1, 9, 30), end: at(1, 10, 30), allDay: false,
      location: 'Third Wave, Koramangala', description: 'Catch-up on the mentorship program.', rsvpEnabled: true, rsvps: {}, invitees: ['u3'],
      recurrence: none, reminders: [15], attachments: [], comments: [] },
    { id: 'e5', title: 'Class of 2016 – 10 year reunion planning', eventType: 'Reunion', scope: { type: 'group', id: 'g1' }, hostId: 'u7', assistants: [], start: at(21, 11), end: at(21, 12), allDay: false,
      location: 'Online', description: 'Help shape our 10-year reunion.', rsvpEnabled: true, rsvps: {}, invitees: [],
      recurrence: none, reminders: [], attachments: [], comments: [] },
    { id: 'e6', title: 'Mentorship office hours', eventType: 'Webinar', scope: { type: 'group', id: 'g4' }, hostId: 'u3', assistants: [], start: at(3, 20), end: at(3, 21), allDay: false,
      location: 'Online', description: 'Drop in with questions about careers, higher studies or the mentorship program.', rsvpEnabled: true, rsvps: { u1: 'maybe' }, invitees: [],
      recurrence: { freq: 'weekly', until: at(60, 23) }, reminders: [30], attachments: [], comments: [] },
    { id: 'e7', title: 'Alumni Hackathon 2026', eventType: 'Contest', scope: { type: 'network' }, hostId: 'u4', assistants: ['u6'], start: at(28, 0), end: at(29, 23, 59), allDay: true,
      location: 'Innovation Centre, Main Campus', description: 'Two days, mixed alumni–student teams, one problem statement from a local NGO.', rsvpEnabled: true,
      rsvps: { u4: 'going', u6: 'going', u2: 'maybe' }, invitees: [], recurrence: none, reminders: [1440], attachments: [], comments: [] },
    { id: 'e8', title: 'Founders ShowTime: demo night', eventType: 'ShowTime', scope: { type: 'group', id: 'g3' }, hostId: 'u2', assistants: [], start: at(-6, 19), end: at(-6, 21), allDay: false,
      location: 'Online', description: 'Five alumni startups demo in five minutes each.', rsvpEnabled: true, rsvps: { u2: 'going', u8: 'going', u1: 'going' }, invitees: [],
      recurrence: none, reminders: [], attachments: [], comments: [{ id: 'ec3', authorId: 'u8', text: 'Great demos, thanks everyone!', createdAt: at(-6, 21, 30) }] },
  ],

  townhalls: [
    { id: 'th1', title: 'AMA with the Director', description: 'Ask the Institute Director anything about campus plans, research and alumni partnerships.', hostId: 'u7',
      moderators: ['u7', 'u1'], groupId: null, start: at(3, 17), end: at(3, 18), status: 'upcoming', allowAnonymous: true, moderateQuestions: true, createdAt: now - 2 * day },
    { id: 'th2', title: 'Placement season Q&A', description: 'Alumni recruiters answer student and alumni questions about hiring this year.', hostId: 'u3',
      moderators: ['u3'], groupId: 'g4', start: now - 20 * 60e3, end: now + 40 * 60e3, status: 'live', allowAnonymous: true, moderateQuestions: false, createdAt: now - 4 * day },
    { id: 'th3', title: 'Campus 2030 plan', description: 'The alumni association walked through the 2030 campus master plan.', hostId: 'u7',
      moderators: ['u7'], groupId: null, start: at(-10, 17), end: at(-10, 18), status: 'ended', allowAnonymous: false, moderateQuestions: false, createdAt: now - 14 * day },
  ],

  townhallQuestions: [
    { id: 'q1', townhallId: 'th1', authorId: 'u2', anonymous: false, text: 'Will alumni get access to the new incubation centre?', votes: ['u1', 'u4', 'u8'], status: 'approved', createdAt: now - day },
    { id: 'q2', townhallId: 'th1', authorId: 'u6', anonymous: true, text: 'How is the endowment fund being used?', votes: ['u5'], status: 'approved', createdAt: now - 20 * 3600e3 },
    { id: 'q3', townhallId: 'th1', authorId: 'u4', anonymous: false, text: 'Any plans for a part-time master’s for working alumni?', votes: [], status: 'pending', createdAt: now - 3600e3 },
    { id: 'q4', townhallId: 'th2', authorId: 'u6', anonymous: false, text: 'Do referrals from alumni actually make a difference?', votes: ['u1', 'u4'], status: 'answered', answer: 'Yes. Referred candidates are three times more likely to reach the final round.', answeredBy: 'u3', createdAt: now - 15 * 60e3 },
    { id: 'q5', townhallId: 'th2', authorId: 'u4', anonymous: true, text: 'Is it OK to negotiate a campus offer?', votes: ['u6', 'u2', 'u5'], status: 'approved', createdAt: now - 10 * 60e3 },
    { id: 'q6', townhallId: 'th3', authorId: 'u5', anonymous: false, text: 'Will the new hostels be walkable from the academic blocks?', votes: ['u1', 'u7'], status: 'answered', answer: 'Yes. Every hostel is planned within a ten-minute walk of the academic core, with covered walkways.', answeredBy: 'u7', createdAt: at(-10, 17, 10) },
    { id: 'q7', townhallId: 'th3', authorId: 'u2', anonymous: false, text: 'How can alumni contribute to the new labs?', votes: ['u8'], status: 'answered', answer: 'Through named lab sponsorships and by mentoring student research teams. Details will be shared in the Alumni Handbook.', answeredBy: 'u7', createdAt: at(-10, 17, 25) },
    { id: 'q8', townhallId: 'th3', authorId: 'u3', anonymous: false, text: 'What is the timeline for the library expansion?', votes: [], status: 'answered', answer: 'Phase one opens next year. Phase two depends on fundraising.', answeredBy: 'u7', createdAt: at(-10, 17, 40) },
  ],

  broadcasts: [
    { id: 'bc1', title: 'Convocation 2026 livestream', description: 'Watch the graduating batch walk the stage.', hostId: 'u7', status: 'scheduled', scheduledAt: at(9, 10), chat: [], subscribers: ['u2'], peakViewers: 0, createdAt: now - 3 * day },
    { id: 'bc2', title: 'Founders fireside chat', description: 'Aisha hosts a fireside chat with alumni founders.', hostId: 'u1', status: 'scheduled', scheduledAt: at(4, 19), chat: [], subscribers: [], peakViewers: 0, createdAt: now - day },
    { id: 'bc3', title: 'Alumni awards night', description: 'Recognising alumni who gave back this year.', hostId: 'u7', status: 'ended', scheduledAt: at(-20, 19), endedAt: at(-20, 21), peakViewers: 412,
      chat: [{ id: 'bm1', authorId: 'u5', text: 'Congratulations to all the winners!', createdAt: at(-20, 19, 40) }], subscribers: [], createdAt: now - 25 * day },
  ],

  meetings: [
    { id: 'mt1', title: 'Homecoming planning sync', hostId: 'u7', participants: ['u7', 'u1', 'u2', 'u3'], scheduledAt: at(1, 16), chat: [], createdAt: now - day },
    { id: 'mt2', title: 'Mentorship pairing review', hostId: 'u3', participants: ['u3', 'u1', 'u5'], scheduledAt: at(4, 11), chat: [], createdAt: now - 2 * day },
  ],
};
