import { useMemo, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar, AvatarStack, Empty, Field, Modal } from '../ui.jsx';
import { Glyph } from '../icons.jsx';
import { LABEL_TONES, LabelChip } from '../UserLabels.jsx';
import { isActiveUser } from '../people/shared.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const LABEL_ICONS = ['sprout', 'pinned', 'shield', 'sparkle', 'cap', 'groups', 'star', 'medal', 'mic', 'ideas', 'trophy', 'label'];
const TONE_NAMES = { saffron: 'Saffron', leaf: 'Leaf green', gold: 'Gold' };

/** Admin → User labels: define labels and choose who carries them. */
export default function UserLabelsAdmin() {
  const { state, dispatch } = useStore();
  const labels = state.userLabels || [];
  const [editing, setEditing] = useState(null); // null | 'new' | label

  const remove = async (l) => {
    if (!(await confirmAction(`Delete the “${l.name}” label? It will be removed from ${l.members.length} member${l.members.length === 1 ? '' : 's'}.`))) return;
    dispatch({ type: 'remove', col: 'userLabels', id: l.id });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-2">Labels appear next to a member’s name on their profile, in the directory and, if you choose, on their posts. Members can be filtered by label in People.</p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>New label</button>
      </div>

      {labels.length === 0 ? <Empty icon="label" title="Create your first label">Mentor, Chapter Lead and Verified Alumni are good places to start.</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {labels.map((l) => (
            <li key={l.id} className="panel flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <Glyph value={l.icon || 'label'} size={40} />
                <div className="min-w-0 flex-1">
                  <LabelChip label={l} />
                  <p className="mt-1.5 text-sm text-2">{l.description || 'No description.'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-2">
                <span className="flex items-center gap-2">
                  {l.members.length ? <AvatarStack ids={l.members} size={24} /> : null}
                  {l.members.length} member{l.members.length === 1 ? '' : 's'} · {l.showOnPosts ? 'Shown on posts' : 'Profile and directory only'}
                </span>
                <span className="flex gap-2">
                  <button className="btn btn-ghost min-h-9 !px-3" onClick={() => setEditing(l)} aria-label={`Edit ${l.name}`}>Edit</button>
                  <button className="btn btn-ghost min-h-9 !px-3 text-[var(--az-danger)]" onClick={() => remove(l)} aria-label={`Delete ${l.name}`}>Delete</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <LabelForm label={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// Top-level so store updates from background runners don't remount it and wipe the inputs.
function LabelForm({ label, onClose }) {
    const { state, dispatch } = useStore();
    const labels = state.userLabels || [];
    const [d, setD] = useState(() => ({ name: '', description: '', tone: 'saffron', icon: 'label', showOnPosts: true, members: [], ...label }));
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    const people = useMemo(() => state.users.filter(isActiveUser), []);
    const matches = people.filter((u) => !q || `${u.name} ${u.role ?? ''} ${u.city ?? ''} ${u.batch ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    const toggle = (id) => setD({ ...d, members: d.members.includes(id) ? d.members.filter((m) => m !== id) : [...d.members, id] });

    const save = (e) => {
      e.preventDefault();
      const name = d.name.trim();
      if (!name) return setError('Give the label a name.');
      if (labels.some((l) => l.id !== label?.id && l.name.toLowerCase() === name.toLowerCase())) return setError('A label with that name already exists.');
      const item = { ...d, name };
      if (label) dispatch({ type: 'update', col: 'userLabels', id: label.id, patch: item });
      else dispatch({ type: 'add', col: 'userLabels', item, prepend: false });
      // Let people know when they're given a label (not on every edit).
      const added = d.members.filter((id) => !(label?.members || []).includes(id));
      added.forEach((id) => dispatch({ type: 'notify', silent: true,
        notification: { userId: id, kind: 'label', link: `/people/${id}`, text: `You were given the “${name}” label` } }));
      onClose();
    };

    return (
      <Modal title={label ? `Edit “${label.name}”` : 'New label'} onClose={onClose} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className="input" value={d.name} onChange={(e) => { setD({ ...d, name: e.target.value }); setError(''); }} placeholder="Mentor" maxLength={30} /></Field>
            <Field label="Preview"><div className="flex min-h-11 items-center"><LabelChip label={{ ...d, name: d.name || 'Label name' }} /></div></Field>
          </div>
          <Field label="Description" hint="Shown when someone hovers over the label.">
            <input className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Volunteers time to guide students." maxLength={120} />
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-[var(--az-text)]">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {LABEL_TONES.map((t) => (
                <button type="button" key={t} aria-pressed={d.tone === t} onClick={() => setD({ ...d, tone: t })}
                  className={`btn btn-ghost min-h-11 ${d.tone === t ? 'ring-2 ring-[var(--az-focus)]' : ''}`}>
                  <span className={`ill ill-${t} ill-tile`} style={{ width: 18, height: 18 }} />{TONE_NAMES[t]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-[var(--az-text)]">Icon</legend>
            <div className="flex flex-wrap gap-2">
              {LABEL_ICONS.map((ic) => (
                <button type="button" key={ic} aria-pressed={d.icon === ic} aria-label={`Icon: ${ic}`} onClick={() => setD({ ...d, icon: ic })}
                  className={`rounded-xl p-1 ${d.icon === ic ? 'ring-2 ring-[var(--az-focus)]' : 'hover:bg-[var(--az-sunken)]'}`}>
                  <Glyph value={ic} size={34} />
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={d.showOnPosts} onChange={(e) => setD({ ...d, showOnPosts: e.target.checked })} />
            Show this label next to the member’s name on posts
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--az-text)]">
              <span>Members with this label</span><span className="text-2">{d.members.length} selected</span>
            </div>
            <input className="input mb-2" type="search" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-[var(--az-hairline)] scroll-thin">
              {matches.map((u) => (
                <li key={u.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 hover:bg-[var(--az-sunken)]">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={d.members.includes(u.id)} onChange={() => toggle(u.id)} />
                    <Avatar user={u} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm">{u.name}{u.batch && <span className="text-2"> · Class of {u.batch}</span>}</span>
                  </label>
                </li>
              ))}
              {!matches.length && <li className="p-3 text-sm text-2">No members match.</li>}
            </ul>
          </div>

          {error && <p role="alert" className="text-sm text-[var(--az-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary">{label ? 'Save label' : 'Create label'}</button>
          </div>
        </form>
      </Modal>
    );
}
