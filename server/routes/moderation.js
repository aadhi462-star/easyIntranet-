// Reporting and moderation (redesign Stage 6, board S6Moderation; decisions D1–D4). MOD-* cases
// are referenced where handled.
//
// Who reviews what (D1): a report becomes a case for its community. A case about a member's
// content goes to Moderators, Admins and Owners; about a Moderator's or Admin's, to Owners only;
// about an Owner's, to Platform Admins (Stage 7). Nobody reviews a case about themselves.
//
// PGlite has one connection: inside db.tx only `t` is used; access checks and notifications run
// outside the transaction.
import { audit } from '../lib/audit.js';
import { access, atLeast } from '../lib/community.js';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { notify } from '../lib/notify.js';

const LOCK_MINUTES = 30;
const RESTORE_DAYS = 30;
const APPEAL_DAYS = 14;
const REPORTS_PER_HOUR = 20;
export const REASONS = ['spam', 'harassment', 'hate', 'misleading', 'off_topic', 'other'];
const ACTIONS = ['dismiss', 'remove', 'warn', 'restrict', 'remove_member', 'block'];
const lockFresh = (at) => !!at && new Date(at) > new Date(Date.now() - LOCK_MINUTES * 60e3);
const text = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

/** Lifts restrictions whose time is up (run each minute by lib/jobs.js). Safe to run twice. */
export async function liftExpiredRestrictions(db) {
  const { rows } = await db.query(`update sanctions set lifted_at = now() where kind = 'restrict' and lifted_at is null and until is not null and until <= now()
    returning community_id, user_id`);
  for (const r of rows) {
    // Only if no other restriction on them is still running.
    await db.query(`update memberships m set state = 'active', updated_at = now() where m.community_id = $1 and m.user_id = $2 and m.state = 'restricted'
      and not exists (select 1 from sanctions s where s.community_id = $1 and s.user_id = $2 and s.kind = 'restrict' and s.lifted_at is null)`, [r.community_id, r.user_id]);
  }
  return rows.length;
}

export default async function moderationRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const roleIn = async (communityId, userId) => (await db.query(`select role, state from memberships where community_id = $1 and user_id = $2`, [communityId, userId])).rows[0] ?? null;

  /** The reported thing: its community, who is responsible, and what it says now. */
  async function target(type, id, communityId = null) {
    if (type === 'post') {
      const { rows: [p] } = await db.query(`select id, community_id, author_id, type, body, status, deleted_at, removed_at from posts where id = $1`, [id]);
      return p && { communityId: p.community_id, subjectId: p.author_id, body: p.body, title: null, gone: !!p.deleted_at, removed: p.status === 'removed', link: `/post/${p.id}` };
    }
    if (type === 'comment') {
      const { rows: [c] } = await db.query(`select c.id, c.post_id, c.author_id, c.body, c.deleted_at, c.removed_at, p.community_id from comments c join posts p on p.id = c.post_id where c.id = $1`, [id]);
      return c && { communityId: c.community_id, subjectId: c.author_id, body: c.body, title: null, gone: !!c.deleted_at && !c.removed_at, removed: !!c.removed_at, link: `/post/${c.post_id}` };
    }
    if (type === 'event') {
      const { rows: [e] } = await db.query(`select id, community_id, host_id, title, description, deleted_at, removed_at from events where id = $1`, [id]);
      return e && { communityId: e.community_id, subjectId: e.host_id, title: e.title, body: e.description ?? '', gone: !!e.deleted_at && !e.removed_at, removed: !!e.removed_at, link: `/events/${e.id}` };
    }
    if (type === 'member') {
      const { rows: [u] } = await db.query(`select u.id, u.name, p.headline from users u left join profiles p on p.user_id = u.id where u.id = $1`, [id]);
      return u && communityId && { communityId, subjectId: u.id, title: u.name, body: u.headline ?? '', gone: false, removed: false, link: `/people/${u.id}` };
    }
    return null;
  }

  // D1: who reviews depends on the subject's role in the community at the time of the report.
  const audienceFor = (role) => (role === 'owner' ? 'platform' : ['admin', 'moderator'].includes(role) ? 'owners' : 'moderators');
  const canReview = (a, c, uid) => c.subject_id !== uid && (a.adminMode
    || (c.audience === 'moderators' && a.canModerate)
    || (c.audience === 'owners' && a.isOwner));
  // MOD-06 (Stage 7): a Platform Admin acting in Administrative Mode who holds a role in the
  // community, or took part (subject, reporter, the one who decided), sees the case but another
  // Platform Admin decides it.
  async function platformConflict(c, uid) {
    if (c.subject_id === uid || c.resolved_by === uid) return true;
    const { rows } = await db.query(`select 1 from reports where case_id = $1 and reporter_id = $2
      union all select 1 from memberships where community_id = $3 and user_id = $2 and state = 'active' and role in ('owner', 'admin', 'moderator') limit 1`, [c.id, uid, c.community_id]);
    return rows.length > 0;
  }
  const visibleAudiences = (a) => (a.adminMode ? ['moderators', 'owners', 'platform'] : a.isOwner ? ['moderators', 'owners'] : a.canModerate ? ['moderators'] : []);

  // ---- Reporting (any member or viewer) -------------------------------------------------------
  app.post('/reports', { schema: { body: { type: 'object', required: ['targetType', 'targetId', 'reason'], additionalProperties: false, properties: {
    targetType: { type: 'string', enum: ['post', 'comment', 'event', 'member'] }, targetId: { type: 'string' }, communityId: { type: 'string' },
    reason: { type: 'string', enum: REASONS }, note: { type: ['string', 'null'] } } } } }, async (req) => {
    const uid = signedIn(req);
    const { targetType, targetId, reason } = req.body;
    const note = text(req.body.note, 1000);
    if (reason === 'other' && !note) throw badRequest('NOTE_REQUIRED', 'Tell the moderators what’s wrong.', { field: 'note' });
    const t = await target(targetType, targetId, req.body.communityId);
    if (!t || t.gone) throw notFound('That isn’t available any more.');
    const a = await access(db, req, t.communityId, { audited: false });
    if (!a.canView) throw notFound('That isn’t available any more.');
    if (t.subjectId === uid) throw badRequest('OWN_CONTENT', 'You can’t report yourself.');
    if (targetType === 'member' && !['active', 'restricted'].includes((await roleIn(t.communityId, targetId))?.state)) throw notFound('That person isn’t in this community.');
    // A burst of reports from one person is slowed down, not stored (MOD-08).
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from reports where reporter_id = $1 and updated_at > now() - interval '1 hour'`, [uid]);
    if (n >= REPORTS_PER_HOUR) throw new HttpError(429, 'TOO_MANY_REPORTS', 'You’ve sent a lot of reports in the last hour. Try again later.');
    const subjectRole = (await roleIn(t.communityId, t.subjectId))?.role ?? 'member';
    const key = targetType === 'member' ? `${t.communityId}:${targetId}` : targetId;
    const out = await db.tx(async (q) => {
      // One open case per item (MOD-02); the snapshot is taken at the first report (MOD-11).
      await q.query(`insert into moderation_cases (id, community_id, target_type, target_id, subject_id, snapshot, audience) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (target_type, target_id) where status = 'open' do nothing`,
      [newId('case'), t.communityId, targetType, key, t.subjectId, JSON.stringify({ title: t.title, body: t.body, at: new Date().toISOString() }), audienceFor(subjectRole)]);
      const { rows: [c] } = await q.query(`select * from moderation_cases where target_type = $1 and target_id = $2 and status = 'open' for update`, [targetType, key]);
      const { rows: [r] } = await q.query(`insert into reports (id, case_id, reporter_id, reason, note) values ($1, $2, $3, $4, $5)
        on conflict (case_id, reporter_id) do update set reason = excluded.reason, note = excluded.note, updated_at = now() returning (xmax = 0) as fresh`, [newId('rep'), c.id, uid, reason, note]);
      const { rows: [u] } = await q.query(`update moderation_cases set report_count = (select count(*) from reports where case_id = $1), last_report_at = now() where id = $1 returning *`, [c.id]);
      if (r.fresh) await q.query(`insert into case_events (id, case_id, actor_id, action, detail) values ($1, $2, null, 'reported', $3)`, [newId('cev'), c.id, JSON.stringify({ reason })]);
      return { c: u, fresh: r.fresh };
    });
    if (out.c.report_count === 1 && out.fresh) {
      const roles = out.c.audience === 'owners' ? ['owner'] : ['owner', 'admin', 'moderator'];
      if (out.c.audience !== 'platform') {
        const { rows } = await db.query(`select user_id from memberships where community_id = $1 and state = 'active' and role = any($2) and user_id <> $3`, [t.communityId, roles, t.subjectId ?? '']);
        await notify(ctx, req, { to: rows.map((x) => x.user_id), type: 'report_new', communityId: t.communityId, targetType: 'case', targetId: out.c.id, dedupe: `case:${out.c.id}:new`, email: false });
      }
    }
    await audit(db, { actorId: uid, action: 'report.create', targetType: targetType, targetId, context: { caseId: out.c.id, reason }, ip: req.ip });
    return { reported: true, caseId: out.c.id };
  });

  // ---- The queue (reviewers) ------------------------------------------------------------------
  const caseRow = (c, uid) => ({
    id: c.id, targetType: c.target_type, targetId: c.target_type === 'member' ? c.target_id.split(':')[1] : c.target_id, audience: c.audience,
    status: c.status, decision: c.decision, reportCount: c.report_count, openedAt: c.opened_at, lastReportAt: c.last_report_at, resolvedAt: c.resolved_at,
    subject: c.subject_id ? { id: c.subject_id, name: c.subject_name ?? 'Deleted member' } : null, snapshot: c.snapshot,
    escalatedAt: c.escalated_at ?? null, escalationNote: c.escalation_note ?? null,
    lockedBy: c.status === 'open' && c.lock_by && lockFresh(c.lock_at) && c.lock_role ? { id: c.lock_by, name: c.lock_name, me: c.lock_by === uid } : null,
  });

  app.get('/communities/:id/cases', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    const audiences = visibleAudiences(a);
    if (!audiences.length) throw forbidden('Only the community’s moderators see its reports.', 'NOT_A_MODERATOR');
    const open = req.query.status !== 'resolved';
    const { rows } = await db.query(
      `select c.*, s.name as subject_name, l.name as lock_name, lm.role as lock_role,
              (select coalesce(json_object_agg(reason, n), '{}') from (select reason, count(*) as n from reports where case_id = c.id group by reason) x) as reasons
         from moderation_cases c left join users s on s.id = c.subject_id left join users l on l.id = c.lock_by
         left join memberships lm on lm.community_id = c.community_id and lm.user_id = c.lock_by and lm.state = 'active' and lm.role in ('owner', 'admin', 'moderator')
        where c.community_id = $1 and c.audience = any($2) and coalesce(c.subject_id, '') <> $3 and (($4 and c.status = 'open') or (not $4 and c.status <> 'open'))
        order by ${open ? 'c.report_count desc, c.opened_at asc' : 'c.resolved_at desc'} limit 100`, [a.community.id, audiences, uid, open]);
    return { cases: rows.map((c) => ({ ...caseRow(c, uid), reasons: c.reasons })) };
  });

  /** A case for a reviewer (everything) or for the person it's about (the decision only). */
  async function caseFor(req, id) {
    const uid = signedIn(req);
    const { rows: [c] } = await db.query(`select c.*, s.name as subject_name, l.name as lock_name, lm.role as lock_role from moderation_cases c
      left join users s on s.id = c.subject_id left join users l on l.id = c.lock_by
      left join memberships lm on lm.community_id = c.community_id and lm.user_id = c.lock_by and lm.state = 'active' and lm.role in ('owner', 'admin', 'moderator')
      where c.id = $1`, [id]);
    if (!c) throw notFound('That case doesn’t exist.');
    const a = await access(db, req, c.community_id, { audited: true }).catch(() => null);
    const reviewer = !!a && canReview(a, c, uid);
    if (!reviewer && !(c.subject_id === uid && c.status === 'actioned')) throw notFound('That case doesn’t exist.');
    return { c, a, uid, reviewer };
  }

  async function caseDetail(c, a, uid, reviewer) {
    const t = await target(c.target_type, c.target_type === 'member' ? c.target_id.split(':')[1] : c.target_id, c.community_id);
    const { rows: [co] } = await db.query(`select id, slug, name, accent from communities where id = $1`, [c.community_id]);
    const { rows: [appeal] } = await db.query(`select id, status, body, created_at, decided_at, decision_note from appeals where case_id = $1`, [c.id]);
    const base = { ...caseRow(c, uid), community: co, decisionReason: c.decision_reason, restoredAt: c.restored_at,
      now: t ? { title: t.title, body: t.body, gone: t.gone, removed: t.removed, link: t.link } : { gone: true },
      appeal: appeal ? { id: appeal.id, status: appeal.status, body: appeal.body, createdAt: appeal.created_at, decidedAt: appeal.decided_at, note: appeal.decision_note } : null };
    if (!reviewer) {
      const canAppeal = c.subject_id === uid && c.status === 'actioned' && c.decision !== 'dismiss' && !appeal && !c.restored_at
        && new Date(c.resolved_at) > new Date(Date.now() - APPEAL_DAYS * 864e5);
      return { ...base, reportCount: undefined, canAppeal, appealBy: canAppeal ? new Date(new Date(c.resolved_at).getTime() + APPEAL_DAYS * 864e5).toISOString() : null };
    }
    const [{ rows: reports }, { rows: history }, { rows: earlier }, member] = await Promise.all([
      // Reporters are numbered, never named, in the review (D2).
      db.query(`select reason, note, created_at from reports where case_id = $1 order by created_at`, [c.id]),
      db.query(`select e.action, e.detail, e.created_at, u.name as actor from case_events e left join users u on u.id = e.actor_id where e.case_id = $1 order by e.created_at`, [c.id]),
      db.query(`select kind, count(*)::int as n from sanctions where community_id = $1 and user_id = $2 and coalesce(case_id, '') <> $3 group by kind`, [c.community_id, c.subject_id, c.id]),
      c.subject_id ? roleIn(c.community_id, c.subject_id) : null,
    ]);
    return { ...base, reports: reports.map((r, i) => ({ n: i + 1, reason: r.reason, note: r.note, at: r.created_at })),
      history: history.map((h) => ({ action: h.action, detail: h.detail, at: h.created_at, actor: h.actor })),
      subjectRecord: { earlier: Object.fromEntries(earlier.map((e) => [e.kind, e.n])), state: member?.state ?? null, role: member?.role ?? null },
      canRestore: c.decision === 'remove' && !c.restored_at && new Date(c.resolved_at) > new Date(Date.now() - RESTORE_DAYS * 864e5) && !!t?.removed };
  }

  app.get('/cases/:id', async (req) => {
    const { c, a, uid, reviewer } = await caseFor(req, req.params.id);
    return { case: await caseDetail(c, a, uid, reviewer) };
  });

  // Opening a case to decide takes it for 30 minutes, like grading (MOD-04). A holder who lost
  // their role no longer counts (MOD-09).
  app.post('/cases/:id/claim', async (req) => {
    const { c, a, uid, reviewer } = await caseFor(req, req.params.id);
    if (!reviewer) throw notFound('That case doesn’t exist.');
    if (c.status !== 'open') throw conflict('ALREADY_DECIDED', 'Someone already decided this.');
    await db.tx(async (t) => {
      const { rows: [cur] } = await t.query(`select c.*, u.name as lock_name, lm.role as lock_role from moderation_cases c left join users u on u.id = c.lock_by
        left join memberships lm on lm.community_id = c.community_id and lm.user_id = c.lock_by and lm.state = 'active' and lm.role in ('owner', 'admin', 'moderator')
        where c.id = $1 for update of c`, [c.id]);
      if (cur.status !== 'open') throw conflict('ALREADY_DECIDED', 'Someone already decided this.');
      if (cur.lock_by && cur.lock_by !== uid && lockFresh(cur.lock_at) && cur.lock_role) throw conflict('LOCKED', `${cur.lock_name} is reviewing this.`, { by: cur.lock_name });
      await t.query(`update moderation_cases set lock_by = $2, lock_at = now() where id = $1`, [c.id, uid]);
    });
    const fresh = (await caseFor(req, c.id));
    return { case: await caseDetail(fresh.c, a, uid, true) };
  });
  app.delete('/cases/:id/claim', async (req) => {
    const uid = signedIn(req);
    await db.query(`update moderation_cases set lock_by = null, lock_at = null where id = $1 and lock_by = $2`, [req.params.id, uid]);
    return { ok: true };
  });

  // ---- Decisions (D3) -------------------------------------------------------------------------
  /** Applies a sanction to a membership inside a transaction. Returns the sanction row. */
  async function sanction(t, { communityId, userId, kind, reason, days, caseId, actorId }) {
    const until = kind === 'restrict' && days ? new Date(Date.now() + days * 864e5).toISOString() : null;
    if (kind === 'restrict') await t.query(`update memberships set state = 'restricted', updated_at = now() where community_id = $1 and user_id = $2 and state = 'active'`, [communityId, userId]);
    if (kind === 'remove') await t.query(`update memberships set state = 'removed', role = 'member', updated_at = now() where community_id = $1 and user_id = $2 and state in ('active', 'restricted')`, [communityId, userId]);
    if (kind === 'block') await t.query(`update memberships set state = 'blocked', role = 'member', updated_at = now() where community_id = $1 and user_id = $2`, [communityId, userId]);
    const { rows: [s] } = await t.query(`insert into sanctions (id, community_id, user_id, case_id, kind, reason, until, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [newId('snc'), communityId, userId, caseId, kind, reason, until, actorId]);
    return s;
  }

  /** Nobody acts on someone at or above their own role; the Owner is never sanctioned here. */
  async function checkRank(a, communityId, subjectId) {
    const m = await roleIn(communityId, subjectId);
    if (!m) return null;
    if (m.role === 'owner') throw forbidden('An Owner can’t be restricted or removed. Platform Admins handle reports about Owners.', 'OWNER_PROTECTED');
    if (!a.adminMode && atLeast(m.role, a.role)) throw forbidden('You can’t act on someone at or above your own role.', 'RANK');
    if (m.role === 'admin') {
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from memberships where community_id = $1 and state = 'active' and role in ('owner', 'admin')`, [communityId]);
      if (n <= 1) throw conflict('LAST_ADMIN', 'This community needs at least one admin.');
    }
    return m;
  }

  const removeContent = async (t, type, id, actorId, reason) => {
    if (type === 'post') await t.query(`update posts set status = 'removed', removed_by = $2, removed_reason = $3, removed_at = now(), pinned = false, version = version + 1 where id = $1 and status <> 'removed'`, [id, actorId, reason]);
    if (type === 'comment') await t.query(`update comments set deleted_at = coalesce(deleted_at, now()), removed_at = now(), removed_by = $2 where id = $1 and removed_at is null`, [id, actorId]);
    if (type === 'event') await t.query(`update events set deleted_at = coalesce(deleted_at, now()), removed_at = now(), removed_by = $2 where id = $1 and removed_at is null`, [id, actorId]);
  };
  const restoreContent = async (t, type, id) => {
    if (type === 'post') await t.query(`update posts set status = 'published', removed_at = null, removed_by = null, removed_reason = null, version = version + 1 where id = $1 and status = 'removed'`, [id]);
    if (type === 'comment') await t.query(`update comments set deleted_at = null, removed_at = null, removed_by = null where id = $1 and removed_at is not null`, [id]);
    if (type === 'event') await t.query(`update events set deleted_at = null, removed_at = null, removed_by = null where id = $1 and removed_at is not null`, [id]);
  };
  const event = (t, caseId, actorId, action, detail = {}) => t.query(`insert into case_events (id, case_id, actor_id, action, detail) values ($1, $2, $3, $4, $5)`, [newId('cev'), caseId, actorId, action, JSON.stringify(detail)]);

  app.post('/cases/:id/decide', { schema: { body: { type: 'object', required: ['action'], additionalProperties: false, properties: {
    action: { type: 'string', enum: ACTIONS }, reason: { type: ['string', 'null'] }, days: { type: ['integer', 'null'], enum: [1, 7, 30, null] }, alsoWarn: { type: 'boolean' } } } } }, async (req) => {
    const { c, a, uid, reviewer } = await caseFor(req, req.params.id);
    if (!reviewer) throw notFound('That case doesn’t exist.');
    if (a.adminMode && (c.audience === 'platform' || c.escalated_at) && await platformConflict(c, uid)) throw forbidden('You took part in this or hold a role in this community, so another Platform Admin decides it.', 'CONFLICTED');
    const { action } = req.body;
    const reason = text(req.body.reason, 500);
    if (action !== 'dismiss' && !reason) throw badRequest('REASON_REQUIRED', 'Give a reason; the person sees it.', { field: 'reason' });
    if (action === 'remove' && c.target_type === 'member') throw badRequest('INVALID_INPUT', 'A member can’t be removed as content. Use Remove from community.');
    if (['restrict', 'remove_member', 'block'].includes(action) || req.body.alsoWarn || action === 'warn') {
      if (!c.subject_id) throw conflict('NO_SUBJECT', 'The person’s account no longer exists.');
      if (!a.adminMode && !atLeast(a.role, 'moderator')) throw forbidden();
      await checkRank(a, c.community_id, c.subject_id);
    }
    const targetId = c.target_type === 'member' ? c.target_id.split(':')[1] : c.target_id;
    await db.tx(async (t) => {
      const { rows: [cur] } = await t.query(`select c.*, lm.role as lock_role from moderation_cases c
        left join memberships lm on lm.community_id = c.community_id and lm.user_id = c.lock_by and lm.state = 'active' and lm.role in ('owner', 'admin', 'moderator')
        where c.id = $1 for update of c`, [c.id]);
      // Someone else decided first, or holds it (MOD-04): nothing is applied twice.
      if (cur.status !== 'open') throw conflict('ALREADY_DECIDED', 'Someone already decided this. Reload to see their decision.');
      if (cur.lock_by && cur.lock_by !== uid && lockFresh(cur.lock_at) && cur.lock_role) throw conflict('LOCKED', 'Someone else is reviewing this.');
      if (action === 'remove') await removeContent(t, c.target_type, targetId, uid, reason);
      const kinds = { warn: 'warn', restrict: 'restrict', remove_member: 'remove', block: 'block' };
      if (kinds[action]) await sanction(t, { communityId: c.community_id, userId: c.subject_id, kind: kinds[action], reason, days: req.body.days ?? null, caseId: c.id, actorId: uid });
      if (req.body.alsoWarn && action !== 'warn' && action !== 'dismiss') await sanction(t, { communityId: c.community_id, userId: c.subject_id, kind: 'warn', reason, caseId: c.id, actorId: uid });
      await t.query(`update moderation_cases set status = $2, decision = $3, decision_reason = $4, resolved_at = now(), resolved_by = $5, lock_by = null, lock_at = null where id = $1`,
        [c.id, action === 'dismiss' ? 'dismissed' : 'actioned', action, reason, uid]);
      await event(t, c.id, uid, action, { reason, days: req.body.days ?? null, alsoWarn: !!req.body.alsoWarn });
    });
    await audit(db, { actorId: uid, action: `moderation.${action}`, targetType: c.target_type, targetId, context: { caseId: c.id, reason, adminMode: a.adminMode }, ip: req.ip });
    if (action !== 'dismiss') {
      await notify(ctx, req, { to: [c.subject_id], type: 'moderation_action', actorId: uid, communityId: c.community_id, targetType: 'case', targetId: c.id, dedupe: `case:${c.id}:decided` });
      const { rows } = await db.query(`select reporter_id from reports where case_id = $1 and reporter_id is not null`, [c.id]);
      await notify(ctx, req, { to: rows.map((r) => r.reporter_id), type: 'report_actioned', communityId: c.community_id, targetType: 'community', targetId: c.community_id, dedupe: `case:${c.id}:reporters`, email: false });
    }
    const fresh = await caseFor(req, c.id);
    return { case: await caseDetail(fresh.c, a, uid, true) };
  });

  // Removed content can come back for 30 days (D3, MOD-05).
  app.post('/cases/:id/restore', { schema: { body: { type: 'object', additionalProperties: false, properties: { note: { type: ['string', 'null'] } } } } }, async (req) => {
    const { c, a, uid, reviewer } = await caseFor(req, req.params.id);
    if (!reviewer) throw notFound('That case doesn’t exist.');
    const detail = await caseDetail(c, a, uid, true);
    if (!detail.canRestore) throw conflict('CANT_RESTORE', 'This can’t be restored: it wasn’t removed here, it was restored already, or 30 days have passed.');
    await db.tx(async (t) => {
      await restoreContent(t, c.target_type, c.target_id);
      await t.query(`update moderation_cases set restored_at = now() where id = $1`, [c.id]);
      await event(t, c.id, uid, 'restored', { note: text(req.body?.note, 500) });
    });
    await audit(db, { actorId: uid, action: 'moderation.restore', targetType: c.target_type, targetId: c.target_id, context: { caseId: c.id }, ip: req.ip });
    const fresh = await caseFor(req, c.id);
    return { case: await caseDetail(fresh.c, a, uid, true) };
  });

  // Stage 7 (D5): an Owner or Admin can hand a case to the platform, with a note. It leaves the
  // community's queue view of "open" only once the platform decides it.
  app.post('/cases/:id/escalate', { schema: { body: { type: 'object', required: ['note'], additionalProperties: false, properties: { note: { type: 'string' } } } } }, async (req) => {
    const { c, a, uid, reviewer } = await caseFor(req, req.params.id);
    if (!reviewer || a.adminMode || !a.canAdmin) throw forbidden('Owners and Admins can send a case to CommunityOne.', 'NOT_AN_ADMIN');
    if (c.status !== 'open') throw conflict('ALREADY_DECIDED', 'Someone already decided this.');
    const note = text(req.body.note, 1000);
    if (!note) throw badRequest('INVALID_INPUT', 'Say why the platform should decide this.', { field: 'note' });
    const { rows } = await db.query(`update moderation_cases set escalated_at = now(), escalated_by = $2, escalation_note = $3, lock_by = null, lock_at = null
      where id = $1 and status = 'open' and escalated_at is null returning id`, [c.id, uid, note]);
    if (!rows.length) throw conflict('ALREADY_ESCALATED', 'This case has already been sent to CommunityOne.');
    await db.query(`insert into case_events (id, case_id, actor_id, action, detail) values ($1, $2, $3, 'escalated', $4)`, [newId('cev'), c.id, uid, JSON.stringify({ note })]);
    await audit(db, { actorId: uid, action: 'case.escalate', targetType: 'case', targetId: c.id, context: { communityId: c.community_id }, ip: req.ip });
    const fresh = await caseFor(req, c.id);
    return { case: await caseDetail(fresh.c, a, uid, true) };
  });

  // ---- Appeals (D4, MOD-06) -------------------------------------------------------------------
  app.post('/cases/:id/appeal', { schema: { body: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: { type: 'string' } } } } }, async (req) => {
    const { c, a, uid } = await caseFor(req, req.params.id);
    const detail = await caseDetail(c, a, uid, false);
    if (!detail.canAppeal) throw conflict('CANT_APPEAL', 'This can’t be appealed: you’ve appealed already, it was more than 14 days ago, or it was undone.');
    const body = text(req.body.body, 2000);
    if (!body) throw badRequest('INVALID_INPUT', 'Say why the decision should change.', { field: 'body' });
    const { rows: [ap] } = await db.query(`insert into appeals (id, case_id, community_id, appellant_id, body) values ($1, $2, $3, $4, $5) on conflict (case_id, appellant_id) do nothing returning *`,
      [newId('apl'), c.id, c.community_id, uid, body]);
    if (!ap) throw conflict('CANT_APPEAL', 'You’ve already appealed this decision.');
    await db.query(`insert into case_events (id, case_id, actor_id, action) values ($1, $2, $3, 'appealed')`, [newId('cev'), c.id, uid]);
    const deciders = await appealDeciders(c);
    await notify(ctx, req, { to: deciders, type: 'appeal_new', actorId: uid, communityId: c.community_id, targetType: 'case', targetId: c.id, dedupe: `appeal:${ap.id}`, email: false });
    return { case: await caseDetail((await caseFor(req, c.id)).c, a, uid, false) };
  });

  /** Owners and Admins who didn't take the action and aren't its subject; Owners only for D1 "owners" cases. */
  async function appealDeciders(c) {
    const roles = c.audience === 'moderators' ? ['owner', 'admin'] : ['owner'];
    const { rows } = await db.query(`select m.user_id from memberships m join users u on u.id = m.user_id where m.community_id = $1 and m.state = 'active' and m.role = any($2)
      and u.status = 'active' and m.user_id <> coalesce($3, '') and m.user_id <> coalesce($4, '')`, [c.community_id, roles, c.resolved_by, c.subject_id]);
    return rows.map((r) => r.user_id);
  }

  app.get('/communities/:id/appeals', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only Owners and Admins decide appeals.', 'NOT_AN_ADMIN');
    const { rows } = await db.query(`select ap.*, c.audience, c.resolved_by, c.subject_id, c.decision, c.target_type, u.name as appellant_name, r.name as resolver_name from appeals ap
      join moderation_cases c on c.id = ap.case_id join users u on u.id = ap.appellant_id left join users r on r.id = c.resolved_by
      where ap.community_id = $1 and ap.status = 'open' order by ap.created_at`, [a.community.id]);
    const mine = [];
    for (const r of rows) {
      const deciders = await appealDeciders({ ...r, community_id: a.community.id });
      // Nobody in the community can decide it: it waits for Platform Admins (Stage 7).
      if (deciders.includes(uid) || a.adminMode) mine.push({ id: r.id, caseId: r.case_id, appellant: { id: r.appellant_id, name: r.appellant_name }, body: r.body, createdAt: r.created_at,
        decision: r.decision, targetType: r.target_type, decidedBy: r.resolver_name });
    }
    return { appeals: mine };
  });

  app.post('/appeals/:id/decide', { schema: { body: { type: 'object', required: ['outcome', 'note'], additionalProperties: false, properties: {
    outcome: { type: 'string', enum: ['upheld', 'overturned'] }, note: { type: 'string' } } } } }, async (req) => {
    const uid = signedIn(req);
    const { rows: [ap] } = await db.query(`select ap.*, c.audience, c.resolved_by, c.subject_id, c.target_type, c.target_id, c.decision, c.community_id from appeals ap join moderation_cases c on c.id = ap.case_id where ap.id = $1`, [req.params.id]);
    if (!ap) throw notFound('That appeal doesn’t exist.');
    const a = await access(db, req, ap.community_id);
    if (!a.adminMode && !(await appealDeciders(ap)).includes(uid)) throw forbidden('Someone who didn’t take the action decides the appeal.', 'CONFLICTED');
    if (a.adminMode && await platformConflict({ id: ap.case_id, community_id: ap.community_id, subject_id: ap.subject_id, resolved_by: ap.resolved_by }, uid)) {
      throw forbidden('You took part in this or hold a role in this community, so another Platform Admin decides it.', 'CONFLICTED');
    }
    const note = text(req.body.note, 1000);
    if (!note) throw badRequest('INVALID_INPUT', 'Add a note for both people.', { field: 'note' });
    await db.tx(async (t) => {
      const { rows: [cur] } = await t.query(`select status from appeals where id = $1 for update`, [ap.id]);
      if (cur.status !== 'open') throw conflict('ALREADY_DECIDED', 'This appeal has been decided.');
      await t.query(`update appeals set status = $2, decided_at = now(), decided_by = $3, decision_note = $4 where id = $1`, [ap.id, req.body.outcome, uid, note]);
      if (req.body.outcome === 'overturned') {
        // Undo what the case did: content back, sanctions from it lifted, membership restored.
        if (ap.decision === 'remove') {
          await restoreContent(t, ap.target_type, ap.target_id);
          await t.query(`update moderation_cases set restored_at = now() where id = $1`, [ap.case_id]);
        }
        const { rows: lifted } = await t.query(`update sanctions set lifted_at = now(), lifted_by = $2 where case_id = $1 and lifted_at is null and kind in ('restrict', 'remove', 'block') returning kind`, [ap.case_id, uid]);
        if (lifted.length) await t.query(`update memberships set state = 'active', updated_at = now() where community_id = $1 and user_id = $2 and state in ('restricted', 'removed', 'blocked')`, [ap.community_id, ap.subject_id]);
      }
      await t.query(`insert into case_events (id, case_id, actor_id, action, detail) values ($1, $2, $3, $4, $5)`, [newId('cev'), ap.case_id, uid, `appeal_${req.body.outcome}`, JSON.stringify({ note })]);
    });
    await audit(db, { actorId: uid, action: `appeal.${req.body.outcome}`, targetType: 'case', targetId: ap.case_id, context: { appealId: ap.id }, ip: req.ip });
    await notify(ctx, req, { to: [ap.appellant_id, ap.resolved_by].filter(Boolean), type: 'appeal_decided', actorId: uid, communityId: ap.community_id, targetType: 'case', targetId: ap.case_id, dedupe: `appeal:${ap.id}:decided` });
    return { ok: true, outcome: req.body.outcome };
  });

  // ---- Sanctions from the Members list (Manage → Members) ------------------------------------
  app.post('/communities/:id/members/:userId/sanction', { schema: { body: { type: 'object', required: ['kind', 'reason'], additionalProperties: false, properties: {
    kind: { type: 'string', enum: ['warn', 'restrict', 'remove', 'block'] }, reason: { type: 'string' }, days: { type: ['integer', 'null'], enum: [1, 7, 30, null] } } } } }, async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canModerate) throw forbidden();
    if (req.params.userId === uid) throw forbidden('You can’t act on yourself.', 'SELF_ACTION');
    // Removing and blocking are Admin decisions; Moderators warn and restrict (D3, D5).
    if (['remove', 'block'].includes(req.body.kind) && !a.canAdmin) throw forbidden('Only Admins and Owners remove or block members.');
    const m = await checkRank(a, a.community.id, req.params.userId);
    if (!m || !['active', 'restricted'].includes(m.state) && req.body.kind !== 'block') throw notFound('That person isn’t in this community.');
    const reason = text(req.body.reason, 500);
    if (!reason) throw badRequest('REASON_REQUIRED', 'Give a reason; the person sees it.', { field: 'reason' });
    const s = await db.tx((t) => sanction(t, { communityId: a.community.id, userId: req.params.userId, kind: req.body.kind, reason, days: req.body.days ?? null, caseId: null, actorId: uid }));
    await audit(db, { actorId: uid, action: `member.${req.body.kind}`, targetType: 'community', targetId: a.community.id, context: { userId: req.params.userId, reason, until: s.until, adminMode: a.adminMode }, ip: req.ip });
    await notify(ctx, req, { to: [req.params.userId], type: 'member_sanction', actorId: uid, communityId: a.community.id, targetType: 'community', targetId: a.community.id, dedupe: `sanction:${s.id}` });
    return { sanction: { id: s.id, kind: s.kind, until: s.until } };
  });

  app.post('/communities/:id/members/:userId/lift', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canModerate) throw forbidden();
    const m = await roleIn(a.community.id, req.params.userId);
    if (!m || m.state !== 'restricted' && !(a.canAdmin && ['removed', 'blocked'].includes(m.state))) throw conflict('NOTHING_TO_LIFT', 'There’s nothing to lift.');
    await db.tx(async (t) => {
      await t.query(`update sanctions set lifted_at = now(), lifted_by = $3 where community_id = $1 and user_id = $2 and lifted_at is null and kind in ('restrict', 'remove', 'block')`, [a.community.id, req.params.userId, uid]);
      // Removed people go back to "left" (they can ask again); restricted and blocked to active / left.
      await t.query(`update memberships set state = case when state = 'restricted' then 'active' else 'left' end, updated_at = now() where community_id = $1 and user_id = $2`, [a.community.id, req.params.userId]);
    });
    await audit(db, { actorId: uid, action: 'member.lift', targetType: 'community', targetId: a.community.id, context: { userId: req.params.userId, from: m.state }, ip: req.ip });
    return { ok: true };
  });

  /** A member's sanctions, newest first (for Members and the case's "History"). */
  app.get('/communities/:id/members/:userId/sanctions', async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canModerate) throw forbidden();
    const { rows } = await db.query(`select s.kind, s.reason, s.until, s.created_at, s.lifted_at, u.name as by from sanctions s left join users u on u.id = s.created_by
      where s.community_id = $1 and s.user_id = $2 order by s.created_at desc limit 50`, [a.community.id, req.params.userId]);
    return { sanctions: rows };
  });
}
