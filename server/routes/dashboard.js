// Member dashboard (prompt §11): one request for the home screen's summary. Everything comes
// from communities the member belongs to and passes the same access and block rules as the
// full screens, so the dashboard never shows more than the pages it links to.
import { unauthorized } from '../lib/errors.js';
import { notBlockedSql } from '../lib/relations.js';
import { listEvents } from './events.js';

const DAY = 864e5;

export default async function dashboardRoutes(app, { ctx }) {
  const { db } = ctx;

  app.get('/dashboard', async (req) => {
    if (!req.user) throw unauthorized();
    const uid = req.user.id;
    const now = Date.now();
    const mine = `select m.community_id from memberships m join communities c on c.id = m.community_id
      where m.user_id = $1 and m.state in ('active', 'restricted') and c.status <> 'suspended'`;

    const [communities, events, mandatory, announcements, requests, newMembers] = await Promise.all([
      db.query(`select c.id, c.name, c.emoji, c.visibility, c.status, m.role, m.state,
          (select count(*)::int from memberships mm where mm.community_id = c.id and mm.state in ('active', 'restricted')) as member_count
        from memberships m join communities c on c.id = m.community_id
        where m.user_id = $1 and m.state in ('active', 'restricted') and c.status <> 'suspended'
        order by c.status = 'active' desc, c.name`, [uid]),
      listEvents(db, req, { from: new Date(now), to: new Date(now + 60 * DAY) }),
      // Mandatory Reads waiting for this member's acknowledgement (not their own posts).
      db.query(`select p.id, p.body, p.mandatory, p.published_at, p.community_id, c.name as community, u.name as author
          from posts p join communities c on c.id = p.community_id join users u on u.id = p.author_id
         where p.community_id in (${mine}) and p.status = 'published' and p.deleted_at is null and p.mandatory is not null
           and p.author_id <> $1 and not exists (select 1 from post_acks k where k.post_id = p.id and k.user_id = $1)
           and ${notBlockedSql('p.author_id', '$1')}
         order by p.published_at desc limit 5`, [uid]),
      db.query(`select p.id, p.body, p.published_at, p.community_id, c.name as community, u.name as author, u.status as author_status
          from posts p join communities c on c.id = p.community_id join users u on u.id = p.author_id
         where p.community_id in (${mine}) and p.status = 'published' and p.deleted_at is null and p.type = 'announcement'
           and ${notBlockedSql('p.author_id', '$1')}
         order by p.published_at desc limit 5`, [uid]),
      db.query(`select count(*)::int as n from connections c
         where (c.user_a = $1 or c.user_b = $1) and c.status = 'pending' and c.requested_by <> $1
           and ${notBlockedSql('c.requested_by', '$1')}`, [uid]),
      // Newest people who share a community with you (not you, not blocked, not hidden).
      db.query(`select u.id, u.name from memberships m join users u on u.id = m.user_id
          left join profiles pr on pr.user_id = u.id
         where m.community_id in (${mine}) and m.state = 'active' and u.status = 'active' and u.id <> $1
           and coalesce(pr.directory_visible, true) and ${notBlockedSql('u.id', '$1')}
         group by u.id, u.name, u.created_at order by u.created_at desc, u.id limit 5`, [uid]),
    ]);

    const upcoming = events.filter((e) => e.status === 'scheduled' && Date.parse(e.nextStart) >= now)
      .sort((a, b) => Date.parse(a.nextStart) - Date.parse(b.nextStart)).slice(0, 5);
    const excerpt = (s) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);
    return {
      communities: communities.rows.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, visibility: c.visibility, status: c.status, role: c.role, state: c.state, memberCount: c.member_count })),
      upcomingEvents: upcoming,
      mandatoryReads: mandatory.rows.map((p) => ({ id: p.id, excerpt: excerpt(p.body), button: p.mandatory.button, deadline: p.mandatory.deadline, publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author })),
      announcements: announcements.rows.map((p) => ({ id: p.id, excerpt: excerpt(p.body), publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author_status === 'deleted' ? 'Deleted member' : p.author })),
      connectionRequests: requests.rows[0].n,
      newMembers: newMembers.rows.map((u) => ({ id: u.id, name: u.name })),
    };
  });
}
