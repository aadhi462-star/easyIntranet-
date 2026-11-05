import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { sentiment } from '../../lib/assist.js';
import { leaderboard } from '../../lib/gamify.js';
import { Avatar } from '../ui.jsx';
import { BarList, LineChart, PieChart, Stat } from './charts.jsx';

const DAY = 864e5;

const live = (x) => (x.status ?? 'published') === 'published';

// Base content timestamps let the graph show history even before any live activity is logged.
// Only live content counts: drafts, scheduled and pending items aren't interactions yet.
function contentEvents(s) {
  const posts = (s.posts || []).filter(live);
  const forum = (s.forumPosts || []).filter((f) => f.status !== 'draft');
  return [
    ...posts.map((p) => ({ at: p.createdAt, userId: p.authorId, module: 'Wall' })),
    ...posts.flatMap((p) => (p.comments || []).map((c) => ({ at: c.createdAt, userId: c.authorId, module: 'Wall' }))),
    ...forum.map((f) => ({ at: f.createdAt, userId: f.authorId, module: 'Forums' })),
    ...forum.flatMap((f) => (f.replies || []).map((r) => ({ at: r.createdAt, userId: r.authorId, module: 'Forums' }))),
    ...(s.channels || []).flatMap((c) => (c.messages || []).map((m) => ({ at: m.createdAt, userId: m.authorId, module: 'Channels' }))),
    ...(s.ideas || []).map((i) => ({ at: i.createdAt, userId: i.authorId, module: 'Ideas' })),
    ...(s.files || []).map((f) => ({ at: f.createdAt, userId: f.authorId ?? f.ownerId, module: 'Files' })),
    ...(s.townhalls || []).map((t) => ({ at: t.createdAt ?? t.start, userId: t.hostId, module: 'Town halls' })),
    ...(s.events || []).map((e) => ({ at: e.createdAt ?? e.start - 7 * DAY, userId: e.hostId, module: 'Events' })),
  ].filter((e) => e.at);
}

// Member-facing activity that isn't already counted from content above. Content creation
// (posts, comments, forum posts, messages, ideas, files, events, town halls) comes from the
// content itself, and admin/system actions (settings, members, workflows…) aren't engagement.
const INTERACTIONS = {
  'post/like': 'Wall', 'post/vote': 'Wall', 'post/ack': 'Wall',
  'forum/upvote': 'Forums', 'event/rsvp': 'Events', 'group/create': 'Groups', 'group/join': 'Groups',
  'manual/article': 'Manuals', 'update:ideas': 'Ideas', 'add:praise': 'Praise', 'add:answers': 'Town halls',
  'add:townhallQuestions': 'Town halls', 'add:surveyResponses': 'Surveys', 'add:tasks': 'Tasks',
};
// Toggles (like/unlike, join/leave) count once per member per item.
const ONCE = new Set(['post/like', 'post/vote', 'post/ack', 'forum/upvote', 'event/rsvp', 'group/join', 'update:ideas']);

function activityEvents(s) {
  const seen = new Set();
  const out = [];
  for (const a of s.activity || []) {
    const module = INTERACTIONS[a.type];
    if (!module || !a.userId) continue;
    const key = ONCE.has(a.type) ? `${a.type}:${a.userId}:${a.ref}` : a.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ at: a.at, userId: a.userId, module });
  }
  return out;
}

/** Members who count: not pending approval and not deactivated. */
const isMember = (u) => !u.deactivated && (u.status ?? 'active') === 'active';

export default function Analytics() {
  const { state } = useStore();
  const [range, setRange] = useState(30);

  const data = useMemo(() => {
    const since = Date.now() - range * DAY;
    const active = state.users.filter(isMember);
    const memberIds = new Set(active.map((u) => u.id));
    const all = [...contentEvents(state), ...activityEvents(state)].filter((e) => memberIds.has(e.userId));
    const events = all.filter((e) => e.at >= since);

    const buckets = Array.from({ length: range }, (_, i) => {
      const d = new Date(Date.now() - (range - 1 - i) * DAY);
      return { key: d.toDateString(), label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: 0 };
    });
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
    for (const e of events) { const b = byKey[new Date(e.at).toDateString()]; if (b) b.value++; }

    const activeIds = new Set(events.map((e) => e.userId));
    const recent = new Set(all.filter((e) => e.at >= Date.now() - 30 * DAY).map((e) => e.userId));
    const inactive30 = active.filter((u) => !recent.has(u.id));
    const score = Math.round(Math.min(100, (activeIds.size / Math.max(1, active.length)) * 70 + Math.min(30, events.length / Math.max(1, active.length) * 3)));

    const livePosts = state.posts.filter(live);
    const texts = [...livePosts.map((p) => p.text), ...livePosts.flatMap((p) => (p.comments || []).map((c) => c.text)),
      ...state.forumPosts.filter((f) => f.status !== 'draft').flatMap((f) => [f.body, ...(f.replies || []).map((r) => r.text)])].filter(Boolean);
    const senti = { happy: 0, neutral: 0, unhappy: 0 };
    texts.forEach((t) => senti[sentiment(t)]++);

    const views = state.posts.reduce((acc, p) => {
      const v = p.views || {};
      const entries = typeof v === 'number' ? [] : Object.entries(v);
      acc.total += typeof v === 'number' ? v : entries.reduce((n, [, c]) => n + (typeof c === 'number' ? c : 1), 0);
      entries.forEach(([u]) => acc.unique.add(u));
      return acc;
    }, { total: 0, unique: new Set() });

    const perModule = {};
    events.forEach((e) => { perModule[e.module] = (perModule[e.module] || 0) + 1; });

    const audience = (key) => {
      const m = {};
      for (const e of events) { const u = state.users.find((x) => x.id === e.userId); if (u) m[u[key] ?? '—'] = (m[u[key] ?? '—'] || 0) + 1; }
      return Object.entries(m).map(([label, value]) => ({ label: String(label), value })).sort((a, b) => b.value - a.value).slice(0, 6);
    };

    const newJoins = active.filter((u) => u.joinedAt && u.joinedAt >= since);
    return { buckets, events, score, senti, views, perModule, audience, newJoins, inactive30, activeIds, active };
  }, [state, range]);

  const top = leaderboard(state, Date.now() - range * DAY).slice(0, 5);
  const totalSenti = data.senti.happy + data.senti.neutral + data.senti.unhappy || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-400">Range</span>
        {[7, 30, 90].map((r) => <button key={r} className={`btn h-10 ${range === r ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRange(r)}>{r} days</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Engagement score" value={`${data.score}/100`} hint="Active members × interactions" />
        <Stat label="Interactions" value={data.events.length} hint={`Last ${range} days`} />
        <Stat label="Active members" value={`${data.activeIds.size}/${data.active.length}`} />
        <Stat label="Post views" value={data.views.total} hint={`${data.views.unique.size} unique viewers`} />
      </div>
      <section className="glass p-5">
        <h3 className="mb-3 font-bold">Engagement over time</h3>
        <LineChart points={data.buckets} label="Interactions per day" />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass p-5">
          <h3 className="mb-3 font-bold">Sentiment meter</h3>
          <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={`Happy ${data.senti.happy}, neutral ${data.senti.neutral}, unhappy ${data.senti.unhappy}`}>
            <div className="bg-emerald-400" style={{ width: `${(data.senti.happy / totalSenti) * 100}%` }} />
            <div className="bg-slate-500" style={{ width: `${(data.senti.neutral / totalSenti) * 100}%` }} />
            <div className="bg-rose-400" style={{ width: `${(data.senti.unhappy / totalSenti) * 100}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span>😊 Happy {Math.round((data.senti.happy / totalSenti) * 100)}%</span>
            <span>😐 Neutral {Math.round((data.senti.neutral / totalSenti) * 100)}%</span>
            <span>🙁 Unhappy {Math.round((data.senti.unhappy / totalSenti) * 100)}%</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Sentiment across posts, comments and forum replies.</p>
        </section>
        <section className="glass p-5">
          <h3 className="mb-3 font-bold">Content per module</h3>
          <PieChart data={Object.entries(data.perModule).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} label="Interactions per module" />
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass p-5">
          <h3 className="mb-3 font-bold">Top participants</h3>
          <ol className="space-y-2">{top.map((r, i) => (
            <li key={r.user.id} className="flex items-center gap-2 text-sm"><span className="w-4 text-slate-500">{i + 1}</span><Avatar user={r.user} size={28} />
              <Link to={`/people/${r.user.id}`} className="flex-1 truncate hover:underline">{r.user.name}</Link><span className="text-amber-200">{r.points}</span></li>
          ))}</ol>
        </section>
        <section className="glass p-5">
          <h3 className="mb-3 font-bold">New joins · {data.newJoins.length}</h3>
          {data.newJoins.length === 0 ? <p className="text-sm text-slate-400">No new members in this range.</p>
            : <ul className="space-y-1 text-sm">{data.newJoins.map((u) => <li key={u.id}><Link to={`/people/${u.id}`} className="hover:underline">{u.name}</Link></li>)}</ul>}
        </section>
        <section className="glass p-5">
          <h3 className="mb-3 font-bold">Inactive 30 days · {data.inactive30.length}</h3>
          {data.inactive30.length === 0 ? <p className="text-sm text-slate-400">Everyone has been active. 🎉</p>
            : <ul className="space-y-1 text-sm">{data.inactive30.map((u) => <li key={u.id}><Link to={`/people/${u.id}`} className="hover:underline">{u.name}</Link></li>)}</ul>}
        </section>
      </div>
      <section className="glass p-5">
        <h3 className="mb-4 font-bold">Audience engagement</h3>
        <div className="grid gap-6 md:grid-cols-3">
          {[['dept', 'By department'], ['batch', 'By batch'], ['city', 'By city']].map(([k, l]) => (
            <div key={k}><h4 className="mb-2 text-sm font-semibold text-slate-300">{l}</h4><BarList data={data.audience(k)} /></div>
          ))}
        </div>
      </section>
    </div>
  );
}
