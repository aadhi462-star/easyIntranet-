// Community management (redesign Stage 6, boards S6Settings and S6Analytics): deletion requests
// (D6) and community analytics (D7). Moderation is in routes/moderation.js.
import { audit } from '../lib/audit.js';
import { access } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';

// D7: days run midnight to midnight in the platform's reporting time zone (ANL-04).
export const REPORTING_TZ = process.env.REPORTING_TZ || 'Asia/Kolkata';
const SMALL = 5; // groups under 5 people are shown as "fewer than 5" (ANL-08)
const small = (n) => (n > 0 && n < SMALL ? null : n);

/** A spreadsheet cell: quoted, and text that starts like a formula is kept as text (ANL-09). */
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export default async function manageRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };

  // ---- Deletion requests (D6, DEL-01–06) -------------------------------------------------------
  const requestOut = (r) => r && { id: r.id, status: r.status, reason: r.reason, createdAt: r.created_at, requestedBy: r.requested_by_name ?? null,
    decidedAt: r.decided_at, decisionNote: r.decision_note };
  const latest = async (communityId) => (await db.query(`select d.*, u.name as requested_by_name from deletion_requests d left join users u on u.id = d.requested_by
    where d.community_id = $1 order by d.created_at desc limit 1`, [communityId])).rows[0] ?? null;

  app.get('/communities/:id/deletion-request', async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden();
    return { request: requestOut(await latest(a.community.id)) };
  });

  // Owners only (D6). The name must be typed to confirm; one open request at a time (DEL-02).
  app.post('/communities/:id/deletion-request', { schema: { body: { type: 'object', required: ['reason', 'confirmName'], additionalProperties: false, properties: {
    reason: { type: 'string' }, confirmName: { type: 'string' } } } } }, async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.isOwner) throw forbidden('Only the community’s Owner can request deletion.', 'OWNER_ONLY');
    if (a.community.status === 'suspended') throw conflict('SUSPENDED', 'This community is suspended.');
    const reason = String(req.body.reason).trim().slice(0, 2000);
    if (!reason) throw badRequest('REASON_REQUIRED', 'Say why it should be deleted.', { field: 'reason' });
    if (req.body.confirmName.trim() !== a.community.name) throw badRequest('NAME_MISMATCH', 'Type the community’s name exactly to confirm.', { field: 'confirmName' });
    const { rows } = await db.query(`insert into deletion_requests (id, community_id, requested_by, reason) values ($1, $2, $3, $4)
      on conflict (community_id) where status = 'open' do nothing returning id`, [newId('del'), a.community.id, uid, reason]);
    if (!rows.length) throw conflict('ALREADY_REQUESTED', 'Deletion has already been requested. Withdraw that request to change it.');
    await audit(db, { actorId: uid, action: 'community.deletion_request', targetType: 'community', targetId: a.community.id, context: { requestId: rows[0].id }, ip: req.ip });
    return { request: requestOut(await latest(a.community.id)) };
  });

  // Withdraw while it's open (DEL-05); the record stays.
  app.delete('/communities/:id/deletion-request', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.isOwner) throw forbidden('Only the community’s Owner can withdraw the request.', 'OWNER_ONLY');
    const { rows } = await db.query(`update deletion_requests set status = 'withdrawn', decided_at = now(), decided_by = $2 where community_id = $1 and status = 'open' returning id`, [a.community.id, uid]);
    if (!rows.length) throw conflict('NOT_OPEN', 'There’s no open request to withdraw.');
    await audit(db, { actorId: uid, action: 'community.deletion_withdraw', targetType: 'community', targetId: a.community.id, context: { requestId: rows[0].id }, ip: req.ip });
    return { request: requestOut(await latest(a.community.id)) };
  });

  // ---- Analytics (D7, ANL-01–11) --------------------------------------------------------------
  // Complete days only: the period ends at the start of today in the reporting time zone, so a
  // figure never changes after it's shown (ANL-05). Owners and Admins only (ANL-06).
  async function analytics(req) {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw notFound('That page doesn’t exist.');
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const id = a.community.id;
    const { rows: [range] } = await db.query(`select (date_trunc('day', now() at time zone $1) at time zone $1) as until,
      (date_trunc('day', now() at time zone $1) at time zone $1) - make_interval(days => $2) as since`, [REPORTING_TZ, days]);
    const p = [id, range.since, range.until];
    // Who did something in the community, when: posts, replies, reactions, RSVPs, lessons.
    const ACTIVITY = `
      select author_id as user_id, published_at as at from posts where community_id = $1 and status = 'published' and deleted_at is null
      union all select c.author_id, c.created_at from comments c join posts p on p.id = c.post_id where p.community_id = $1 and c.deleted_at is null
      union all select r.user_id, r.created_at from reactions r join posts p on p.id = r.post_id where p.community_id = $1
      union all select v.user_id, v.updated_at from event_rsvps v join events e on e.id = v.event_id where e.community_id = $1 and v.status = 'going'
      union all select lp.user_id, lp.completed_at from lesson_progress lp join courses c on c.id = lp.course_id where c.community_id = $1`;
    const one = async (sql, params = p) => (await db.query(sql, params)).rows[0].n;
    const [members, joined, left, active, posts, replies, rsvps, weekly, top, learning, batches] = await Promise.all([
      one(`select count(*)::int as n from memberships m join users u on u.id = m.user_id where m.community_id = $1 and m.state in ('active', 'restricted') and u.status = 'active'`, [id]),
      one(`select count(*)::int as n from memberships where community_id = $1 and joined_at >= $2 and joined_at < $3 and state in ('active', 'restricted')`),
      one(`select count(*)::int as n from memberships where community_id = $1 and state in ('left', 'removed') and updated_at >= $2 and updated_at < $3`),
      one(`select count(distinct user_id)::int as n from (${ACTIVITY}) x where at >= $2 and at < $3`),
      one(`select count(*)::int as n from posts where community_id = $1 and status = 'published' and deleted_at is null and published_at >= $2 and published_at < $3`),
      one(`select count(*)::int as n from comments c join posts p on p.id = c.post_id where p.community_id = $1 and c.deleted_at is null and c.created_at >= $2 and c.created_at < $3`),
      one(`select count(*)::int as n from event_rsvps v join events e on e.id = v.event_id where e.community_id = $1 and v.status = 'going' and v.updated_at >= $2 and v.updated_at < $3`),
      // Active people per week, oldest first; empty weeks are 0, never missing (ANL-01).
      db.query(`with w as (select generate_series(0, ceil($4::numeric / 7)::int - 1) as i)
        select w.i, ($3::timestamptz - make_interval(days => (w.i + 1) * 7)) as start,
               (select count(distinct user_id)::int from (${ACTIVITY}) x where at >= greatest($2, $3::timestamptz - make_interval(days => (w.i + 1) * 7)) and at < $3::timestamptz - make_interval(days => w.i * 7)) as n
          from w order by w.i desc`, [...p, days]),
      db.query(`select p.id, left(p.body, 120) as title, count(c.id)::int as n from posts p join comments c on c.post_id = p.id and c.deleted_at is null and c.created_at >= $2 and c.created_at < $3
        where p.community_id = $1 and p.status = 'published' and p.deleted_at is null group by p.id order by n desc limit 5`, p),
      db.query(`select c.id, c.title, count(e.user_id) filter (where e.status = 'active')::int as enrolled, count(e.user_id) filter (where e.completed_at is not null)::int as completed
        from courses c left join enrollments e on e.course_id = c.id where c.community_id = $1 and c.status <> 'draft' group by c.id order by c.title`, [id]),
      db.query(`select ed.grad_year as batch, count(distinct m.user_id)::int as n from memberships m join users u on u.id = m.user_id
        left join education ed on ed.user_id = m.user_id and ed.is_primary where m.community_id = $1 and m.state in ('active', 'restricted') and u.status = 'active'
        group by ed.grad_year order by ed.grad_year nulls last`, [id]),
    ]);
    // Breakdowns under 5 people fold into "fewer than 5" (ANL-08).
    const bigBatches = batches.rows.filter((b) => b.batch != null && b.n >= SMALL);
    const smallBatches = batches.rows.filter((b) => b.batch != null && b.n < SMALL);
    return {
      a, days, since: range.since, until: range.until, timeZone: REPORTING_TZ, smallThreshold: SMALL,
      totals: { members, joined, left, active, posts, replies, rsvps },
      weekly: weekly.rows.map((w) => ({ start: w.start, active: w.n })),
      topDiscussions: top.rows.map((t) => ({ id: t.id, title: t.title, replies: t.n })),
      learning: learning.rows.map((c) => ({ id: c.id, title: c.title, enrolled: small(c.enrolled), completed: small(c.completed) })),
      batches: [...bigBatches.map((b) => ({ batch: String(b.batch), members: b.n })),
        ...(smallBatches.length ? [{ batch: 'Other batches', members: null, note: `fewer than ${SMALL} each` }] : []),
        ...batches.rows.filter((b) => b.batch == null).map((b) => ({ batch: 'Not given', members: small(b.n) }))],
    };
  }

  app.get('/communities/:id/analytics', async (req) => {
    const { a, ...out } = await analytics(req);
    void a;
    return out;
  });

  // One CSV for the period shown, named with its dates; the export is recorded (ANL-07, ANL-10).
  app.get('/communities/:id/analytics.csv', async (req, reply) => {
    const uid = signedIn(req);
    const r = await analytics(req);
    const d = (x) => new Date(x).toISOString().slice(0, 10);
    const rows = [['Community', r.a.community.name], ['From', d(r.since)], ['Until (not including)', d(r.until)], ['Time zone', r.timeZone], [],
      ['Measure', 'Value'], ...Object.entries(r.totals).map(([k, v]) => [k, v]), [],
      ['Week starting', 'Active people'], ...r.weekly.map((w) => [d(w.start), w.active]), [],
      ['Course', 'Enrolled', 'Completed'], ...r.learning.map((c) => [c.title, c.enrolled ?? `fewer than ${SMALL}`, c.completed ?? `fewer than ${SMALL}`]), [],
      ['Batch', 'Members'], ...r.batches.map((b) => [b.batch, b.members ?? b.note ?? `fewer than ${SMALL}`])];
    await audit(db, { actorId: uid, action: 'analytics.export', targetType: 'community', targetId: r.a.community.id, context: { days: r.days, since: r.since, until: r.until }, ip: req.ip });
    reply.header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${r.a.community.slug || r.a.community.id}-analytics-${d(r.since)}-to-${d(r.until)}.csv"`);
    return rows.map((row) => row.map(cell).join(',')).join('\r\n');
  });
}
