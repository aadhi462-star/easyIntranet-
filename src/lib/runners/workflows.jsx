import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';

// Which collection an activity type writes to, so conditions can inspect the content.
const COLLECTION = {
  'post/create': 'posts', 'post/comment': 'posts', 'post/like': 'posts',
  'forum/save': 'forumPosts', 'forum/reply': 'forumPosts',
  'event/create': 'events', 'event/rsvp': 'events',
  'group/create': 'groups', 'group/join': 'groups',
  'channel/send': 'channels',
};

function findContent(state, entry) {
  const col = COLLECTION[entry.type] || (entry.type.startsWith('add:') || entry.type.startsWith('update:') ? entry.type.split(':')[1] : null);
  if (!col) return null;
  const list = state[col] || [];
  if (entry.ref) return list.find((x) => x.id === entry.ref) || null;
  // Newly created items get their id inside the reducer, so match the newest by author.
  return list.find((x) => x.authorId === entry.userId && Math.abs((x.createdAt || 0) - entry.at) < 5000) || null;
}

const textOf = (item) => [item?.text, item?.title, item?.body, item?.name, item?.description,
  ...(item?.comments || []).slice(-1).map((c) => c.text), ...(item?.messages || []).slice(-1).map((m) => m.text)].filter(Boolean).join(' ');

export function matches(wf, entry, state) {
  if (!wf.enabled || wf.trigger !== entry.type) return false;
  const { groupId, keyword } = wf.condition || {};
  if (!groupId && !keyword) return true;
  const item = findContent(state, entry);
  if (groupId) {
    const g = item?.scope?.type === 'group' ? item.scope.id : item?.groupId ?? (entry.type.startsWith('group/') ? item?.id : null);
    if (g !== groupId) return false;
  }
  if (keyword && !textOf(item).toLowerCase().includes(keyword.toLowerCase())) return false;
  return true;
}

/** Runs a workflow's actions. Every dispatch is silent so it can't re-trigger workflows. */
export function runActions(wf, entry, state, dispatch) {
  const admins = state.users.filter((u) => u.admin);
  const actor = state.users.find((u) => u.id === entry.userId);
  const fill = (t = '') => t.replaceAll('{user}', actor?.name ?? 'Someone');
  for (const act of wf.actions || []) {
    switch (act.kind) {
      case 'notifyUser':
        dispatch({ type: 'notify', silent: true, notification: { userId: act.userId || entry.userId, text: fill(act.text) || wf.name, link: act.link || '/feed', kind: 'workflow' } });
        break;
      case 'notifyAdmins':
        admins.forEach((u) => dispatch({ type: 'notify', silent: true, notification: { userId: u.id, text: `${fill(act.text) || wf.name}${actor ? ` (${actor.name})` : ''}`, link: '/admin/members', kind: 'workflow' } }));
        break;
      case 'announce':
        dispatch({ type: 'post/create', silent: true, post: { type: 'announcement', text: fill(act.text) || wf.name,
          scope: act.groupId ? { type: 'group', id: act.groupId } : { type: 'network' }, authorId: admins[0]?.id ?? entry.userId } });
        break;
      case 'createTask':
        dispatch({ type: 'add', col: 'tasks', silent: true, item: { title: fill(act.text) || wf.name, status: 'todo', priority: 'medium',
          assigneeId: act.userId || admins[0]?.id, authorId: admins[0]?.id, description: `Created by workflow “${wf.name}”.`, boardId: act.boardId || null } });
        break;
      case 'awardBadge':
        dispatch({ type: 'add', col: 'badgeAwards', silent: true, item: { badgeId: act.badgeId, toId: entry.userId, reason: wf.name } });
        dispatch({ type: 'notify', silent: true, notification: { userId: entry.userId, text: `You earned a badge from “${wf.name}”`, link: '/leaderboard', kind: 'badge' } });
        break;
      default:
    }
  }
  dispatch({ type: 'update', col: 'workflows', id: wf.id, silent: true,
    patch: (w) => ({ ...w, runs: [{ at: Date.now(), entryType: entry.type, userId: entry.userId }, ...(w.runs || [])].slice(0, 30) }) });
}

/** Watches the activity log and fires matching workflows plus custom-app owner notifications. */
export default function WorkflowRunner() {
  const { state, dispatch } = useStore();
  const mountedAt = useRef(Date.now());
  const seen = useRef(new Set());

  useEffect(() => {
    const fresh = (state.activity || []).filter((e) => e.at >= mountedAt.current && !seen.current.has(e.id)).reverse();
    for (const entry of fresh) {
      seen.current.add(entry.id);
      for (const wf of state.workflows || []) if (matches(wf, entry, state)) runActions(wf, entry, state, dispatch);
      if (entry.type === 'add:appRecords') {
        const rec = findContent(state, entry);
        const app = (state.customApps || []).find((a) => a.id === rec?.appId);
        if (app?.notifyOwner && app.ownerId && app.ownerId !== entry.userId) {
          dispatch({ type: 'notify', silent: true, notification: { userId: app.ownerId, text: `New “${app.name}” record submitted`, link: `/apps/${app.id}`, kind: 'app' } });
        }
      }
    }
  }, [state, dispatch]);

  return null;
}
