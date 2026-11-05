// Feed seed. Overrides the base `posts` collection (same base posts, enriched) and adds
// examples of every post type: question, social advocacy, scheduled, draft, pinned.

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const photo = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f3c"/><stop offset="1" stop-color="#a3e635"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><g fill="#fff" opacity=".9"><circle cx="200" cy="260" r="40"/><circle cx="320" cy="250" r="40"/><circle cx="440" cy="262" r="40"/><circle cx="560" cy="248" r="40"/></g><text x="400" y="390" font-family="Inter,Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">Convocation 2014</text></svg>'
)}`;

export const seed = {
  follows: [
    { id: 'fo1', authorId: 'u1', targetId: 'u2', createdAt: now - 20 * day },
    { id: 'fo2', authorId: 'u1', targetId: 'u3', createdAt: now - 18 * day },
  ],
  posts: [
    { id: 'p1', authorId: 'u7', scope: { type: 'network' }, createdAt: now - 2 * 3600e3, type: 'announcement', status: 'published', pinned: true,
      text: 'The Annual Alumni Homecoming is confirmed for next month! Please read the code of conduct and confirm below so we can finalise passes. #homecoming',
      mandatory: { deadline: now + 10 * day, reminder: 'daily', message: 'I have read and agree to the Homecoming code of conduct.', button: 'Acknowledge', color: '#4d7c0f', acks: ['u2', 'u3'] },
      likes: ['u2', 'u3', 'u4', 'u5'], reactions: { u2: 'happy', u3: 'happy', u6: 'neutral' }, views: { u2: 1, u3: 2, u4: 1, u5: 1, u6: 1 },
      comments: [{ id: 'c1', authorId: 'u2', text: 'Cannot wait! Booking tickets already.', createdAt: now - 3600e3, upvotes: [] }] },
    { id: 'p2', authorId: 'u2', scope: { type: 'network' }, createdAt: now - 5 * 3600e3, type: 'post', status: 'published',
      text: 'Torque EV just closed our seed round 🎉 Huge thanks to the Founders Circle for the intros. We are hiring firmware engineers. Alumni referrals get priority! #hiring #startups',
      likes: ['u1', 'u4', 'u8', 'u6', 'u7'], reactions: { u1: 'happy', u8: 'happy' }, views: { u1: 1, u4: 1, u8: 2, u6: 1, u7: 1, u3: 1 },
      comments: [{ id: 'c2', authorId: 'u8', text: 'Proud of you, Karthik!', createdAt: now - 4 * 3600e3, upvotes: ['u2'] }] },
    { id: 'p3', authorId: 'u4', scope: { type: 'group', id: 'g2' }, createdAt: now - 26 * 3600e3, type: 'poll', status: 'published',
      text: 'Where should the next Bengaluru meet-up be? #meetup',
      poll: { options: [{ id: 'o1', text: 'Cubbon Park picnic', votes: ['u1', 'u8'] }, { id: 'o2', text: 'Brewery in Indiranagar', votes: ['u4'] }, { id: 'o3', text: 'Campus visit', votes: [] }] },
      likes: ['u8'], comments: [] },
    { id: 'p4', authorId: 'u3', scope: { type: 'group', id: 'g4' }, createdAt: now - 2 * day, type: 'post', status: 'published',
      text: 'Mentorship applications for the spring cohort are open. 40 students are waiting for mentors. Even one hour a month helps. #mentorship',
      likes: ['u1', 'u7'], comments: [] },
    { id: 'p5', authorId: 'u5', scope: { type: 'network' }, createdAt: now - 3 * day, type: 'post', status: 'published',
      text: 'Found this photo from our 2014 convocation. Tag yourself if you can find your younger self 😄 #throwback',
      attachments: [{ id: 'at1', name: 'convocation-2014.svg', type: 'image/svg+xml', size: 1200, dataUrl: photo }],
      likes: ['u7', 'u3', 'u1'], reactions: { u7: 'happy' },
      comments: [{ id: 'c3', authorId: 'u7', text: 'Adding this to the alumni archive!', createdAt: now - 2.5 * day, upvotes: [] }] },
    { id: 'p6', authorId: 'u6', scope: { type: 'network' }, createdAt: now - 30 * 3600e3, type: 'question', status: 'published',
      text: 'Any alumni working in climate tech? I am exploring a move and would love a 20-minute chat about what the day-to-day looks like. #careers #climate',
      likes: ['u5'], bestAnswerId: 'c5',
      comments: [
        { id: 'c4', authorId: 'u5', text: 'City Lab works with a few climate startups on urban heat mapping. Happy to intro you.', createdAt: now - 28 * 3600e3, upvotes: ['u6', 'u1'] },
        { id: 'c5', authorId: 'u8', text: 'Helix Motors has a battery recycling team. DM me and I will connect you with the lead.', createdAt: now - 27 * 3600e3, upvotes: ['u6', 'u2', 'u4'] },
      ] },
    { id: 'p7', authorId: 'u7', scope: { type: 'network' }, createdAt: now - 4 * day, type: 'advocacy', status: 'published',
      text: 'Our Institute was ranked among the top 10 engineering schools this year. Please share the news with your network!',
      advocacy: { title: 'Institute ranked in the national top 10', url: 'https://example.com/news/institute-top-10', platforms: ['linkedin', 'x', 'facebook'],
        tweet: 'Proud alum! My alma mater just made the national top 10 🎓', shares: { linkedin: ['u2', 'u3', 'u8'], x: ['u4'], facebook: ['u5'] } },
      likes: ['u1', 'u3'], comments: [] },
    { id: 'p8', authorId: 'u1', scope: { type: 'group', id: 'g1' }, createdAt: now - 3600e3, type: 'post', status: 'scheduled', publishAt: now + 2 * day,
      text: 'Reminder: the 10-year reunion planning call is this weekend. Bring your venue ideas! #reunion', likes: [], comments: [] },
    { id: 'p9', authorId: 'u1', scope: { type: 'network' }, createdAt: now - 6 * 3600e3, type: 'post', status: 'draft',
      text: 'Draft: thinking of starting a design mentorship circle for juniors. Who would be interested?', likes: [], comments: [] },
  ],
};
