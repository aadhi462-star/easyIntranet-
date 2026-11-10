import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { ACTION_TOASTS, toast } from './toast.js';
import { initialState } from '../data/seed.js';
import { POINTS } from './gamify.js';

const KEY = 'alumnizone:v3';
const VERSION = 4;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* storage blocked or corrupt: fall back to seed */ }
  return initialState();
}

/**
 * Bring a save from an older version forward instead of discarding it: keep everything the
 * community created, fill collections added since, and add seed people who weren't there yet.
 */
export function migrate(saved) {
  const fresh = initialState();
  if (!saved || typeof saved !== 'object') return fresh;
  if (saved.version === VERSION) return { ...fresh, ...saved };
  const out = { ...fresh, ...saved, version: VERSION };
  const ids = new Set((saved.users || []).map((u) => u.id));
  const emails = new Set((saved.users || []).map((u) => u.email?.toLowerCase()));
  out.users = [...(saved.users || []), ...fresh.users.filter((u) => !ids.has(u.id) && !emails.has(u.email.toLowerCase()))];
  out.settings = { ...fresh.settings, ...(saved.settings || {}) };
  if (Array.isArray(saved.bookmarks)) out.bookmarks = {};
  return out;
}

/** Whether `userId` has read `n`. Broadcasts (no userId) track readers per member. */
export const isRead = (n, userId) => (n.userId ? !!n.read : (n.readBy || []).includes(userId) || (n.read && !n.readBy));

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
const mapById = (list, id, fn) => list.map((x) => (x.id === id ? fn(x) : x));

/**
 * Module-specific actions (feed, groups, events, ...) live here. Feature modules that need
 * their own collections use the generic `add` / `update` / `remove` / `set` actions instead,
 * so they never have to edit this reducer.
 */
function core(s, a) {
  const me = s.session?.userId;
  switch (a.type) {
    case 'login': return { ...s, session: { userId: a.userId } };
    // The server signed this person in. Until profiles move to the API (Phase 1, step 3), the
    // local directory needs a matching record, so add one for accounts created on the server.
    // Server profiles (lib/people.js) replace the matching local fields; unknown people are added.
    case 'users/merge': {
      const byId = new Map(a.users.map((u) => [u.id, u]));
      const merged = s.users.map((u) => (byId.has(u.id) ? { ...u, ...byId.get(u.id) } : u));
      const known = new Set(s.users.map((u) => u.id));
      const added = a.users.filter((u) => !known.has(u.id)).map((u) => ({ joinedAt: Date.now(), skills: [], career: [], ...u }));
      return { ...s, users: [...merged, ...added] };
    }
    case 'profile/sync-email': return { ...s, users: mapById(s.users, a.id, (u) => ({ ...u, email: a.email })) };
    case 'session/adopt': {
      const known = s.users.find((u) => u.id === a.user.id);
      const users = known
        ? s.users.map((u) => (u.id === a.user.id ? { ...u, name: a.user.name, email: a.user.email, status: 'active' } : u))
        : [...s.users, { hue: Math.floor(Math.random() * 360), skills: [], career: [], bio: '', company: '', role: '', joinedAt: Date.now(), ...a.profile, id: a.user.id, name: a.user.name, email: a.user.email, status: 'active' }];
      const admin = (a.user.roles || []).some((r) => r === 'platform_admin' || r === 'super_admin');
      return { ...s, users: users.map((u) => (u.id === a.user.id ? { ...u, admin } : u)), session: { userId: a.user.id } };
    }
    case 'logout': return { ...s, session: null };
    case 'reset': {
      // Fresh demo data, but keep whoever is signed in. Someone who joined through sign-up
      // isn't in the seed, so carry their account over instead of stranding the session.
      const fresh = initialState();
      const current = s.users.find((u) => u.id === s.session?.userId);
      if (current && !fresh.users.some((u) => u.id === current.id)) fresh.users.push({ ...current, status: 'active' });
      return { ...fresh, session: current ? s.session : null, resetAt: Date.now() };
    }
    case 'signup': {
      const id = uid('u');
      const user = { id, hue: Math.floor(Math.random() * 360), skills: [], career: [], bio: '', company: '', role: '', joinedAt: Date.now(),
        status: s.settings?.registration?.requireApproval ? 'pending' : 'active', ...a.user };
      // Callers may pre-approve (e.g. an invitation), so decide from the final status.
      const pending = user.status === 'pending';
      const welcome = { id: uid('n'), userId: id, createdAt: Date.now(), read: false, kind: 'welcome', text: `Welcome to CommunityOne! Complete your profile so classmates can find you.`, link: `/people/${id}` };
      const adminNote = pending ? [{ id: uid('n'), createdAt: Date.now(), read: false, kind: 'member', adminOnly: true, ref: id, text: `${user.name} is waiting for membership approval`, link: '/admin/members' }] : [];
      return { ...s, users: [...s.users, user], session: pending ? null : { userId: id }, notifications: [welcome, ...adminNote, ...s.notifications] };
    }

    // An admin approves a pending signup. Logged against the new member (see reducer) so
    // "new member" workflows fire at approval, the moment they actually join.
    case 'member/approve':
      return { ...s, users: mapById(s.users, a.id, (u) => ({ ...u, status: 'active', deactivated: false })) };

    // Generic collection CRUD. `patch` may be an object or (item) => item.
    case 'add': {
      // Runner/workflow items carry deterministic ids; a repeat (e.g. the same job in two
      // tabs) is ignored rather than duplicated.
      if (a.item?.id && (s[a.col] || []).some((x) => x.id === a.item.id)) return s;
      const item = { id: uid(a.col.slice(0, 2)), createdAt: Date.now(), authorId: me, ...a.item };
      return { ...s, [a.col]: a.prepend === false ? [...(s[a.col] || []), item] : [item, ...(s[a.col] || [])] };
    }
    case 'update':
      return { ...s, [a.col]: mapById(s[a.col] || [], a.id, (x) => (typeof a.patch === 'function' ? a.patch(x, me) : { ...x, ...a.patch })) };
    case 'remove': return { ...s, [a.col]: (s[a.col] || []).filter((x) => x.id !== a.id) };
    case 'set': return { ...s, [a.key]: typeof a.value === 'function' ? a.value(s[a.key], me) : a.value };
    case 'notify':
      if (a.notification?.id && s.notifications.some((n) => n.id === a.notification.id)) return s;
      return { ...s, notifications: [{ id: uid('n'), createdAt: Date.now(), read: false, kind: 'info', ...a.notification }, ...s.notifications] };

    // Wall
    case 'post/create':
      if (a.post?.id && s.posts.some((p) => p.id === a.post.id)) return s;
      return { ...s, posts: [{ id: uid('p'), authorId: me, createdAt: Date.now(), likes: [], comments: [], status: 'published', ...a.post }, ...s.posts] };
    case 'post/delete': return { ...s, posts: s.posts.filter((p) => p.id !== a.id) };
    // Draft, scheduled or pending → live. Points go to the author (see `creditTo`).
    case 'post/publish': {
      // Idempotent: two tabs (or two runners) publishing the same post must not double-credit.
      const p0 = s.posts.find((p) => p.id === a.id);
      if (!p0 || p0.status === 'published') return s;
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, status: 'published', createdAt: a.keepDate ? p.createdAt : Date.now(), publishAt: undefined })) };
    }
    case 'post/like': return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, likes: toggle(p.likes, me) })) };
    case 'post/comment':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, comments: [...p.comments, { id: uid('c'), authorId: me, text: a.text, createdAt: Date.now() }] })) };
    case 'post/vote': {
      // Re-clicking your current option is a no-op (no new state, so no activity or points).
      const target = s.posts.find((p) => p.id === a.id);
      if (target?.poll?.options.find((o) => o.id === a.optionId)?.votes.includes(me)) return s;
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, poll: { ...p.poll,
        options: p.poll.options.map((o) => ({ ...o, votes: o.id === a.optionId ? [...new Set([...o.votes, me])] : o.votes.filter((v) => v !== me) })) } })) };
    }
    case 'post/mandatory':
      // `markedAt` identifies this marking, so reminders for a re-marked post aren't mistaken
      // for the earlier marking's (their notification ids include it).
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, mandatory: a.mandatory ? { acks: [], markedAt: p.mandatory?.markedAt ?? Date.now(), ...p.mandatory, ...a.mandatory } : undefined })) };
    case 'post/ack':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, mandatory: { ...p.mandatory, acks: [...new Set([...p.mandatory.acks, me])] } })) };
    // Bookmarks are per member: { [userId]: postIds[] }.
    case 'bookmark': return { ...s, bookmarks: { ...normBookmarks(s.bookmarks), [me]: toggle(bookmarksOf(s, me), a.id) } };

    // Groups / Spaces
    case 'group/create':
      return { ...s, groups: [...s.groups, { id: uid('g'), members: [me], admins: [me], apps: ['feed', 'forums', 'events', 'files', 'members'], createdAt: Date.now(), ...a.group }] };
    case 'group/join': {
      // Join or leave. Leaving also drops your admin/moderator roles and records the
      // opt-out (so dynamic-membership rules don't re-add you); linked channels follow.
      const g0 = s.groups.find((g) => g.id === a.id);
      if (!g0) return s;
      const leaving = g0.members.includes(me);
      const without = (list = []) => list.filter((x) => x !== me);
      return {
        ...s,
        groups: mapById(s.groups, a.id, (g) => (leaving
          ? { ...g, members: without(g.members), admins: without(g.admins), moderators: without(g.moderators), optedOut: [...new Set([...(g.optedOut || []), me])] }
          : { ...g, members: [...g.members, me], joinRequests: without(g.joinRequests), optedOut: without(g.optedOut) })),
        channels: s.channels.flatMap((c) => {
          if (c.groupId !== a.id) return [c];
          if (!leaving) return [{ ...c, members: [...new Set([...c.members, me])] }];
          // Same rules as channel/leave: drop admin rights, delete when empty, and hand
          // admin to the longest-standing member if nobody else has it.
          const members = without(c.members);
          if (!members.length) return [];
          const admins = without(c.admins);
          return [{ ...c, members, admins: admins.length || !c.admins ? admins : [members[0]] }];
        }),
      };
    }
    case 'group/addMembers':
      return { ...s, groups: mapById(s.groups, a.id, (g) => ({ ...g, members: [...new Set([...g.members, ...a.userIds])],
          joinRequests: (g.joinRequests || []).filter((x) => !a.userIds.includes(x)), optedOut: (g.optedOut || []).filter((x) => !a.userIds.includes(x)) })),
        channels: s.channels.map((c) => (c.groupId === a.id ? { ...c, members: [...new Set([...c.members, ...a.userIds])] } : c)) };

    // Communities from the server (lib/communities.js): matching groups take the server's
    // fields, new ones are added with default screens, and `drop` ids are ones you can't see.
    case 'communities/merge': {
      const drop = new Set(a.drop || []);
      const byId = new Map(a.groups.map((g) => [g.id, g]));
      const known = new Set(s.groups.map((g) => g.id));
      const kept = s.groups.filter((g) => !drop.has(g.id)).map((g) => (byId.has(g.id) ? { ...g, ...byId.get(g.id) } : g));
      const added = a.groups.filter((g) => !known.has(g.id) && !drop.has(g.id)).map((g) => ({
        apps: ['dashboard', 'feed', 'forums', 'events', 'files', 'members'], dashboard: [{ id: 'w-about', kind: 'about' }, { id: 'w-members', kind: 'members' }],
        moderators: [], joinRequests: [], createdAt: Date.now(), ...g }));
      return { ...s, groups: [...kept, ...added] };
    }

    // Events
    case 'event/create': return { ...s, events: [...s.events, { id: uid('e'), hostId: me, assistants: [], rsvps: {}, invitees: [], rsvpEnabled: true, createdAt: Date.now(), ...a.event }] };
    case 'event/rsvp': return { ...s, events: mapById(s.events, a.id, (e) => ({ ...e, rsvps: { ...e.rsvps, [me]: a.status } })) };
    case 'event/delete': return { ...s, events: s.events.filter((e) => e.id !== a.id) };

    // Forums
    case 'forum/save': {
      if (s.forumPosts.some((f) => f.id === a.post.id)) return { ...s, forumPosts: mapById(s.forumPosts, a.post.id, (f) => ({ ...f, ...a.post })) };
      return { ...s, forumPosts: [{ id: uid('f'), authorId: me, createdAt: Date.now(), upvotes: [], replies: [], groupId: null, ...a.post }, ...s.forumPosts] };
    }
    case 'forum/delete': return { ...s, forumPosts: s.forumPosts.filter((f) => f.id !== a.id) };
    case 'forum/upvote': return { ...s, forumPosts: mapById(s.forumPosts, a.id, (f) => ({ ...f, upvotes: toggle(f.upvotes, me) })) };
    case 'forum/reply':
      return { ...s, forumPosts: mapById(s.forumPosts, a.id, (f) => ({ ...f, replies: [...f.replies, { id: uid('r'), authorId: me, text: a.text, createdAt: Date.now() }] })) };
    case 'forum/category': return { ...s, forumCategories: [...s.forumCategories, { id: uid('fc'), ...a.category }] };

    // Channels
    case 'channel/create': {
      const group = s.groups.find((g) => g.id === a.channel.groupId);
      const members = [...new Set([me, ...(a.channel.members || []), ...(group?.members || [])])];
      return { ...s, channels: [...s.channels, { id: uid('ch'), admins: [me], messages: [], ...a.channel, members }] };
    }
    case 'channel/send':
      return { ...s, channels: mapById(s.channels, a.id, (c) => ({ ...c, messages: [...c.messages, { id: uid('m'), authorId: me, text: a.text, createdAt: Date.now(), ...a.extra }] })) };
    case 'channel/leave': {
      // Leaving drops admin rights too; the last member out removes the channel.
      const c0 = s.channels.find((c) => c.id === a.id);
      if (!c0) return s;
      const members = c0.members.filter((m) => m !== me);
      if (!members.length) return { ...s, channels: s.channels.filter((c) => c.id !== a.id) };
      return { ...s, channels: mapById(s.channels, a.id, (c) => ({ ...c, members, admins: (c.admins || []).filter((m) => m !== me) })) };
    }
    case 'channel/delete': return { ...s, channels: s.channels.filter((c) => c.id !== a.id) };

    // Manuals
    case 'manual/article': {
      const { manualId, chapterId, article } = a;
      return { ...s, manuals: mapById(s.manuals, manualId, (m) => ({ ...m, chapters: m.chapters.map((c) => {
        if (c.id !== chapterId) return c;
        const next = { ...article, updatedAt: Date.now() };
        return { ...c, articles: c.articles.some((x) => x.id === article.id)
          ? c.articles.map((x) => (x.id === article.id ? { ...x, ...next, versions: [...(x.versions || []), { body: x.body, at: x.updatedAt }] } : x))
          : [...c.articles, { id: uid('a'), published: false, ...next }] };
      }) })) };
    }

    case 'profile/update': return { ...s, users: mapById(s.users, me, (u) => ({ ...u, ...a.patch })) };
    case 'notif/read':
      return { ...s, notifications: s.notifications.map((n) => {
        if (a.id != null && n.id !== a.id) return n;
        if (n.userId) return n.userId === me ? { ...n, read: true } : n;
        return { ...n, readBy: [...new Set([...(n.readBy || []), me])] };
      }) };
    // Another tab saved newer data: adopt it wholesale (see the storage listener below).
    // Keep this tab's signed-in member unless the other tab signed out; `hydratedAt` lets
    // runners skip activity that another tab already handled.
    case 'hydrate': return { ...a.state, session: a.keepSession || (a.state.session && s.session) ? s.session : a.state.session, hydratedAt: Date.now() };
    default: return s;
  }
}

/**
 * Every write is appended to `activity`. That one log drives points and levels, the
 * leaderboard, analytics, the audit log and workflow triggers.
 */
// Toggle-style actions earn points once per item per member, so like/unlike or
// join/leave loops can't farm points.
const ONCE_PER_ITEM = new Set(['post/like', 'post/vote', 'post/ack', 'forum/upvote', 'event/rsvp', 'group/join', 'update:ideas']);

function reducer(s, a) {
  const next = core(s, a);
  if (next === s || a.type === 'hydrate' || a.type === 'set' && a.key === 'activity' || a.silent) return next;
  const key = a.col ? `${a.type}:${a.col}` : a.type;
  // A signup (even one waiting for approval) is attributed to the new member.
  // A signup (even one waiting for approval) is attributed to the new member. An approval is
  // the admin's action, with the member as its ref (workflows read ref as "who joined").
  const joined = a.type === 'signup' ? next.users.at(-1)?.id : null;
  const userId = a.creditTo ?? joined ?? s.session?.userId ?? next.session?.userId;
  const ref = joined ?? a.id ?? a.item?.id ?? a.post?.id ?? null;
  let points = POINTS[key] ?? 0;
  // Only live posts count: drafts, scheduled and pending posts earn on publish instead.
  if (key === 'post/create' && (a.post?.status ?? 'published') !== 'published') points = 0;
  if (key === 'forum/save' && a.post?.id && s.forumPosts.some((f) => f.id === a.post.id)) points = 0; // edits don't score
  if (points && ONCE_PER_ITEM.has(key) && (s.activity || []).some((x) => x.type === key && x.ref === ref && x.userId === userId && x.points > 0)) points = 0;
  const entry = { id: uid('ac'), at: Date.now(), userId, type: key, ref, points, meta: a.meta };
  return { ...next, activity: trimActivity([entry, ...(next.activity || [])]) };
}

// Cap the log, but never drop entries that carry points: levels and badges are summed
// from it, so trimming them made members' points go down over time.
function trimActivity(list, cap = 1500) {
  if (list.length <= cap) return list;
  let spare = list.length - cap;
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (spare > 0 && !list[i].points) { spare--; continue; }
    out.push(list[i]);
  }
  return out.reverse();
}

// Older saves kept one shared bookmark list; it can't be attributed, so it's dropped.
function normBookmarks(b) { return b && !Array.isArray(b) && typeof b === 'object' ? b : {}; }
/** The post ids `userId` has bookmarked. */
export function bookmarksOf(state, userId) { return normBookmarks(state.bookmarks)[userId] || []; }

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);

  // Save when the browser is idle instead of on every change: serialising the whole store
  // per keystroke (notes, drafts) was blocking input. Flush when the tab is hidden or closed.
  const latest = useRef(state);
  latest.current = state;
  const lastSaved = useRef(null);
  // Actions since the last successful save, replayed if another tab's save arrives first.
  const unsaved = useRef([]);
  // What actually needs saving: tab-only details (hydratedAt, which member this tab has
  // signed in) don't count, otherwise two tabs would keep re-saving to each other.
  const lastBody = useRef(null);
  const bodyOf = (st) => { const { hydratedAt: _h, session: _s, ...rest } = st; return JSON.stringify(rest); };
  const save = useCallback((force = false) => {
    try {
      const { hydratedAt: _h, ...persist } = latest.current;
      const body = bodyOf(latest.current);
      if (!force && body === lastBody.current) { unsaved.current = []; return; }
      const raw = JSON.stringify(persist);
      if (raw === lastSaved.current) return;
      localStorage.setItem(KEY, raw);
      lastSaved.current = raw;
      lastBody.current = body;
      unsaved.current = [];
    } catch (err) {
      // Quota: say so instead of silently dropping every later change.
      if (err?.name === 'QuotaExceededError' || err?.code === 22) toast('Storage is full, so recent changes can’t be saved. Remove large files or attachments.', 'error');
    }
  }, []);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 200));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    let handle;
    const t = setTimeout(() => { handle = idle(save, { timeout: 1000 }); }, 250);
    return () => { clearTimeout(t); if (handle) cancel(handle); };
  }, [state, save]);
  // Flush right away on sign-in, sign-out and reset so a quick reload never loses them.
  useEffect(() => { save(true); }, [state.session, state.resetAt, save]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    // Two tabs: adopt the other tab's save rather than overwriting it later with stale data.
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue || e.newValue === lastSaved.current) return;
      try {
        lastSaved.current = e.newValue;
        const incoming = migrate(JSON.parse(e.newValue));
        lastBody.current = bodyOf(incoming);
        const replay = unsaved.current;
        const mine = latest.current.session;
        if (replay.length && mine && !incoming.session) {
          // The other tab signed out while this tab had unsaved work: save that work under the
          // member who did it, then follow the sign-out.
          rawDispatch({ type: 'hydrate', state: incoming, keepSession: true });
          replay.forEach((x) => rawDispatch(x));
          rawDispatch({ type: 'logout' });
        } else {
          rawDispatch({ type: 'hydrate', state: incoming });
          replay.forEach((x) => rawDispatch(x)); // keep this tab's not-yet-saved work
        }
      } catch { /* ignore corrupt */ }
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('storage', onStorage); };
  }, [save]);

  // Same reducer, plus a short confirmation toast for actions a member triggers directly.
  const dispatch = useCallback((a) => {
    unsaved.current.push(a);
    rawDispatch(a);
    if (!a.silent && ACTION_TOASTS[a.type]) toast(ACTION_TOASTS[a.type]);
  }, []);
  const value = useMemo(() => {
    const byId = Object.fromEntries(state.users.map((u) => [u.id, u]));
    const me = state.session ? byId[state.session.userId] : null;
    return { state, dispatch, me, user: (id) => byId[id], can: (perm) => can(state, me, perm) };
  }, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/** Role-based permission check. Network admins can do everything. */
export function can(state, me, perm) {
  if (!me) return false;
  if (me.admin) return true;
  const role = (state.roles || []).find((r) => r.id === (me.roleId || 'member'));
  // Fail closed: an unknown or deleted role grants nothing.
  return role ? role.perms.includes(perm) : false;
}

export function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return `in ${fmtDuration(-s)}`;
  if (s < 60) return 'just now';
  return fmtDuration(s);
}
function fmtDuration(s) {
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(Date.now() - s * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const fmtDate = (t, opts) => new Date(t).toLocaleString(undefined, opts ?? { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
