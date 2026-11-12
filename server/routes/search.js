// Global search (redesign Stage 3, v2 D9): communities, people, discussions, events, resources
// and courses in one request. Each kind applies the same rules as its own screen, so search never
// shows more than the page a result links to (SRC-01, SRC-02), and that page checks access again
// when it opens (SRC-05). `mode=suggest` is the top-bar box: at most 3 per kind, lighter fields,
// the same rules.
import { badRequest, unauthorized } from '../lib/errors.js';
import { access, brandingUrls, sectionOn } from '../lib/community.js';
import { notBlockedSql } from '../lib/relations.js';
import { listEvents } from './events.js';

const KINDS = ['communities', 'people', 'events', 'posts', 'resources', 'courses'];
const DAY = 864e5;
// LIKE treats % and _ as wildcards; escape them so a search for "100%" means just that.
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const snippet = (text, q, size = 140) => {
  const at = text.toLowerCase().indexOf(q);
  const start = Math.max(0, Math.min(at < 0 ? 0 : at - 40, text.length - size));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + size).trim()}${start + size < text.length ? '…' : ''}`;
};
const ref = (c) => ({ id: c.community_id, slug: c.community_slug, name: c.community_name });

// Communities whose content a signed-in person might read: ones they belong to, and Public
// active ones they aren't blocked from. Every hit is checked again with access() below.
const READABLE_SQL = `c.merged_into is null and c.status not in ('suspended', 'deleted')
  and (m.state in ('active', 'restricted') or (c.visibility = 'public' and c.status = 'active' and coalesce(m.state, '') <> 'blocked'))`;

export default async function searchRoutes(app, { ctx }) {
  const { db } = ctx;
  const limit = { config: { rateLimit: ctx.rateLimits ? { max: 120, timeWindow: '1 minute' } : false } };

  app.get('/search', limit, async (req) => {
    if (!req.user) throw unauthorized();
    const uid = req.user.id;
    const q = String(req.query.q ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
    if (q.length < 2) throw badRequest('QUERY_TOO_SHORT', 'Type at least 2 characters to search.');
    const mode = String(req.query.mode ?? 'full');
    if (!['full', 'suggest'].includes(mode)) throw badRequest('INVALID_INPUT', 'Choose how to search.');
    const suggest = mode === 'suggest';
    // Suggestions always cover every kind.
    const type = suggest ? 'all' : String(req.query.type ?? 'all');
    if (type !== 'all' && !KINDS.includes(type)) throw badRequest('INVALID_INPUT', 'Choose what to search.');
    const n = suggest ? 3 : type === 'all' ? 5 : 20;
    const want = (k) => type === 'all' || type === k;
    const pattern = like(q);
    const prefix = like(q).slice(1);

    // The community page's own answer for each community a hit lives in, once per request.
    // Admin mode is never used here: search is for what you can open as yourself.
    const plain = { user: req.user, headers: {}, url: req.url, method: 'GET', ip: req.ip };
    const seen = new Map();
    const accessOf = (id) => {
      if (!seen.has(id)) seen.set(id, access(db, plain, id, { audited: false }).catch(() => null));
      return seen.get(id);
    };
    /** Ids among `ids` whose page you may open with `section` switched on. */
    const readable = async (ids, section) => {
      const ok = [];
      for (const id of new Set(ids)) {
        const a = await accessOf(id);
        if (a?.canView && sectionOn(a.community, section)) ok.push(id);
      }
      return ok;
    };

    const [communities, people, posts, events, resources, courses] = await Promise.all([
      // Same rule as discovery: Public and Private, plus Closed ones you belong to; never merged,
      // suspended, or one you're blocked from (VIS-04, SRC-01, SRC-04).
      want('communities') ? db.query(
        `select c.id, c.slug, c.name, c.description, c.category, c.emoji, c.accent, c.logo_file_id, c.cover_file_id, c.visibility, c.status, m.state as member_state,
                (select count(*)::int from memberships mm join users u on u.id = mm.user_id
                  where mm.community_id = c.id and mm.state in ('active', 'restricted') and u.status = 'active') as member_count
           from communities c left join memberships m on m.community_id = c.id and m.user_id = $1
          where c.merged_into is null
            and (c.status = 'active' or (c.status = 'archived' and m.state in ('active', 'restricted')))
            and (c.visibility <> 'closed' or m.state in ('active', 'restricted'))
            and coalesce(m.state, '') <> 'blocked'
            and lower(c.name || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.category, '')) like $2
          order by (lower(c.name) like $3) desc, member_count desc, c.name limit $4`, [uid, pattern, prefix, n]) : null,
      // Same rule as the directory: active, listed, not blocked either way.
      want('people') ? db.query(
        `select u.id, u.name, p.headline, p.job_title, p.company, p.city, p.avatar_hue from users u join profiles p on p.user_id = u.id
          where u.status = 'active' and (p.directory_visible or u.id = $1) and ${notBlockedSql('u.id', '$1')}
            and lower(u.name || ' ' || coalesce(p.headline, '') || ' ' || coalesce(p.job_title, '') || ' ' || coalesce(p.company, '') || ' ' || coalesce(p.city, '')) like $2
          order by (lower(u.name) like $3) desc, lower(u.name), u.id limit $4`, [uid, pattern, prefix, n]) : null,
      // Published posts in communities whose discussions you may read: ones you belong to, and
      // Public ones. Never Private or Closed communities you're not in (SRC-02). Drafts,
      // scheduled and deleted posts never match.
      want('posts') ? (async () => {
        const { rows: hits } = await db.query(
          `select distinct p.community_id from posts p join communities c on c.id = p.community_id
             left join memberships m on m.community_id = c.id and m.user_id = $1
            where p.status = 'published' and p.deleted_at is null and ${READABLE_SQL} and lower(p.body) like $2`, [uid, pattern]);
        const ok = await readable(hits.map((h) => h.community_id), 'discussions');
        return (await db.query(
          `select p.id, p.body, p.type, p.community_id, coalesce(p.published_at, p.created_at) as at, c.slug as community_slug, c.name as community_name, u.name as author
             from posts p join communities c on c.id = p.community_id join users u on u.id = p.author_id
            where p.community_id = any($1) and p.status = 'published' and p.deleted_at is null
              and u.status <> 'deleted' and ${notBlockedSql('p.author_id', '$2')} and lower(p.body) like $3
            order by at desc, p.id desc limit $4`, [ok, uid, pattern, n])).rows;
      })() : null,
      // Events you could see on the Events page in the coming year (EVT-08 rules apply).
      want('events') ? listEvents(db, req, { from: new Date(), to: new Date(Date.now() + 365 * DAY) }) : null,
      // The Resources page's rule: anyone who can view the community, with Resources switched
      // on; deleted resources never (SRC-05).
      want('resources') ? (async () => {
        const { rows: hits } = await db.query(
          `select distinct r.community_id from resources r join communities c on c.id = r.community_id
             left join memberships m on m.community_id = c.id and m.user_id = $1
            where r.deleted_at is null and ${READABLE_SQL}
              and lower(r.title || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.category, '')) like $2`, [uid, pattern]);
        const ok = await readable(hits.map((h) => h.community_id), 'resources');
        return (await db.query(
          `select r.id, r.title, r.kind, r.description, r.community_id, c.slug as community_slug, c.name as community_name
             from resources r join communities c on c.id = r.community_id
            where r.community_id = any($1) and r.deleted_at is null
              and lower(r.title || ' ' || coalesce(r.description, '') || ' ' || coalesce(r.category, '')) like $2
            order by (lower(r.title) like $3) desc, r.created_at desc, r.id limit $4`, [ok, pattern, prefix, n])).rows;
      })() : null,
      // The Learning catalogue's rule (learning.js): the platform's Learning switch on, the
      // community's Learning section on, and a course the catalogue lists and its page opens:
      // published and listed for anyone who can view the community; also ones you're enrolled
      // in, and every course for its managers (Admins, and its own active Instructors). Drafts
      // and hidden courses stay out for everyone else (SRC-05).
      want('courses') ? (async () => {
        const { rows: [flag] } = await db.query(`select enabled from feature_flags where key = 'learning'`);
        if (flag && !flag.enabled) return [];
        const { rows: hits } = await db.query(
          `select co.id, co.title, co.status, co.visibility, co.community_id, c.slug as community_slug, c.name as community_name,
                  (select e.status from enrollments e where e.course_id = co.id and e.user_id = $1) as enrollment,
                  exists (select 1 from course_instructors i where i.course_id = co.id and i.user_id = $1) as instructor
             from courses co join communities c on c.id = co.community_id
             left join memberships m on m.community_id = c.id and m.user_id = $1
            where ${READABLE_SQL} and lower(co.title || ' ' || coalesce(co.description, '') || ' ' || coalesce(co.category, '')) like $2
            order by (lower(co.title) like $3) desc, co.published_at desc nulls last, co.id`, [uid, pattern, prefix]);
        const ok = new Set(await readable(hits.map((h) => h.community_id), 'learning'));
        const out = [];
        for (const h of hits) {
          if (!ok.has(h.community_id)) continue;
          const a = await accessOf(h.community_id);
          const manage = a.canAdmin || (h.instructor && a.state === 'active');
          const learner = h.enrollment === 'active' && a.member;
          const listed = h.status === 'published' && (h.visibility === 'members' || ['active', 'waitlist'].includes(h.enrollment));
          if (manage || learner || listed) out.push(h);
          if (out.length >= n) break;
        }
        return out;
      })() : null,
    ]);

    const out = {};
    if (communities) {
      out.communities = communities.rows.map((c) => (suggest
        ? { id: c.id, slug: c.slug, name: c.name, accent: c.accent, visibility: c.visibility, member: ['active', 'restricted'].includes(c.member_state) }
        : { id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category, emoji: c.emoji, accent: c.accent, ...brandingUrls(c),
          visibility: c.visibility, status: c.status, memberCount: c.member_count, member: ['active', 'restricted'].includes(c.member_state) }));
    }
    if (people) {
      out.people = people.rows.map((p) => {
        const headline = p.headline || [p.job_title, p.company].filter(Boolean).join(' · ') || null;
        return suggest ? { id: p.id, name: p.name, headline, avatarHue: p.avatar_hue } : { id: p.id, name: p.name, headline, city: p.city, avatarHue: p.avatar_hue };
      });
    }
    if (posts) {
      out.posts = posts.map((p) => (suggest
        ? { id: p.id, excerpt: snippet(p.body, q, 80), community: ref(p) }
        : { id: p.id, type: p.type, excerpt: snippet(p.body, q), community: ref(p), author: p.author, at: p.at }));
    }
    if (events) {
      // A repeating event is shown at its next occurrence, not the date the series began.
      out.events = events.filter((e) => `${e.title} ${e.location ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q))
        .map((e) => (suggest
          ? { id: e.id, title: e.title, start: e.nextStart ?? e.start, allDay: e.allDay, community: e.community ? { id: e.community.id, name: e.community.name } : null }
          : { id: e.id, title: e.title, start: e.nextStart ?? e.start, allDay: e.allDay, location: e.location, community: e.community }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, n);
    }
    if (resources) {
      out.resources = resources.map((r) => ({ id: r.id, title: r.title, kind: r.kind, community: ref(r),
        ...(suggest ? {} : { description: r.description ? snippet(r.description, q) : null }) }));
    }
    if (courses) out.courses = courses.map((c) => ({ id: c.id, title: c.title, community: ref(c) }));
    return { q, results: out };
  });
}
