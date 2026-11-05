import { useState } from 'react';
import { uid, useStore } from '../../lib/store.jsx';
import { PERMS } from '../../data/modules/admin.js';
import { Field } from '../ui.jsx';

export function Roles() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const roles = state.roles || [];
  const toggle = (role, perm) => dispatch({ type: 'update', col: 'roles', id: role.id,
    patch: (r) => ({ ...r, perms: r.perms.includes(perm) ? r.perms.filter((p) => p !== perm) : [...r.perms, perm] }) });
  const countOf = (id) => state.users.filter((u) => (u.roleId || 'member') === id).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Network admins always have every permission. Changes apply immediately.</p>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
              <th className="p-3">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="p-3 text-center">
                  <span className="block normal-case text-white">{r.name}</span>
                  <span className="font-normal normal-case">{countOf(r.id)} members</span>
                  {!r.system && <button className="mt-1 block w-full text-[11px] normal-case text-rose-300 hover:underline"
                    onClick={() => countOf(r.id) ? alert('Move members to another role first.') : confirm(`Delete role “${r.name}”?`) && dispatch({ type: 'remove', col: 'roles', id: r.id })}>Delete</button>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {PERMS.map(([perm, label]) => (
              <tr key={perm}>
                <td className="p-3"><span className="text-slate-200">{label}</span><span className="block font-mono text-[11px] text-slate-500">{perm}</span></td>
                {roles.map((r) => (
                  <td key={r.id} className="p-3 text-center">
                    <input type="checkbox" className="h-5 w-5 accent-brand-500" checked={r.perms.includes(perm)} onChange={() => toggle(r, perm)} aria-label={`${label} for ${r.name}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="glass flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        dispatch({ type: 'add', col: 'roles', prepend: false, item: { id: uid('role'), name: name.trim(), system: false, perms: ['post.create'] } });
        setName('');
      }}>
        <div className="min-w-56 flex-1"><Field label="New custom role"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chapter lead" /></Field></div>
        <button className="btn btn-primary h-11">Create role</button>
      </form>
    </div>
  );
}

export function Policies() {
  const { state, dispatch } = useStore();
  const p = state.policies || {};
  const set = (patch) => dispatch({ type: 'set', key: 'policies', value: (cur = {}) => ({ ...cur, ...patch }) });
  const who = [['everyone', 'All members'], ['moderators', 'Moderators and admins'], ['admins', 'Admins only']];
  return (
    <div className="glass grid gap-5 p-5 md:grid-cols-2">
      <Field label="Who can create groups"><select className="input" value={p.groupCreation || 'everyone'} onChange={(e) => set({ groupCreation: e.target.value })}>{who.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Who can create channels"><select className="input" value={p.channelCreation || 'everyone'} onChange={(e) => set({ channelCreation: e.target.value })}>{who.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Maximum file size (MB)" hint="Applies to post, channel and file attachments"><input className="input" type="number" min="1" max="1024" value={p.maxFileSizeMb ?? 30} onChange={(e) => set({ maxFileSizeMb: Number(e.target.value) })} /></Field>
      <Field label="Content retention (days)" hint="0 keeps content forever"><input className="input" type="number" min="0" value={p.retentionDays ?? 0} onChange={(e) => set({ retentionDays: Number(e.target.value) })} /></Field>
      <Field label="Profile visibility"><select className="input" value={p.profileVisibility || 'members'} onChange={(e) => set({ profileVisibility: e.target.value })}>
        <option value="members">All network members</option><option value="connections">Followers and group mates only</option><option value="public">Public (anyone with the link)</option></select></Field>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={p.allowExternalUsers !== false} onChange={(e) => set({ allowExternalUsers: e.target.checked })} />Allow external users (guests with restricted access)</label>
      <p className="text-xs text-slate-500 md:col-span-2">Other modules read these policies from <code>state.policies</code>. The roles matrix still decides individual permissions.</p>
    </div>
  );
}

const FIELD_TYPES = [['text', 'Text'], ['number', 'Number'], ['date', 'Date'], ['select', 'Dropdown'], ['checkbox', 'Checkbox'], ['url', 'Link']];

export function ProfileFields() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState({ label: '', type: 'text', options: '', visibility: 'everyone' });
  const fields = state.customFields || [];
  const upd = (id, patch) => dispatch({ type: 'update', col: 'customFields', id, patch });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Extra fields shown on member profiles. “Admins only” fields are hidden from other members.</p>
      <ul className="glass divide-y divide-white/5">
        {fields.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 p-3">
            <input className="input min-w-40 flex-1" value={f.label} onChange={(e) => upd(f.id, { label: e.target.value })} aria-label="Field label" />
            <select className="input !w-32" value={f.type} onChange={(e) => upd(f.id, { type: e.target.value })} aria-label="Field type">{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select className="input !w-36" value={f.visibility} onChange={(e) => upd(f.id, { visibility: e.target.value })} aria-label="Visibility">
              <option value="everyone">Everyone</option><option value="admins">Admins only</option><option value="self">Only the member</option></select>
            {f.type === 'select' && <input className="input min-w-48 flex-1" value={f.options.join(', ')} placeholder="Options" aria-label="Options"
              onChange={(e) => upd(f.id, { options: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />}
            <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => confirm(`Delete field “${f.label}”?`) && dispatch({ type: 'remove', col: 'customFields', id: f.id })} aria-label={`Delete ${f.label}`}>✕</button>
          </li>
        ))}
      </ul>
      <form className="glass flex flex-wrap items-end gap-2 p-4" onSubmit={(e) => {
        e.preventDefault();
        if (!draft.label.trim()) return;
        dispatch({ type: 'add', col: 'customFields', prepend: false, item: { label: draft.label.trim(), type: draft.type, visibility: draft.visibility,
          options: draft.options.split(',').map((x) => x.trim()).filter(Boolean) } });
        setDraft({ label: '', type: 'text', options: '', visibility: 'everyone' });
      }}>
        <div className="min-w-48 flex-1"><Field label="New field"><input className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. LinkedIn" /></Field></div>
        <Field label="Type"><select className="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {draft.type === 'select' && <Field label="Options"><input className="input" value={draft.options} onChange={(e) => setDraft({ ...draft, options: e.target.value })} placeholder="A, B, C" /></Field>}
        <button className="btn btn-primary h-11">Add field</button>
      </form>
    </div>
  );
}
