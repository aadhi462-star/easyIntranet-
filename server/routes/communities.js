// Communities and memberships (Phase 1 community foundation). MEM-*, VIS-*, PER-* cases are
// referenced where handled.
import { audit } from '../lib/audit.js';
import { access, atLeast, publicCommunity, requireView } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { can } from '../lib/permissions.js';
import { idempotent } from '../lib/session.js';
import { UNIQUE_VIOLATION } from '../db/index.js';

// Settings a community stores for its own screens (tabs, dashboard, guidelines, membership rule).
// Validated as a plain object of limited size; nothing here grants permissions.
const SETTING_KEYS = new Set(['apps', 'dashboard', 'guidelines', 'dynamicRule', 'requireApproval', 'whoCanPost', 'announceOnly', 'allHands', 'coverHue']);
function cleanSettings(input) {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw badRequest('INVALID_INPUT', 'Settings must be an object.');
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!SETTING_KEYS.has(k)) throw badRequest('FIELD_NOT_ALLOWED', `“${k}” can’t be set here.`);
    out[k] = v;
  }
  if (out.whoCanPost && !['members', 'admins'].includes(out.whoCanPost)) throw badRequest('INVALID_INPUT', 'Choose who can post: members or admins.');
  if (JSON.stringify(out).length > 20000) throw badRequest('TOO_LONG', 'These settings are too large.');
  return out;
}
const cleanName = (s) => {
  const t = String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (t.length < 2 || t.length > 80) throw badRequest('INVALID_NAME', 'Give the community a name of 2–80 characters.', { field: 'name' });
  return t;
};
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'community';

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
        -- Archived communities stay listed for their own members (not for discovery).
        where (c.status = 'active' or (c.status = 'archived' and m.state in ('active', 'restricted')))
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
      community: publicCommunity(a.community, { memberCount: n, version: a.community.version, settings: a.canView ? a.community.settings : undefined }),
      membership: a.state ? { state: a.state, role: a.role } : null,
      permissions: { canView: a.canView, canParticipate: a.canParticipate, canComment: a.canComment, canModerate: a.canModerate, canAdmin: a.canAdmin },
      adminMode: a.adminMode,
    };
  });

  app.get('/communities/:id/members', async (req) => {
    const a = requireView(await access(db, req, req.params.id));
    // Restricted members are members (they can read), so they're listed with their state;
    // moderators also see removed and blocked people so those decisions can be reversed.
    const states = a.canModerate ? ['active', 'restricted', 'removed', 'blocked'] : ['active', 'restricted'];
    const { rows } = await db.query(
      `select m.user_id as id, u.name, m.role, m.state, m.joined_at from memberships m join users u on u.id = m.user_id
        where m.community_id = $1 and m.state = any($2) and u.status = 'active' order by m.role = 'owner' desc, u.name`, [a.community.id, states]);
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

  // Create (COM-05/06: idempotent; COM-01: duplicate names refused). The creator becomes owner.
  app.post('/communities', {
    schema: { body: { type: 'object', required: ['name', 'visibility'], additionalProperties: false, properties: {
      name: { type: 'string' }, description: { type: ['string', 'null'] }, category: { type: ['string', 'null'] }, emoji: { type: ['string', 'null'] },
      visibility: { type: 'string', enum: ['public', 'private', 'closed'] }, settings: { type: 'object' } } } },
  }, async (req, reply) => idempotent(db, req, reply, async () => {
    const uid = signedIn(req);
    const name = cleanName(req.body.name);
    const description = String(req.body.description ?? '').trim().slice(0, 1000) || null;
    const settings = cleanSettings(req.body.settings);
    const id = newId('com');
    try {
      await db.tx(async (t) => {
        await t.query(`insert into communities (id, slug, name, description, category, emoji, visibility, created_by, settings) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, slugOf(name), name, description, String(req.body.category ?? '').slice(0, 40) || null, String(req.body.emoji ?? '').slice(0, 8) || null, req.body.visibility, uid, JSON.stringify(settings)]);
        await t.query(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, 'owner', 'active', now())`, [id, uid]);
      });
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE_NAME', 'A community with a very similar name already exists. Choose a different name.', { field: 'name' });
      throw err;
    }
    await audit(db, { actorId: uid, action: 'community.create', targetType: 'community', targetId: id, context: { name, visibility: req.body.visibility }, ip: req.ip });
    reply.status(201);
    return { community: { id, name, visibility: req.body.visibility, membership: { state: 'active', role: 'owner' } } };
  }));

  // Edit details, visibility and settings (community admins, or admin mode). Version-checked so
  // two admins can't silently overwrite each other (SET-03). Visibility changes apply to the
  // very next request because access is decided per request (VIS-05/06/07).
  app.patch('/communities/:id', {
    schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: {
      version: { type: 'integer' }, name: { type: 'string' }, description: { type: ['string', 'null'] }, category: { type: ['string', 'null'] },
      emoji: { type: ['string', 'null'] }, visibility: { type: 'string', enum: ['public', 'private', 'closed'] }, settings: { type: 'object' } } } },
  }, async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only community admins can change these settings.');
    const b = req.body; const c = a.community;
    const name = 'name' in b ? cleanName(b.name) : c.name;
    const settings = 'settings' in b ? { ...c.settings, ...cleanSettings(b.settings) } : c.settings;
    try {
      const { rows } = await db.query(
        `update communities set name = $3, slug = $4, description = $5, category = $6, emoji = $7, visibility = $8, settings = $9, version = version + 1
          where id = $1 and version = $2 returning *`,
        [c.id, b.version, name, slugOf(name), 'description' in b ? (String(b.description ?? '').trim().slice(0, 1000) || null) : c.description,
          'category' in b ? (String(b.category ?? '').slice(0, 40) || null) : c.category, 'emoji' in b ? (String(b.emoji ?? '').slice(0, 8) || null) : c.emoji,
          b.visibility ?? c.visibility, JSON.stringify(settings)]);
      if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed this community. Reload to see the latest settings.');
      // A pending request to a community that's no longer Private is re-evaluated (VIS-13):
      // Public → it becomes a membership; Closed → it's dropped (needs an invitation now).
      if (b.visibility && b.visibility !== c.visibility) {
        if (b.visibility === 'public') await db.query(`update memberships set state = 'active', joined_at = now() where community_id = $1 and state = 'pending'`, [c.id]);
        if (b.visibility === 'closed') await db.query(`update memberships set state = 'left' where community_id = $1 and state = 'pending'`, [c.id]);
      }
      await audit(db, { actorId: req.user.id, action: 'community.update', targetType: 'community', targetId: c.id, context: { fields: Object.keys(b).filter((k) => k !== 'version'), from: b.visibility ? c.visibility : undefined, adminMode: a.adminMode }, ip: req.ip });
      return { community: publicCommunity(rows[0], { settings: rows[0].settings, version: rows[0].version }) };
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE_NAME', 'A community with a very similar name already exists.', { field: 'name' });
      throw err;
    }
  });

  // Admins add people directly (active platform members only). Existing members are left alone;
  // removed or blocked people need their state changed explicitly first (MEM-05).
  // `source: 'rule'` (automatic membership rules) never re-adds people who left on their own.
  app.post('/communities/:id/members', { schema: { body: { type: 'object', required: ['userIds'], additionalProperties: false, properties: { userIds: { type: 'array', items: { type: 'string' }, maxItems: 200 }, source: { type: 'string', enum: ['admin', 'rule'] } } } } },
    async (req) => {
      const a = await access(db, req, req.params.id);
      if (!a.canAdmin) throw forbidden('Only community admins can add members.');
      if (a.community.status !== 'active') throw conflict('ARCHIVED', 'This community is archived.');
      const { rows } = await db.query(
        `insert into memberships (community_id, user_id, role, state, joined_at)
         select $1, u.id, 'member', 'active', now() from users u where u.id = any($2) and u.status = 'active'
         on conflict (community_id, user_id) do update set state = 'active', joined_at = now(), updated_at = now()
           where memberships.state = any($3)
         returning user_id`, [a.community.id, req.body.userIds, req.body.source === 'rule' ? ['pending', 'invited'] : ['pending', 'left', 'invited']]);
      await audit(db, { actorId: req.user.id, action: 'community.add_members', targetType: 'community', targetId: a.community.id, context: { added: rows.map((r) => r.user_id), adminMode: a.adminMode }, ip: req.ip });
      return { added: rows.map((r) => r.user_id) };
    });

  // Archive / restore (owner or admin). Archived communities stay readable for members, accept no
  // new content and leave discovery (VIS-14). Permanent deletion is Platform-only (DEL-01).
  app.post('/communities/:id/archive', { schema: { body: { type: 'object', required: ['archived'], properties: { archived: { type: 'boolean' } } } } }, async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only community admins can archive a community.');
    await db.query(`update communities set status = $2, version = version + 1 where id = $1 and status <> 'suspended'`, [a.community.id, req.body.archived ? 'archived' : 'active']);
    await audit(db, { actorId: req.user.id, action: req.body.archived ? 'community.archive' : 'community.restore', targetType: 'community', targetId: a.community.id, context: { adminMode: a.adminMode }, ip: req.ip });
    return { ok: true };
  });

  app.delete('/communities/:id', async (req) => {
    signedIn(req);
    // Community admins request deletion (Phase 2 workflow); only platform staff delete (DEL-01, TC-03).
    if (!can(req.user, 'communities.manage')) throw forbidden('Community admins can’t delete a community. Archive it, or ask the platform team.', 'DELETE_NOT_ALLOWED');
    const { rows } = await db.query(`select id, name from communities where id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound('That community doesn’t exist.');
    await db.query(`delete from communities where id = $1`, [req.params.id]);
    await audit(db, { actorId: req.user.id, action: 'community.delete', targetType: 'community', targetId: req.params.id, context: { name: rows[0].name }, ip: req.ip });
    return { ok: true };
  });
}
