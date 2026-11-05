import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';

const DAY = 24 * 60 * 60 * 1000;
export const INTERVALS = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };

/** Executes one scheduled job and moves its nextRun forward. Shared with Admin → "Run now". */
export function runJob(job, state, dispatch) {
  const admin = state.users.find((u) => u.admin);
  const scope = job.target && job.target !== 'network' ? { type: 'group', id: job.target } : { type: 'network' };
  const since = job.lastRun || Date.now() - (INTERVALS[job.interval] || DAY);
  if (job.kind === 'digest') {
    const posts = state.posts.filter((p) => p.createdAt >= since && p.status !== 'pending');
    const events = state.events.filter((e) => e.start > Date.now() && e.start < Date.now() + 14 * DAY);
    const top = [...posts].sort((a, b) => (b.likes.length + b.comments.length) - (a.likes.length + a.comments.length)).slice(0, 3);
    const lines = [
      `📬 ${job.name}: ${posts.length} new post${posts.length === 1 ? '' : 's'} since last time.`,
      ...top.map((p) => `• ${p.text.slice(0, 80)}${p.text.length > 80 ? '…' : ''}`),
      events.length ? `📅 Coming up: ${events.map((e) => e.title).join(', ')}` : '',
    ].filter(Boolean);
    dispatch({ type: 'post/create', silent: true, post: { type: 'announcement', text: lines.join('\n'), scope, authorId: admin?.id } });
  } else if (job.kind === 'inactive') {
    const cutoff = Date.now() - 30 * DAY;
    const active = new Set((state.activity || []).filter((a) => a.at >= cutoff).map((a) => a.userId));
    state.users.filter((u) => !active.has(u.id) && !u.deactivated).forEach((u) =>
      dispatch({ type: 'notify', silent: true, notification: { userId: u.id, kind: 'reminder', link: '/feed', text: 'We miss you! See what your batchmates have been up to.' } }));
  } else {
    dispatch({ type: 'post/create', silent: true, post: { type: 'announcement', text: job.text || job.name, scope, authorId: admin?.id } });
  }
  const now = Date.now();
  dispatch({ type: 'update', col: 'schedulers', id: job.id, silent: true, patch: { lastRun: now, nextRun: now + (INTERVALS[job.interval] || DAY) } });
}

/** Checks every 30 seconds for due jobs. */
export default function SchedulerRunner() {
  const { state, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const tick = () => {
      const s = latest.current;
      for (const job of s.schedulers || []) if (job.enabled && job.nextRun && job.nextRun <= Date.now()) runJob(job, s, dispatch);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [dispatch]);

  return null;
}
