import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { needsApproval } from '../../components/feed/utils.js';

// Ids already handled this page load, so StrictMode's double effects don't double-notify.
const handled = new Set();

/** Publishes scheduled posts when due and sends Mandatory Read reminders. */
export default function ScheduledPosts() {
  const { state, dispatch } = useStore();
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    const tick = () => {
      const s = ref.current;
      const now = Date.now();
      for (const p of s.posts) {
        if (p.status === 'scheduled' && p.publishAt <= now && !handled.has(`pub:${p.id}`)) {
          handled.add(`pub:${p.id}`);
          const author = s.users.find((u) => u.id === p.authorId);
          const status = needsApproval(s, author, p.text) ? 'pending' : 'published';
          dispatch({ type: 'update', col: 'posts', id: p.id, silent: true, patch: { status, createdAt: p.publishAt, publishAt: undefined } });
          dispatch({ type: 'notify', notification: { userId: p.authorId, kind: 'info', link: `/post/${p.id}`, text: 'Your scheduled post was published' } });
        }
        const m = p.mandatory;
        if ((p.status ?? 'published') !== 'published' || !m || !m.reminder || m.reminder === 'none' || (m.deadline && m.deadline < now)) continue;
        const due = m.reminder === 'daily'
          ? now - (m.remindedAt ?? p.createdAt) > 864e5
          : !m.remindedAt && m.deadline && m.deadline - now < 864e5;
        const key = `rem:${p.id}:${m.remindedAt ?? 0}`;
        if (!due || handled.has(key)) continue;
        handled.add(key);
        const audience = p.scope?.type === 'group' ? s.groups.find((g) => g.id === p.scope.id)?.members ?? [] : s.users.map((u) => u.id);
        audience.filter((id) => id !== p.authorId && !m.acks.includes(id)).forEach((id) => dispatch({ type: 'notify',
          notification: { userId: id, kind: 'mandatory', link: `/post/${p.id}`, text: 'Reminder: a Mandatory Read post is waiting for your acknowledgement' } }));
        dispatch({ type: 'post/mandatory', id: p.id, silent: true, mandatory: { remindedAt: now } });
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, [dispatch]);

  return null;
}
