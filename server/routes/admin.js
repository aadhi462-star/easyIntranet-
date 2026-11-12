// Platform administration (Phase 1): users, approvals, suspension, platform roles, settings, audit.
// Every route authorises on the server; staff roles only reach what their role grants (PER-16).
import { audit } from '../lib/audit.js';
import { brandingUrls } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { authorize, can, canAssignRole, PLATFORM_ROLES } from '../lib/permissions.js';
import { requireFreshPassword, revokeAllSessions } from '../lib/session.js';
import { CRITICAL_SETTINGS, getSetting, updateSetting } from '../lib/settings.js';
import { publicUser } from './auth.js';

const CRITICAL_ROLE_SET = new Set(['super_admin', 'platform_admin']);
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
/** A spreadsheet cell: quoted, and text that starts like a formula is kept as text (ANL-09). */
export const csvCell = (v) => {
  let x = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
  return `"${x.replace(/"/g, '""')}"`;
};

export default async function adminRoutes(app, { ctx }) {
  const { db } = ctx;
  const loadUser = async (id) => {
    const { rows } = await db.query(`select u.*, coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
      from users u left join platform_roles r on r.user_id = u.id where u.id = $1 group by u.id`, [id]);
    if (!rows[0]) throw notFound('That account doesn’t exist.');
    return rows[0];
  };
  const isSuper = (u) => u.roles.includes('super_admin');

  // Users (Stage 7, board S7Users): search, status and role filters, 25 per page. "Restricted"
  // means restricted in at least one community: set by its moderators, shown here so nothing is
  // missed. Emails are for staff who can view users.
  const USER_FILTER = `($1 = '' or u.email_norm like '%' || $1 || '%' or lower(u.name) like '%' || $1 || '%')
      and ($2::text is null or ($2 = 'restricted' and exists (select 1 from memberships rm where rm.user_id = u.id and rm.state = 'restricted'))
           or ($2 = 'pending' and u.status in ('pending_approval', 'unverified')) or u.status = $2)
      and ($3::text is null or ($3 = 'none' and not exists (select 1 from platform_roles pr where pr.user_id = u.id))
           or exists (select 1 from platform_roles pr where pr.user_id = u.id and pr.role = $3))`;
  const userFilters = (req) => [String(req.query.q ?? '').trim().toLowerCase().slice(0, 100), req.query.status ? String(req.query.status) : null, req.query.role ? String(req.query.role) : null];
  const USER_COLUMNS = `u.*, coalesce((select array_agg(role) from platform_roles where user_id = u.id), '{}') as roles,
      (select count(*)::int from memberships m join communities c on c.id = m.community_id where m.user_id = u.id and m.state in ('active', 'restricted') and c.merged_into is null and c.status <> 'deleted') as community_count,
      (select max(last_seen_at) from sessions where user_id = u.id) as last_active`;
  const userRow = (u) => ({ ...publicUser(u, u.roles), createdAt: u.created_at, statusReason: u.status_reason, communityCount: u.community_count, lastActive: u.last_active });

  app.get('/users', async (req) => {
    authorize(req.user, 'users.view');
    const limit = Math.min(Number(req.query.limit) || 25, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [{ rows }, { rows: [{ total }] }, { rows: counts }] = await Promise.all([
      db.query(`select ${USER_COLUMNS} from users u where ${USER_FILTER} order by u.created_at desc limit $4 offset $5`, [...userFilters(req), limit, offset]),
      db.query(`select count(*)::int as total from users u where ${USER_FILTER}`, userFilters(req)),
      db.query(`select 'all' as k, count(*)::int as n from users where status <> 'deleted'
        union all select 'pending', count(*)::int from users where status in ('pending_approval', 'unverified')
        union all select 'suspended', count(*)::int from users where status = 'suspended'
        union all select 'deactivated', count(*)::int from users where status = 'deactivated'
        union all select 'restricted', count(distinct user_id)::int from memberships where state = 'restricted'`),
    ]);
    return { users: rows.map(userRow), total, counts: Object.fromEntries(counts.map((c) => [c.k, c.n])) };
  });

  // One person's panel: their communities with role and state (and any restriction), sign-in
  // and sessions, and reports about them.
  app.get('/users/:id', async (req) => {
    authorize(req.user, 'users.view');
    const { rows: [u] } = await db.query(`select ${USER_COLUMNS} from users u where u.id = $1`, [req.params.id]);
    if (!u) throw notFound('That account doesn’t exist.');
    const [{ rows: communities }, { rows: [sess] }, { rows: [reports] }] = await Promise.all([
      db.query(`select c.id, c.slug, c.name, c.accent, c.logo_file_id, c.cover_file_id, c.visibility, m.role, m.state,
          (select json_build_object('until', s.until, 'by', b.name) from sanctions s left join users b on b.id = s.created_by
            where s.community_id = c.id and s.user_id = m.user_id and s.kind = 'restrict' and s.lifted_at is null order by s.created_at desc limit 1) as restriction
        from memberships m join communities c on c.id = m.community_id
        where m.user_id = $1 and m.state in ('active', 'restricted', 'pending') and c.merged_into is null and c.status <> 'deleted' order by (m.role = 'member'), c.name`, [u.id]),
      db.query(`select count(*)::int as active, max(last_seen_at) as last from sessions where user_id = $1 and revoked_at is null and expires_at > now()`, [u.id]),
      db.query(`select count(*)::int as n, count(distinct community_id)::int as communities from moderation_cases where subject_id = $1`, [u.id]),
    ]);
    return { user: { ...userRow(u), emailConfirmed: !!u.email_verified_at },
      communities: communities.map((c) => ({ id: c.id, slug: c.slug, name: c.name, accent: c.accent, ...brandingUrls(c), visibility: c.visibility, role: c.role, state: c.state, restriction: c.restriction })),
      sessions: { active: sess.active, last: sess.last }, reports: { count: reports.n, communities: reports.communities } };
  });

  // Sign out everywhere (S7Users): every session of theirs ends now.
  app.post('/users/:id/sessions/revoke', async (req) => {
    authorize(req.user, 'users.suspend');
    const target = await loadUser(req.params.id);
    if (isSuper(target) && !req.user.roles.includes('super_admin')) throw forbidden('Only a Super Admin can sign out a Super Admin.');
    const res = await revokeAllSessions(db, target.id, target.id === req.user.id ? { except: req.sessionHash } : {});
    await audit(db, { actorId: req.user.id, action: 'user.sessions_revoke', targetType: 'user', targetId: target.id, context: { count: res.rowCount ?? res.affectedRows ?? null }, ip: req.ip });
    return { ok: true };
  });

  // Users CSV (D6): Platform Admins only; emails only when asked for; every export is logged.
  app.get('/users.csv', async (req, reply) => {
    authorize(req.user, 'users.export');
    const withEmail = req.query.email === '1';
    const { rows } = await db.query(`select ${USER_COLUMNS} from users u where ${USER_FILTER} order by u.created_at desc limit 10000`, userFilters(req));
    const [q, status, role] = userFilters(req);
    await audit(db, { actorId: req.user.id, action: 'users.export', targetType: 'platform', context: { q, status, role, email: withEmail, rows: rows.length }, ip: req.ip });
    const head = ['Name', ...(withEmail ? ['Email'] : []), 'Status', 'Platform roles', 'Communities', 'Joined', 'Last active'];
    const lines = rows.map((u) => [u.name, ...(withEmail ? [u.email] : []), u.status, u.roles.join(' '), u.community_count, iso(u.created_at), iso(u.last_active)]);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="communityone-users-${iso(new Date())}.csv"`);
    return [head, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
  });

  // Suspension ends every session at once (REG-13, USR-06). Staff can't suspend themselves,
  // and only a Super Admin can suspend a Super Admin.
  app.post('/users/:id/suspend', async (req) => {
    authorize(req.user, 'users.suspend');
    const target = await loadUser(req.params.id);
    if (target.id === req.user.id) throw badRequest('SELF_ACTION', 'You can’t suspend your own account.');
    if (isSuper(target) && !req.user.roles.includes('super_admin')) throw forbidden('Only a Super Admin can suspend a Super Admin.');
    if (target.status === 'deleted') throw conflict('INVALID_STATE', 'Deleted accounts can’t be suspended.');
    const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
    if (!reason) throw badRequest('REASON_REQUIRED', 'Give a reason for the suspension.');
    await db.query(`update users set status = 'suspended', status_reason = $2, updated_at = now(), version = version + 1 where id = $1`, [target.id, reason]);
    await revokeAllSessions(db, target.id);
    await audit(db, { actorId: req.user.id, action: 'user.suspend', targetType: 'user', targetId: target.id, context: { reason }, ip: req.ip });
    // D3: they're told why. A failed email stays in the outbox; the suspension stands.
    try { await ctx.mailer?.send(target.email, 'account_suspended', { name: target.name, reason }, { req }); } catch { /* recorded in the outbox */ }
    return { ok: true };
  });

  app.post('/users/:id/reactivate', async (req) => {
    authorize(req.user, 'users.suspend');
    const target = await loadUser(req.params.id);
    if (target.status !== 'suspended') throw conflict('INVALID_STATE', 'Only suspended accounts can be reactivated here.');
    await db.query(`update users set status = 'active', status_reason = null, updated_at = now(), version = version + 1 where id = $1`, [target.id]);
    await audit(db, { actorId: req.user.id, action: 'user.reactivate', targetType: 'user', targetId: target.id, ip: req.ip });
    const origin = ctx.appOrigin || `${req.protocol}://${req.headers.host}`;
    try { await ctx.mailer?.send(target.email, 'account_reactivated', { name: target.name, link: `${origin}/#/login` }, { req }); } catch { /* recorded in the outbox */ }
    return { ok: true };
  });

  app.post('/users/:id/approve', async (req) => {
    authorize(req.user, 'users.approve');
    // Conditional update: approving twice, or after a decline, is a clean no-op (MEM-03/04 pattern).
    const { rows } = await db.query(`update users set status = 'active', updated_at = now(), version = version + 1 where id = $1 and status = 'pending_approval' returning id`, [req.params.id]);
    if (!rows.length) throw conflict('INVALID_STATE', 'This account isn’t waiting for approval any more.');
    await audit(db, { actorId: req.user.id, action: 'user.approve', targetType: 'user', targetId: req.params.id, ip: req.ip });
    return { ok: true };
  });

  app.post('/users/:id/decline', async (req) => {
    authorize(req.user, 'users.approve');
    const { rows } = await db.query(`update users set status = 'deleted', status_reason = 'declined', email = 'declined+' || id || '@invalid.communityone', updated_at = now()
      where id = $1 and status = 'pending_approval' returning id`, [req.params.id]);
    if (!rows.length) throw conflict('INVALID_STATE', 'This account isn’t waiting for approval any more.');
    await audit(db, { actorId: req.user.id, action: 'user.decline', targetType: 'user', targetId: req.params.id, ip: req.ip });
    return { ok: true };
  });

  // Granting/revoking platform roles. Platform Admin and Super Admin need Super Admin (prompt §9);
  // nobody can leave the platform without a Super Admin.
  app.post('/users/:id/roles', {
    schema: { body: { type: 'object', required: ['role', 'grant'], additionalProperties: false, properties: { role: { type: 'string', enum: PLATFORM_ROLES }, grant: { type: 'boolean' } } } },
  }, async (req) => {
    if (!req.user) throw forbidden();
    const { role, grant } = req.body;
    if (!canAssignRole(req.user, role)) throw forbidden('Your role can’t assign that platform role.');
    // PER-02: nobody changes their own platform role. D4: Super Admin and Platform Admin need
    // the password entered in the last 10 minutes.
    if (req.params.id === req.user.id) throw badRequest('SELF_ACTION', 'You can’t change your own platform role.');
    if (CRITICAL_ROLE_SET.has(role)) await requireFreshPassword(db, req);
    const target = await loadUser(req.params.id);
    if (target.status !== 'active') throw conflict('INVALID_STATE', 'Roles can only be given to active accounts.');
    if (grant) {
      await db.query(`insert into platform_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing`, [target.id, role, req.user.id]);
    } else {
      if (role === 'super_admin') {
        const n = (await db.query(`select count(*)::int as n from platform_roles where role = 'super_admin'`)).rows[0].n;
        if (n <= 1 && target.roles.includes('super_admin')) throw conflict('LAST_SUPER_ADMIN', 'The platform needs at least one Super Admin.');
      }
      await db.query(`delete from platform_roles where user_id = $1 and role = $2`, [target.id, role]);
      // Losing a role takes effect at once: their sessions end (PER-12).
      if (target.roles.includes(role)) await revokeAllSessions(db, target.id);
    }
    await audit(db, { actorId: req.user.id, action: grant ? 'role.grant' : 'role.revoke', targetType: 'user', targetId: target.id, context: { role }, ip: req.ip });
    return { ok: true };
  });

  app.get('/settings/:key', async (req) => {
    authorize(req.user, 'settings.platform');
    const value = await getSetting(db, req.params.key);
    if (!value) throw notFound('That setting doesn’t exist.');
    return { key: req.params.key, value };
  });

  app.put('/settings/:key', {
    schema: { body: { type: 'object', required: ['version', 'value'], properties: { version: { type: 'integer' }, value: { type: 'object' } } } },
  }, async (req) => {
    const { key } = req.params;
    authorize(req.user, 'settings.platform');
    if (CRITICAL_SETTINGS.has(key) && !req.user.roles.includes('super_admin')) {
      await audit(db, { actorId: req.user.id, action: 'settings.denied', targetType: 'setting', targetId: key, ip: req.ip });
      throw forbidden('Only a Super Admin can change security settings.');
    }
    const value = await updateSetting(db, key, req.body.value, { version: req.body.version, actorId: req.user.id });
    await audit(db, { actorId: req.user.id, action: 'settings.update', targetType: 'setting', targetId: key, context: { patch: req.body.value }, ip: req.ip });
    return { key, value };
  });

  // Platform Admin overview (refined designs, board R1Admin): live totals, what's waiting, recent
  // activity and every community. Merged communities (R4) aren't counted or listed. Each part is
  // only returned to staff whose role grants it.
  app.get('/overview', async (req) => {
    authorize(req.user, 'analytics.platform');
    const [users, communities, events, posts, list] = await Promise.all([
      db.query(`select status, count(*)::int as n from users group by status`),
      db.query(`select visibility, status, count(*)::int as n from communities where merged_into is null group by visibility, status`),
      db.query(`select count(*)::int as n from events e join communities c on c.id = e.community_id where e.deleted_at is null and c.merged_into is null`),
      db.query(`select count(*)::int as n from posts p join communities c on c.id = p.community_id where p.status = 'published' and p.deleted_at is null and c.merged_into is null`),
      db.query(`select c.id, c.slug, c.name, c.accent, c.logo_file_id, c.cover_file_id, c.visibility, c.status, c.created_at,
          (select count(*)::int from memberships m join users u on u.id = m.user_id
            where m.community_id = c.id and m.state in ('active', 'restricted') and u.status = 'active') as member_count,
          (select u.name from memberships m join users u on u.id = m.user_id where m.community_id = c.id and m.role = 'owner' and m.state = 'active' limit 1) as owner,
          exists (select 1 from memberships m where m.community_id = c.id and m.user_id = $1 and m.state in ('active', 'restricted')) as is_member
        from communities c where c.merged_into is null order by member_count desc, c.name`, [req.user.id]),
    ]);
    const byStatus = Object.fromEntries(users.rows.map((r) => [r.status, r.n]));
    const vis = { public: 0, private: 0, closed: 0 };
    let archived = 0; let suspended = 0;
    for (const r of communities.rows) { vis[r.visibility] += r.n; if (r.status === 'archived') archived += r.n; if (r.status === 'suspended') suspended += r.n; }
    const out = {
      totals: {
        accounts: { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus },
        communities: { total: vis.public + vis.private + vis.closed, ...vis, archived, suspended },
        events: events.rows[0].n,
        posts: posts.rows[0].n,
      },
      communities: list.rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, accent: c.accent, ...brandingUrls(c), visibility: c.visibility, status: c.status, memberCount: c.member_count, owner: c.owner,
        // Whether its page opens for you without Administrative Mode (Closed ones are members only).
        canOpen: c.status !== 'suspended' && (c.visibility !== 'closed' || c.is_member) })),
    };
    // Accounts waiting for a CommunityOne administrator's approval (status pending_approval).
    if (can(req.user, 'users.approve')) out.pendingAccounts = byStatus.pending_approval ?? 0;
    if (can(req.user, 'audit.view')) {
      out.activity = (await db.query(`select a.id, a.action, a.target_type, a.target_id, a.at, u.name as actor_name
          from audit_log a left join users u on u.id = a.actor_id order by a.at desc, a.id desc limit 6`)).rows
        .map((r) => ({ id: r.id, action: r.action, targetType: r.target_type, targetId: r.target_id, at: r.at, actor: r.actor_name }));
    }
    return out;
  });

  app.get('/audit', async (req) => {
    authorize(req.user, 'audit.view');
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await db.query(
      `select a.*, u.name as actor_name from audit_log a left join users u on u.id = a.actor_id
        where ($1::text is null or a.target_id = $1) order by a.at desc, a.id desc limit $2`, [req.query.targetId ?? null, limit]);
    return { entries: rows };
  });

  app.get('/me/permissions', async (req) => {
    if (!req.user) throw forbidden();
    const actions = ['users.view', 'users.manage', 'users.suspend', 'users.approve', 'users.export', 'settings.platform', 'audit.view', 'audit.export', 'analytics.platform', 'analytics.export', 'roles.assign.critical', 'communities.manage', 'moderation.manage', 'announcements.manage', 'health.view', 'templates.manage', 'institutions.manage'];
    return { roles: req.user.roles, can: Object.fromEntries(actions.map((a) => [a, can(req.user, a)])) };
  });
}
