// Platform administration (redesign Stage 7, boards S7Communities, S7Moderation, S7Settings and
// S7Activity; decisions D1–D8 on S7Plan, approved 12 Nov 2026). Users, roles and settings
// writes are in routes/admin.js; this file adds communities and deletion, the moderation centre,
// announcements, the activity log and platform analytics.
//
// PGlite has one connection: inside db.tx only `t` is used, and permission checks run first.
import { audit } from '../lib/audit.js';
import { brandingUrls } from '../lib/community.js';
import { verifyPassword, newId } from '../lib/crypto.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { notify } from '../lib/notify.js';
import { authorize, can } from '../lib/permissions.js';
import { requireFreshPassword } from '../lib/session.js';
import { csvCell } from './admin.js';
import { REPORTING_TZ } from './manage.js';

export const RESTORE_DAYS = 30;
const REVIEW_MINUTES = 30;
const NO_MODERATOR_DAYS = 7;
const SMALL = 5;
const small = (n) => (n > 0 && n < SMALL ? null : n);
const text = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const fresh = (at, minutes) => !!at && Date.now() - new Date(at).getTime() < minutes * 60e3;

// ---- Permanent removal (D1, DEL-13) -------------------------------------------------------------
// Runs from lib/jobs.js. Each community moves through steps that can resume after a restart:
// files (the bulk of the bytes) in batches, then posts in batches, then the community row, whose
// foreign keys remove everything else. Certificates keep their own copy of the names, so they
// keep verifying (D1). What remains is a tombstone so old links say "removed" (DEL-12).
export async function purgeDeletedCommunities(db, { now = new Date(), batch = 200 } = {}) {
  const { rows } = await db.query(`select id, slug, name, purge_step from communities where status = 'deleted' and purge_after <= $1 order by purge_after limit 5`, [now]);
  let removed = 0;
  for (const c of rows) {
    if (!c.purge_step || c.purge_step === 'files') {
      await db.query(`update communities set purge_step = 'files' where id = $1`, [c.id]);
      let n;
      do { n = (await db.query(`delete from files where id in (select id from files where community_id = $1 limit $2) returning id`, [c.id, batch])).rows.length; } while (n > 0);
      await db.query(`update communities set purge_step = 'posts' where id = $1`, [c.id]);
    }
    let n;
    do { n = (await db.query(`delete from posts where id in (select id from posts where community_id = $1 limit $2) returning id`, [c.id, batch])).rows.length; } while (n > 0);
    await db.query(`update communities set purge_step = 'row' where id = $1`, [c.id]);
    await db.tx(async (t) => {
      await t.query(`insert into removed_communities (id, slug, name) values ($1, $2, $3) on conflict (id) do nothing`, [c.id, c.slug, c.name]);
      await t.query(`delete from communities where id = $1 and status = 'deleted'`, [c.id]);
    });
    await audit(db, { action: 'community.purged', targetType: 'community', targetId: c.id, context: { name: c.name } });
    removed += 1;
  }
  return removed;
}

export default async function platformRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };

  // D4: re-entering the password. Marks this session fresh for 10 minutes.
  app.post('/confirm-password', { schema: { body: { type: 'object', required: ['password'], additionalProperties: false, properties: { password: { type: 'string' } } } } }, async (req) => {
    const uid = signedIn(req);
    const { rows: [u] } = await db.query(`select password_hash from users where id = $1`, [uid]);
    if (!u || !(await verifyPassword(req.body.password, u.password_hash))) {
      await audit(db, { actorId: uid, action: 'auth.confirm_failed', targetType: 'user', targetId: uid, ip: req.ip });
      throw badRequest('WRONG_PASSWORD', 'That password isn’t right.', { field: 'password' });
    }
    await db.query(`update sessions set password_at = now() where id_hash = $1`, [req.sessionHash]);
    return { ok: true };
  });

  // ---- Communities (S7Communities) -------------------------------------------------------------
  const MEMBERS = `(select count(*)::int from memberships m join users u on u.id = m.user_id where m.community_id = c.id and m.state in ('active', 'restricted') and u.status = 'active')`;
  const ACTIVE_OWNERS = `(select count(*)::int from memberships m join users u on u.id = m.user_id where m.community_id = c.id and m.role = 'owner' and m.state = 'active' and u.status = 'active')`;
  const FILTERS = {
    all: `c.status <> 'deleted'`,
    requests: `exists (select 1 from deletion_requests d where d.community_id = c.id and d.status = 'open')`,
    no_owner: `c.status in ('active', 'archived') and ${ACTIVE_OWNERS} = 0`,
    suspended: `c.status = 'suspended'`,
    archived: `c.status = 'archived'`,
    deleted: `c.status = 'deleted'`,
  };

  app.get('/communities', async (req) => {
    authorize(req.user, 'communities.manage');
    const show = FILTERS[req.query.show] ? String(req.query.show) : 'all';
    const counts = Object.fromEntries(await Promise.all(Object.entries(FILTERS).map(async ([k, where]) =>
      [k, (await db.query(`select count(*)::int as n from communities c where c.merged_into is null and ${where}`)).rows[0].n])));
    const { rows } = await db.query(`select c.id, c.slug, c.name, c.accent, c.logo_file_id, c.cover_file_id, c.visibility, c.status, c.status_reason, c.deleted_at, c.purge_after, c.purge_step, c.created_at,
        ${MEMBERS} as member_count, ${ACTIVE_OWNERS} as owner_count,
        (select u.name from memberships m join users u on u.id = m.user_id where m.community_id = c.id and m.role = 'owner' and m.state = 'active' order by m.joined_at limit 1) as owner,
        (select json_build_object('id', d.id, 'createdAt', d.created_at, 'by', u.name, 'reviewBy', r.name, 'reviewAt', d.review_at, 'mine', d.review_by = $1)
          from deletion_requests d left join users u on u.id = d.requested_by left join users r on r.id = d.review_by where d.community_id = c.id and d.status = 'open') as request
      from communities c where c.merged_into is null and ${FILTERS[show]}
      order by ${show === 'requests' ? `(select created_at from deletion_requests d where d.community_id = c.id and d.status = 'open')` : 'member_count desc, c.name'}`, [req.user.id]);
    return {
      show, counts,
      communities: rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, accent: c.accent, ...brandingUrls(c), visibility: c.visibility, status: c.status, statusReason: c.status_reason,
        memberCount: c.member_count, owner: c.owner, ownerCount: c.owner_count, deletedAt: c.deleted_at, purgeAfter: c.purge_after, purging: !!c.purge_step,
        request: c.request ? { ...c.request, reviewBy: fresh(c.request.reviewAt, REVIEW_MINUTES) ? c.request.reviewBy : null, mine: c.request.mine && fresh(c.request.reviewAt, REVIEW_MINUTES) } : null })),
    };
  });

  /** What deleting a community affects (S7Communities "What deleting it affects", DEL-06–09). */
  async function impact(id) {
    const one = async (sql) => (await db.query(sql, [id])).rows[0];
    const [members, content, courses, certificates, open, files] = await Promise.all([
      one(`select count(*)::int as n from memberships m join users u on u.id = m.user_id where m.community_id = $1 and m.state in ('active', 'restricted') and u.status = 'active'`),
      one(`select (select count(*)::int from posts where community_id = $1 and deleted_at is null) as posts,
          (select count(*)::int from comments x join posts p on p.id = x.post_id where p.community_id = $1 and x.deleted_at is null) as replies,
          (select count(*)::int from events where community_id = $1 and deleted_at is null) as events,
          (select count(*)::int from resources where community_id = $1 and deleted_at is null) as resources`),
      one(`select count(distinct c.id)::int as n, count(e.user_id)::int as learners from courses c join enrollments e on e.course_id = c.id and e.status = 'active' and e.completed_at is null where c.community_id = $1`),
      one(`select count(*)::int as n from certificates where community_id = $1 and revoked_at is null`),
      one(`select (select count(*)::int from moderation_cases where community_id = $1 and status = 'open') as reports, (select count(*)::int from appeals where community_id = $1 and status = 'open') as appeals`),
      one(`select count(*)::int as n, coalesce(sum(size), 0)::bigint as bytes from files where community_id = $1 and deleted_at is null`),
    ]);
    return { members: members.n, ...content, courses: courses.n, learners: courses.learners, certificates: certificates.n,
      openReports: open.reports, openAppeals: open.appeals, files: files.n, fileBytes: Number(files.bytes) };
  }

  async function loadCommunity(id) {
    const { rows: [c] } = await db.query(`select c.*, ${MEMBERS} as member_count from communities c where c.id = $1 and c.merged_into is null`, [id]);
    if (!c) throw notFound('That community doesn’t exist.');
    return c;
  }

  // Each community's panel: owners and admins, counts, open reports and courses.
  app.get('/communities/:id', async (req) => {
    authorize(req.user, 'communities.manage');
    const c = await loadCommunity(req.params.id);
    const [{ rows: staff }, effect, { rows: [request] }] = await Promise.all([
      db.query(`select u.id, u.name, u.status, m.role, m.state from memberships m join users u on u.id = m.user_id
        where m.community_id = $1 and m.role in ('owner', 'admin') and m.state in ('active', 'restricted') order by (m.role = 'owner') desc, u.name`, [c.id]),
      impact(c.id),
      db.query(`select d.*, u.name as requested_by_name from deletion_requests d left join users u on u.id = d.requested_by where d.community_id = $1 order by d.created_at desc limit 1`, [c.id]),
    ]);
    return {
      community: { id: c.id, slug: c.slug, name: c.name, accent: c.accent, ...brandingUrls(c), visibility: c.visibility, status: c.status, statusReason: c.status_reason,
        memberCount: c.member_count, deletedAt: c.deleted_at, purgeAfter: c.purge_after, purging: !!c.purge_step },
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role, accountStatus: s.status })),
      impact: effect,
      request: request ? { id: request.id, status: request.status, reason: request.reason, createdAt: request.created_at, requestedBy: request.requested_by_name,
        decidedAt: request.decided_at, decisionNote: request.decision_note } : null,
    };
  });

  // Suspend: hidden from everyone but its own staff, who can read it but not change it.
  app.post('/communities/:id/suspend', { schema: { body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string' } } } } }, async (req) => {
    authorize(req.user, 'communities.manage');
    const c = await loadCommunity(req.params.id);
    const reason = text(req.body.reason, 1000);
    if (!reason) throw badRequest('REASON_REQUIRED', 'Give a reason; its staff see it.', { field: 'reason' });
    const { rows } = await db.query(`update communities set status = 'suspended', status_before = status, status_reason = $2, version = version + 1
      where id = $1 and status in ('active', 'archived') returning id`, [c.id, reason]);
    if (!rows.length) throw conflict('INVALID_STATE', 'Only an active or archived community can be suspended.');
    await audit(db, { actorId: req.user.id, action: 'community.suspend', targetType: 'community', targetId: c.id, context: { reason }, ip: req.ip });
    const staff = (await db.query(`select user_id from memberships where community_id = $1 and state = 'active' and role in ('owner', 'admin', 'moderator')`, [c.id])).rows.map((r) => r.user_id);
    await notify(ctx, req, { to: staff, type: 'community_suspended', actorId: req.user.id, communityId: c.id, targetType: 'community', targetId: c.id, dedupe: `suspend:${c.id}:${Date.now()}` });
    return { ok: true };
  });

  app.post('/communities/:id/unsuspend', async (req) => {
    authorize(req.user, 'communities.manage');
    const c = await loadCommunity(req.params.id);
    const { rows } = await db.query(`update communities set status = coalesce(status_before, 'active'), status_before = null, status_reason = null, version = version + 1
      where id = $1 and status = 'suspended' returning id`, [c.id]);
    if (!rows.length) throw conflict('INVALID_STATE', 'This community isn’t suspended.');
    await audit(db, { actorId: req.user.id, action: 'community.unsuspend', targetType: 'community', targetId: c.id, ip: req.ip });
    return { ok: true };
  });

  // COM-08: a community whose only Owner left or was suspended gets a new one, chosen from its
  // active members. A community has one Owner (memberships_one_owner), so the previous one, if
  // their membership row is still there, becomes an Admin. With an active Owner this is refused:
  // handing over ownership is the Owner's own decision (Manage → Members).
  app.post('/communities/:id/owner', { schema: { body: { type: 'object', required: ['userId'], additionalProperties: false, properties: { userId: { type: 'string' } } } } }, async (req) => {
    authorize(req.user, 'communities.manage');
    const c = await loadCommunity(req.params.id);
    if (c.status === 'deleted') throw conflict('INVALID_STATE', 'Restore the community first.');
    const { rows: [{ n }] } = await db.query(`select ${ACTIVE_OWNERS} as n from communities c where c.id = $1`, [c.id]);
    if (n > 0) throw conflict('HAS_OWNER', 'This community has an active Owner. They can hand over ownership themselves.');
    const promoted = await db.tx(async (t) => {
      const { rows: [m] } = await t.query(`select m.user_id from memberships m join users u on u.id = m.user_id
        where m.community_id = $1 and m.user_id = $2 and m.state = 'active' and u.status = 'active' for update of m`, [c.id, req.body.userId]);
      if (!m) return false;
      await t.query(`update memberships set role = 'admin', updated_at = now() where community_id = $1 and role = 'owner'`, [c.id]);
      await t.query(`update memberships set role = 'owner', updated_at = now() where community_id = $1 and user_id = $2`, [c.id, req.body.userId]);
      return true;
    });
    if (!promoted) throw conflict('NOT_A_MEMBER', 'Choose an active member of this community.');
    await audit(db, { actorId: req.user.id, action: 'community.owner_assign', targetType: 'community', targetId: c.id, context: { userId: req.body.userId }, ip: req.ip });
    await notify(ctx, req, { to: [req.body.userId], type: 'owner_assigned', actorId: req.user.id, communityId: c.id, targetType: 'community', targetId: c.id, dedupe: `owner:${c.id}:${req.body.userId}:${Date.now()}` });
    return { ok: true };
  });

  // Members to choose a new Owner from (search by name).
  app.get('/communities/:id/members', async (req) => {
    authorize(req.user, 'communities.manage');
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80);
    const { rows } = await db.query(`select u.id, u.name, m.role from memberships m join users u on u.id = m.user_id
      where m.community_id = $1 and m.state = 'active' and u.status = 'active' and ($2 = '' or lower(u.name) like '%' || $2 || '%') order by u.name limit 20`, [req.params.id, q]);
    return { members: rows };
  });

  // ---- Deleting (D1, D2) -----------------------------------------------------------------------
  /** The checks every deletion passes: typed name, a reason, nothing left undecided (DEL-09). */
  async function checkDeletable(c, body) {
    if (c.status === 'deleted') throw conflict('ALREADY_DELETED', 'This community has already been deleted.');
    const { rows: [merged] } = await db.query(`select 1 from communities where merged_into = $1 limit 1`, [c.id]);
    if (merged) throw conflict('HAS_MERGES', 'Other communities were merged into this one. Undo those merges first.');
    if (String(body.confirmName ?? '').trim() !== c.name) throw badRequest('NAME_MISMATCH', 'Type the community’s name exactly to confirm.', { field: 'confirmName' });
    const note = text(body.note, 1000);
    if (!note) throw badRequest('REASON_REQUIRED', 'Add a note; the Owners see it.', { field: 'note' });
    const effect = await impact(c.id);
    if (effect.openReports || effect.openAppeals) throw conflict('OPEN_CASES', 'Decide the open reports and appeals first.', { openReports: effect.openReports, openAppeals: effect.openAppeals });
    return note;
  }

  async function softDelete(req, c, note, requestId) {
    await db.tx(async (t) => {
      const { rows } = await t.query(`update communities set status = 'deleted', status_before = status, status_reason = $2, deleted_at = now(), deleted_by = $3,
        purge_after = now() + make_interval(days => ${RESTORE_DAYS}), purge_step = null, version = version + 1
        where id = $1 and status <> 'deleted' returning id`, [c.id, note, req.user.id]);
      if (!rows.length) throw conflict('ALREADY_DELETED', 'This community has already been deleted.');
      if (requestId) {
        const { rows: r } = await t.query(`update deletion_requests set status = 'approved', decided_at = now(), decided_by = $2, decision_note = $3, review_by = null where id = $1 and status = 'open' returning id`, [requestId, req.user.id, note]);
        if (!r.length) throw conflict('NOT_OPEN', 'This request was withdrawn or already decided.');
      } else {
        // D2: a direct deletion closes any open request with the same decision.
        await t.query(`update deletion_requests set status = 'approved', decided_at = now(), decided_by = $2, decision_note = $3 where community_id = $1 and status = 'open'`, [c.id, req.user.id, note]);
      }
    });
    await audit(db, { actorId: req.user.id, action: 'community.delete', targetType: 'community', targetId: c.id, context: { name: c.name, note, requestId: requestId ?? null, direct: !requestId }, ip: req.ip });
    // Every member is told; the line names the community only (DEL-10).
    const { rows: members } = await db.query(`select user_id from memberships where community_id = $1 and state in ('active', 'restricted')`, [c.id]);
    await notify(ctx, req, { to: members.map((m) => m.user_id), type: 'community_deleted', actorId: req.user.id, communityId: c.id, targetType: 'community', targetId: c.id, dedupe: `deleted:${c.id}:${Date.now()}` });
  }

  // Opening a request marks it as yours for 30 minutes (DEL-15).
  app.post('/deletion-requests/:id/review', async (req) => {
    authorize(req.user, 'communities.manage');
    const { rows: [d] } = await db.query(`select d.*, u.name as review_name from deletion_requests d left join users u on u.id = d.review_by where d.id = $1`, [req.params.id]);
    if (!d) throw notFound('That request doesn’t exist.');
    if (d.status !== 'open') throw conflict('NOT_OPEN', 'This request was withdrawn or already decided.');
    if (d.review_by && d.review_by !== req.user.id && fresh(d.review_at, REVIEW_MINUTES)) throw conflict('LOCKED', `${d.review_name} is reviewing this.`, { by: d.review_name });
    const { rows } = await db.query(`update deletion_requests set review_by = $2, review_at = now() where id = $1 and status = 'open'
      and (review_by is null or review_by = $2 or review_at < now() - make_interval(mins => ${REVIEW_MINUTES})) returning id`, [d.id, req.user.id]);
    if (!rows.length) throw conflict('LOCKED', 'Someone else just opened this request.');
    return { ok: true };
  });

  const loadRequest = async (req) => {
    authorize(req.user, 'communities.manage');
    const { rows: [d] } = await db.query(`select * from deletion_requests where id = $1`, [req.params.id]);
    if (!d) throw notFound('That request doesn’t exist.');
    if (d.status !== 'open') throw conflict('NOT_OPEN', 'This request was withdrawn or already decided.');
    if (d.review_by && d.review_by !== req.user.id && fresh(d.review_at, REVIEW_MINUTES)) throw conflict('LOCKED', 'Someone else is reviewing this request.');
    return d;
  };

  app.post('/deletion-requests/:id/approve', { schema: { body: { type: 'object', required: ['note', 'confirmName'], additionalProperties: false, properties: {
    note: { type: 'string' }, confirmName: { type: 'string' } } } } }, async (req) => {
    const d = await loadRequest(req);
    await requireFreshPassword(db, req);
    const c = await loadCommunity(d.community_id);
    const note = await checkDeletable(c, req.body);
    await softDelete(req, c, note, d.id);
    return { ok: true };
  });

  // Declined: the Owner gets the note and can ask again later (DEL-04).
  app.post('/deletion-requests/:id/decline', { schema: { body: { type: 'object', required: ['note'], additionalProperties: false, properties: { note: { type: 'string' } } } } }, async (req) => {
    const d = await loadRequest(req);
    const note = text(req.body.note, 1000);
    if (!note) throw badRequest('REASON_REQUIRED', 'Add a note; the Owner sees it.', { field: 'note' });
    const { rows } = await db.query(`update deletion_requests set status = 'declined', decided_at = now(), decided_by = $2, decision_note = $3, review_by = null where id = $1 and status = 'open' returning id`, [d.id, req.user.id, note]);
    if (!rows.length) throw conflict('NOT_OPEN', 'This request was withdrawn or already decided.');
    await audit(db, { actorId: req.user.id, action: 'community.deletion_decline', targetType: 'community', targetId: d.community_id, context: { requestId: d.id, note }, ip: req.ip });
    await notify(ctx, req, { to: [d.requested_by].filter(Boolean), type: 'deletion_declined', actorId: req.user.id, communityId: d.community_id, targetType: 'community', targetId: d.community_id, dedupe: `deldecl:${d.id}` });
    return { ok: true };
  });

  // D2: Platform Admins can delete a community that breaks platform rules, without a request.
  app.post('/communities/:id/delete', { schema: { body: { type: 'object', required: ['note', 'confirmName'], additionalProperties: false, properties: {
    note: { type: 'string' }, confirmName: { type: 'string' } } } } }, async (req) => {
    authorize(req.user, 'communities.manage');
    await requireFreshPassword(db, req);
    const c = await loadCommunity(req.params.id);
    const note = await checkDeletable(c, req.body);
    await softDelete(req, c, note, null);
    return { ok: true };
  });

  // Within 30 days everything comes back as it was, memberships included (DEL-14).
  app.post('/communities/:id/restore', async (req) => {
    authorize(req.user, 'communities.manage');
    const c = await loadCommunity(req.params.id);
    const { rows } = await db.query(`update communities set status = coalesce(status_before, 'active'), status_before = null, status_reason = null, deleted_at = null, deleted_by = null,
      purge_after = null, version = version + 1 where id = $1 and status = 'deleted' and purge_step is null and purge_after > now() returning id`, [c.id]);
    if (!rows.length) throw conflict('CANT_RESTORE', 'This community can’t be restored: it isn’t deleted, or its removal has started.');
    await audit(db, { actorId: req.user.id, action: 'community.restore', targetType: 'community', targetId: c.id, context: { name: c.name }, ip: req.ip });
    const { rows: members } = await db.query(`select user_id from memberships where community_id = $1 and state in ('active', 'restricted')`, [c.id]);
    await notify(ctx, req, { to: members.map((m) => m.user_id), type: 'community_restored', actorId: req.user.id, communityId: c.id, targetType: 'community', targetId: c.id, dedupe: `restored:${c.id}:${Date.now()}` });
    return { ok: true };
  });

  // ---- Moderation centre (D5, S7Moderation) ---------------------------------------------------
  // What reaches the platform: reports about Owners (audience 'platform'), cases a community
  // escalated, reports open 7 days where no Owner, Admin or Moderator has been active, and
  // appeals nobody in the community can decide. Acting is an Administrative Mode visit through
  // the Stage 6 case and appeal routes.
  const NO_MOD = `not exists (select 1 from memberships sm join users su on su.id = sm.user_id
      where sm.community_id = c.community_id and sm.state = 'active' and sm.role in ('owner', 'admin', 'moderator') and su.status = 'active'
        and exists (select 1 from sessions ss where ss.user_id = su.id and ss.last_seen_at > now() - make_interval(days => ${NO_MODERATOR_DAYS})))`;
  const CENTRE = `c.status = 'open' and (c.audience = 'platform' or c.escalated_at is not null
      or (c.opened_at < now() - make_interval(days => ${NO_MODERATOR_DAYS}) and ${NO_MOD}))`;

  async function orphanAppeals() {
    // Deciders are Owners/Admins (Owners only for cases about staff) who didn't act and aren't the subject.
    const { rows } = await db.query(`select ap.id, ap.case_id, ap.body, ap.created_at, ap.community_id, co.name as community_name, co.slug, co.accent, co.visibility,
        u.name as appellant_name, c.decision, c.target_type, c.decision_reason, c.resolved_at, r.name as resolver_name
      from appeals ap join moderation_cases c on c.id = ap.case_id join communities co on co.id = ap.community_id join users u on u.id = ap.appellant_id left join users r on r.id = c.resolved_by
      where ap.status = 'open' and co.status <> 'deleted' and not exists (select 1 from memberships m join users mu on mu.id = m.user_id
        where m.community_id = ap.community_id and m.state = 'active' and mu.status = 'active'
          and m.role = any(case when c.audience = 'moderators' then array['owner', 'admin'] else array['owner'] end)
          and m.user_id <> coalesce(c.resolved_by, '') and m.user_id <> coalesce(c.subject_id, ''))
      order by ap.created_at`);
    return rows;
  }

  app.get('/moderation', async (req) => {
    authorize(req.user, 'moderation.manage');
    const uid = req.user.id;
    const [{ rows: cases }, appeals, { rows: decided }] = await Promise.all([
      db.query(`select c.id, c.target_type, c.audience, c.report_count, c.opened_at, c.escalated_at, c.escalation_note, c.subject_id, c.snapshot,
          co.id as community_id, co.name as community_name, co.slug, co.accent, co.visibility, s.name as subject_name,
          (select coalesce(json_object_agg(reason, n), '{}') from (select reason, count(*) as n from reports where case_id = c.id group by reason) x) as reasons,
          (${NO_MOD}) as no_moderator,
          -- MOD-06: a Platform Admin who holds a role there or took part sees it, but another decides.
          (c.subject_id = $1 or exists (select 1 from reports r where r.case_id = c.id and r.reporter_id = $1)
            or exists (select 1 from memberships m where m.community_id = c.community_id and m.user_id = $1 and m.state = 'active' and m.role in ('owner', 'admin', 'moderator'))) as conflicted
        from moderation_cases c join communities co on co.id = c.community_id left join users s on s.id = c.subject_id
        where ${CENTRE} and co.status <> 'deleted' order by c.opened_at`, [uid]),
      orphanAppeals(),
      // Decided here: cases that reached the platform, newest first.
      db.query(`select c.id as case_id, c.decision as action, c.resolved_at as created_at, u.name as actor, co.name as community_name from moderation_cases c
        join communities co on co.id = c.community_id left join users u on u.id = c.resolved_by
        where c.status <> 'open' and (c.audience = 'platform' or c.escalated_at is not null) order by c.resolved_at desc limit 30`),
    ]);
    const community = (r) => ({ id: r.community_id, name: r.community_name, slug: r.slug, accent: r.accent, visibility: r.visibility });
    const why = (c) => (c.audience === 'platform' ? 'owner' : c.escalated_at ? 'escalated' : 'no_moderator');
    return {
      cases: cases.map((c) => ({ id: c.id, why: why(c), targetType: c.target_type, reportCount: c.report_count, openedAt: c.opened_at, reasons: c.reasons,
        escalatedAt: c.escalated_at, escalationNote: c.escalation_note, subject: c.subject_id ? { id: c.subject_id, name: c.subject_name ?? 'Deleted member' } : null,
        excerpt: String(c.snapshot?.title || c.snapshot?.body || '').slice(0, 140), community: community(c), conflicted: c.conflicted })),
      appeals: appeals.map((a) => ({ id: a.id, caseId: a.case_id, body: a.body, createdAt: a.created_at, appellant: a.appellant_name, decision: a.decision,
        decisionReason: a.decision_reason, decidedBy: a.resolver_name, targetType: a.target_type, community: community(a) })),
      decided: decided.map((d) => ({ action: d.action, at: d.created_at, caseId: d.case_id, actor: d.actor, community: d.community_name })),
    };
  });

  // What's waiting, for the Administration menu and Overview (each count only for staff whose
  // role grants it).
  app.get('/waiting', async (req) => {
    if (!req.user) throw unauthorized();
    const out = {};
    if (can(req.user, 'users.approve')) out.pendingAccounts = (await db.query(`select count(*)::int as n from users where status = 'pending_approval'`)).rows[0].n;
    if (can(req.user, 'communities.manage')) out.deletionRequests = (await db.query(`select count(*)::int as n from deletion_requests d join communities c on c.id = d.community_id where d.status = 'open' and c.status <> 'deleted'`)).rows[0].n;
    if (can(req.user, 'moderation.manage')) {
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from moderation_cases c join communities co on co.id = c.community_id where ${CENTRE} and co.status <> 'deleted'`);
      out.moderationCentre = n + (await orphanAppeals()).length;
    }
    return { waiting: out };
  });

  // Owners (MOD-09) get a reminder on day 3 before a report moves here on day 7: done by the
  // job runner (`remindStaleReports`).

  // ---- Settings sections (S7Settings) ---------------------------------------------------------
  // Read in one call: registration, communities, files, and the feature switches (D2).
  app.get('/settings', async (req) => {
    authorize(req.user, 'settings.platform');
    const { rows } = await db.query(`select s.key, s.value, s.version, s.updated_at, u.name as updated_by from platform_settings s left join users u on u.id = s.updated_by
      where s.key in ('registration', 'communities', 'files')`);
    const { rows: flags } = await db.query(`select f.key, f.enabled, f.description, f.updated_at, u.name as updated_by from feature_flags f left join users u on u.id = f.updated_by order by f.key`);
    return {
      settings: Object.fromEntries(rows.map((r) => [r.key, { ...r.value, _version: r.version, updatedAt: r.updated_at, updatedBy: r.updated_by }])),
      features: flags.map((f) => ({ key: f.key, enabled: f.enabled, description: f.description, updatedAt: f.updated_at, updatedBy: f.updated_by })),
    };
  });

  // D8/SET-02: turning a module off hides it and keeps its data. Smart Assist isn't built, so
  // it can't be turned on.
  app.put('/features/:key', { schema: { body: { type: 'object', required: ['enabled'], additionalProperties: false, properties: { enabled: { type: 'boolean' } } } } }, async (req) => {
    authorize(req.user, 'settings.platform');
    if (req.params.key === 'module.assist' && req.body.enabled) throw conflict('NOT_BUILT', 'Smart Assist isn’t built yet.');
    const { rows } = await db.query(`update feature_flags set enabled = $2, updated_by = $3, updated_at = now() where key = $1 returning key, enabled`, [req.params.key, req.body.enabled, req.user.id]);
    if (!rows.length) throw notFound('That feature doesn’t exist.');
    await audit(db, { actorId: req.user.id, action: 'feature.update', targetType: 'feature', targetId: req.params.key, context: { enabled: req.body.enabled }, ip: req.ip });
    return { feature: rows[0] };
  });

  // Who holds Super Admin and Platform Admin (Roles and permissions).
  app.get('/roles', async (req) => {
    authorize(req.user, 'users.view');
    const { rows } = await db.query(`select r.role, r.granted_at, u.id, u.name, u.status from platform_roles r join users u on u.id = r.user_id order by r.role, u.name`);
    return { holders: rows.map((r) => ({ role: r.role, grantedAt: r.granted_at, user: { id: r.id, name: r.name, status: r.status } })) };
  });

  // ---- Announcements (D7) ----------------------------------------------------------------------
  const announcementOut = (a) => a && ({ id: a.id, message: a.message, link: a.link, audience: a.audience, communityIds: a.community_ids, endsAt: a.ends_at,
    createdAt: a.created_at, endedAt: a.ended_at, createdBy: a.created_by_name ?? null, dismissals: a.dismissals ?? undefined });

  app.get('/announcements', async (req) => {
    authorize(req.user, 'announcements.manage');
    const { rows } = await db.query(`select a.*, u.name as created_by_name, (select count(*)::int from announcement_dismissals d where d.announcement_id = a.id) as dismissals
      from announcements a left join users u on u.id = a.created_by order by a.created_at desc limit 20`);
    return { announcements: rows.map(announcementOut) };
  });

  // One at a time: publishing replaces the current one.
  app.post('/announcements', { schema: { body: { type: 'object', required: ['message'], additionalProperties: false, properties: {
    message: { type: 'string' }, link: { type: ['string', 'null'] }, audience: { type: 'string', enum: ['all', 'communities'] },
    communityIds: { type: 'array', items: { type: 'string' }, maxItems: 50 }, endsAt: { type: ['string', 'null'] } } } } }, async (req) => {
    authorize(req.user, 'announcements.manage');
    const message = text(req.body.message, 1000);
    if (!message) throw badRequest('INVALID_INPUT', 'Write the announcement.', { field: 'message' });
    if (message.length > 280) throw badRequest('TOO_LONG', 'Keep it to 280 characters.', { field: 'message' });
    // Links stay inside CommunityOne: an app address like /events/… or #/events/….
    const link = text(req.body.link, 300);
    if (link && !/^#?\/[^/\\]/.test(link)) throw badRequest('INVALID_LINK', 'Link to a page in CommunityOne, like /events/…', { field: 'link' });
    const audience = req.body.audience ?? 'all';
    const ids = [...new Set(req.body.communityIds ?? [])];
    if (audience === 'communities') {
      if (!ids.length) throw badRequest('INVALID_INPUT', 'Choose at least one community.', { field: 'communityIds' });
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from communities where id = any($1) and status <> 'deleted' and merged_into is null`, [ids]);
      if (n !== ids.length) throw badRequest('INVALID_INPUT', 'One of those communities doesn’t exist.', { field: 'communityIds' });
    }
    const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) throw badRequest('INVALID_INPUT', 'Choose an end date in the future.', { field: 'endsAt' });
    const id = newId('ann');
    await db.tx(async (t) => {
      await t.query(`update announcements set ended_at = now() where ended_at is null`);
      await t.query(`insert into announcements (id, message, link, audience, community_ids, ends_at, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, message, link ? link.replace(/^#/, '') : null, audience, audience === 'communities' ? ids : [], endsAt, req.user.id]);
    });
    await audit(db, { actorId: req.user.id, action: 'announcement.publish', targetType: 'announcement', targetId: id, context: { audience, communities: ids.length, endsAt }, ip: req.ip });
    const { rows: [a] } = await db.query(`select * from announcements where id = $1`, [id]);
    return { announcement: announcementOut(a) };
  });

  app.post('/announcements/:id/end', async (req) => {
    authorize(req.user, 'announcements.manage');
    const { rows } = await db.query(`update announcements set ended_at = now() where id = $1 and ended_at is null returning id`, [req.params.id]);
    if (!rows.length) throw conflict('NOT_LIVE', 'This announcement has already ended.');
    await audit(db, { actorId: req.user.id, action: 'announcement.end', targetType: 'announcement', targetId: req.params.id, ip: req.ip });
    return { ok: true };
  });

  // ---- Activity log (S7Activity, PER-10) ------------------------------------------------------
  // Entries can't be edited or deleted from the app; there is no route that does.
  const CATEGORIES = {
    admin_mode: ['admin_mode.access'],
    roles: ['role.grant', 'role.revoke', 'user.suspend', 'user.reactivate', 'user.sessions_revoke', 'user.approve', 'user.decline'],
    moderation: ['moderation.%', 'appeal.%', 'member.%', 'report.create', 'case.escalate'],
    settings: ['settings.%', 'feature.update'],
    deletions: ['community.delete', 'community.restore', 'community.purged', 'community.deletion_%'],
    exports: ['%.export'],
  };
  function auditWhere(req) {
    const params = [];
    const where = ['true'];
    const add = (sql, v) => { params.push(v); where.push(sql.replaceAll('?', `$${params.length}`)); };
    const who = String(req.query.who ?? '').trim().toLowerCase().slice(0, 80);
    if (who) add(`(lower(u.name) like '%' || ? || '%' or (? = 'system' and a.actor_id is null))`, who);
    if (req.query.community) add(`(a.target_id = ? or a.context->>'communityId' = ?)`, String(req.query.community));
    if (req.query.from) add(`a.at >= ?::date`, String(req.query.from));
    if (req.query.to) add(`a.at < ?::date + 1`, String(req.query.to));
    const cat = CATEGORIES[req.query.category];
    if (cat) add(`a.action like any(?::text[])`, cat);
    return { sql: where.join(' and '), params };
  }
  const AUDIT_SELECT = `select a.id, a.at, a.action, a.target_type, a.target_id, a.context, u.name as actor_name, co.name as community_name, co.slug as community_slug, tu.name as target_name
    from audit_log a left join users u on u.id = a.actor_id left join users tu on a.target_type = 'user' and tu.id = a.target_id
    left join communities co on co.id = case when a.target_type = 'community' then a.target_id else a.context->>'communityId' end`;
  const entryOut = (r) => ({ id: Number(r.id), at: r.at, action: r.action, targetType: r.target_type, targetId: r.target_id, actor: r.actor_name ?? null,
    context: r.context, community: r.community_name ? { name: r.community_name, slug: r.community_slug } : null, targetName: r.target_name ?? null });

  app.get('/activity', async (req) => {
    authorize(req.user, 'audit.view');
    const { sql, params } = auditWhere(req);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const before = Number(req.query.before) || null;
    const { rows } = await db.query(`${AUDIT_SELECT} where ${sql} ${before ? `and a.id < ${before}` : ''} order by a.id desc limit ${limit + 1}`, params);
    return { entries: rows.slice(0, limit).map(entryOut), more: rows.length > limit };
  });

  // D4 + D6: needs the password again, and the export is itself an entry with the filters used.
  app.get('/activity.csv', async (req, reply) => {
    authorize(req.user, 'audit.export');
    await requireFreshPassword(db, req);
    const { sql, params } = auditWhere(req);
    const { rows } = await db.query(`${AUDIT_SELECT} where ${sql} order by a.id desc limit 50000`, params);
    const filters = Object.fromEntries(['who', 'community', 'from', 'to', 'category'].filter((k) => req.query[k]).map((k) => [k, String(req.query[k])]));
    await audit(db, { actorId: req.user.id, action: 'audit.export', targetType: 'platform', context: { filters, rows: rows.length }, ip: req.ip });
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="communityone-activity-${iso(new Date())}.csv"`);
    const head = ['When (UTC)', 'Who', 'Action', 'Target type', 'Target', 'Community', 'Context'];
    return [head, ...rows.map((r) => [new Date(r.at).toISOString(), r.actor_name ?? 'System', r.action, r.target_type, r.target_id, r.community_name, JSON.stringify(r.context)])]
      .map((row) => row.map(csvCell).join(',')).join('\r\n');
  });

  // ---- Platform analytics (S7Activity) --------------------------------------------------------
  // Same rules as Stage 6: complete days in the reporting time zone; under 5 shows as "fewer
  // than 5"; people are counted once however many communities they're in (ANL-02); deleted
  // accounts' past activity counts without a name (ANL-03).
  async function platformAnalytics(req) {
    authorize(req.user, 'analytics.platform');
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const { rows: [range] } = await db.query(`select (date_trunc('day', now() at time zone $1) at time zone $1) as until,
      (date_trunc('day', now() at time zone $1) at time zone $1) - make_interval(days => $2) as since`, [REPORTING_TZ, days]);
    const p = [range.since, range.until];
    const ACTIVITY = `
      select p.author_id as user_id, p.community_id, p.published_at as at from posts p where p.status = 'published' and p.deleted_at is null
      union all select c.author_id, p.community_id, c.created_at from comments c join posts p on p.id = c.post_id where c.deleted_at is null
      union all select r.user_id, p.community_id, r.created_at from reactions r join posts p on p.id = r.post_id
      union all select v.user_id, e.community_id, v.updated_at from event_rsvps v join events e on e.id = v.event_id where v.status = 'going'
      union all select lp.user_id, co.community_id, lp.completed_at from lesson_progress lp join courses co on co.id = lp.course_id`;
    const LIVE = `c.merged_into is null and c.status not in ('deleted')`;
    const one = async (sql, params = p) => (await db.query(sql, params)).rows[0];
    const [people, memberships, active, communities, learning, perCommunity] = await Promise.all([
      one(`select count(*)::int as n from users where status = 'active'`, []),
      one(`select count(*)::int as n from memberships m join users u on u.id = m.user_id join communities c on c.id = m.community_id
        where m.state in ('active', 'restricted') and u.status = 'active' and ${LIVE}`, []),
      one(`select count(distinct x.user_id)::int as n from (${ACTIVITY}) x where x.at >= $1 and x.at < $2`),
      one(`select count(*)::int as n, count(*) filter (where exists (select 1 from (${ACTIVITY}) x where x.community_id = c.id and x.at >= $1 and x.at < $2))::int as active
        from communities c where ${LIVE}`),
      one(`select (select count(*)::int from enrollments where completed_at >= $1 and completed_at < $2) as completions,
          (select count(*)::int from certificates where issued_at >= $1 and issued_at < $2 and revoked_at is null) as certificates`),
      db.query(`select c.id, c.name, c.slug, c.visibility, c.accent, c.logo_file_id, c.cover_file_id,
          (select count(*)::int from memberships m join users u on u.id = m.user_id where m.community_id = c.id and m.state in ('active', 'restricted') and u.status = 'active') as members,
          (select count(distinct x.user_id)::int from (${ACTIVITY}) x where x.community_id = c.id and x.at >= $1 and x.at < $2) as active,
          (select count(*)::int from posts where community_id = c.id and status = 'published' and deleted_at is null and published_at >= $1 and published_at < $2) as posts,
          (select count(*)::int from moderation_cases where community_id = c.id and status = 'open') as open_reports
        from communities c where ${LIVE} order by members desc, c.name`, p),
    ]);
    return {
      days, since: range.since, until: range.until, timeZone: REPORTING_TZ, smallThreshold: SMALL,
      totals: { people: people.n, memberships: memberships.n, activePeople: small(active.n), communities: communities.n, activeCommunities: communities.active,
        completions: small(learning.completions), certificates: small(learning.certificates) },
      communities: perCommunity.rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, visibility: c.visibility, accent: c.accent, ...brandingUrls(c),
        members: small(c.members), active: small(c.active), posts: c.posts, openReports: c.open_reports })),
    };
  }

  app.get('/analytics', async (req) => platformAnalytics(req));

  app.get('/analytics.csv', async (req, reply) => {
    authorize(req.user, 'analytics.export');
    const r = await platformAnalytics(req);
    await audit(db, { actorId: req.user.id, action: 'analytics.export', targetType: 'platform', context: { days: r.days, since: r.since, until: r.until }, ip: req.ip });
    const f = (v) => v ?? `fewer than ${SMALL}`;
    const rows = [['From', iso(r.since)], ['Until (not including)', iso(r.until)], ['Time zone', r.timeZone], [],
      ['Measure', 'Value'], ...Object.entries(r.totals).map(([k, v]) => [k, f(v)]), [],
      ['Community', 'Members', 'Active people', 'Posts', 'Open reports'], ...r.communities.map((c) => [c.name, f(c.members), f(c.active), c.posts, c.openReports])];
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="communityone-analytics-${iso(r.since)}-to-${iso(r.until)}.csv"`);
    return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  });
}

// ---- For everyone: the current announcement on Home (D7) ---------------------------------------
export async function announcementRoutes(app, { ctx }) {
  const { db } = ctx;
  // Which modules are switched on (v2 brief). Anyone may read it: it says nothing private, and
  // the server enforces each switch on its own routes.
  app.get('/features', async () => {
    const { rows } = await db.query(`select key, enabled from feature_flags order by key`);
    return { features: Object.fromEntries(rows.map((r) => [r.key, r.enabled])) };
  });
  app.get('/announcements/current', async (req) => {
    if (!req.user) throw unauthorized();
    const { rows: [a] } = await db.query(`select a.id, a.message, a.link from announcements a
      where a.ended_at is null and (a.ends_at is null or a.ends_at > now())
        and (a.audience = 'all' or exists (select 1 from memberships m where m.user_id = $1 and m.state in ('active', 'restricted') and m.community_id = any(a.community_ids)))
        and not exists (select 1 from announcement_dismissals d where d.announcement_id = a.id and d.user_id = $1)
      order by a.created_at desc limit 1`, [req.user.id]);
    return { announcement: a ?? null };
  });

  app.post('/announcements/:id/dismiss', async (req) => {
    if (!req.user) throw unauthorized();
    await db.query(`insert into announcement_dismissals (announcement_id, user_id) select id, $2 from announcements where id = $1 on conflict do nothing`, [req.params.id, req.user.id]);
    return { ok: true };
  });
}

// ---- Day-3 reminder to Owners (MOD-09) ----------------------------------------------------------
export async function remindStaleReports(ctx) {
  const { db } = ctx;
  const { rows } = await db.query(`select c.id, c.community_id from moderation_cases c join communities co on co.id = c.community_id
    where c.status = 'open' and c.audience <> 'platform' and c.escalated_at is null and co.status = 'active'
      and c.opened_at < now() - interval '3 days' and c.opened_at > now() - interval '7 days'`);
  let sent = 0;
  for (const c of rows) {
    const { rows: owners } = await db.query(`select user_id from memberships where community_id = $1 and role = 'owner' and state = 'active'`, [c.community_id]);
    sent += (await notify(ctx, null, { to: owners.map((o) => o.user_id), type: 'report_new', communityId: c.community_id, targetType: 'case', targetId: c.id, dedupe: `case:${c.id}:day3`, email: true })).length;
  }
  return sent;
}

