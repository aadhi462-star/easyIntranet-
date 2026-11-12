import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { isLive, isPublicPost } from '../../components/feed/utils.js';

const DAY = 24 * 60 * 60 * 1000;
export const INTERVALS = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };

/** Executes one scheduled job and moves its nextRun forward. Shared with Admin → "Run now". */
export function runJob(job, state, dispatch) {
  const admin = state.users.find((u) => u.admin);
  const scope = job.target && job.target !== 'network' ? { type: 'group', id: job.target } : { type: 'network' };
  const since = job.lastRun || Date.now() - (INTERVALS[job.interval] || DAY);
  if (job.kind === 'digest') {
    // Only live posts the digest's audience can see: public ones, or the target group's own.
    const inTarget = (s) => scope.type === 'group' && s?.type === 'group' && s.id === scope.id;
    const posts = state.posts.filter((p) => p.createdAt >= since && isLive(p) && (isPublicPost(state, p) || inTarget(p.scope)));
    const events = state.events.filter((e) => e.start > Date.now() && e.start < Date.now() + 14 * DAY
      && (e.scope?.type === 'network' || inTarget(e.scope)));
    const top = [...posts].sort((a, b) => (b.likes.length + b.comments.length) - (a.likes.length + a.comments.length)).slice(0, 3);
    const lines = [
      `${job.name}: ${posts.length} new post${posts.length === 1 ? '' : 's'} since last time.`,
      ...top.map((p) => `• ${p.text.slice(0, 80)}${p.text.length > 80 ? '…' : ''}`),
      events.length ? `Coming up: ${events.map((e) => e.title).join(', ')}` : '',
    ].filter(Boolean);
    dispatch({ type: 'post/create', silent: true, post: { id: `dg-${job.id}-${job.nextRun ?? 0}`, type: 'announcement', text: lines.join('\n'), scope, authorId: admin?.id } });
  } else if (job.kind === 'inactive') {
    const cutoff = Date.now() - 30 * DAY;
    const active = new Set((state.activity || []).filter((a) => a.at >= cutoff).map((a) => a.userId));
    state.users.filter((u) => !active.has(u.id) && !u.deactivated).forEach((u) =>
      dispatch({ type: 'notify', silent: true, notification: { id: `in-${job.id}-${job.nextRun ?? 0}-${u.id}`, userId: u.id, kind: 'reminder', link: '/feed', text: 'We miss you! See what your batchmates have been up to.' } }));
  } else {
    dispatch({ type: 'post/create', silent: true, post: { id: `an-${job.id}-${job.nextRun ?? 0}`, type: 'announcement', text: job.text || job.name, scope, authorId: admin?.id } });
  }
  const now = Date.now();
  dispatch({ type: 'update', col: 'schedulers', id: job.id, silent: true, patch: { lastRun: now, nextRun: now + (INTERVALS[job.interval] || DAY) } });
}

// Due runs already started, keyed by job and the nextRun they were due at. Module-level so
// StrictMode's double effect (and a stale state snapshot before the update lands) can't
// fire the same run twice.
const handled = new Set();

/** Checks every 30 seconds for due jobs. */
export default function SchedulerRunner() {
  const { state, dispatch } = useStore();
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const tick = () => {
      const s = latest.current;
      for (const job of s.schedulers || []) {
        if (!job.enabled || !job.nextRun || job.nextRun > Date.now()) continue;
        const key = `${job.id}:${job.nextRun}`;
        if (handled.has(key)) continue;
        handled.add(key);
        runJob(job, s, dispatch);
      }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [dispatch]);

  return null;
}
