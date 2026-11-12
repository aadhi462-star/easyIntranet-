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
      where m.user_id = $1 and m.state in ('active', 'restricted') and c.status not in ('suspended', 'deleted') and c.merged_into is null`;

    const [communities, events, mandatory, announcements, requests, newMembers, replies, recent, suggested] = await Promise.all([
      db.query(`select c.id, c.slug, c.name, c.emoji, c.accent, c.visibility, c.status, m.role, m.state,
          (select count(*)::int from memberships mm join users uu on uu.id = mm.user_id
            where mm.community_id = c.id and mm.state in ('active', 'restricted') and uu.status = 'active') as member_count
        from memberships m join communities c on c.id = m.community_id
        where m.user_id = $1 and m.state in ('active', 'restricted') and c.status not in ('suspended', 'deleted') and c.merged_into is null
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
      // Replies from other people to your own posts in the last 30 days, newest first.
      db.query(`select k.id, k.body, k.created_at, k.post_id, p.body as post_body, p.community_id, c.slug, c.name as community,
                       u.name as author, u.status as author_status
          from comments k join posts p on p.id = k.post_id join communities c on c.id = p.community_id join users u on u.id = k.author_id
         where p.author_id = $1 and k.author_id <> $1 and k.deleted_at is null and p.deleted_at is null and p.status = 'published'
           and p.community_id in (${mine}) and k.created_at > now() - interval '30 days' and ${notBlockedSql('k.author_id', '$1')}
         order by k.created_at desc limit 20`, [uid]),
      // What's new: other people's posts in your communities.
      db.query(`select p.id, p.body, p.type, p.published_at, p.community_id, c.slug, c.name as community, c.accent,
                       u.id as author_id, u.name as author, u.status as author_status,
                       (select count(*)::int from reactions r where r.post_id = p.id and r.kind = 'like') as likes,
                       (select count(*)::int from comments k where k.post_id = p.id and k.deleted_at is null) as replies
          from posts p join communities c on c.id = p.community_id join users u on u.id = p.author_id
         where p.community_id in (${mine}) and p.status = 'published' and p.deleted_at is null and p.author_id <> $1
           and ${notBlockedSql('p.author_id', '$1')}
         order by p.published_at desc limit 5`, [uid]),
      // Public communities you're not in (and haven't asked to join), most members first. No tracking.
      db.query(`select c.id, c.slug, c.name, c.category, c.accent,
          (select count(*)::int from memberships mm join users uu on uu.id = mm.user_id
            where mm.community_id = c.id and mm.state in ('active', 'restricted') and uu.status = 'active') as member_count
          from communities c
         where c.visibility = 'public' and c.status = 'active' and c.merged_into is null
           and not exists (select 1 from memberships m where m.community_id = c.id and m.user_id = $1)
         order by member_count desc, c.name limit 3`, [uid]),
    ]);

    const upcoming = events.filter((e) => e.status === 'scheduled' && Date.parse(e.nextStart) >= now)
      .sort((a, b) => Date.parse(a.nextStart) - Date.parse(b.nextStart)).slice(0, 5);
    const excerpt = (s) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);
    return {
      communities: communities.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, accent: c.accent, visibility: c.visibility, status: c.status, role: c.role, state: c.state, memberCount: c.member_count })),
      upcomingEvents: upcoming,
      mandatoryReads: mandatory.rows.map((p) => ({ id: p.id, excerpt: excerpt(p.body), button: p.mandatory.button, deadline: p.mandatory.deadline, publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author })),
      announcements: announcements.rows.map((p) => ({ id: p.id, excerpt: excerpt(p.body), publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author_status === 'deleted' ? 'Deleted member' : p.author })),
      connectionRequests: requests.rows[0].n,
      newMembers: newMembers.rows.map((u) => ({ id: u.id, name: u.name })),
      replies: repliesByPost(replies.rows, excerpt),
      recentPosts: recent.rows.map((p) => ({ id: p.id, excerpt: excerpt(p.body), type: p.type, publishedAt: p.published_at, likes: p.likes, replies: p.replies,
        community: { id: p.community_id, slug: p.slug, name: p.community, accent: p.accent },
        author: p.author_status === 'deleted' ? { id: null, name: 'Deleted member' } : { id: p.author_id, name: p.author } })),
      suggested: suggested.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, category: c.category, accent: c.accent, memberCount: c.member_count })),
    };
  });
}

// Replies grouped by your post, newest activity first: the two latest replies and the count.
function repliesByPost(rows, excerpt) {
  const posts = new Map();
  for (const r of rows) {
    const p = posts.get(r.post_id) ?? { postId: r.post_id, excerpt: excerpt(r.post_body), community: { id: r.community_id, slug: r.slug, name: r.community }, count: 0, latest: [] };
    p.count += 1;
    if (p.latest.length < 2) p.latest.push({ id: r.id, author: r.author_status === 'deleted' ? 'Deleted member' : r.author, excerpt: excerpt(r.body), at: r.created_at });
    posts.set(r.post_id, p);
  }
  return [...posts.values()].slice(0, 3);
}
