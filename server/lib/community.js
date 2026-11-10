// Community access: the single place that decides what a person may see and do inside a
// community. Order of checks: platform account → community status → visibility → membership
// state → community role → community settings. Every community/post route calls `access()`.
import { audit } from './audit.js';
import { can } from './permissions.js';
import { forbidden, notFound, unauthorized } from './errors.js';

const RANK = { member: 0, teaching_assistant: 1, instructor: 1, moderator: 2, admin: 3, owner: 4 };
export const atLeast = (role, min) => (RANK[role] ?? -1) >= RANK[min];

/**
 * Administrative mode (prompt §9): platform staff with community authority may open any
 * community, including Private and Closed, *only* when they ask for it explicitly. It never
 * creates a membership or changes counts, and every use is audited.
 */
export const wantsAdminMode = (req) => req.headers['x-admin-mode'] === '1';

export async function access(db, req, communityId, { audited = true } = {}) {
  const user = req.user;
  if (!user) throw unauthorized();
  const { rows } = await db.query(
    `select c.*, m.role, m.state as member_state from communities c
       left join memberships m on m.community_id = c.id and m.user_id = $2 where c.id = $1`, [communityId, user.id]);
  const c = rows[0];
  const adminMode = wantsAdminMode(req) && can(user, 'communities.manage');
  if (!c) throw notFound('That community doesn’t exist.');
  if (adminMode && audited) {
    await audit(db, { actorId: user.id, action: 'admin_mode.access', targetType: 'community', targetId: c.id, context: { path: req.url, method: req.method }, ip: req.ip });
  }
  const state = c.member_state ?? null;
  const member = state === 'active' || state === 'restricted';
  const role = state === 'active' ? c.role : null;
  // Closed and suspended communities don't exist for anyone outside them.
  if (!adminMode && (c.status === 'suspended' || (c.visibility === 'closed' && !member))) throw notFound('That community doesn’t exist.');
  if (state === 'blocked' && !adminMode) throw notFound('That community doesn’t exist.');
  const canView = adminMode || member || c.visibility === 'public';
  const writable = c.status === 'active';
  const whoCanPost = c.settings?.whoCanPost ?? 'members';
  return {
    community: c, state, role, adminMode, member, canView,
    // Restricted members can read but not take part (MEM-16).
    canParticipate: writable && state === 'active' && (whoCanPost === 'members' || atLeast(role, 'admin')),
    canComment: writable && state === 'active',
    canModerate: adminMode || atLeast(role, 'moderator'),
    canAdmin: adminMode || atLeast(role, 'admin'),
    isOwner: role === 'owner',
  };
}

export function requireView(ctx) {
  if (!ctx.canView) throw forbidden('Join this community to see its discussions.', 'MEMBERS_ONLY');
  return ctx;
}

/** Public metadata a non-member may see (Private communities show this, never content). */
export const publicCommunity = (c, extra = {}) => ({
  id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category, emoji: c.emoji,
  visibility: c.visibility, status: c.status, ...extra,
});
