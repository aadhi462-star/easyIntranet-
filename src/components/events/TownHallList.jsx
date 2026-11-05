import { Glyph } from '../icons.jsx';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';

export const STATUS_STYLES = {
  live: '!bg-rose-500/20 !text-rose-200',
  upcoming: '!bg-brand-500/20 !text-brand-200',
  ended: '!bg-white/10 !text-slate-400',
};

export function TownHallCard({ th }) {
  const { state } = useStore();
  const qs = (state.townhallQuestions || []).filter((q) => q.townhallId === th.id && q.status !== 'hidden' && q.status !== 'pending');
  const answered = qs.filter((q) => q.status === 'answered').length;
  const group = th.groupId && state.groups.find((g) => g.id === th.groupId);
  return (
    <Link to={`/townhalls/${th.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${STATUS_STYLES[th.status]}`}>{th.status === 'live' ? '● Live now' : th.status === 'upcoming' ? 'Upcoming' : 'Ended'}</span>
        {group && <span className="chip !bg-white/5 !text-slate-300">{group.emoji} {group.name}</span>}
        {th.allowAnonymous && <span className="chip !bg-white/5 !text-slate-400">Anonymous questions on</span>}
      </div>
      <h3 className="mt-3 font-bold"><Glyph value="🎤" tile={false} size={16} /> {th.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-400">{th.description}</p>
      <p className="mt-3 text-xs text-slate-400">
        {new Date(th.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {' · '}{qs.length} question{qs.length === 1 ? '' : 's'}{answered ? ` · ${answered} answered` : ''}
      </p>
    </Link>
  );
}

/** Town hall sessions, optionally limited to one group and/or one status. */
export default function TownHallList({ groupId, status }) {
  const { state } = useStore();
  const order = { live: 0, upcoming: 1, ended: 2 };
  const list = (state.townhalls || [])
    .filter((t) => (groupId ? t.groupId === groupId : true) && (status ? t.status === status : true))
    .sort((a, b) => order[a.status] - order[b.status] || (a.status === 'ended' ? b.start - a.start : a.start - b.start));
  if (!list.length) return <Empty icon="🎤" title="No town halls here yet">{groupId ? 'Group admins can host a Q&A session for this group.' : ''}</Empty>;
  return <div className="grid gap-4 md:grid-cols-2">{list.map((th) => <TownHallCard key={th.id} th={th} />)}</div>;
}
