// Notifications (Stage 4, board S4Inbox; v2 tokens, workstream D): created by the server, the
// same on every device. Each line is rebuilt when read, so something you can no longer open
// says so and shows nothing. Below the list: which kinds also arrive by email (decision S4-5).
// /notifications?settings=1 (the account menu's "Notification settings") jumps to that section.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { timeAgo } from '../lib/store.jsx';
import { fetchNotifications, fetchPrefs, markRead, savePrefs } from '../lib/engage.js';
import { errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';
import { Avatar } from '../components/ui.jsx';
import { Button, Skeleton } from '../components/ui/Controls.jsx';

export default function Notifications() {
  const nav = useNavigate();
  const [params] = useSearchParams();
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h1 text-[var(--az-text)]">Notifications</h1>
          <p className="text-2 mt-1 text-[15px]">{s.status === 'ready' ? (s.unread ? `${s.unread} unread` : 'You’re all caught up.') : ' '}</p>
        </div>
        {s.unread > 0 && <Button variant="secondary" onClick={() => read('all')}>Mark all as read</Button>}
      </header>

      <div role="group" aria-label="Show" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[['all', 'All'], ['unread', 'Unread']].map(([id, label]) => (
          <button key={id} type="button" className="filter-chip shrink-0" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}{id === 'unread' && s.unread > 0 && <span className="ml-1.5 tabular-nums">· {s.unread}</span>}
          </button>
        ))}
      </div>

      {s.status === 'loading' && !s.notifications.length ? (
        <div className="panel flex flex-col gap-5 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} lines={2} label={i === 0 ? 'Loading notifications' : 'Loading'} />)}
        </div>
      ) : s.status === 'error' ? (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <p><strong>Couldn’t load notifications.</strong> {s.message}</p>
          <Button variant="secondary" size="sm" onClick={load}>Try again</Button>
        </div>
      ) : s.notifications.length === 0 ? (
        <p className="band text-2 p-6 text-center">{tab === 'unread' ? 'Nothing unread.' : 'You’re all caught up. Replies, mentions, requests and event changes will show here.'}</p>
      ) : (
        <ul className="list-rows -mt-2 border-y border-[var(--az-divider)]">
          {s.notifications.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} disabled={!n.available && n.read}
                className="flex w-full items-start gap-3 py-4 text-left hover:bg-[var(--az-band)] disabled:cursor-default disabled:hover:bg-transparent">
                <span className="mt-4 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? 'transparent' : 'var(--az-focus)' }} aria-hidden="true" />
                {n.actor ? <Avatar user={{ id: n.actor.id, name: n.actor.name }} size={36} /> : <span className="h-9 w-9 shrink-0 rounded-full bg-[var(--az-sunken)]" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className={`block break-words text-[15px] leading-6 ${n.available ? (n.read ? 'text-2' : 'font-semibold text-[var(--az-text)]') : 'text-3 italic'}`}>{n.line}</span>
                  <span className="t-small">{timeAgo(Date.parse(n.createdAt))}{!n.read && <span className="sr-only"> · unread</span>}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <EmailSettings jump={params.get('settings') === '1'} />
    </div>
  );
}

/** Which kinds also arrive by email. Every kind always shows here in the app. */
function EmailSettings({ jump }) {
  const [cats, setCats] = useState(null);
  const [busy, setBusy] = useState(null);
  const heading = useRef(null);
  const { key } = useLocation(); // each visit to ?settings=1 jumps again
  const ready = !!cats?.length;
  useEffect(() => { fetchPrefs().then(setCats, () => setCats([])); }, []);
  useEffect(() => {
    if (!jump || !ready || !heading.current) return;
    heading.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    heading.current.focus({ preventScroll: true });
  }, [jump, ready, key]);
  const toggle = async (c) => {
    setBusy(c.id);
    try { setCats(await savePrefs({ [c.id]: !c.email })); toast(c.email ? `No more emails for ${c.label.toLowerCase()}` : `Emails on for ${c.label.toLowerCase()}`); }
    catch (e) { toast(errorText(e), 'error'); } finally { setBusy(null); }
  };
  if (!ready) return null;
  return (
    <section id="email-settings" aria-labelledby="email-h" className="flex scroll-mt-24 flex-col gap-3 pt-4">
      <h2 id="email-h" ref={heading} tabIndex={-1} className="t-h2 text-[var(--az-text)]">Email settings</h2>
      <p className="text-2 text-sm">Everything appears here in the app. Choose what also arrives by email. Emails say who did what and where, never what a post says.</p>
      <div className="panel overflow-hidden">
        <div aria-hidden="true" className="t-label hidden grid-cols-[1fr_120px_140px] gap-4 border-b border-[var(--az-hairline)] bg-[var(--az-band)] px-4 py-2.5 sm:grid">
          <span>Kind</span><span>In the app</span><span>Email</span>
        </div>
        <ul className="list-rows">
          {cats.map((c) => (
            <li key={c.id} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:grid sm:grid-cols-[1fr_120px_140px]">
              <span className="min-w-0 text-sm text-[var(--az-text)]">{c.label}{c.email === c.default ? '' : <span className="text-3"> · changed</span>}</span>
              <span className="text-3 hidden text-sm sm:block">Always</span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[var(--az-focus)]" checked={c.email} disabled={busy === c.id} onChange={() => toggle(c)} />
                <span className="text-[var(--az-text)]">Email me</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
