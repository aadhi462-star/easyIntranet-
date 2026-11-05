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
    if (raw) {
      const s = JSON.parse(raw);
      if (s.version === VERSION) return { ...initialState(), ...s };
    }
  } catch { /* storage blocked or corrupt: fall back to seed */ }
  return initialState();
}

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
    case 'logout': return { ...s, session: null };
    case 'reset': {
      // Fresh demo data, but keep whoever is signed in. Someone who joined through sign-up
      // isn't in the seed, so carry their account over instead of stranding the session.
      const fresh = initialState();
      const current = s.users.find((u) => u.id === s.session?.userId);
      if (current && !fresh.users.some((u) => u.id === current.id)) fresh.users.push({ ...current, status: 'active' });
      return { ...fresh, session: current ? s.session : null };
    }
    case 'signup': {
      const id = uid('u');
      const user = { id, hue: Math.floor(Math.random() * 360), skills: [], career: [], bio: '', company: '', role: '', joinedAt: Date.now(),
        status: s.settings?.registration?.requireApproval ? 'pending' : 'active', ...a.user };
      // Callers may pre-approve (e.g. an invitation), so decide from the final status.
      const pending = user.status === 'pending';
      const welcome = { id: uid('n'), userId: id, createdAt: Date.now(), read: false, kind: 'welcome', text: `Welcome to ${s.settings?.networkName ?? 'AlumniZone'}! Complete your profile so classmates can find you.`, link: `/people/${id}` };
      const adminNote = pending ? [{ id: uid('n'), createdAt: Date.now(), read: false, kind: 'member', adminOnly: true, text: `${user.name} is waiting for membership approval`, link: '/admin/members' }] : [];
      return { ...s, users: [...s.users, user], session: pending ? null : { userId: id }, notifications: [welcome, ...adminNote, ...s.notifications] };
    }

    // Generic collection CRUD. `patch` may be an object or (item) => item.
    case 'add': {
      const item = { id: uid(a.col.slice(0, 2)), createdAt: Date.now(), authorId: me, ...a.item };
      return { ...s, [a.col]: a.prepend === false ? [...(s[a.col] || []), item] : [item, ...(s[a.col] || [])] };
    }
    case 'update':
      return { ...s, [a.col]: mapById(s[a.col] || [], a.id, (x) => (typeof a.patch === 'function' ? a.patch(x, me) : { ...x, ...a.patch })) };
    case 'remove': return { ...s, [a.col]: (s[a.col] || []).filter((x) => x.id !== a.id) };
    case 'set': return { ...s, [a.key]: typeof a.value === 'function' ? a.value(s[a.key], me) : a.value };
    case 'notify':
      return { ...s, notifications: [{ id: uid('n'), createdAt: Date.now(), read: false, kind: 'info', ...a.notification }, ...s.notifications] };

    // Wall
    case 'post/create':
      return { ...s, posts: [{ id: uid('p'), authorId: me, createdAt: Date.now(), likes: [], comments: [], status: 'published', ...a.post }, ...s.posts] };
    case 'post/delete': return { ...s, posts: s.posts.filter((p) => p.id !== a.id) };
    case 'post/like': return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, likes: toggle(p.likes, me) })) };
    case 'post/comment':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, comments: [...p.comments, { id: uid('c'), authorId: me, text: a.text, createdAt: Date.now() }] })) };
    case 'post/vote':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, poll: { ...p.poll,
        options: p.poll.options.map((o) => ({ ...o, votes: o.id === a.optionId ? [...new Set([...o.votes, me])] : o.votes.filter((v) => v !== me) })) } })) };
    case 'post/mandatory':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, mandatory: a.mandatory ? { acks: [], ...p.mandatory, ...a.mandatory } : undefined })) };
    case 'post/ack':
      return { ...s, posts: mapById(s.posts, a.id, (p) => ({ ...p, mandatory: { ...p.mandatory, acks: [...new Set([...p.mandatory.acks, me])] } })) };
    case 'bookmark': return { ...s, bookmarks: toggle(s.bookmarks, a.id) };

    // Groups / Spaces
    case 'group/create':
      return { ...s, groups: [...s.groups, { id: uid('g'), members: [me], admins: [me], apps: ['feed', 'forums', 'events', 'files', 'members'], createdAt: Date.now(), ...a.group }] };
    case 'group/join': return { ...s, groups: mapById(s.groups, a.id, (g) => ({ ...g, members: toggle(g.members, me) })) };
    case 'group/addMembers':
      return { ...s, groups: mapById(s.groups, a.id, (g) => ({ ...g, members: [...new Set([...g.members, ...a.userIds])] })),
        channels: s.channels.map((c) => (c.groupId === a.id ? { ...c, members: [...new Set([...c.members, ...a.userIds])] } : c)) };

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
    case 'channel/leave': return { ...s, channels: mapById(s.channels, a.id, (c) => ({ ...c, members: c.members.filter((m) => m !== me) })) };
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
    case 'notif/read': return { ...s, notifications: s.notifications.map((n) => (a.id == null || n.id === a.id ? { ...n, read: true } : n)) };
    default: return s;
  }
}

/**
 * Every write is appended to `activity`. That one log drives points and levels, the
 * leaderboard, analytics, the audit log and workflow triggers.
 */
function reducer(s, a) {
  const next = core(s, a);
  if (next === s || a.type === 'set' && a.key === 'activity' || a.silent) return next;
  const key = a.col ? `${a.type}:${a.col}` : a.type;
  const entry = { id: uid('ac'), at: Date.now(), userId: s.session?.userId ?? next.session?.userId, type: key,
    ref: a.id ?? a.item?.id ?? a.post?.id ?? null, points: POINTS[key] ?? 0, meta: a.meta };
  return { ...next, activity: [entry, ...(next.activity || [])].slice(0, 1500) };
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);

  // Save when the browser is idle instead of on every change: serialising the whole store
  // per keystroke (notes, drafts) was blocking input. Flush when the tab is hidden or closed.
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(latest.current)); } catch { /* quota / private mode */ } };
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 200));
    const cancel = window.cancelIdleCallback ?? clearTimeout;
    let handle;
    const t = setTimeout(() => { handle = idle(save, { timeout: 1000 }); }, 250);
    window.addEventListener('pagehide', save);
    return () => { clearTimeout(t); if (handle) cancel(handle); window.removeEventListener('pagehide', save); };
  }, [state]);
  // Flush right away on sign-in, sign-out and reset so a quick reload never loses them.
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(latest.current)); } catch { /* ignore */ } }, [state.session, state.version]);

  // Same reducer, plus a short confirmation toast for actions a member triggers directly.
  const dispatch = useCallback((a) => {
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
  return role ? role.perms.includes(perm) : true;
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
