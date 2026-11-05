import { sentiment } from '../../lib/assist.js';

export const VIEWS = [
  { id: 'my', label: 'My Feed', icon: 'myfeed' },
  { id: 'wall', label: 'Company Wall', icon: '🏛️' },
  { id: 'announcements', label: 'Announcements', icon: '📢' },
  { id: 'mandatory', label: 'Mandatory Reads', icon: '✅' },
  { id: 'questions', label: 'Questions', icon: '❓' },
  { id: 'following', label: 'Following', icon: '👣' },
  { id: 'bookmarks', label: 'Bookmarks', icon: '🔖' },
  { id: 'pinned', label: 'Pinned', icon: '📌' },
  { id: 'drafts', label: 'My Drafts', icon: '📝' },
  { id: 'scheduled', label: 'Scheduled', icon: '⏰' },
];

/** Should this author's new posts wait for moderator approval? Admins are exempt. */
export function needsApproval(state, user, text = '') {
  if (!user || user.admin) return false;
  const m = state.settings?.moderation;
  if (m?.whitelist?.includes(user.id)) return false;
  if (m?.requireApproval) return true;
  const lower = text.toLowerCase();
  if (m?.bannedWords?.some((w) => w && lower.includes(w.toLowerCase()))) return true;
  return m?.newMemberHoldDays > 0 && !!user.joinedAt && Date.now() - user.joinedAt < m.newMemberHoldDays * 864e5;
}

/** Stand-in viewer for signed-out visitors. */
export const GUEST = { id: null, admin: false, name: 'Guest' };

export const statusOf = (p) => p.status || 'published';
export const isLive = (p) => statusOf(p) === 'published';

/** Can `me` see this post at all? */
export function canSee(state, me, p) {
  const st = statusOf(p);
  if (st === 'draft' || st === 'scheduled') return p.authorId === me.id;
  if (st === 'pending' && p.authorId !== me.id && !me.admin) return false;
  if (p.scope?.type === 'group') {
    const g = state.groups.find((x) => x.id === p.scope.id);
    return !!g && (g.members.includes(me.id) || g.accessType === 'public' || me.admin);
  }
  return true;
}

export const followingIds = (state, me) => (state.follows || []).filter((f) => f.authorId === me.id).map((f) => f.targetId);

/** Is this post part of my personalised feed? */
function inMyFeed(state, me, p) {
  if (p.authorId === me.id) return true;
  if (p.scope?.type === 'network') return true;
  if (p.scope?.type === 'group') return !!state.groups.find((g) => g.id === p.scope.id)?.members.includes(me.id);
  if (p.scope?.type === 'user') return p.scope.id === me.id || followingIds(state, me).includes(p.authorId);
  return false;
}

export function matchesScope(p, scope) {
  if (!scope) return true;
  if (scope.type === 'network') return p.scope?.type === 'network';
  if (scope.type === 'group') return p.scope?.type === 'group' && p.scope.id === scope.id;
  if (scope.type === 'user') return p.authorId === scope.id || (p.scope?.type === 'user' && p.scope.id === scope.id);
  return true;
}

export function sortPosts(list, pinnedFirst = true) {
  return [...list].sort((a, b) => (pinnedFirst ? (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) : 0) || b.createdAt - a.createdAt);
}

export function postsForView(state, me, view) {
  const visible = state.posts.filter((p) => canSee(state, me, p));
  const live = visible.filter((p) => isLive(p) || statusOf(p) === 'pending');
  switch (view) {
    case 'wall': return sortPosts(live.filter((p) => p.scope?.type === 'network'));
    case 'announcements': return sortPosts(live.filter((p) => p.type === 'announcement'), false);
    case 'mandatory': return sortPosts(live.filter((p) => p.mandatory), false);
    case 'questions': return sortPosts(live.filter((p) => p.type === 'question'), false);
    case 'following': { const ids = followingIds(state, me); return sortPosts(live.filter((p) => ids.includes(p.authorId)), false); }
    case 'bookmarks': return sortPosts(live.filter((p) => state.bookmarks.includes(p.id)), false);
    case 'pinned': return sortPosts(live.filter((p) => p.pinned), false);
    case 'drafts': return sortPosts(visible.filter((p) => statusOf(p) === 'draft'), false);
    case 'scheduled': return [...visible.filter((p) => statusOf(p) === 'scheduled')].sort((a, b) => a.publishAt - b.publishAt);
    default: return sortPosts(live.filter((p) => inMyFeed(state, me, p)));
  }
}

export const tagsOf = (text = '') => [...new Set((text.match(/#(\w+)/g) || []).map((t) => t.slice(1).toLowerCase()))];

export function trendingTags(state, me, days = 30) {
  const since = Date.now() - days * 864e5;
  const counts = {};
  for (const p of state.posts) {
    if (!isLive(p) || p.createdAt < since || !canSee(state, me, p)) continue;
    for (const t of tagsOf(p.text)) counts[t] = (counts[t] || 0) + 1 + p.likes.length * 0.2 + p.comments.length * 0.3;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, score]) => ({ tag, score }));
}

/** Members expected to read/acknowledge a post (author excluded). */
export function audienceOf(state, p) {
  const ids = p.scope?.type === 'group' ? state.groups.find((g) => g.id === p.scope.id)?.members ?? [] : state.users.map((u) => u.id);
  return ids.filter((id) => id !== p.authorId);
}

export function scopeLabel(state, scope) {
  if (!scope || scope.type === 'network') return 'Company wall';
  if (scope.type === 'group') return state.groups.find((g) => g.id === scope.id)?.name ?? 'Group';
  if (scope.type === 'user') return `${state.users.find((u) => u.id === scope.id)?.name ?? 'Member'}'s wall`;
  return '';
}

export function sentimentCounts(posts) {
  const c = { happy: 0, neutral: 0, unhappy: 0 };
  for (const p of [].concat(posts)) {
    for (const r of Object.values(p.reactions || {})) c[r] = (c[r] || 0) + 1;
    for (const cm of p.comments || []) c[sentiment(cm.text)] += 1;
  }
  return c;
}

export function insightsOf(p) {
  const views = p.views || {};
  const total = Object.values(views).reduce((n, v) => n + v, 0);
  const unique = Object.keys(views).length;
  const reactions = Object.keys(p.reactions || {}).length + p.likes.length;
  const comments = p.comments.length;
  const shares = Object.values(p.advocacy?.shares || {}).reduce((n, l) => n + l.length, 0) + (p.reposts || 0);
  const engaged = new Set([...p.likes, ...Object.keys(p.reactions || {}), ...p.comments.map((c) => c.authorId)]).size;
  const score = Math.min(100, Math.round((engaged / Math.max(unique, engaged, 1)) * 70 + Math.min(30, comments * 4 + shares * 5)));
  return { total, unique, reactions, comments, shares, score, sentiment: sentimentCounts(p) };
}

export const SHARE_TARGETS = {
  linkedin: { label: 'LinkedIn', icon: 'in', url: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  x: { label: 'X', icon: '𝕏', url: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t || '')}` },
  facebook: { label: 'Facebook', icon: 'f', url: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
};

export const MOODS = { happy: '😊', neutral: '😐', unhappy: '😞' };
