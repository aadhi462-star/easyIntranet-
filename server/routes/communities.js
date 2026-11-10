// Communities and memberships (Phase 1 community foundation). MEM-*, VIS-*, PER-* cases are
// referenced where handled.
import { audit } from '../lib/audit.js';
import { access, atLeast, publicCommunity, requireView } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';

export default async function communityRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const countMembers = `(select count(*)::int from memberships mm where mm.community_id = c.id and mm.state in ('active', 'restricted'))`;

  // Discovery: Public and Private communities, plus Closed ones you belong to (VIS-04: closed
  // communities never appear for anyone else). Member counts never include admin-mode visits.
  app.get('/communities', async (req) => {
    const uid = signedIn(req);
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80);
    const { rows } = await db.query(
      `select c.*, m.role, m.state as member_state, ${countMembers} as member_count
         from communities c left join memberships m on m.community_id = c.id and m.user_id = $1
        where c.status = 'active'
          and (c.visibility <> 'closed' or m.state in ('active', 'restricted'))
          and coalesce(m.state, '') <> 'blocked'
          and ($2 = '' or lower(c.name || ' ' || coalesce(c.description, '') || ' ' || coalesce(c.category, '')) like '%' || $2 || '%')
        order by (m.state = 'active') desc nulls last, c.name`, [uid, q]);
    return { communities: rows.map((c) => publicCommunity(c, { memberCount: c.member_count, membership: c.member_state ? { state: c.member_state, role: c.role } : null })) };
  });

  app.get('/communities/:id', async (req) => {
    const a = await access(db, req, req.params.id);
    const n = (await db.query(`select count(*)::int as n from memberships where community_id = $1 and state in ('active', 'restricted')`, [a.community.id])).rows[0].n;
    return {
      community: publicCommunity(a.community, { memberCount: n, settings: a.canAdmin ? a.community.settings : undefined }),
      membership: a.state ? { state: a.state, role: a.role } : null,
      permissions: { canView: a.canView, canParticipate: a.canParticipate, canComment: a.canComment, canModerate: a.canModerate, canAdmin: a.canAdmin },
      adminMode: a.adminMode,
    };
  });

  app.get('/communities/:id/members', async (req) => {
    const a = requireView(await access(db, req, req.params.id));
    const { rows } = await db.query(
      `select m.user_id as id, u.name, m.role, m.joined_at from memberships m join users u on u.id = m.user_id
        where m.community_id = $1 and m.state = 'active' and u.status = 'active' order by m.role = 'owner' desc, u.name`, [a.community.id]);
    return { members: rows };
  });

  // Join: Public → member at once; Private → a request; Closed → needs an invitation (VIS-03).
  // Repeated clicks keep one record (MEM-01); blocked or removed states aren't overridden.
  app.post('/communities/:id/join', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id, { audited: false });
    const c = a.community;
    if (c.status !== 'active') throw conflict('ARCHIVED', 'This community isn’t accepting new members.');
    if (a.state === 'active' || a.state === 'restricted') return { membership: { state: a.state, role: a.role } };
    if (a.state === 'pending') return { membership: { state: 'pending' } };
    if (a.state === 'removed') throw forbidden('You were removed from this community. Ask its admins to let you back in.', 'REMOVED');
    if (c.visibility === 'closed') throw forbidden('This community is invitation-only.', 'INVITE_ONLY');
    const state = c.visibility === 'public' ? 'active' : 'pending';
    const message = String(req.body?.message ?? '').trim().slice(0, 500) || null;
    await db.query(
      `insert into memberships (community_id, user_id, role, state, request_message, joined_at) values ($1, $2, 'member', $3, $4, case when $3 = 'active' then now() end)
       on conflict (community_id, user_id) do update set state = excluded.state, request_message = excluded.request_message,
         joined_at = excluded.joined_at, role = 'member', updated_at = now()
       where memberships.state in ('left', 'invited')`, [c.id, uid, state, message]);
    await audit(db, { actorId: uid, action: state === 'active' ? 'community.join' : 'community.request', targetType: 'community', targetId: c.id, ip: req.ip });
    const now = (await db.query(`select state, role from memberships where community_id = $1 and user_id = $2`, [c.id, uid])).rows[0];
    return { membership: now };
  });

  // Leave, or withdraw a pending request (MEM-02). The owner must transfer first (MEM-09), and
  // the last admin can't leave a community without one (MEM-10).
  app.post('/communities/:id/leave', async (req) => {
    const uid = signedIn(req);
    const a = await access(db, req, req.params.id, { audited: false });
    if (!a.state || a.state === 'left') return { membership: null };
    if (a.isOwner) throw conflict('OWNER_MUST_TRANSFER', 'Transfer ownership to another member before you leave.');
    if (a.role === 'admin') {
      const admins = (await db.query(`select count(*)::int as n from memberships where community_id = $1 and state = 'active' and role in ('owner', 'admin')`, [a.community.id])).rows[0].n;
      if (admins <= 1) throw conflict('LAST_ADMIN', 'Make someone else an admin before you leave.');
    }
    await db.query(`update memberships set state = 'left', role = 'member', updated_at = now() where community_id = $1 and user_id = $2 and state in ('active', 'restricted', 'pending')`, [a.community.id, uid]);
    await audit(db, { actorId: uid, action: a.state === 'pending' ? 'community.withdraw_request' : 'community.leave', targetType: 'community', targetId: a.community.id, ip: req.ip });
    return { membership: null };
  });

  app.get('/communities/:id/requests', async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden();
    const { rows } = await db.query(`select m.user_id as id, u.name, m.request_message as message, m.updated_at from memberships m join users u on u.id = m.user_id
      where m.community_id = $1 and m.state = 'pending' and u.status = 'active' order by m.updated_at`, [a.community.id]);
    return { requests: rows };
  });

  // Approve / decline a request. Only a request that is still pending can be decided, so a
  // withdrawn request or a second admin's click can't flip the outcome (MEM-02/03/04).
  for (const decision of ['approve', 'decline']) {
    app.post(`/communities/:id/requests/:userId/${decision}`, async (req) => {
      const a = await access(db, req, req.params.id);
      if (!a.canAdmin) throw forbidden();
      const { rows } = await db.query(
        `update memberships set state = $3, joined_at = case when $3 = 'active' then now() else joined_at end, updated_at = now()
          where community_id = $1 and user_id = $2 and state = 'pending' returning state`,
        [a.community.id, req.params.userId, decision === 'approve' ? 'active' : 'left']);
      if (!rows.length) throw conflict('NOT_PENDING', 'This request isn’t waiting any more.');
      await audit(db, { actorId: req.user.id, action: `community.request_${decision}`, targetType: 'community', targetId: a.community.id, context: { userId: req.params.userId, adminMode: a.adminMode }, ip: req.ip });
      return { ok: true };
    });
  }

  // Change a member's role or state. Nobody can raise someone (or themselves) above their own
  // rank (PER-02); the owner role only moves through transfer (PER-03).
  app.post('/communities/:id/members/:userId', {
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      role: { type: 'string', enum: ['admin', 'moderator', 'instructor', 'teaching_assistant', 'member'] },
      state: { type: 'string', enum: ['active', 'restricted', 'removed', 'blocked'] } } } },
  }, async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canModerate) throw forbidden();
    const { rows: [target] } = await db.query(`select role, state from memberships where community_id = $1 and user_id = $2`, [a.community.id, req.params.userId]);
    if (!target) throw notFound('That person isn’t in this community.');
    if (target.role === 'owner') throw forbidden('The owner’s role changes only through an ownership transfer.', 'OWNER_PROTECTED');
    const myRank = a.adminMode ? 'owner' : a.role;
    if (req.params.userId === req.user.id && req.body.role) throw forbidden('You can’t change your own role.', 'SELF_ACTION');
    if (!a.adminMode && !atLeast(myRank, 'admin') && req.body.role) throw forbidden('Only admins can change roles.');
    if (req.body.role && atLeast(req.body.role, myRank) && !a.adminMode) throw forbidden('You can’t give a role equal to or above your own.');
    if (atLeast(target.role, myRank) && !a.adminMode) throw forbidden('You can’t change someone at or above your own role.');
    const role = req.body.role ?? target.role;
    const state = req.body.state ?? target.state;
    if (target.role === 'admin' && (role !== 'admin' || state !== 'active')) {
      const admins = (await db.query(`select count(*)::int as n from memberships where community_id = $1 and state = 'active' and role in ('owner', 'admin')`, [a.community.id])).rows[0].n;
      if (admins <= 1) throw conflict('LAST_ADMIN', 'This community needs at least one admin.');
    }
    await db.query(`update memberships set role = $3, state = $4, updated_at = now() where community_id = $1 and user_id = $2`, [a.community.id, req.params.userId, role, state]);
    await audit(db, { actorId: req.user.id, action: 'community.member_update', targetType: 'community', targetId: a.community.id, context: { userId: req.params.userId, from: target, to: { role, state }, adminMode: a.adminMode }, ip: req.ip });
    return { membership: { role, state } };
  });

  // Ownership transfer (MEM-09, PER-03): owner (or admin mode) hands over to an active member;
  // the old owner becomes an admin. Done in one transaction so there's never zero or two owners.
  app.post('/communities/:id/transfer', { schema: { body: { type: 'object', required: ['toUserId'], properties: { toUserId: { type: 'string' } } } } }, async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.isOwner && !a.adminMode) throw forbidden('Only the owner can transfer ownership.');
    const to = req.body.toUserId;
    if (to === req.user.id && a.isOwner) throw badRequest('SELF_ACTION', 'You already own this community.');
    await db.tx(async (t) => {
      const target = (await t.query(`select m.state, u.status from memberships m join users u on u.id = m.user_id where m.community_id = $1 and m.user_id = $2`, [a.community.id, to])).rows[0];
      if (!target || target.state !== 'active' || target.status !== 'active') throw conflict('INELIGIBLE', 'Ownership can only go to an active member of this community.');
      await t.query(`update memberships set role = 'admin', updated_at = now() where community_id = $1 and role = 'owner' and state = 'active'`, [a.community.id]);
      await t.query(`update memberships set role = 'owner', updated_at = now() where community_id = $1 and user_id = $2`, [a.community.id, to]);
    });
    await audit(db, { actorId: req.user.id, action: 'community.transfer_ownership', targetType: 'community', targetId: a.community.id, context: { to, adminMode: a.adminMode }, ip: req.ip });
    return { ok: true };
  });
}
