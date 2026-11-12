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
  if (!c) {
    // Removed for good (Stage 7): an old link says so and nothing else (DEL-12).
    const { rows: [gone] } = await db.query(`select 1 from removed_communities where id = $1`, [communityId]);
    if (gone) throw new HttpError(404, 'COMMUNITY_REMOVED', 'This community has been removed.');
    throw notFound('That community doesn’t exist.');
  }
  // Deleted, restorable for 30 days: the same for everyone, staff included (D1, DEL-12).
  if (c.status === 'deleted') throw new HttpError(404, 'COMMUNITY_REMOVED', 'This community has been removed.');
  if (adminMode && audited) {
    await audit(db, { actorId: user.id, action: 'admin_mode.access', targetType: 'community', targetId: c.id, context: { path: req.url, method: req.method }, ip: req.ip });
  }
  const state = c.member_state ?? null;
  const member = state === 'active' || state === 'restricted';
  const role = state === 'active' ? c.role : null;
  // Closed communities don't exist for anyone outside them. A suspended one is hidden from
  // everyone but its own staff, who can read it but not change it (Stage 7).
  const staff = state === 'active' && atLeast(c.role, 'moderator');
  if (!adminMode && ((c.status === 'suspended' && !staff) || (c.visibility === 'closed' && !member))) throw notFound('That community doesn’t exist.');
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

/**
 * Community id for an address that may hold the id or the slug (/c/:slug). The id wins when
 * both match, so a community named like another's id can't take over its address.
 */
export async function resolveCommunityId(db, key) {
  const { rows } = await db.query(`select id from communities where id = $1 or lower(slug) = lower($1) order by (id = $1) desc limit 1`, [String(key)]);
  if (rows[0]) return rows[0].id;
  const { rows: gone } = await db.query(`select id from removed_communities where id = $1 or lower(slug) = lower($1) limit 1`, [String(key)]);
  return gone[0]?.id ?? String(key);
}

export function requireView(ctx) {
  if (!ctx.canView) throw forbidden('Join this community to see its discussions.', 'MEMBERS_ONLY');
  return ctx;
}

/**
 * Addresses of a community's logo and cover (v2 workstream E), or null when it has none. The
 * file id is in the address, so a new picture is a new address and no cache shows the old one.
 */
export const brandingUrls = (c) => ({
  logoUrl: c.logo_file_id ? `/api/communities/${c.id}/logo?v=${c.logo_file_id}` : null,
  coverUrl: c.cover_file_id ? `/api/communities/${c.id}/cover?v=${c.cover_file_id}` : null,
});

/** Public metadata a non-member may see (Private communities show this, never content). */
export const publicCommunity = (c, extra = {}) => ({
  id: c.id, slug: c.slug, name: c.name, description: c.description, category: c.category, emoji: c.emoji,
  accent: c.accent, ...brandingUrls(c), visibility: c.visibility, status: c.status, ...extra,
});

// Sections a community can switch off (settings.apps; Overview, Members and About always show).
// A community with no stored list has every section on, as AlumniZone and older communities do.
// Lists saved by the older settings screens use the prototype's app names, which map onto the
// sections below; those screens never offered Learning, so a list in only the older names
// leaves Learning on.
const SECTION_APPS = { discussions: ['discussions', 'feed', 'forums'], events: ['events'], resources: ['resources', 'files', 'manuals'], learning: ['learning'] };
const NEWER_NAMES = ['discussions', 'resources', 'learning'];
export const SECTIONS = Object.keys(SECTION_APPS);
const SECTION_LABEL = { discussions: 'Discussions', events: 'Events', resources: 'Resources', learning: 'Learning' };

export function sectionOn(c, section) {
  const apps = c.settings?.apps;
  if (!Array.isArray(apps)) return true;
  if (section === 'learning' && !apps.some((x) => NEWER_NAMES.includes(x))) return true;
  return SECTION_APPS[section].some((x) => apps.includes(x));
}
export const sectionsOf = (c) => Object.fromEntries(SECTIONS.map((s) => [s, sectionOn(c, s)]));

/**
 * A switched-off section is gone for members: its lists and items answer 404 SECTION_OFF.
 * Staff (Moderators and up, or admin mode) can still read it from Manage, but nobody adds to it
 * (`write`) until it's switched back on. Its content is kept either way.
 */
export function requireSection(a, section, { write = false } = {}) {
  if (sectionOn(a.community, section)) return a;
  if (!a.canModerate) throw new HttpError(404, 'SECTION_OFF', `${SECTION_LABEL[section]} is switched off in this community.`);
  if (write) throw new HttpError(409, 'SECTION_OFF', `${SECTION_LABEL[section]} is switched off in this community. Switch it on in Manage first.`);
  return a;
}

// Accents a community can have; its Owner or an Admin chooses one (v2 workstream E).
export const ACCENTS = ['sky', 'violet', 'amber', 'teal', 'rose', 'orange'];
// Accents a new community can get: the least-used one, so neighbours in a list rarely share a
// colour. (v2 brief: no community is special, so sky is pickable like the rest.)
const PICKABLE = ['violet', 'amber', 'teal', 'rose', 'orange', 'sky'];
export async function pickAccent(db) {
  const { rows } = await db.query(`select accent, count(*)::int as n from communities group by accent`);
  const used = Object.fromEntries(rows.map((r) => [r.accent, r.n]));
  return PICKABLE.reduce((best, a) => ((used[a] ?? 0) < (used[best] ?? 0) ? a : best), PICKABLE[0]);
}
