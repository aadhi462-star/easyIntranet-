import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar, Modal } from '../ui.jsx';
import { isActiveUser } from '../people/shared.jsx';

export default function AddMembers({ group, onClose }) {
  const { state, dispatch, me } = useStore();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const candidates = state.users.filter((u) => isActiveUser(u) && !group.members.includes(u.id) && `${u.name} ${u.city} ${u.batch}`.toLowerCase().includes(q.toLowerCase()));

  const add = () => {
    dispatch({ type: 'group/addMembers', id: group.id, userIds: picked });
    picked.forEach((userId) => dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'group', text: `${me.name} added you to ${group.name}`, link: `/groups/${group.id}` } }));
    onClose();
  };

  return (
    <Modal title={`Add members to ${group.name}`} onClose={onClose}>
      <input className="input" type="search" placeholder="Search by name, city or batch" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto scroll-thin">
        {candidates.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Everyone matching is already a member.</li>}
        {candidates.map((u) => (
          <li key={u.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-white/5">
              <input type="checkbox" className="accent-brand-500" checked={picked.includes(u.id)}
                onChange={() => setPicked(picked.includes(u.id) ? picked.filter((x) => x !== u.id) : [...picked, u.id])} />
              <Avatar user={u} size={32} />
              <span className="text-sm"><b>{u.name}</b><span className="block text-xs text-slate-400">{u.batch} · {u.city}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!picked.length} onClick={add}>Add {picked.length || ''}</button>
      </div>
    </Modal>
  );
}
