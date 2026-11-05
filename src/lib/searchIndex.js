// Shared, visibility-respecting search index. Used by the Search page and by the
// saved-search alerts runner, so alerts can never surface anything Search wouldn't.
import { canSee as canSeePost } from '../components/feed/utils.js';
import { canSee as canSeeEvent, canSeeTownhall } from '../components/events/eventUtils.js';
import { canReadArticle } from '../components/collab/manual.js';
import { canSeeBoard } from '../components/collab/board.jsx';

export const TYPES = [
  ['people', 'People', '🧑'], ['posts', 'Posts', '📰'], ['groups', 'Groups', '👥'], ['events', 'Events', '📅'],
  ['forums', 'Forums', '🗂️'], ['articles', 'Manuals', '📖'], ['files', 'Files', '📁'], ['ideas', 'Ideas', '💡'],
  ['messages', 'Messages', '💬'], ['tasks', 'Tasks', '✅'], ['surveys', 'Surveys', '📋'], ['townhalls', 'Town halls', '🎤'],
];

export const typeLabel = (id) => (id === 'all' ? 'All types' : TYPES.find(([t]) => t === id)?.[1] ?? id);

const memberOf = (g, id) => !!g && [g.members, g.admins, g.moderators].some((l) => (l || []).includes(id));

/** Flattens every collection `me` is allowed to see into {type, id, title, body, link, at}. */
export function buildIndex(s, user, me) {
  const out = [];
  const push = (type, id, title, body, link, at) => out.push({ type, id: `${type}:${id}`, title: String(title ?? ''), body: String(body ?? ''), link, at });
  const groups = s.groups || [];
  const groupById = (id) => groups.find((g) => g.id === id);
  const inGroup = (id) => me.admin || memberOf(groupById(id), me.id);
  const nameOf = (id) => user(id)?.name ?? 'Former member';
  for (const u of s.users) if (me.admin || !u.status || u.status === 'active') push('people', u.id, u.name, [u.role, u.company, u.city, u.dept, u.batch, ...(u.skills || [])].join(' · '), `/people/${u.id}`);
  for (const p of s.posts) if (canSeePost(s, me, p)) push('posts', p.id, nameOf(p.authorId), [p.text, ...(p.comments || []).map((c) => c.text)].join(' — '), `/post/${p.id}`, p.createdAt);
  for (const g of groups) if (g.accessType !== 'private' || inGroup(g.id)) push('groups', g.id, g.name, g.description, `/groups/${g.id}`);
  for (const e of s.events) if (canSeeEvent(e, me, groups)) push('events', e.id, e.title, [e.location, e.description].join(' — '), `/events/${e.id}`, e.start);
  for (const f of s.forumPosts) {
    if (f.status === 'draft' ? f.authorId !== me.id : f.groupId && !inGroup(f.groupId)) continue;
    push('forums', f.id, f.title, [f.body, ...(f.replies || []).map((r) => r.text)].join(' — '), `/forums/${f.id}`, f.createdAt);
  }
  for (const m of s.manuals || []) for (const c of m.chapters || []) for (const a of c.articles || []) if (canReadArticle(m, a, me)) push('articles', a.id, a.title, `${m.title} › ${c.title} — ${a.body ?? ''}`, `/manuals/${m.id}/${a.id}`, a.updatedAt);
  for (const f of s.files || []) if (!f.groupId || inGroup(f.groupId) || f.authorId === me.id || f.sharedWith?.includes(me.id)) push('files', f.id, f.name, [f.description, f.folder, f.type].filter(Boolean).join(' · '), `/files/${f.id}`, f.createdAt);
  for (const i of s.ideas || []) push('ideas', i.id, i.title, i.description || i.body, `/ideas/${i.id}`, i.createdAt);
  for (const c of s.channels || []) if ((c.members || []).includes(me.id)) for (const m of c.messages || []) push('messages', `${c.id}-${m.id}`, `#${c.name} · ${nameOf(m.authorId)}`, m.text, `/channels/${c.id}`, m.createdAt);
  for (const d of s.dms || []) if ((d.members || []).includes(me.id)) for (const m of d.messages || []) push('messages', `${d.id}-${m.id}`, `Chat · ${nameOf(m.authorId)}`, m.text, `/messages/${d.id}`, m.createdAt);
  const boards = s.boards || [];
  for (const t of s.tasks || []) {
    const board = boards.find((b) => b.id === t.boardId);
    if (board && !canSeeBoard(s, me, board)) continue;
    push('tasks', t.id, t.title, t.description, `/tasks/${t.id}`, t.createdAt);
  }
  for (const sv of s.surveys || []) if (sv.authorId === me.id || sv.audience?.type !== 'group' || inGroup(sv.audience.id)) push('surveys', sv.id, sv.title, sv.description, `/surveys/${sv.id}`, sv.createdAt);
  for (const th of s.townhalls || []) if (canSeeTownhall(th, me, groups)) push('townhalls', th.id, th.title, th.description, `/townhalls/${th.id}`, th.start ?? th.createdAt);
  return out;
}

export const termsOf = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);

/** Every index entry containing all terms, best first. */
export function searchIndex(index, q) {
  const terms = termsOf(q);
  if (!terms.length) return [];
  return index
    .map((r) => {
      const hay = `${r.title} ${r.body}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return null;
      const score = terms.reduce((n, t) => n + (r.title.toLowerCase().includes(t) ? 3 : 1), 0);
      return { ...r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.at || 0) - (a.at || 0));
}

/** Result ids a saved search {q, type} currently matches. */
export function savedSearchIds(index, { q, type }) {
  return searchIndex(index, q).filter((r) => !type || type === 'all' || r.type === type).map((r) => r.id);
}
