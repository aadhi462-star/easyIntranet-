// Notifications and Saved (redesign Stage 4). Both live on the account, so they're the same on
// every device. Every read re-checks access: a notification or saved item never shows a post,
// event or resource its owner can no longer open (NTF-10). The item stays, marked unavailable.
import { access } from '../lib/community.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { CATEGORIES, PLATFORM_NOTICES, TYPES } from '../lib/notify.js';

const excerpt = (s, n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default async function notificationRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };

  // Access to a community without throwing (Closed, merged or suspended → none).
  const accessOf = async (req, id, cache) => {
    if (!id) return null;
    if (!(id in cache)) cache[id] = await access(db, req, id, { audited: false }).catch(() => null);
    return cache[id];
  };

  /** What a post, event or resource looks like to this viewer now, or null if they can't open it. */
  async function resolve(req, type, id, cache) {
    const uid = req.user.id;
    if (type === 'post') {
      const { rows: [p] } = await db.query(`select id, community_id, author_id, body, status, deleted_at from posts where id = $1`, [id]);
      const a = p && !p.deleted_at && await accessOf(req, p.community_id, cache);
      if (!a?.canView) return null;
      if (!(p.status === 'published' || p.author_id === uid || (p.status === 'pending' && a.canModerate))) return null;
      return { title: excerpt(p.body), href: `/post/${p.id}`, community: { id: a.community.id, slug: a.community.slug, name: a.community.name, accent: a.community.accent } };
    }
    if (type === 'event') {
      const { rows: [e] } = await db.query(`select e.id, e.title, e.community_id, e.start_at, e.invite_only, e.host_id,
          exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = $2) or exists (select 1 from event_invitees i where i.event_id = e.id and i.user_id = $2) as invited
        from events e where e.id = $1 and e.deleted_at is null`, [id, uid]);
      const a = e && await accessOf(req, e.community_id, cache);
      if (!a?.canView || (e.invite_only && e.host_id !== uid && !e.invited && !a.canAdmin)) return null;
      return { title: e.title, start: e.start_at, href: `/events/${e.id}`, community: { id: a.community.id, slug: a.community.slug, name: a.community.name, accent: a.community.accent } };
    }
    if (type === 'resource') {
      const { rows: [r] } = await db.query(`select id, community_id, title from resources where id = $1 and deleted_at is null`, [id]);
      const a = r && await accessOf(req, r.community_id, cache);
      if (!a?.canView) return null;
      return { title: r.title, href: `/c/${a.community.slug || a.community.id}/resources`, community: { id: a.community.id, slug: a.community.slug, name: a.community.name, accent: a.community.accent } };
    }
    // Stage 5b: graded work points at its lesson (the lesson page checks enrolment), and a
    // certificate at its verification page, for its owner only.
    if (type === 'lesson') {
      const { rows: [l] } = await db.query(`select l.id, l.title, c.community_id from lessons l join courses c on c.id = l.course_id where l.id = $1`, [id]);
      const a = l && await accessOf(req, l.community_id, cache);
      if (!a?.canView) return null;
      return { title: l.title, href: `/lessons/${l.id}`, community: { id: a.community.id, slug: a.community.slug, name: a.community.name, accent: a.community.accent } };
    }
    // Stage 6: a case links reviewers to the queue and the person it's about to their notice.
    if (type === 'case') {
      const { rows: [c] } = await db.query(`select c.id, c.community_id, c.subject_id, c.audience, co.slug from moderation_cases c join communities co on co.id = c.community_id where c.id = $1`, [id]);
      if (!c) return null;
      if (c.subject_id === uid) return { title: 'A moderation decision', href: `/notices/${c.id}` };
      const a = await accessOf(req, c.community_id, cache);
      const reviewer = a && ((c.audience === 'moderators' && a.canModerate) || (c.audience === 'owners' && a.isOwner));
      return reviewer ? { title: 'A report', href: `/c/${c.slug || c.community_id}/manage/queue?case=${c.id}` } : null;
    }
    if (type === 'community') {
      const a = await accessOf(req, id, cache);
      return a?.canView ? { title: a.community.name, href: `/c/${a.community.slug || a.community.id}` } : null;
    }
    // v2 workstream F: an invitation, for the account it names or whose verified address it went
    // to. Open: it points at the invitee's list. Accepted: at the community. Otherwise it says the
    // invitation is over (NTF-05), without the community's name.
    if (type === 'invitation') {
      const { rows: [i] } = await db.query(`select c.name, i.community_id, i.accepted_by,
          (i.accepted_at is null and i.revoked_at is null and i.superseded_at is null and i.expires_at > now() and c.status = 'active' and c.merged_into is null) as open
        from community_invitations i join communities c on c.id = i.community_id
        where i.id = $1 and (i.user_id = $2 or (i.user_id is null and i.email = (select email_norm from users where id = $2 and email_verified_at is not null)))`, [id, uid]);
      if (!i) return null;
      if (i.open) return { title: i.name, href: '/invitations' };
      if (i.accepted_by === uid) {
        const a = await accessOf(req, i.community_id, cache);
        return a?.canView ? { title: a.community.name, href: `/c/${a.community.slug || a.community.id}` } : null;
      }
      return { closed: 'This invitation has expired or was withdrawn' };
    }
    if (type === 'certificate') {
      const { rows: [c] } = await db.query(`select code, course_title from certificates where code = $1 and user_id = $2 and revoked_at is null`, [id, uid]);
      return c ? { title: c.course_title, href: `/verify/${c.code}` } : null;
    }
    return null;
  }

  // ---- Notifications ------------------------------------------------------------------------
  app.get('/notifications', async (req) => {
    const uid = signedIn(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const { rows } = await db.query(
      `select n.*, a.name as actor_name, a.status as actor_status, c.name as community_name, c.slug as community_slug
         from notifications n left join users a on a.id = n.actor_id left join communities c on c.id = n.community_id
        where n.user_id = $1 and ($2::boolean is false or n.read_at is null)
        order by n.created_at desc limit $3`, [uid, req.query.unread === '1', limit]);
    const cache = {};
    const out = [];
    for (const n of rows) {
      const t = TYPES[n.kind];
      if (!t) continue;
      let target = n.target_type ? await resolve(req, n.target_type, n.target_id, cache) : null;
      // Join decisions point at the community, which the requester may not be able to open yet.
      let available = !!target && !target.closed;
      if (n.kind.startsWith('join_')) {
        const a = await accessOf(req, n.community_id, cache);
        available = !!a && (n.kind !== 'join_request' || a.canAdmin);
        target = available ? { href: `/c/${n.community_slug || n.community_id}${n.kind === 'join_request' ? '/members' : ''}` } : null;
      }
      // A sanction notice is for its subject even when they can't open the community any more.
      if (PLATFORM_NOTICES.has(n.kind) && !available) { available = true; target = { href: null }; }
      const actor = n.actor_status === 'deleted' ? 'Deleted member' : n.actor_name ?? 'Someone';
      out.push({
        id: n.id, kind: n.kind, category: t.cat, createdAt: n.created_at, read: !!n.read_at,
        // Without access, only a generic line: no names of private communities, no content.
        line: available ? t.line({ actor, community: n.community_name ?? 'CommunityOne' }) : target?.closed ?? 'This is no longer available to you',
        actor: available && n.actor_id ? { id: n.actor_id, name: actor } : null,
        href: available ? target.href : null, available,
      });
    }
    const { rows: [{ unread }] } = await db.query(`select count(*)::int as unread from notifications where user_id = $1 and read_at is null`, [uid]);
    return { notifications: out, unread };
  });

  app.get('/notifications/unread-count', async (req) => {
    const uid = signedIn(req);
    const { rows: [{ unread }] } = await db.query(`select count(*)::int as unread from notifications where user_id = $1 and read_at is null`, [uid]);
    return { unread };
  });

  // Mark some or all as read. Only ever the caller's own.
  app.post('/notifications/read', { schema: { body: { type: 'object', additionalProperties: false, properties: { ids: { type: 'array', items: { type: 'string' }, maxItems: 200 }, all: { type: 'boolean' } } } } }, async (req) => {
    const uid = signedIn(req);
    if (!req.body.all && !req.body.ids?.length) throw badRequest('INVALID_INPUT', 'Say which notifications to mark as read.');
    await db.query(`update notifications set read_at = now() where user_id = $1 and read_at is null and ($2::boolean or id = any($3))`, [uid, !!req.body.all, req.body.ids ?? []]);
    const { rows: [{ unread }] } = await db.query(`select count(*)::int as unread from notifications where user_id = $1 and read_at is null`, [uid]);
    return { unread };
  });

  // Email settings per category (decision S4-5): defaults apply until the member changes one.
  app.get('/notification-prefs', async (req) => {
    const uid = signedIn(req);
    const { rows } = await db.query(`select kind, email from notification_prefs where user_id = $1`, [uid]);
    const mine = Object.fromEntries(rows.map((r) => [r.kind, r.email]));
    return { categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label, email: mine[id] ?? c.email, default: c.email })) };
  });

  app.put('/notification-prefs', { schema: { body: { type: 'object', additionalProperties: { type: 'boolean' } } } }, async (req) => {
    const uid = signedIn(req);
    for (const [kind, email] of Object.entries(req.body)) {
      if (!CATEGORIES[kind]) throw badRequest('INVALID_INPUT', `“${kind}” isn’t a notification category.`);
      await db.query(`insert into notification_prefs (user_id, kind, email) values ($1, $2, $3) on conflict (user_id, kind) do update set email = excluded.email`, [uid, kind, email]);
    }
    const { rows } = await db.query(`select kind, email from notification_prefs where user_id = $1`, [uid]);
    const mine = Object.fromEntries(rows.map((r) => [r.kind, r.email]));
    return { categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label, email: mine[id] ?? c.email, default: c.email })) };
  });

  // ---- Saved --------------------------------------------------------------------------------
  const savedBody = { type: 'object', required: ['type', 'id'], additionalProperties: false, properties: { type: { type: 'string', enum: ['post', 'event', 'resource'] }, id: { type: 'string' } } };

  app.get('/saved', async (req) => {
    const uid = signedIn(req);
    const type = ['post', 'event', 'resource'].includes(req.query.type) ? req.query.type : null;
    const { rows } = await db.query(`select target_type, target_id, created_at from saved_items where user_id = $1 and ($2::text is null or target_type = $2) order by created_at desc limit 200`, [uid, type]);
    const cache = {};
    const items = [];
    for (const r of rows) {
      const t = await resolve(req, r.target_type, r.target_id, cache);
      items.push({ type: r.target_type, id: r.target_id, savedAt: r.created_at, available: !!t, ...(t ?? {}) });
    }
    return { items };
  });

  // Save only what you can open now; saving twice is a no-op.
  app.put('/saved', { schema: { body: savedBody } }, async (req) => {
    const uid = signedIn(req);
    if (!await resolve(req, req.body.type, req.body.id, {})) throw badRequest('NOT_AVAILABLE', 'That isn’t available to save.');
    await db.query(`insert into saved_items (user_id, target_type, target_id) values ($1, $2, $3) on conflict do nothing`, [uid, req.body.type, req.body.id]);
    return { saved: true };
  });

  app.delete('/saved/:type/:id', async (req) => {
    const uid = signedIn(req);
    await db.query(`delete from saved_items where user_id = $1 and target_type = $2 and target_id = $3`, [uid, req.params.type, req.params.id]);
    return { saved: false };
  });

  // Moves bookmarks kept in this browser (before Stage 4) onto the account, once.
  app.post('/saved/import', { schema: { body: { type: 'object', required: ['postIds'], additionalProperties: false, properties: { postIds: { type: 'array', items: { type: 'string' }, maxItems: 200 } } } } }, async (req) => {
    const uid = signedIn(req);
    let added = 0;
    for (const id of new Set(req.body.postIds)) {
      if (!await resolve(req, 'post', id, {})) continue;
      const { rows } = await db.query(`insert into saved_items (user_id, target_type, target_id) values ($1, 'post', $2) on conflict do nothing returning 1`, [uid, id]);
      added += rows.length;
    }
    return { added };
  });
}
