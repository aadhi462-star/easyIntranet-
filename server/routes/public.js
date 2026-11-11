// Public discovery (decision R7): what a visitor may see before signing in, for the landing
// page and public Explore. Only Public and Private communities that are active; Closed ones
// never appear (VIS-04). Cards carry public metadata and a member count, never member lists
// or content. Upcoming events are listed for Public communities only, and never invite-only
// ones (EVT-08). Rate-limited per IP because it needs no account.
import { badRequest } from '../lib/errors.js';
import { nextOccurrence, seriesEnd } from '../../shared/recurrence.js';
import { timing } from './events.js';

export default async function publicRoutes(app, { ctx }) {
  const { db } = ctx;
  const limit = { config: { rateLimit: ctx.rateLimits ? { max: 60, timeWindow: '1 minute' } : false } };

  app.get('/public/communities', limit, async (req) => {
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80);
    const category = req.query.category ? String(req.query.category).slice(0, 60) : null;
    const n = req.query.limit == null ? 24 : Number(req.query.limit);
    if (!Number.isInteger(n) || n < 1 || n > 60) throw badRequest('INVALID_INPUT', 'Choose a limit between 1 and 60.');
    const visible = `c.status = 'active' and c.visibility in ('public', 'private')`;
    const [{ rows }, cats] = await Promise.all([
      db.query(
        `select c.id, c.slug, c.name, c.description, c.category, c.visibility,
                (select count(*)::int from memberships m join users u on u.id = m.user_id
                  where m.community_id = c.id and m.state in ('active', 'restricted') and u.status = 'active') as member_count
           from communities c
          where ${visible}
            and ($1 = '' or lower(c.name || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.category, '')) like '%' || $1 || '%')
            and ($2::text is null or c.category = $2)
          order by member_count desc, c.name limit $3`, [q, category, n]),
      db.query(`select distinct c.category from communities c where ${visible} and c.category is not null order by 1`),
    ]);
    const publicIds = rows.filter((c) => c.visibility === 'public').map((c) => c.id);
    const events = publicIds.length ? (await db.query(
      `select e.* from events e where e.community_id = any($1) and e.deleted_at is null and e.status = 'scheduled'
          and not e.invite_only and e.start_at <= now() + interval '400 days'
        order by e.start_at`, [publicIds])).rows : [];
    // A repeating event is listed at its next occurrence, not the series' first date.
    const now = Date.now();
    const upcoming = {};
    const next = events.filter((e) => seriesEnd(timing(e)) >= now)
      .map((e) => ({ e, at: nextOccurrence(timing(e), now) })).filter((x) => x.at >= now).sort((a, b) => a.at - b.at);
    for (const { e, at } of next) {
      const list = (upcoming[e.community_id] ??= []);
      if (list.length < 2) list.push({ id: e.id, title: e.title, start: new Date(at).toISOString(), allDay: e.all_day });
    }
    return {
      communities: rows.map((c) => ({
        id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category, visibility: c.visibility,
        memberCount: c.member_count, upcomingEvents: upcoming[c.id] ?? [],
      })),
      categories: cats.rows.map((r) => r.category),
    };
  });
}
