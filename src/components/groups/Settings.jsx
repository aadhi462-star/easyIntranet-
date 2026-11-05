import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Field } from '../ui.jsx';
import { ACCESS, APPS, RULE_FIELDS, matchesRule } from './helpers.js';

export default function Settings({ group }) {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const [v, setV] = useState({ name: group.name, description: group.description, guidelines: group.guidelines || '', accessType: group.accessType, apps: group.apps, announceOnly: !!group.announceOnly });
  const [rule, setRule] = useState(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setV({ ...v, [k]: e.target.value }); };
  const preview = rule.value ? state.users.filter((u) => matchesRule(u, rule)) : [];

  const save = (e) => {
    e.preventDefault();
    dispatch({ type: 'update', col: 'groups', id: group.id, patch: { ...v, name: v.name.trim() || group.name, dynamicRule: rule.value ? rule : undefined } });
    setSaved(true);
  };
  const del = () => {
    if (!confirm(`Delete ${group.name}? Its content will no longer be reachable.`)) return;
    dispatch({ type: 'remove', col: 'groups', id: group.id });
    nav('/groups');
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <section className="glass space-y-4 p-5">
        <h3 className="font-bold">General</h3>
        <Field label="Name"><input className="input" value={v.name} onChange={set('name')} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={v.description} onChange={set('description')} /></Field>
        <Field label="Guidelines" hint="Shown on the dashboard Guidelines widget."><textarea className="input min-h-20" value={v.guidelines} onChange={set('guidelines')} /></Field>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="accent-brand-500" checked={v.announceOnly} onChange={(e) => setV({ ...v, announceOnly: e.target.checked })} />
          Only admins can post in the feed (announcement group)
        </label>
      </section>

      <section className="glass p-5">
        <h3 className="mb-3 font-bold">Access type</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(ACCESS).map(([k, a]) => (
            <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm ${v.accessType === k ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
              <input type="radio" name="access" className="sr-only" checked={v.accessType === k} onChange={() => setV({ ...v, accessType: k })} />
              <div className="font-semibold"><span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span></div><div className="mt-1 text-xs text-slate-400">{a.desc}</div>
            </label>
          ))}
        </div>
      </section>

      <section className="glass p-5">
        <h3 className="mb-3 font-bold">Apps</h3>
        <div className="flex flex-wrap gap-2">
          {APPS.map((a) => (
            <label key={a.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${v.apps.includes(a.id) ? 'border-brand-500 bg-brand-500/15' : 'border-white/10'}`}>
              <input type="checkbox" className="accent-brand-500" disabled={a.id === 'members'} checked={v.apps.includes(a.id)}
                onChange={() => setV({ ...v, apps: v.apps.includes(a.id) ? v.apps.filter((x) => x !== a.id) : [...v.apps, a.id] })} />
              <span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="glass space-y-3 p-5">
        <h3 className="font-bold">Dynamic membership</h3>
        <p className="text-sm text-slate-400">People whose profile matches this rule are added automatically, now and when they join later.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="input" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} aria-label="Profile field">
            {RULE_FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value })} aria-label="Condition">
            <option value="eq">is</option><option value="contains">contains</option>
          </select>
          <input className="input" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} placeholder="Value (blank = off)" aria-label="Value" />
        </div>
        {rule.value && <p className="text-xs text-slate-400">Matches {preview.length} {preview.length === 1 ? 'person' : 'people'}: {preview.map((u) => u.name).join(', ') || 'none'}</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-ghost text-rose-300" onClick={del} disabled={group.allHands}>Delete group</button>
        <div className="flex items-center gap-3">
          {saved && <span role="status" className="text-sm text-emerald-300">Saved</span>}
          <button className="btn btn-primary">Save settings</button>
        </div>
      </div>
    </form>
  );
}
