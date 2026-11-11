// Notifications (redesign Stage 4). Created by the server when something happens; read back
// through GET /notifications, which rebuilds each line from current data and re-checks access,
// so a stored row never shows something its reader can no longer see (NTF-06, NTF-10).
//
// Rules applied when creating:
// - one row per (recipient, dedupe key): retries and repeats never notify twice (NTF-02)
// - never to the person who acted, to blocked pairs, or to accounts that aren't active (NTF-09)
// - only to people who can see the community, except replies about their own join request
// - email per category (decision S4-5), sent to the address on file at send time (NTF-07),
//   naming who did what and where, never quoting the content (NTF-06, CNT-15). A failed email
//   stays recorded in the outbox; the in-app notification is kept either way (NTF-03).

export const CATEGORIES = {
  replies: { label: 'Replies to your posts', email: false },
  mentions: { label: 'Mentions', email: true },
  joins: { label: 'Join requests and decisions', email: true },
  events: { label: 'Events you’re going to', email: true },
  announcements: { label: 'New announcements', email: false },
  moderation: { label: 'Moderation: your posts, reports and appeals', email: true },
  learning: { label: 'Your courses: grades and certificates', email: true },
};

export const TYPES = {
  reply: { cat: 'replies', line: (x) => `${x.actor} replied to your post in ${x.community}` },
  reply_comment: { cat: 'replies', line: (x) => `${x.actor} replied to your comment in ${x.community}` },
  mention: { cat: 'mentions', line: (x) => `${x.actor} mentioned you in ${x.community}` },
  join_request: { cat: 'joins', line: (x) => `${x.actor} asked to join ${x.community}` },
  join_approved: { cat: 'joins', outsider: true, line: (x) => `Your request to join ${x.community} was approved` },
  join_declined: { cat: 'joins', outsider: true, line: (x) => `Your request to join ${x.community} was declined` },
  event_changed: { cat: 'events', line: (x) => `An event you’re going to in ${x.community} changed` },
  event_cancelled: { cat: 'events', line: (x) => `An event you’re going to in ${x.community} was cancelled` },
  event_reminder: { cat: 'events', line: (x) => `Reminder: an event you’re going to in ${x.community} starts soon` },
  waitlist_promoted: { cat: 'events', line: (x) => `A place opened up: you’re now going to an event in ${x.community}` },
  announcement: { cat: 'announcements', line: (x) => `${x.actor} posted an announcement in ${x.community}` },
  post_approved: { cat: 'moderation', line: (x) => `Your post in ${x.community} was approved` },
  post_removed: { cat: 'moderation', line: (x) => `A moderator removed your post in ${x.community}` },
  // Stage 6: reports, decisions and appeals. The person affected always sees their own notice.
  report_new: { cat: 'moderation', line: (x) => `Something was reported in ${x.community}` },
  report_actioned: { cat: 'moderation', line: (x) => `Action was taken on something you reported in ${x.community}` },
  moderation_action: { cat: 'moderation', own: true, line: (x) => `A moderator took action on your content or membership in ${x.community}` },
  member_sanction: { cat: 'moderation', own: true, line: (x) => `A moderator took action on your membership of ${x.community}` },
  appeal_new: { cat: 'moderation', line: (x) => `${x.actor} appealed a moderation decision in ${x.community}` },
  appeal_decided: { cat: 'moderation', own: true, line: (x) => `An appeal was decided in ${x.community}` },
  submission_returned: { cat: 'learning', line: (x) => `${x.actor} returned your work in ${x.community} with a grade` },
  certificate_issued: { cat: 'learning', line: (x) => `You earned a certificate in ${x.community}` },
};

const origin = (ctx, req) => ctx.appOrigin || (req ? `${req.protocol}://${req.headers.host}` : '');

/**
 * Notify `to` (user ids) that `type` happened. `dedupe` makes the action unique per recipient.
 * Returns the ids of the people notified. Never throws for delivery problems.
 */
export async function notify(ctx, req, { to, type, actorId = null, communityId = null, targetType = null, targetId = null, dedupe, email = true }) {
  const { db, mailer } = ctx;
  const t = TYPES[type];
  const ids = [...new Set((to || []).filter((u) => u && u !== actorId))];
  if (!t || !ids.length) return [];
  const { rows: eligible } = await db.query(
    `select u.id, u.email, u.name from users u
      where u.id = any($1) and u.status = 'active'
        and ($2::text is null or not exists (select 1 from blocks b where (b.blocker_id = u.id and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = u.id)))
        and ($3::text is null or $4::boolean or $5::boolean or exists (select 1 from memberships m join communities c on c.id = m.community_id
              where m.community_id = $3 and m.user_id = u.id and m.state in ('active', 'restricted') and c.merged_into is null))`,
    [ids, actorId, communityId, !!t.outsider, !!t.own]);
  const notified = [];
  for (const u of eligible) {
    const { rows } = await db.query(
      `insert into notifications (id, user_id, kind, actor_id, community_id, target_type, target_id, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (user_id, dedupe_key) do nothing returning id`,
      [`ntf_${cryptoId()}`, u.id, type, actorId, communityId, targetType, targetId, dedupe]);
    if (rows.length) notified.push({ ...u, nid: rows[0].id });
  }
  if (!notified.length || !mailer || !email) return notified.map((u) => u.id);
  const [{ rows: [c] }, { rows: [a] }, { rows: prefs }] = await Promise.all([
    db.query(`select name from communities where id = $1`, [communityId]),
    db.query(`select name from users where id = $1`, [actorId]),
    db.query(`select user_id, email from notification_prefs where kind = $1 and user_id = any($2)`, [t.cat, notified.map((u) => u.id)]),
  ]);
  const wants = Object.fromEntries(prefs.map((p) => [p.user_id, p.email]));
  const line = t.line({ actor: a?.name ?? 'Someone', community: c?.name ?? 'CommunityOne' });
  for (const u of notified) {
    if (!(wants[u.id] ?? CATEGORIES[t.cat].email)) continue; // NTF-01
    try {
      await mailer.send(u.email, 'notification', { name: u.name, line, link: `${origin(ctx, req)}/#/notifications` }, { req });
      await db.query(`update notifications set emailed_at = now() where id = $1`, [u.nid]);
    } catch { /* recorded in the outbox; the in-app notification stays */ }
  }
  return notified.map((u) => u.id);
}

function cryptoId() {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}
