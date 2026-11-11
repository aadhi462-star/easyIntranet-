// Community access: the single place that decides what a person may see and do inside a
// community. Order of checks: platform account → community status → visibility → membership
// state → community role → community settings. Every community/post route calls `access()`.
import { audit } from './audit.js';
import { can } from './permissions.js';
import { forbidden, HttpError, notFound, unauthorized } from './errors.js';

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
    `select c.*, m.role, m.state as member_state, m.joined_at as member_joined_at, t.slug as merged_slug from communities c
       left join memberships m on m.community_id = c.id and m.user_id = $2
       left join communities t on t.id = c.merged_into where c.id = $1`, [communityId, user.id]);
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
  // A merged community (R4) has moved: say where, so old links can follow it. Only its new
  // home's address is given, and that page checks access again on its own.
  if (c.merged_into && !adminMode) throw new HttpError(404, 'MERGED', 'This community is now part of another one.', { mergedInto: { id: c.merged_into, slug: c.merged_slug } });
  const canView = adminMode || member || c.visibility === 'public';
  const writable = c.status === 'active';
  const whoCanPost = c.settings?.whoCanPost ?? 'members';
  return {
    community: c, state, role, adminMode, member, canView, joinedAt: member ? c.member_joined_at : null,
    // Restricted members can read but not take part (MEM-16).
    canParticipate: writable && state === 'active' && (whoCanPost === 'members' || atLeast(role, 'admin')),
    canComment: writable && state === 'active',
    canModerate: adminMode || atLeast(role, 'moderator'),
    canAdmin: adminMode || atLeast(role, 'admin'),
    isOwner: role === 'owner',
  };
}

/** The platform's default community (decision D3): every account joins it when it becomes active. */
export const DEFAULT_COMMUNITY = 'alumnizone';

/**
 * Adds an activated account to the default community as a member (decision R5). Never
 * overrides an existing membership: someone who left, was removed or blocked stays that way.
 */
export async function joinDefaultCommunity(q, userId) {
  await q.query(`insert into memberships (community_id, user_id, role, state, joined_at)
    select $1, $2, 'member', 'active', now() where exists (select 1 from communities where id = $1 and status = 'active')
    on conflict (community_id, user_id) do nothing`, [DEFAULT_COMMUNITY, userId]);
}

/**
 * Community id for an address that may hold the id or the slug (/c/:slug). The id wins when
 * both match, so a community named like another's id can't take over its address.
 */
export async function resolveCommunityId(db, key) {
  const { rows } = await db.query(`select id from communities where id = $1 or lower(slug) = lower($1) order by (id = $1) desc limit 1`, [String(key)]);
  return rows[0]?.id ?? String(key);
}

export function requireView(ctx) {
  if (!ctx.canView) throw forbidden('Join this community to see its discussions.', 'MEMBERS_ONLY');
  return ctx;
}

/** Public metadata a non-member may see (Private communities show this, never content). */
export const publicCommunity = (c, extra = {}) => ({
  id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category, emoji: c.emoji,
  accent: c.accent, visibility: c.visibility, status: c.status, ...extra,
});

// Accents a new community can get (sky is AlumniZone's). The least-used one, so neighbours in
// a list rarely share a colour.
const PICKABLE = ['violet', 'amber', 'teal', 'rose', 'orange'];
export async function pickAccent(db) {
  const { rows } = await db.query(`select accent, count(*)::int as n from communities group by accent`);
  const used = Object.fromEntries(rows.map((r) => [r.accent, r.n]));
  return PICKABLE.reduce((best, a) => ((used[a] ?? 0) < (used[best] ?? 0) ? a : best), PICKABLE[0]);
}
