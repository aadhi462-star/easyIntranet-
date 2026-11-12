// Groups & Spaces data from the CommunityOne API. The server owns communities and memberships;
// the rest of the app (feed, events, files, forums…) still reads groups from `state.groups`, so
// server communities are merged into it in the store's group shape. Community ids equal the old
// group ids, so every module that links to a group keeps working.
import { api, ApiError, widenAdminScope } from './api.js';

/**
 * Where a community opens: /c/<slug>, optionally a tab (/c/<slug>/events). Takes a community
 * (uses its slug) or just an id (the page accepts ids too and swaps in the slug).
 */
export const communityPath = (c, tab) => {
  const key = typeof c === 'string' ? c : (c.slug || c.id);
  return `/c/${encodeURIComponent(key)}${tab && tab !== 'overview' ? `/${tab}` : ''}`;
};

// Server visibility ↔ the store's access types.
const TO_ACCESS = { public: 'public', private: 'restricted', closed: 'private' };
const TO_VISIBILITY = { public: 'public', restricted: 'private', private: 'closed' };
export const visibilityOf = (accessType) => TO_VISIBILITY[accessType] ?? 'public';

// Screen settings stored on the community. A key the server doesn't have is left out, so a
// community seeded without it keeps the local value; null on the server clears it.
const SETTING_FIELDS = ['apps', 'dashboard', 'guidelines', 'dynamicRule', 'announceOnly', 'allHands', 'requireApproval'];

const enc = encodeURIComponent;

// Each community's accent (styles/index.css .cm-*), stored by the server. A copy without one
// (an older cached list) falls back to a colour worked out from the id. Lime is the platform's own.
export const ACCENTS = ['sky', 'violet', 'amber', 'teal', 'rose', 'orange'];
export function accentOf(c) {
  if (ACCENTS.includes(c?.accent)) return c.accent;
  const n = [...String(c?.id ?? '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return ACCENTS[1 + (n % (ACCENTS.length - 1))];
}

/**
 * Server community (+ the detail response's membership/permissions and the members list) → the
 * store's group shape. Members, admins and moderators come from the members list; when that
 * can't be seen (a Private community you're not in) they're empty and `memberCount` says how many.
 */
export function toLocalGroup(c, { members, membership = c.membership ?? null, permissions, requests, me } = {}) {
  const settings = c.settings || {};
  const out = {
    id: c.id, slug: c.slug || c.id, name: c.name, description: c.description || '', type: c.category || 'Interest', emoji: c.emoji || '👥', accent: c.accent,
    accessType: TO_ACCESS[c.visibility] ?? 'public',
    status: c.status, memberCount: c.memberCount ?? members?.length ?? 0,
    myMembership: membership, permissions: permissions ?? null,
  };
  if (c.version != null) out.serverVersion = c.version;
  if (c.settings) {
    for (const k of SETTING_FIELDS) if (k in settings) out[k] = settings[k] ?? undefined;
    if (!('announceOnly' in settings) && 'whoCanPost' in settings) out.announceOnly = settings.whoCanPost === 'admins';
    if (typeof settings.coverHue === 'number') out.hue = settings.coverHue;
  }
  if (members) {
    // The list holds active members; a restricted member (you, say) still belongs to it.
    if (me && membership?.state === 'restricted' && !members.some((m) => m.id === me)) members = [...members, { id: me, role: 'member' }];
    out.members = members.map((m) => m.id);
    out.admins = members.filter((m) => m.role === 'owner' || m.role === 'admin').map((m) => m.id);
    out.moderators = members.filter((m) => m.role === 'moderator').map((m) => m.id);
    out.roles = Object.fromEntries(members.map((m) => [m.id, m.role]));
    out.joinedAt = Object.fromEntries(members.map((m) => [m.id, m.joined_at ?? null]));
    out.ownerId = members.find((m) => m.role === 'owner')?.id ?? null;
  } else {
    // Can't see the list: all we know is whether you are in it.
    const mine = me && (membership?.state === 'active' || membership?.state === 'restricted');
    out.members = mine ? [me] : [];
    out.admins = mine && ['owner', 'admin'].includes(membership.role) ? [me] : [];
    out.moderators = mine && membership.role === 'moderator' ? [me] : [];
    out.roles = mine ? { [me]: membership.role } : {};
    out.ownerId = mine && membership.role === 'owner' ? me : null;
  }
  // Admins see every pending request; everyone else only their own.
  if (requests) {
    out.joinRequests = requests.map((r) => r.id);
    out.requestNotes = Object.fromEntries(requests.filter((r) => r.message).map((r) => [r.id, r.message]));
  } else {
    out.joinRequests = membership?.state === 'pending' && me ? [me] : [];
    out.requestNotes = {};
  }
  return out;
}

/**
 * Full detail of one community by id or slug. Null when the server says it doesn't exist for
 * you; `{ merged: { id, slug } }` when it became part of another community (R4).
 */
export async function loadCommunity(id, me) {
  let detail;
  try {
    detail = await api(`/communities/${enc(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return err.code === 'MERGED' && err.extra?.mergedInto ? { merged: err.extra.mergedInto } : null;
    throw err;
  }
  const { community, membership, permissions } = detail;
  if (detail.adminMode) widenAdminScope(id, community.id);
  id = community.id;
  const [members, requests] = await Promise.all([
    permissions.canView ? api(`/communities/${enc(id)}/members`).then((r) => r.members) : null,
    permissions.canAdmin ? api(`/communities/${enc(id)}/requests`).then((r) => r.requests).catch(() => null) : null,
  ]);
  const group = toLocalGroup(community, { members, membership, permissions, requests, me });
  group.adminMode = !!detail.adminMode;
  return { group, members: members || [] };
}

// Member names the local directory may not have yet (so avatars and links resolve).
const peopleOf = (members) => members.map((m) => ({ id: m.id, name: m.name }));

/**
 * Loads every community you can see and merges them into `state.groups`: matching groups are
 * replaced, new ones added, and local groups the server doesn't show you (Closed ones you're not
 * in, deleted ones, ones only ever created in this browser) are dropped.
 */
export async function syncCommunities(dispatch, { me, localIds = [] } = {}) {
  const { communities } = await api('/communities');
  const listed = communities.map((c) => c.id);
  // Discovery leaves out archived communities; ones this browser already knows are checked
  // one by one so members keep seeing them.
  const extra = localIds.filter((id) => !listed.includes(id));
  const results = await Promise.all([...listed, ...extra].map((id) => loadCommunity(id, me).then((r) => [id, r])));
  const groups = []; const drop = []; const people = [];
  for (const [id, r] of results) {
    if (!r || r.merged) { drop.push(id); continue; }
    groups.push(r.group);
    people.push(...peopleOf(r.members));
  }
  if (people.length) dispatch({ type: 'users/merge', users: dedupe(people), silent: true });
  dispatch({ type: 'communities/merge', groups, drop, silent: true });
  return groups.length;
}

/** Tells open community pages that community `id` changed on the server. */
const changed = (id) => window.dispatchEvent(new CustomEvent('c1-community-changed', { detail: id }));
export function onCommunityChange(fn) {
  const h = (e) => fn(e.detail);
  window.addEventListener('c1-community-changed', h);
  return () => window.removeEventListener('c1-community-changed', h);
}

/** Re-reads one community after a write. Returns the merged group, or null when it's gone. */
export async function refreshCommunity(id, dispatch, { me } = {}) {
  const r = await loadCommunity(id, me);
  if (!r || r.merged) { dispatch({ type: 'communities/merge', groups: [], drop: [id], silent: true }); changed(id); return null; }
  if (r.members.length) dispatch({ type: 'users/merge', users: peopleOf(r.members), silent: true });
  dispatch({ type: 'communities/merge', groups: [r.group], silent: true });
  changed(id);
  return r.group;
}

/** Community list from the server (discovery rules), in the group shape the cards use. */
export async function fetchCommunityList(me) {
  const { communities } = await api('/communities');
  return communities.map((c) => toLocalGroup(c, { me }));
}

const dedupe = (list) => [...new Map(list.map((x) => [x.id, x])).values()];

// Writes. Each returns the server response; callers refresh the community afterwards.
export const communityApi = {
  create: (body) => api('/communities', { method: 'POST', body, idempotent: true }),
  update: (id, body) => api(`/communities/${enc(id)}`, { method: 'PATCH', body }),
  join: (id, message) => api(`/communities/${enc(id)}/join`, { method: 'POST', body: message ? { message } : {} }),
  leave: (id) => api(`/communities/${enc(id)}/leave`, { method: 'POST', body: {} }),
  decide: (id, userId, approve) => api(`/communities/${enc(id)}/requests/${enc(userId)}/${approve ? 'approve' : 'decline'}`, { method: 'POST', body: {} }),
  addMembers: (id, userIds) => api(`/communities/${enc(id)}/members`, { method: 'POST', body: { userIds } }),
  setMember: (id, userId, patch) => api(`/communities/${enc(id)}/members/${enc(userId)}`, { method: 'POST', body: patch }),
  transfer: (id, toUserId) => api(`/communities/${enc(id)}/transfer`, { method: 'POST', body: { toUserId } }),
  archive: (id, archived) => api(`/communities/${enc(id)}/archive`, { method: 'POST', body: { archived } }),
  remove: (id) => api(`/communities/${enc(id)}`, { method: 'DELETE' }),
};

/** A message for a failed write (server text when there is one). */
export const errorText = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
