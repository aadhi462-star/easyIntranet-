import { Glyph } from '../icons.jsx';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Empty } from '../ui.jsx';
import { canSeeTownhall } from './eventUtils.js';

export const STATUS_STYLES = {
  live: '!bg-[var(--az-danger-soft)] !text-[var(--az-danger)]',
  upcoming: '!bg-brand-500/20 !text-brand-200',
  ended: '!bg-[var(--az-sunken)] !text-[var(--az-text-2)]',
};

/**
 * Status to show for a session. 'live' and 'ended' are set by moderators and always win;
 * an 'upcoming' session is derived from its times so stale data doesn't look scheduled.
 * Returns { key: 'live' | 'upcoming' | 'ended', label }.
 */
export function displayStatus(th, now = Date.now()) {
  if (th.status === 'live') return { key: 'live', label: '● Live now' };
  if (th.status === 'ended' || (th.end && now > th.end)) return { key: 'ended', label: 'Ended' };
  if (now >= th.start) return { key: 'upcoming', label: 'Running late' };
  if (th.start - now <= 15 * 60e3) return { key: 'upcoming', label: 'Starting soon' };
  return { key: 'upcoming', label: 'Upcoming' };
}

export function TownHallCard({ th }) {
  const { state } = useStore();
  const qs = (state.townhallQuestions || []).filter((q) => q.townhallId === th.id && q.status !== 'hidden' && q.status !== 'pending');
  const answered = qs.filter((q) => q.status === 'answered').length;
  const group = th.groupId && state.groups.find((g) => g.id === th.groupId);
  const st = displayStatus(th);
  return (
    <Link to={`/townhalls/${th.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${STATUS_STYLES[st.key]}`}>{st.label}</span>
        {group && <span className="chip !bg-[var(--az-sunken)] !text-[var(--az-text-2)]">{group.name}</span>}
        {th.allowAnonymous && <span className="chip !bg-[var(--az-sunken)] !text-[var(--az-text-2)]">Anonymous questions on</span>}
      </div>
      <h3 className="mt-3 font-bold"><Glyph value="mic" tile={false} size={16} /> {th.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-3">{th.description}</p>
      <p className="mt-3 text-xs text-3">
        {new Date(th.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {' · '}{qs.length} question{qs.length === 1 ? '' : 's'}{answered ? ` · ${answered} answered` : ''}
      </p>
    </Link>
  );
}

/** Town hall sessions, optionally limited to one group and/or one status. */
export default function TownHallList({ groupId, status }) {
  const { state, me } = useStore();
  const order = { live: 0, upcoming: 1, ended: 2 };
  const now = Date.now();
  const list = (state.townhalls || [])
    .filter((t) => canSeeTownhall(t, me, state.groups))
    .map((t) => ({ t, s: displayStatus(t, now).key }))
    .filter(({ t, s }) => (groupId ? t.groupId === groupId : true) && (status ? s === status : true))
    .sort((a, b) => order[a.s] - order[b.s] || (a.s === 'ended' ? b.t.start - a.t.start : a.t.start - b.t.start))
    .map(({ t }) => t);
  if (!list.length) return <Empty icon="mic" title="No town halls here yet">{groupId ? 'Group admins can host a Q&A session for this group.' : ''}</Empty>;
  return <div className="grid gap-4 md:grid-cols-2">{list.map((th) => <TownHallCard key={th.id} th={th} />)}</div>;
}
