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
    <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--az-control)] bg-[var(--az-field)]">
      <input className="input !rounded-none !border-0 !border-b !border-[var(--az-hairline)]" placeholder={`Search ${label}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label}`} />
      <div className="max-h-40 overflow-y-auto p-1 scroll-thin">
        {list.map((u) => (
          <label key={u.id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)]">
            <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 accent-[var(--az-focus)]" />
            <Avatar user={u} size={24} />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            <span className="t-small shrink-0">{u.batch}</span>
          </label>
        ))}
        {list.length === 0 && <p className="t-small px-2 py-3">No matches.</p>}
      </div>
      {value.length > 0 && <p className="t-small border-t border-[var(--az-hairline)] px-3 py-2">{value.length} selected</p>}
    </div>
  );
}
