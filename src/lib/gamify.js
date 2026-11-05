// Points, levels and badges, all derived from the activity log.

/** Points per action. Keys are `type` or `type:collection` for generic actions. */
export const POINTS = {
  'post/create': 10, 'post/comment': 3, 'post/like': 1, 'post/vote': 1, 'post/ack': 2,
  'forum/save': 8, 'forum/reply': 4, 'forum/upvote': 1,
  'event/create': 6, 'event/rsvp': 2,
  'group/create': 8, 'group/join': 2,
  'channel/send': 1, 'manual/article': 8,
  'add:ideas': 6, 'update:ideas': 0, 'add:praise': 5, 'add:answers': 5, 'add:townhallQuestions': 3,
  'add:surveyResponses': 4, 'add:tasks': 2, 'add:files': 3, 'add:arcade': 0,
};

export const LEVELS = [
  { name: 'Newcomer', min: 0 },
  { name: 'Contributor', min: 50 },
  { name: 'Regular', min: 150 },
  { name: 'Champion', min: 400 },
  { name: 'Legend', min: 1000 },
];

export const BADGES = [
  { id: 'first-post', icon: '✍️', name: 'First Words', desc: 'Published your first post', test: (c) => c['post/create'] >= 1 },
  { id: 'commenter', icon: '💬', name: 'Conversation Starter', desc: '10 comments or replies', test: (c) => (c['post/comment'] || 0) + (c['forum/reply'] || 0) >= 10 },
  { id: 'ideator', icon: '💡', name: 'Ideator', desc: 'Shared 3 ideas', test: (c) => c['add:ideas'] >= 3 },
  { id: 'event-goer', icon: '🎟️', name: 'Event Goer', desc: 'RSVPed to 3 events', test: (c) => c['event/rsvp'] >= 3 },
  { id: 'appreciator', icon: '🙌', name: 'Appreciator', desc: 'Gave praise 3 times', test: (c) => c['add:praise'] >= 3 },
  { id: 'scholar', icon: '📚', name: 'Scholar', desc: 'Wrote a manual article', test: (c) => c['manual/article'] >= 1 },
  { id: 'helper', icon: '🛟', name: 'Helper', desc: 'Answered 5 questions', test: (c) => c['add:answers'] >= 5 },
];

/** Seeded starting points so the leaderboard isn't empty in the demo. */
const BASE = { u1: 180, u2: 240, u3: 310, u4: 95, u5: 150, u6: 60, u7: 520, u8: 130 };

export function statsFor(state, userId) {
  const counts = {};
  let points = BASE[userId] ?? 0;
  for (const a of state.activity || []) {
    if (a.userId !== userId) continue;
    counts[a.type] = (counts[a.type] || 0) + 1;
    points += a.points || 0;
  }
  points += (state.praise || []).filter((p) => p.toId === userId).length * 5;
  const level = [...LEVELS].reverse().find((l) => points >= l.min);
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  const earned = BADGES.filter((b) => b.test(counts)).map((b) => b.id);
  const awarded = (state.badgeAwards || []).filter((b) => b.toId === userId).map((b) => b.badgeId);
  return { points, level, nextLevel, counts, badges: [...new Set([...earned, ...awarded])] };
}

export function leaderboard(state, since = 0) {
  return state.users
    .map((u) => ({ user: u, ...statsFor({ ...state, activity: (state.activity || []).filter((a) => a.at >= since) }, u.id) }))
    .sort((a, b) => b.points - a.points);
}
