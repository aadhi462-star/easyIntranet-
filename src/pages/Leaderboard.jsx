import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, timeAgo } from '../lib/store.jsx';
import { statsFor, leaderboard, LEVELS, BADGES, POINTS } from '../lib/gamify.js';
import { Avatar, PageHeader, Tabs } from '../components/ui.jsx';
import { PraiseModal, PRAISE_BADGES, praiseBadge, isActiveUser } from '../components/people/shared.jsx';

const day = 86400e3;
const PERIODS = [{ id: 'week', label: 'This week', ms: 7 * day }, { id: 'month', label: 'This month', ms: 30 * day }, { id: 'all', label: 'All time', ms: null }];

// Arcade: challenges computed from the activity counts that statsFor returns.
const CHALLENGES = [
  { id: 'post3', icon: '✍️', title: 'Post 3 times on the wall', goal: 3, count: (c) => c['post/create'] || 0, reward: 'Storyteller' },
  { id: 'rsvp2', icon: '🎟️', title: 'RSVP to 2 events', goal: 2, count: (c) => c['event/rsvp'] || 0, reward: 'Show Up' },
  { id: 'answer1', icon: '🙋', title: 'Answer a question', goal: 1, count: (c) => (c['add:answers'] || 0) + (c['forum/reply'] || 0), reward: 'Helping Hand' },
  { id: 'praise2', icon: '🙌', title: 'Praise 2 fellow alumni', goal: 2, count: (c) => c['add:praise'] || 0, reward: 'Cheerleader' },
  { id: 'idea1', icon: '💡', title: 'Share an idea', goal: 1, count: (c) => c['add:ideas'] || 0, reward: 'Spark' },
  { id: 'comment5', icon: '💬', title: 'Leave 5 comments', goal: 5, count: (c) => c['post/comment'] || 0, reward: 'Chatterbox' },
  { id: 'join2', icon: '👥', title: 'Join 2 groups', goal: 2, count: (c) => c['group/join'] || 0, reward: 'Joiner' },
  { id: 'survey1', icon: '📋', title: 'Answer a survey', goal: 1, count: (c) => c['add:surveyResponses'] || 0, reward: 'Voice' },
];

export default function Leaderboard() {
  const { state, me, user, dispatch } = useStore();
  const [tab, setTab] = useState('board');
  const [period, setPeriod] = useState('week');
  const [praise, setPraise] = useState(false);
  const mine = statsFor(state, me.id);

  const { contributors, awardees } = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period);
    const since = p.ms ? Date.now() - p.ms : 0;
    const praiseIn = (state.praise || []).filter((x) => (x.createdAt || 0) >= since);
    let contributors;
    if (!p.ms) contributors = leaderboard(state).filter((r) => isActiveUser(r.user)).map((r) => ({ user: r.user, points: r.points, level: r.level }));
    else {
      const pts = {};
      for (const a of state.activity || []) if (a.at >= since && a.userId) pts[a.userId] = (pts[a.userId] || 0) + (a.points || 0);
      for (const x of praiseIn) pts[x.toId] = (pts[x.toId] || 0) + 5;
      contributors = state.users.filter(isActiveUser).map((u) => ({ user: u, points: pts[u.id] || 0, level: statsFor(state, u.id).level })).sort((a, b) => b.points - a.points);
    }
    const counts = {};
    for (const x of praiseIn) counts[x.toId] = (counts[x.toId] || 0) + 1;
    const awardees = Object.entries(counts).map(([id, n]) => ({ user: user(id), n })).filter((x) => isActiveUser(x.user)).sort((a, b) => b.n - a.n);
    // Only people who scored in the period; competition ranking so ties share a rank (1, 1, 3…).
    const ranked = contributors.filter((r) => r.points > 0).sort((a, b) => b.points - a.points);
    ranked.forEach((r, i) => { r.rank = i > 0 && ranked[i - 1].points === r.points ? ranked[i - 1].rank : i + 1; });
    return { contributors: ranked.slice(0, 10), awardees };
  }, [state, period, user]);

  const claimed = (state.badgeAwards || []).filter((b) => b.toId === me.id).map((b) => b.badgeId);
  const claim = (c) => {
    dispatch({ type: 'add', col: 'badgeAwards', item: { toId: me.id, badgeId: `arcade-${c.id}` } });
    dispatch({ type: 'notify', notification: { userId: me.id, kind: 'badge', text: `You unlocked the ${c.reward} badge ${c.icon}`, link: '/leaderboard' } });
  };

  return (
    <div>
      <PageHeader title="Recognition" subtitle="Points, levels, badges and praise across the community"
        actions={<button className="btn btn-primary min-h-11" onClick={() => setPraise(true)}>🙌 Give praise</button>} />

      <section className="glass mb-5 flex flex-wrap items-center gap-4 p-5">
        <Avatar user={me} size={52} />
        <div className="flex-1">
          <div className="font-semibold">You’re a <span className="text-brand-gradient">{mine.level.name}</span></div>
          <div className="text-sm text-slate-400">{mine.points} points · {mine.badges.length} badges</div>
          {mine.nextLevel && <div className="mt-2 h-2 max-w-sm overflow-hidden rounded-full bg-white/10"><div className="brand-gradient h-full" style={{ width: `${Math.round(((mine.points - mine.level.min) / (mine.nextLevel.min - mine.level.min)) * 100)}%` }} /></div>}
        </div>
        {mine.nextLevel && <div className="text-sm text-slate-400">{mine.nextLevel.min - mine.points} pts to {mine.nextLevel.name}</div>}
      </section>

      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'board', label: 'Leaderboard' }, { id: 'praise', label: 'Praise wall' }, { id: 'badges', label: 'Badges' }, { id: 'arcade', label: 'Arcade' }, { id: 'how', label: 'Points & levels' }]} />

      {tab === 'board' && (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Period">
            {PERIODS.map((p) => <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={`btn min-h-11 ${period === p.id ? 'btn-primary' : 'btn-ghost'}`}>{p.label}</button>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="glass p-5 lg:col-span-2">
              <h2 className="font-bold">Top contributors</h2>
              {contributors.length === 0 && <p className="mt-2 text-sm text-slate-500">No one has earned points in this period yet.</p>}
              <ol className="mt-3 space-y-1">
                {contributors.map((r) => (
                  <li key={r.user.id} className={`flex items-center gap-3 rounded-xl p-2 ${r.user.id === me.id ? 'bg-brand-500/15' : ''}`}>
                    <span className="w-8 text-center text-lg font-bold" aria-label={`Rank ${r.rank}`}>{['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank}</span>
                    <Avatar user={r.user} size={36} />
                    <Link to={`/people/${r.user.id}`} className="min-w-0 flex-1"><div className="truncate font-semibold">{r.user.name}</div><div className="text-xs text-slate-400">{r.level.name}</div></Link>
                    <span className="font-bold text-amber-200">{r.points}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="glass p-5">
              <h2 className="font-bold">Top awardees</h2>
              {awardees.length ? <ol className="mt-3 space-y-2">{awardees.slice(0, 8).map((a) => (
                <li key={a.user.id} className="flex items-center gap-3"><Avatar user={a.user} size={32} /><Link to={`/people/${a.user.id}`} className="flex-1 truncate text-sm font-semibold">{a.user.name}</Link><span className="chip">🙌 {a.n}</span></li>
              ))}</ol> : <p className="mt-2 text-sm text-slate-500">No praise in this period yet.</p>}
            </section>
          </div>
        </>
      )}

      {tab === 'praise' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...(state.praise || [])].sort((a, b) => b.createdAt - a.createdAt).map((p) => { const b = praiseBadge(p.badge); return (
            <article key={p.id} className="glass p-5">
              <div className="flex items-center gap-2 text-sm"><span className="text-2xl">{b.icon}</span><b>{b.name}</b><span className="ml-auto text-xs text-slate-500">{timeAgo(p.createdAt)}</span></div>
              <p className="mt-3 text-slate-200">“{p.message}”</p>
              <p className="mt-3 text-sm text-slate-400"><Link className="font-semibold text-white hover:underline" to={`/people/${p.fromId}`}>{user(p.fromId)?.name}</Link> → <Link className="font-semibold text-white hover:underline" to={`/people/${p.toId}`}>{user(p.toId)?.name}</Link></p>
            </article>); })}
        </div>
      )}

      {tab === 'badges' && (
        <div className="space-y-5">
          <section><h2 className="mb-3 font-bold">Achievement badges</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BADGES.map((b) => { const got = mine.badges.includes(b.id); return (
                <div key={b.id} className={`glass p-4 text-center ${got ? '' : 'opacity-45 grayscale'}`}>
                  <div className="text-3xl">{b.icon}</div><div className="mt-2 font-semibold">{b.name}</div><div className="text-xs text-slate-400">{b.desc}</div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider">{got ? '✓ Earned' : '🔒 Locked'}</div>
                </div>); })}
            </div>
          </section>
          <section><h2 className="mb-3 font-bold">Praise badges you can give</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">{PRAISE_BADGES.map((b) => <div key={b.id} className="glass p-3 text-center"><div className="text-2xl">{b.icon}</div><div className="mt-1 text-sm">{b.name}</div></div>)}</div>
          </section>
        </div>
      )}

      {tab === 'arcade' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {CHALLENGES.map((c) => {
            const n = Math.min(c.goal, c.count(mine.counts));
            const done = n >= c.goal;
            const has = claimed.includes(`arcade-${c.id}`);
            return (
              <article key={c.id} className="glass flex items-center gap-4 p-4">
                <span className="text-3xl" aria-hidden="true">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-xs text-slate-400">Reward: {c.reward} badge</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={n}><div className="brand-gradient h-full" style={{ width: `${(n / c.goal) * 100}%` }} /></div>
                  <div className="mt-1 text-[11px] text-slate-500">{n}/{c.goal}</div>
                </div>
                {has ? <span className="chip !bg-emerald-500/15 !text-emerald-200">✓ Claimed</span>
                  : <button className="btn btn-primary min-h-11" disabled={!done} onClick={() => claim(c)}>Claim</button>}
              </article>
            );
          })}
        </div>
      )}

      {tab === 'how' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass p-5">
            <h2 className="font-bold">Levels</h2>
            <ol className="mt-3 space-y-2">{LEVELS.map((l) => <li key={l.name} className={`flex justify-between rounded-xl px-3 py-2 ${mine.level.name === l.name ? 'bg-brand-500/20' : ''}`}><span className="font-semibold">{l.name}</span><span className="text-slate-400">{l.min}+ pts</span></li>)}</ol>
          </section>
          <section className="glass p-5">
            <h2 className="font-bold">How to earn points</h2>
            <ul className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {Object.entries(POINTS).filter(([, v]) => v > 0).map(([k, v]) => <li key={k} className="flex justify-between rounded-lg px-2 py-1 hover:bg-white/5"><span className="text-slate-300">{labelFor(k)}</span><b className="text-amber-200">+{v}</b></li>)}
              <li className="flex justify-between rounded-lg px-2 py-1"><span className="text-slate-300">Receiving praise</span><b className="text-amber-200">+5</b></li>
            </ul>
          </section>
        </div>
      )}

      {praise && <PraiseModal onClose={() => setPraise(false)} />}
    </div>
  );
}

const LABELS = { 'post/create': 'Publishing a post', 'post/comment': 'Commenting', 'post/like': 'Liking', 'post/vote': 'Voting in a poll', 'post/ack': 'Acknowledging a mandatory read',
  'forum/save': 'Starting a forum topic', 'forum/reply': 'Replying in forums', 'forum/upvote': 'Upvoting a topic', 'event/create': 'Hosting an event', 'event/rsvp': 'RSVPing',
  'group/create': 'Creating a group', 'group/join': 'Joining a group', 'channel/send': 'Sending a channel message', 'manual/article': 'Writing a manual article',
  'add:ideas': 'Sharing an idea', 'add:praise': 'Giving praise', 'add:answers': 'Answering a question', 'add:townhallQuestions': 'Asking at a town hall',
  'add:surveyResponses': 'Answering a survey', 'add:tasks': 'Creating a task', 'add:files': 'Uploading a file' };
const labelFor = (k) => LABELS[k] ?? k;
