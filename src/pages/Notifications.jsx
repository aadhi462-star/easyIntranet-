import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo, useStore } from '../lib/store.jsx';
import { Empty, PageHeader, Tabs } from '../components/ui.jsx';

const ICONS = { mandatory: '📌', event: '📅', like: '❤️', group: '👥', mention: '@', workflow: '⚡', badge: '🏅', reminder: '⏰', app: '🧩', info: '🔔' };
const isMention = (n) => n.kind === 'mention' || /mentioned you|@/.test(n.text);

export default function Notifications() {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState('all');
  const mine = state.notifications.filter((n) => (!n.userId || n.userId === me.id) && (!n.adminOnly || me.admin));
  const filters = {
    all: () => true,
    unread: (n) => !n.read,
    mentions: isMention,
    events: (n) => n.kind === 'event',
  };
  const list = mine.filter(filters[tab]);

  const open = (n) => {
    dispatch({ type: 'notif/read', id: n.id, silent: true });
    if (n.link) nav(n.link);
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle={`${mine.filter((n) => !n.read).length} unread`}
        actions={<button className="btn btn-ghost" onClick={() => mine.forEach((n) => !n.read && dispatch({ type: 'notif/read', id: n.id, silent: true }))}>Mark all as read</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'all', label: 'All', count: mine.length },
        { id: 'unread', label: 'Unread', count: mine.filter((n) => !n.read).length },
        { id: 'mentions', label: 'Mentions', count: mine.filter(isMention).length },
        { id: 'events', label: 'Events', count: mine.filter(filters.events).length },
      ]} />
      {list.length === 0 ? <Empty icon="🔕" title="You’re all caught up" /> : (
        <ul className="glass divide-y divide-white/5">
          {list.map((n) => (
            <li key={n.id} className="flex items-center gap-3 p-3 sm:p-4">
              <button onClick={() => open(n)} className="flex min-h-11 flex-1 items-center gap-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5" aria-hidden="true">{ICONS[n.kind] ?? '🔔'}</span>
                <span className="flex-1">
                  <span className={`block text-sm ${n.read ? 'text-slate-300' : 'font-semibold text-white'}`}>{n.text}</span>
                  <span className="text-xs text-slate-500">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" aria-label="Unread" />}
              </button>
              {!n.read && <button className="btn btn-ghost h-11 text-xs" onClick={() => dispatch({ type: 'notif/read', id: n.id, silent: true })}>Mark read</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
