// Member dashboard (prompt §11): one request for the home screen's summary. Everything comes
// from communities the member belongs to and passes the same access and block rules as the
// full screens, so the dashboard never shows more than the pages it links to.
import { access, brandingUrls, sectionOn } from '../lib/community.js';
import { unauthorized } from '../lib/errors.js';
import { notBlockedSql } from '../lib/relations.js';
import { listEvents } from './events.js';

const DAY = 864e5;
// Open community invitations for this account, one per community (the newest), exactly as
// GET /me/invitations in routes/invitations.js picks them.
const OPEN_INVITE = `i.accepted_at is null and i.revoked_at is null and i.superseded_at is null and i.declined_at is null`;
const normEmail = (e) => String(e || '').trim().toLowerCase();

export default async function dashboardRoutes(app, { ctx }) {
  const { db } = ctx;

  app.get('/dashboard', async (req) => {
    if (!req.user) throw unauthorized();
    const uid = req.user.id;
    const now = Date.now();
    const mine = `select m.community_id from memberships m join communities c on c.id = m.community_id
      where m.user_id = $1 and m.state in ('active', 'restricted') and c.status not in ('suspended', 'deleted') and c.merged_into is null`;

    const [communities, events, mandatory, announcements, requests, newMembers, replies, recent, suggested, pending, invites] = await Promise.all([
      db.query(`select c.id, c.slug, c.name, c.emoji, c.accent, c.logo_file_id, c.cover_file_id, c.settings, c.visibility, c.status, m.role, m.state,
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
      db.query(`select c.id, c.slug, c.name, c.category, c.accent, c.logo_file_id, c.cover_file_id,
          (select count(*)::int from memberships mm join users uu on uu.id = mm.user_id
            where mm.community_id = c.id and mm.state in ('active', 'restricted') and uu.status = 'active') as member_count
          from communities c
         where c.visibility = 'public' and c.status = 'active' and c.merged_into is null
           and not exists (select 1 from memberships m where m.community_id = c.id and m.user_id = $1)
         order by member_count desc, c.name limit 6`, [uid]),
      // Your join requests still waiting on a community's admins.
      db.query(`select c.id, c.slug, c.name, c.accent, c.visibility, m.updated_at
          from memberships m join communities c on c.id = m.community_id
         where m.user_id = $1 and m.state = 'pending' and c.status = 'active' and c.merged_into is null
         order by m.updated_at desc`, [uid]),
      db.query(`select i.id, i.community_id, i.role, i.expires_at, c.slug, c.name, c.accent, c.visibility, ib.name as invited_by_name
          from community_invitations i join communities c on c.id = i.community_id left join users ib on ib.id = i.invited_by
         where ${OPEN_INVITE} and i.expires_at > now() and c.status = 'active' and c.merged_into is null
           and ((i.user_id = $1) or (i.user_id is null and $3::boolean and i.email = $2)) order by i.created_at desc`,
      [uid, normEmail(req.user.email), req.user.emailVerified]),
    ]);

    // Where the quick actions may go: the same checks the post and event routes make (access()
    // for status, membership state and whoCanPost; the section switch; whoCanCreateEvents).
    const canPostIn = []; const canCreateEventsIn = [];
    for (const c of communities.rows) {
      const a = await access(db, req, c.id, { audited: false });
      if (!a.canParticipate) continue;
      if (sectionOn(a.community, 'discussions')) canPostIn.push(c.id);
      if (sectionOn(a.community, 'events') && (a.community.settings?.whoCanCreateEvents !== 'admins' || a.canAdmin)) canCreateEventsIn.push(c.id);
    }
    const seenInvite = new Set();
    const invitations = invites.rows.filter((i) => !seenInvite.has(i.community_id) && seenInvite.add(i.community_id));
    // Next 14 days, the ones you haven't answered first, then by start.
    const soon = events.filter((e) => e.status === 'scheduled' && Date.parse(e.nextStart) >= now && Date.parse(e.nextStart) <= now + 14 * DAY)
      .sort((a, b) => (a.myRsvp != null) - (b.myRsvp != null) || Date.parse(a.nextStart) - Date.parse(b.nextStart)).slice(0, 5);

    const upcoming = events.filter((e) => e.status === 'scheduled' && Date.parse(e.nextStart) >= now)
      .sort((a, b) => Date.parse(a.nextStart) - Date.parse(b.nextStart)).slice(0, 5);
    const excerpt = (s) => (s.length > 200 ? `${s.slice(0, 199)}…` : s);
    // Posts from communities whose Discussions are switched off stay off Home (events are
    // already left out by listEvents).
    const quiet = new Set(communities.rows.filter((c) => !sectionOn(c, 'discussions')).map((c) => c.id));
    const shown = (rows) => rows.filter((p) => !quiet.has(p.community_id));
    return {
      communities: communities.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, emoji: c.emoji, accent: c.accent, ...brandingUrls(c), visibility: c.visibility, status: c.status, role: c.role, state: c.state, memberCount: c.member_count })),
      upcomingEvents: upcoming,
      mandatoryReads: shown(mandatory.rows).map((p) => ({ id: p.id, excerpt: excerpt(p.body), button: p.mandatory.button, deadline: p.mandatory.deadline, publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author })),
      announcements: shown(announcements.rows).map((p) => ({ id: p.id, excerpt: excerpt(p.body), publishedAt: p.published_at, community: { id: p.community_id, name: p.community }, author: p.author_status === 'deleted' ? 'Deleted member' : p.author })),
      connectionRequests: requests.rows[0].n,
      newMembers: newMembers.rows.map((u) => ({ id: u.id, name: u.name })),
      replies: repliesByPost(shown(replies.rows), excerpt),
      recentPosts: shown(recent.rows).map((p) => ({ id: p.id, excerpt: excerpt(p.body), type: p.type, publishedAt: p.published_at, likes: p.likes, replies: p.replies,
        community: { id: p.community_id, slug: p.slug, name: p.community, accent: p.accent },
        author: p.author_status === 'deleted' ? { id: null, name: 'Deleted member' } : { id: p.author_id, name: p.author } })),
      suggested: suggested.rows.slice(0, communities.rows.length ? 3 : 6).map((c) => ({ id: c.id, slug: c.slug, name: c.name, category: c.category, accent: c.accent, ...brandingUrls(c), memberCount: c.member_count })),
      comingUp: soon,
      pendingRequests: pending.rows.map((c) => ({ community: { id: c.id, slug: c.slug, name: c.name, accent: c.accent, visibility: c.visibility }, requestedAt: c.updated_at })),
      invitations: invitations.map((i) => ({ id: i.id, community: { id: i.community_id, slug: i.slug, name: i.name, accent: i.accent, visibility: i.visibility },
        role: i.role, invitedBy: i.invited_by_name ?? null, expiresAt: i.expires_at })),
      canPostIn,
      canCreateEventsIn,
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
