import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Avatar, PageHeader } from '../components/ui.jsx';
import { isActiveUser } from '../components/people/shared.jsx';

export default function OrgChart() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const [q, setQ] = useState('');

  const { roots, children, parent } = useMemo(() => {
    const ids = new Set(state.users.filter(isActiveUser).map((u) => u.id));
    const children = {};
    const parent = {};
    const active = state.users.filter(isActiveUser);
    for (const u of active) {
      const m = u.managerId && ids.has(u.managerId) && u.managerId !== u.id ? u.managerId : null;
      parent[u.id] = m;
      if (m) (children[m] ??= []).push(u);
    }
    // Break managerId cycles: anyone whose chain loops back on itself becomes a root,
    // so nobody disappears from the tree.
    const status = {}; // 1 = visiting, 2 = done
    const visit = (id) => {
      const path = [];
      let cur = id;
      while (cur && !status[cur]) { status[cur] = 1; path.push(cur); cur = parent[cur]; }
      if (cur && status[cur] === 1) {
        // cur is on the current path: every node from cur onward is in the cycle.
        for (const x of path.slice(path.indexOf(cur))) {
          if (parent[x]) children[parent[x]] = (children[parent[x]] || []).filter((c) => c.id !== x);
          parent[x] = null;
        }
      }
      path.forEach((x) => { status[x] = 2; });
    };
    for (const u of active) visit(u.id);
    return { roots: active.filter((u) => !parent[u.id]), children, parent };
  }, [state.users]);

  // Expand everything down to depth 1 by default, plus the path to a focused person.
  const [open, setOpen] = useState(() => new Set(roots.map((r) => r.id)));
  useEffect(() => {
    if (!focus) return;
    setOpen((o) => { const n = new Set(o); const seen = new Set([focus]); for (let p = parent[focus]; p && !seen.has(p); p = parent[p]) { seen.add(p); n.add(p); } return n; });
    setTimeout(() => document.getElementById(`org-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }, [focus, parent]);

  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const matches = q.trim() ? state.users.filter((u) => isActiveUser(u) && u.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];

  // A plain render function (not a component) so toggling doesn't remount the tree and lose focus.
  const node = (u) => {
    const kids = children[u.id] || [];
    const isOpen = open.has(u.id);
    return (
      <li key={u.id} className="relative">
        <div id={`org-${u.id}`} className={`glass flex items-center gap-3 p-3 ${focus === u.id ? 'ring-2 ring-leaf-400' : ''}`}>
          {kids.length > 0 ? (
            <button className="btn btn-ghost h-11 w-11 shrink-0 !p-0" onClick={() => toggle(u.id)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${u.name}'s circle`}>{isOpen ? '▾' : '▸'}</button>
          ) : <span className="w-11 shrink-0" />}
          <Link to={`/people/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar user={u} size={40} />
            <div className="min-w-0"><div className="truncate font-semibold">{u.name}</div><div className="truncate text-xs text-slate-400">{u.title || u.role} · {u.city}</div></div>
          </Link>
          {kids.length > 0 && <span className="chip shrink-0">{kids.length}</span>}
        </div>
        {isOpen && kids.length > 0 && (
          <ul className="ml-5 mt-2 space-y-2 border-l border-white/10 pl-4 sm:ml-8 sm:pl-6">
            {kids.map(node)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <PageHeader title="Community structure" subtitle="Chapters, leads and mentor circles across the community"
        actions={<>
          <button className="btn btn-ghost min-h-11" onClick={() => setOpen(new Set(state.users.map((u) => u.id)))}>Expand all</button>
          <button className="btn btn-ghost min-h-11" onClick={() => setOpen(new Set())}>Collapse all</button>
        </>} />
      <div className="relative mb-5 max-w-md">
        <input className="input" type="search" placeholder="Find a member…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a person" />
        {matches.length > 0 && (
          <ul className="glass glass-strong absolute z-10 mt-1 w-full p-1">
            {matches.map((u) => (
              <li key={u.id}><button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-white/5" onClick={() => { setParams({ focus: u.id }); setQ(''); }}>
                <Avatar user={u} size={26} /> {u.name}</button></li>
            ))}
          </ul>
        )}
      </div>
      <ul className="space-y-2">{roots.map(node)}</ul>
    </div>
  );
}
