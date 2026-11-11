// Platform administration (Phase 1): users, approvals, suspension, platform roles, settings, audit.
// Every route authorises on the server; staff roles only reach what their role grants (PER-16).
import { audit } from '../lib/audit.js';
import { joinDefaultCommunity } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { authorize, can, canAssignRole, PLATFORM_ROLES } from '../lib/permissions.js';
import { revokeAllSessions } from '../lib/session.js';
import { CRITICAL_SETTINGS, getSetting, updateSetting } from '../lib/settings.js';
import { publicUser } from './auth.js';

export default async function adminRoutes(app, { ctx }) {
  const { db } = ctx;
  const loadUser = async (id) => {
    const { rows } = await db.query(`select u.*, coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
      from users u left join platform_roles r on r.user_id = u.id where u.id = $1 group by u.id`, [id]);
    if (!rows[0]) throw notFound('That account doesn’t exist.');
    return rows[0];
  };
  const isSuper = (u) => u.roles.includes('super_admin');

  app.get('/users', async (req) => {
    authorize(req.user, 'users.view');
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const status = req.query.status ? String(req.query.status) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { rows } = await db.query(
      `select u.*, coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
         from users u left join platform_roles r on r.user_id = u.id
        where ($1 = '' or u.email_norm like '%' || $1 || '%' or lower(u.name) like '%' || $1 || '%')
          and ($2::text is null or u.status = $2)
        group by u.id order by u.created_at desc limit $3 offset $4`, [q, status, limit, offset]);
    return { users: rows.map((u) => ({ ...publicUser(u, u.roles), createdAt: u.created_at, statusReason: u.status_reason })) };
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
    return { ok: true };
  });

  app.post('/users/:id/reactivate', async (req) => {
    authorize(req.user, 'users.suspend');
    const target = await loadUser(req.params.id);
    if (target.status !== 'suspended') throw conflict('INVALID_STATE', 'Only suspended accounts can be reactivated here.');
    await db.query(`update users set status = 'active', status_reason = null, updated_at = now(), version = version + 1 where id = $1`, [target.id]);
    await audit(db, { actorId: req.user.id, action: 'user.reactivate', targetType: 'user', targetId: target.id, ip: req.ip });
    return { ok: true };
  });

  app.post('/users/:id/approve', async (req) => {
    authorize(req.user, 'users.approve');
    // Conditional update: approving twice, or after a decline, is a clean no-op (MEM-03/04 pattern).
    const { rows } = await db.query(`update users set status = 'active', updated_at = now(), version = version + 1 where id = $1 and status = 'pending_approval' returning id`, [req.params.id]);
    if (!rows.length) throw conflict('INVALID_STATE', 'This account isn’t waiting for approval any more.');
    await joinDefaultCommunity(db, req.params.id);
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
    const actions = ['users.view', 'users.manage', 'users.suspend', 'users.approve', 'settings.platform', 'audit.view', 'analytics.platform', 'roles.assign.critical'];
    return { roles: req.user.roles, can: Object.fromEntries(actions.map((a) => [a, can(req.user, a)])) };
  });
}
