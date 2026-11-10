import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar } from '../ui.jsx';
import { isActiveUser } from '../people/shared.jsx';

/** Searchable multi-select of network members; `only` limits it to those ids (e.g. a community's members). */
export default function PeoplePicker({ value, onChange, exclude = [], only, label = 'people' }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const list = state.users.filter((u) => isActiveUser(u) && !exclude.includes(u.id) && (!only || only.includes(u.id)) && u.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20">
      <input className="input !rounded-b-none !border-0 !border-b" placeholder={`Search ${label}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label}`} />
      <div className="max-h-40 overflow-y-auto p-1 scroll-thin">
        {list.map((u) => (
          <label key={u.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-white/5">
            <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 accent-brand-500" />
            <Avatar user={u} size={24} />
            <span className="flex-1">{u.name}</span>
            <span className="text-xs text-slate-500">{u.batch}</span>
          </label>
        ))}
        {list.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">No matches.</p>}
      </div>
      {value.length > 0 && <p className="border-t border-white/10 px-3 py-2 text-xs text-slate-400">{value.length} selected</p>}
    </div>
  );
}
