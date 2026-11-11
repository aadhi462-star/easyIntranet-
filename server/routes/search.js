// Global search (redesign Stage 3): communities, people, events and posts in one request. Each
// kind applies the same rules as its own screen, so search never shows more than the page a
// result links to (SRC-01, SRC-02), and that page checks access again when it opens (SRC-05).
import { badRequest, unauthorized } from '../lib/errors.js';
import { access } from '../lib/community.js';
import { notBlockedSql } from '../lib/relations.js';
import { listEvents } from './events.js';

const KINDS = ['communities', 'people', 'events', 'posts'];
const DAY = 864e5;
// LIKE treats % and _ as wildcards; escape them so a search for "100%" means just that.
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const snippet = (text, q, size = 140) => {
  const at = text.toLowerCase().indexOf(q);
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 40, text.length - size));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + size).trim()}${start + size < text.length ? '…' : ''}`;
};

export default async function searchRoutes(app, { ctx }) {
  const { db } = ctx;
  const limit = { config: { rateLimit: ctx.rateLimits ? { max: 120, timeWindow: '1 minute' } : false } };

  app.get('/search', limit, async (req) => {
    if (!req.user) throw unauthorized();
    const uid = req.user.id;
    const q = String(req.query.q ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
    if (q.length < 2) throw badRequest('QUERY_TOO_SHORT', 'Type at least 2 characters to search.');
    const type = String(req.query.type ?? 'all');
    if (type !== 'all' && !KINDS.includes(type)) throw badRequest('INVALID_INPUT', 'Choose what to search.');
    const n = type === 'all' ? 5 : 20;
    const want = (k) => type === 'all' || type === k;
    const pattern = like(q);

    const [communities, people, posts, events] = await Promise.all([
      // Same rule as discovery: Public and Private, plus Closed ones you belong to; never merged,
      // suspended, or one you're blocked from (VIS-04, SRC-01, SRC-04).
      want('communities') ? db.query(
        `select c.id, c.slug, c.name, c.description, c.category, c.emoji, c.accent, c.visibility, c.status, m.state as member_state,
                (select count(*)::int from memberships mm join users u on u.id = mm.user_id
                  where mm.community_id = c.id and mm.state in ('active', 'restricted') and u.status = 'active') as member_count
           from communities c left join memberships m on m.community_id = c.id and m.user_id = $1
          where c.merged_into is null
            and (c.status = 'active' or (c.status = 'archived' and m.state in ('active', 'restricted')))
            and (c.visibility <> 'closed' or m.state in ('active', 'restricted'))
            and coalesce(m.state, '') <> 'blocked'
            and lower(c.name || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.category, '')) like $2
          order by (lower(c.name) like $3) desc, member_count desc, c.name limit $4`, [uid, pattern, like(q).slice(1), n]) : null,
      // Same rule as the directory: active, listed, not blocked either way.
      want('people') ? db.query(
        `select u.id, u.name, p.headline, p.job_title, p.company, p.city, p.avatar_hue from users u join profiles p on p.user_id = u.id
          where u.status = 'active' and (p.directory_visible or u.id = $1) and ${notBlockedSql('u.id', '$1')}
            and lower(u.name || ' ' || coalesce(p.headline, '') || ' ' || coalesce(p.job_title, '') || ' ' || coalesce(p.company, '') || ' ' || coalesce(p.city, '')) like $2
          order by (lower(u.name) like $3) desc, lower(u.name), u.id limit $4`, [uid, pattern, like(q).slice(1), n]) : null,
      // Published posts in communities whose discussions you may read: ones you belong to, and
      // Public ones. Never Private or Closed communities you're not in (SRC-02).
      want('posts') ? db.query(
        `select p.id, p.body, p.type, p.community_id, coalesce(p.published_at, p.created_at) as at, c.name as community, u.name as author
           from posts p join communities c on c.id = p.community_id join users u on u.id = p.author_id
           left join memberships m on m.community_id = c.id and m.user_id = $1
          where p.status = 'published' and p.deleted_at is null and c.merged_into is null and c.status <> 'suspended'
            and (m.state in ('active', 'restricted') or (c.visibility = 'public' and c.status = 'active' and coalesce(m.state, '') <> 'blocked'))
            and u.status <> 'deleted' and ${notBlockedSql('p.author_id', '$1')}
            and lower(p.body) like $2
          order by at desc, p.id desc limit $3`, [uid, pattern, n]) : null,
      // Events you could see on the Events page in the coming year (EVT-08 rules apply).
      want('events') ? listEvents(db, req, { from: new Date(), to: new Date(Date.now() + 365 * DAY) }) : null,
    ]);

    const out = {};
    if (communities) {
      out.communities = communities.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category,
        emoji: c.emoji, accent: c.accent, visibility: c.visibility, status: c.status, memberCount: c.member_count, member: ['active', 'restricted'].includes(c.member_state) }));
    }
    if (people) {
      out.people = people.rows.map((p) => ({ id: p.id, name: p.name, headline: p.headline || [p.job_title, p.company].filter(Boolean).join(' · ') || null, city: p.city, avatarHue: p.avatar_hue }));
    }
    if (posts) {
      // A post in a Public community you aren't in is still readable, but check once more with
      // the same access function the post page uses, in case a setting changed mid-request.
      const allowed = {};
      for (const id of new Set(posts.rows.map((p) => p.community_id))) allowed[id] = (await access(db, req, id, { audited: false }).catch(() => null))?.canView;
      out.posts = posts.rows.filter((p) => allowed[p.community_id]).map((p) => ({ id: p.id, type: p.type, excerpt: snippet(p.body, q), community: { id: p.community_id, name: p.community }, author: p.author, at: p.at }));
    }
    if (events) {
      out.events = events.filter((e) => `${e.title} ${e.location ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q)).slice(0, n)
        .map((e) => ({ id: e.id, title: e.title, start: e.start, allDay: e.allDay, location: e.location, community: e.community }));
    }
    return { q, results: out };
  });
}
