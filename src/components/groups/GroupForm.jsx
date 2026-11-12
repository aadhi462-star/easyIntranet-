import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Field, Modal } from '../ui.jsx';
import { ACCESS, APPS, GROUP_TYPES } from './helpers.js';
import { errorText } from '../../lib/communities.js';


/** Create or edit a group. `onSave(values, { createChannel })` may be async; a thrown server error shows here. */
export default function GroupForm({ initial, onSave, onClose }) {
  const editing = !!initial;
  const [v, setV] = useState({
    name: '', description: '', type: 'Interest', accessType: 'public',
    apps: ['dashboard', 'feed', 'forums', 'events', 'files', 'members'], ...initial,
  });
  const [createChannel, setCreateChannel] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const toggleApp = (id) => setV({ ...v, apps: v.apps.includes(id) ? v.apps.filter((a) => a !== id) : [...v.apps, id] });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (v.name.trim().length < 2) { setError('Give your group a name of at least 2 characters.'); return; }
    setError('');
    setBusy(true);
    try {
      await onSave({ ...v, name: v.name.trim(), apps: v.apps.includes('members') ? v.apps : [...v.apps, 'members'] }, { createChannel });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editing ? 'Edit community' : 'Create a community'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name"><input className="input" value={v.name} onChange={set('name')} placeholder="e.g. Harbour Rowers" /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={v.description} onChange={set('description')} /></Field>
        <Field label="Type">
          <select className="input" value={v.type} onChange={set('type')}>{GROUP_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Access</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(ACCESS).map(([k, a]) => (
              <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${v.accessType === k ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
                <input type="radio" name="access" className="sr-only" checked={v.accessType === k} onChange={() => setV({ ...v, accessType: k })} />
                <div className="font-semibold"><span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span></div>
                <div className="mt-1 text-xs text-slate-400">{a.desc}</div>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Built-in apps</legend>
          <div className="flex flex-wrap gap-2">
            {APPS.map((a) => (
              <label key={a.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${v.apps.includes(a.id) ? 'border-brand-500 bg-brand-500/15' : 'border-white/10'} ${a.id === 'members' ? 'opacity-60' : ''}`}>
                <input type="checkbox" checked={v.apps.includes(a.id)} disabled={a.id === 'members'} onChange={() => toggleApp(a.id)} className="accent-brand-500" />
                <span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!editing && (
          <label className="flex items-start gap-3 rounded-xl bg-white/5 p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-brand-500" checked={createChannel} onChange={(e) => setCreateChannel(e.target.checked)} />
            <span><b>Associate a channel</b><span className="block text-xs text-slate-400">Creates a chat channel. Everyone who joins this group is added to it automatically.</span></span>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
