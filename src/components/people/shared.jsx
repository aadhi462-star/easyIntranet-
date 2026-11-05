import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar, Field, Modal } from '../ui.jsx';

export const PRAISE_BADGES = [
  { id: 'mentor', icon: '🧭', name: 'Mentor' },
  { id: 'helper', icon: '🛟', name: 'Helper' },
  { id: 'rockstar', icon: '🌟', name: 'Rockstar' },
  { id: 'teamplayer', icon: '🤝', name: 'Team Player' },
  { id: 'innovator', icon: '💡', name: 'Innovator' },
  { id: 'organiser', icon: '📣', name: 'Great Organiser' },
];
export const praiseBadge = (id) => PRAISE_BADGES.find((b) => b.id === id) ?? PRAISE_BADGES[0];

/** Pending and deactivated accounts are hidden from the directory, leaderboard and pickers. */
export const isActiveUser = (u) => !!u && !['pending', 'deactivated'].includes(u.status);

export const CONTACT_PRIVACY = [['everyone', 'Everyone in the community'], ['following', 'Only members I follow'], ['me', 'Only me']];

/** user.privacy.contact: everyone (default) | following (people the owner follows) | me. */
export function canSeeContact(state, viewerId, target) {
  if (!target || viewerId === target.id) return true;
  const rule = target.privacy?.contact ?? 'everyone';
  if (rule === 'everyone') return true;
  if (rule === 'following') return (state.follows || []).some((f) => f.authorId === target.id && f.targetId === viewerId);
  return false;
}

export function useBlocks() {
  const { state, me, dispatch } = useStore();
  const mine = (state.blocks || []).filter((b) => b.authorId === me.id);
  const blocked = new Set(mine.map((b) => b.targetId));
  const toggle = (targetId) => {
    const rec = mine.find((b) => b.targetId === targetId);
    if (rec) dispatch({ type: 'remove', col: 'blocks', id: rec.id });
    else dispatch({ type: 'add', col: 'blocks', item: { targetId } });
  };
  return { blocked, toggle };
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
    <button className={`btn ${following ? 'btn-ghost' : 'btn-primary'} min-h-11 ${className}`} onClick={toggle} aria-pressed={following}>
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
        text: `${b.icon} ${b.name} praise for @${user(toId).name}: ${message.trim()}` } });
    }
    dispatch({ type: 'notify', notification: { userId: toId, kind: 'praise', text: `${me.name} praised you as a ${b.name} ${b.icon}`, link: '/leaderboard' } });
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
                <span aria-hidden="true">{b.icon}</span> {b.name}
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
