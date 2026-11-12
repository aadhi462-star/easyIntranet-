import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { api } from '../../lib/api.js';
import { toast } from '../../lib/toast.js';
import { Avatar, Field, Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

export const PRAISE_BADGES = [
  { id: 'mentor', icon: 'explore', name: 'Mentor' },
  { id: 'helper', icon: 'like', name: 'Helper' },
  { id: 'rockstar', icon: 'star', name: 'Rockstar' },
  { id: 'teamplayer', icon: 'groups', name: 'Team Player' },
  { id: 'innovator', icon: 'ideas', name: 'Innovator' },
  { id: 'organiser', icon: 'share', name: 'Great Organiser' },
];
export const praiseBadge = (id) => PRAISE_BADGES.find((b) => b.id === id) ?? PRAISE_BADGES[0];

/** Pending and deactivated accounts are hidden from the directory, leaderboard and pickers. */
export const isActiveUser = (u) => !!u && !u.deactivated && (u.status ?? 'active') === 'active';

export const CONTACT_PRIVACY = [['everyone', 'Everyone in the community'], ['following', 'Only my connections'], ['me', 'Only me']];

/** user.privacy.contact: everyone (default) | following (people the owner follows) | me. */
export function canSeeContact(state, viewerId, target) {
  if (!target || viewerId === target.id) return true;
  // Profiles from the server already say whether this viewer may see contact details.
  if (target.contactHidden !== undefined) return !target.contactHidden;
  const rule = target.privacy?.contact ?? 'everyone';
  if (rule === 'everyone') return true;
  if (rule === 'following') return (state.follows || []).some((f) => f.authorId === target.id && f.targetId === viewerId);
  return false;
}

export function useBlocks() {
  const { state, me, dispatch } = useStore();
  const mine = (state.blocks || []).filter((b) => b.authorId === me.id);
  const blocked = new Set(mine.map((b) => b.targetId));
  // The server enforces blocks (profiles, directory, connections); the local copy still hides
  // chats and content in screens that haven't moved to the server yet.
  const toggle = async (targetId) => {
    const rec = mine.find((b) => b.targetId === targetId);
    try {
      await api(`/blocks/${encodeURIComponent(targetId)}`, { method: rec ? 'DELETE' : 'POST' });
    } catch (err) { toast(`Couldn’t ${rec ? 'unblock' : 'block'}: ${err.message}`, 'error'); return; }
    if (rec) dispatch({ type: 'remove', col: 'blocks', id: rec.id });
    else dispatch({ type: 'add', col: 'blocks', item: { targetId } });
    toast(rec ? 'Unblocked' : 'Blocked');
  };
  return { blocked, toggle };
}

/** Connect / Requested / Accept–Decline / Connected, driven by the server's relation. */
export function ConnectButton({ userId, initial, onChange, className = '' }) {
  const [rel, setRel] = useState(initial ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (initial) setRel(initial); }, [initial]);
  useEffect(() => {
    if (initial) return undefined;
    let live = true;
    api(`/connections/${encodeURIComponent(userId)}`).then((r) => { if (live) setRel(r.relation.connection); }).catch(() => {});
    return () => { live = false; };
  }, [userId, initial]);
  const run = async (path, method, done) => {
    setBusy(true);
    try {
      const r = await api(path, { method });
      setRel(r.relation.connection); onChange?.(r.relation.connection);
      if (done) toast(done);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const base = `/connections/${encodeURIComponent(userId)}`;
  if (!rel || rel === 'self') return null;
  if (rel === 'incoming') {
    return (
      <span className={`inline-flex gap-2 ${className}`}>
        <button className="btn btn-primary min-h-11" disabled={busy} onClick={() => run(`${base}/accept`, 'POST', 'Connected')}>Accept</button>
        <button className="btn btn-ghost min-h-11" disabled={busy} onClick={() => run(`${base}/decline`, 'POST', 'Request declined')}>Decline</button>
      </span>
    );
  }
  if (rel === 'outgoing') return <button className={`btn btn-ghost min-h-11 ${className}`} disabled={busy} title="Cancel request" onClick={() => run(base, 'DELETE', 'Request cancelled')}>Requested · Cancel</button>;
  if (rel === 'connected') {
    return <button className={`btn btn-ghost min-h-11 ${className}`} disabled={busy} title="Remove connection"
      onClick={async () => { if ((await confirmAction('Remove this connection? You can connect again later.'))) run(base, 'DELETE', 'Connection removed'); }}>✓ Connected</button>;
  }
  return <button className={`btn btn-primary min-h-11 ${className}`} disabled={busy} onClick={() => run(base, 'POST', 'Request sent')}>Connect</button>;
}

export function useFollow(targetId) {
  const { state, me, dispatch } = useStore();
  const rec = (state.follows || []).find((f) => f.authorId === me.id && f.targetId === targetId);
  const toggle = () => {
    if (rec) dispatch({ type: 'remove', col: 'follows', id: rec.id });
    else {
      dispatch({ type: 'add', col: 'follows', item: { targetId } });
      dispatch({ type: 'notify', notification: { userId: targetId, kind: 'follow', text: `${me.name} started following you`, link: `/people/${me.id}` } });
    }
  };
  return [!!rec, toggle];
}

export function FollowButton({ userId, className = '' }) {
  const { me } = useStore();
  const [following, toggle] = useFollow(userId);
  if (userId === me.id) return null;
  return (
    // Secondary in both states: a directory shows one per person, so lime here would mean dozens
    // of primary buttons on one screen.
    <button className={`btn btn-ghost min-h-11 ${following ? 'text-3' : ''} ${className}`} onClick={toggle} aria-pressed={following}>
      {following ? '✓ Following' : '+ Follow'}
    </button>
  );
}

/** Opens (or creates) a 1:1 direct message and returns the route to navigate to. */
export function useOpenDm() {
  const { state, me, dispatch } = useStore();
  return (userId) => {
    // Blocked pairs land on the (empty) messages list instead of a chat.
    if ((state.blocks || []).some((b) => (b.authorId === me.id && b.targetId === userId) || (b.authorId === userId && b.targetId === me.id))) return '/channels';
    const existing = (state.dms || []).find((d) => d.members.length === 2 && d.members.includes(me.id) && d.members.includes(userId));
    if (existing) return `/messages/${existing.id}`;
    const id = `dm${Date.now().toString(36)}`;
    dispatch({ type: 'add', col: 'dms', item: { id, members: [me.id, userId], messages: [] } });
    return `/messages/${id}`;
  };
}

export function PeoplePicker({ value, onChange, exclude = [], placeholder = 'Search people…', single = false }) {
  const { state, user } = useStore();
  const [q, setQ] = useState('');
  const matches = q.trim()
    ? state.users.filter((u) => isActiveUser(u) && !exclude.includes(u.id) && !value.includes(u.id) && u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="chip !py-1">
              {user(id)?.name}
              <button type="button" aria-label={`Remove ${user(id)?.name}`} onClick={() => onChange(value.filter((v) => v !== id))} className="ml-1 opacity-70 hover:opacity-100">✕</button>
            </span>
          ))}
        </div>
      )}
      {!(single && value.length) && <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />}
      {matches.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-850">
          {matches.map((u) => (
            <li key={u.id}>
              <button type="button" className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm hover:bg-white/5"
                onClick={() => { onChange(single ? [u.id] : [...value, u.id]); setQ(''); }}>
                <Avatar user={u} size={28} /> <span>{u.name}</span><span className="ml-auto text-xs text-slate-500">{u.batch} · {u.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Give praise: records it, shares a 'praise' post on the network wall and notifies the person. */
export function PraiseModal({ toId: initialTo, onClose }) {
  const { me, user, dispatch } = useStore();
  const [to, setTo] = useState(initialTo ? [initialTo] : []);
  const [badge, setBadge] = useState('rockstar');
  const [message, setMessage] = useState('');
  const [shareOnWall, setShareOnWall] = useState(true);
  const submit = (e) => {
    e.preventDefault();
    if (!to.length || !message.trim()) return;
    const toId = to[0];
    const b = praiseBadge(badge);
    dispatch({ type: 'add', col: 'praise', item: { fromId: me.id, toId, badge, message: message.trim() } });
    if (shareOnWall) {
      dispatch({ type: 'post/create', post: { type: 'praise', scope: { type: 'network' }, praise: { toId, badge },
        text: `${b.name} praise for @${user(toId).name}: ${message.trim()}` } });
    }
    dispatch({ type: 'notify', notification: { userId: toId, kind: 'praise', text: `${me.name} praised you as a ${b.name}`, link: '/leaderboard' } });
    onClose(true);
  };
  return (
    <Modal title="Give praise" onClose={() => onClose(false)}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Who are you appreciating?"><PeoplePicker value={to} onChange={setTo} exclude={[me.id]} single /></Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Badge</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRAISE_BADGES.map((b) => (
              <button type="button" key={b.id} onClick={() => setBadge(b.id)} aria-pressed={badge === b.id}
                className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${badge === b.id ? 'border-brand-500 bg-brand-500/20' : 'border-white/10 hover:bg-white/5'}`}>
                <Icon name={b.icon} size={16} className="mr-1 inline align-[-3px]" />{b.name}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Message"><textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did they do that you appreciate?" /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shareOnWall} onChange={(e) => setShareOnWall(e.target.checked)} /> Share on the network wall</label>
        <button className="btn btn-primary min-h-11 w-full" disabled={!to.length || !message.trim()}>Send praise</button>
      </form>
    </Modal>
  );
}

export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
