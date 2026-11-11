// Notifications (Stage 4, board S4Inbox): created by the server, the same on every device. Each
// line is rebuilt when read, so something you can no longer open says so and shows nothing.
// Below the list: which kinds also arrive by email (decision S4-5).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../lib/store.jsx';
import { fetchNotifications, fetchPrefs, markRead, savePrefs } from '../lib/engage.js';
import { errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';
import { Avatar, PageHeader, Tabs } from '../components/ui.jsx';

export default function Notifications() {
  const nav = useNavigate();
  const [tab, setTab] = useState('all');
  const [s, setS] = useState({ status: 'loading', notifications: [], unread: 0 });
  const load = useCallback(() => fetchNotifications(tab === 'unread')
    .then((d) => setS({ status: 'ready', ...d }))
    .catch((e) => setS((p) => ({ ...p, status: 'error', message: errorText(e) }))), [tab]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = 'Notifications · CommunityOne'; }, []);

  const read = async (ids) => {
    try { const unread = await markRead(ids); setS((p) => ({ ...p, unread, notifications: p.notifications.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n)) })); }
    catch (e) { toast(errorText(e), 'error'); }
  };
  const open = (n) => {
    if (!n.read) read([n.id]);
    if (n.href) nav(n.href);
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="Notifications" subtitle={s.status === 'ready' ? (s.unread ? `${s.unread} unread` : 'You’re all caught up.') : ' '}
        actions={s.unread > 0 && <button className="btn btn-ghost" onClick={() => read('all')}>Mark all as read</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread', count: s.unread }]} />
      {s.status === 'loading' && !s.notifications.length ? <div aria-busy="true" aria-label="Loading notifications" className="glass h-40 animate-pulse" />
        : s.status === 'error' ? <div role="alert" className="glass p-5 text-sm"><p className="text-rose-300">{s.message}</p><button className="btn btn-ghost mt-3" onClick={load}>Try again</button></div>
          : s.notifications.length === 0 ? <p className="band text-2 p-6 text-center">{tab === 'unread' ? 'Nothing unread.' : 'You’re all caught up. Replies, mentions, requests and event changes will show here.'}</p>
            : (
              <ul className="list-rows -mt-2">
                {s.notifications.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => open(n)} disabled={!n.available && n.read}
                      className="flex w-full items-start gap-3 py-4 text-left disabled:cursor-default">
                      <span className="mt-3 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : 'var(--color-brand-400)' }} aria-hidden="true" />
                      {n.actor ? <Avatar user={{ id: n.actor.id, name: n.actor.name }} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--az-sunken)]" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] leading-6 ${n.available ? (n.read ? 'text-2' : 'font-semibold text-white') : 'text-3 italic'}`}>{n.line}</span>
                        <span className="t-small">{timeAgo(Date.parse(n.createdAt))}{!n.read && <span className="sr-only"> · unread</span>}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      <EmailSettings />
    </div>
  );
}

/** Which kinds also arrive by email. Every kind always shows here in the app. */
function EmailSettings() {
  const [cats, setCats] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { fetchPrefs().then(setCats, () => setCats([])); }, []);
  const toggle = async (c) => {
    setBusy(c.id);
    try { setCats(await savePrefs({ [c.id]: !c.email })); toast(c.email ? `No more emails for ${c.label.toLowerCase()}` : `Emails on for ${c.label.toLowerCase()}`); }
    catch (e) { toast(errorText(e), 'error'); } finally { setBusy(null); }
  };
  if (!cats?.length) return null;
  return (
    <section aria-labelledby="email-h" className="flex flex-col gap-3">
      <h2 id="email-h" className="t-h2 text-white">Email settings</h2>
      <p className="text-2 text-sm">Everything appears here in the app. Choose what also arrives by email. Emails say who did what and where, never what a post says.</p>
      <ul className="glass list-rows px-4">
        {cats.map((c) => (
          <li key={c.id} className="flex min-h-14 items-center justify-between gap-4 py-2">
            <span className="text-sm text-white">{c.label}{c.email === c.default ? '' : <span className="text-3"> · changed</span>}</span>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand-400)]" checked={c.email} disabled={busy === c.id} onChange={() => toggle(c)} />
              <span className="text-2">Email me</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
