import { useState } from 'react';
import { useStore, uid } from '../../lib/store.jsx';
import { Field, Modal } from '../ui.jsx';
import PeoplePicker from './PeoplePicker.jsx';
import { EVENT_TYPES, MAX_ATTACHMENT, MAX_STORED_ATTACHMENT, REMINDER_OPTIONS, fmtSize, fromInput, toInput } from './eventUtils.js';

/**
 * Create or edit an event. `initial` is either an existing event (edit) or a partial
 * draft such as { start, groupId } (create).
 */
export default function EventForm({ initial = {}, onClose, onSaved }) {
  const { state, dispatch, me, can } = useStore();
  const editing = !!initial.id;
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));
  const canNetwork = can('event.create.network');

  const defStart = initial.start ?? (() => { const d = new Date(Date.now() + 864e5); d.setHours(18, 0, 0, 0); return d.getTime(); })();
  const defScope = initial.scope?.type ?? (initial.groupId ? 'group' : canNetwork ? 'network' : myGroups.length ? 'group' : 'private');
  const [f, setF] = useState({
    title: initial.title ?? '',
    eventType: initial.eventType ?? 'Meetup',
    allDay: initial.allDay ?? false,
    start: toInput(defStart, initial.allDay),
    end: toInput(initial.end ?? defStart + 2 * 3600e3, initial.allDay),
    freq: initial.recurrence?.freq ?? 'none',
    until: initial.recurrence?.until ? toInput(initial.recurrence.until, true) : '',
    description: initial.description ?? '',
    location: initial.location ?? '',
    share: defScope,
    groupId: initial.scope?.id ?? initial.groupId ?? myGroups[0]?.id ?? '',
    invitees: initial.invitees ?? [],
    assistants: initial.assistants ?? [],
    rsvpEnabled: initial.rsvpEnabled ?? true,
    reminders: initial.reminders ?? [30],
    attachments: initial.attachments ?? [],
  });
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const untilError = f.freq !== 'none' && !!f.until && f.until < f.start.slice(0, 10);

  const toggleAllDay = (allDay) => setF((x) => ({ ...x, allDay,
    start: allDay ? x.start.slice(0, 10) : `${x.start.slice(0, 10)}T18:00`,
    end: allDay ? x.end.slice(0, 10) : `${x.end.slice(0, 10)}T20:00` }));

  // Files are kept as data URLs so they can be downloaded later; everything lives in
  // localStorage, so each file is capped well below the advertised upload limit.
  const addFiles = async (files) => {
    const limit = Math.min(MAX_ATTACHMENT, MAX_STORED_ATTACHMENT);
    const big = [...files].filter((file) => file.size > limit);
    const ok = await Promise.all([...files].filter((file) => file.size <= limit).map((file) => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, size: file.size, type: file.type, dataUrl: r.result });
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    })));
    setError(big.length ? `${big.map((b) => b.name).join(', ')} ${big.length > 1 ? 'are' : 'is'} over the ${fmtSize(limit)} limit.` : '');
    setF((x) => ({ ...x, attachments: [...x.attachments, ...ok.filter(Boolean)] }));
  };

  const submit = (e) => {
    e.preventDefault();
    let start = fromInput(f.start);
    let end = fromInput(f.end);
    if (f.allDay) end = end + 864e5 - 60e3; // end of the last day
    if (!f.title.trim()) return setError('Give the event a name.');
    if (Number.isNaN(start) || Number.isNaN(end)) return setError('Choose a start and end time.');
    if (end < start) return setError('The event can’t end before it starts.');
    if (f.share === 'group' && !f.groupId) return setError('Choose a group to share this event in.');
    if (f.share === 'network' && !canNetwork) return setError('You don’t have permission to create company events.');
    const until = f.freq !== 'none' && f.until ? fromInput(f.until) + 864e5 - 1 : null;
    if (until != null && until < start) return setError('“Repeat until” can’t be before the start date.');

    const event = {
      title: f.title.trim(), eventType: f.eventType, allDay: f.allDay, start, end,
      recurrence: { freq: f.freq, until }, description: f.description.trim(), location: f.location.trim(),
      scope: f.share === 'network' ? { type: 'network' } : f.share === 'group' ? { type: 'group', id: f.groupId } : { type: 'private' },
      invitees: f.invitees, assistants: f.assistants, rsvpEnabled: f.rsvpEnabled,
      reminders: [...f.reminders].sort((a, b) => b - a), attachments: f.attachments,
    };

    if (editing) {
      dispatch({ type: 'update', col: 'events', id: initial.id, patch: event });
      const newly = [...f.invitees, ...f.assistants].filter((id) => !(initial.invitees || []).includes(id) && !(initial.assistants || []).includes(id));
      notifyAll(newly, initial.id, event.title);
      const notifyChanged = [...(initial.invitees || []), ...(initial.assistants || []), ...Object.keys(initial.rsvps || {})].filter((id) => id !== me.id);
      if (initial.start !== start || initial.end !== end || !!initial.allDay !== event.allDay || initial.location !== event.location) {
        for (const userId of new Set(notifyChanged)) {
          dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `${me.name} changed the time or location of ${event.title}`, link: `/events/${initial.id}` } });
        }
      }
      onSaved?.(initial.id);
    } else {
      const id = uid('e');
      dispatch({ type: 'event/create', event: { id, comments: [], ...event } });
      notifyAll([...f.invitees, ...f.assistants], id, event.title);
      onSaved?.(id);
    }
  };

  function notifyAll(ids, id, title) {
    for (const userId of new Set(ids)) {
      if (userId === me.id) continue;
      const asAssistant = f.assistants.includes(userId);
      dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', link: `/events/${id}`,
        text: asAssistant ? `${me.name} invited you as an Event Assistant for ${title}` : `${me.name} invited you to ${title}` } });
    }
  }

  return (
    <Modal title={editing ? 'Edit event' : 'Create event'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Event name"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Pune chapter dinner" /></Field>
          <Field label="Event type">
            <select className="input" value={f.eventType} onChange={(e) => set('eventType', e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.allDay} onChange={(e) => toggleAllDay(e.target.checked)} /> All-day event
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts"><input className="input" type={f.allDay ? 'date' : 'datetime-local'} value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="Ends"><input className="input" type={f.allDay ? 'date' : 'datetime-local'} value={f.end} onChange={(e) => set('end', e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeat">
            <select className="input" value={f.freq} onChange={(e) => set('freq', e.target.value)}>
              <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </Field>
          {f.freq !== 'none' && (
            <Field label="Repeat until" hint="Leave empty to repeat indefinitely">
              <input className="input" type="date" min={f.start.slice(0, 10)} value={f.until} aria-invalid={untilError || undefined} onChange={(e) => set('until', e.target.value)} />
              {untilError && <span role="alert" className="mt-1 block text-xs text-rose-300">Must be on or after the start date.</span>}
            </Field>
          )}
        </div>

        <Field label="Description"><textarea className="input min-h-24" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Location" hint="An address, “Online”, or a Google Maps short link (maps.app.goo.gl/…)">
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Share with</legend>
          <div className="flex flex-wrap gap-2">
            {[['network', 'Network wall (company event)', !canNetwork], ['group', 'A group', myGroups.length === 0], ['private', 'Invited members only', false]].map(([v, l, disabled]) => (
              <label key={v} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm ${f.share === v ? 'border-brand-500 bg-brand-500/15' : 'border-white/10'} ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                <input type="radio" name="share" className="accent-brand-500" disabled={disabled} checked={f.share === v} onChange={() => set('share', v)} />{l}
              </label>
            ))}
          </div>
          {!canNetwork && <p className="mt-1 text-xs text-slate-500">Only members with permission can create company events.</p>}
          {f.share === 'group' && (
            <select className="input mt-2" value={f.groupId} onChange={(e) => set('groupId', e.target.value)} aria-label="Group">
              {myGroups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
            </select>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invitees"><PeoplePicker value={f.invitees} onChange={(v) => set('invitees', v)} exclude={[me.id]} label="invitees" /></Field>
          <Field label="Event assistants" hint="Assistants observe, help and report, and get change notifications.">
            <PeoplePicker value={f.assistants} onChange={(v) => set('assistants', v)} exclude={[me.id]} label="assistants" />
          </Field>
        </div>

        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.rsvpEnabled} onChange={(e) => set('rsvpEnabled', e.target.checked)} /> Let invitees RSVP
        </label>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Reminders</legend>
          <div className="flex flex-wrap gap-2">
            {REMINDER_OPTIONS.map(([m, l]) => {
              const on = f.reminders.includes(m);
              return (
                <button type="button" key={m} aria-pressed={on} onClick={() => set('reminders', on ? f.reminders.filter((x) => x !== m) : [...f.reminders, m])}
                  className={`min-h-9 rounded-full px-3 text-xs font-semibold ${on ? 'bg-brand-500 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                  {l} before
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label="Attachments" hint="Up to 1 MB per file (stored on this device)">
          <input type="file" multiple className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-slate-200"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </Field>
        {f.attachments.length > 0 && (
          <ul className="space-y-1 text-sm">
            {f.attachments.map((a, i) => (
              <li key={`${a.name}${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                📎 <span className="flex-1 truncate">{a.name}</span><span className="text-xs text-slate-500">{fmtSize(a.size)}</span>
                <button type="button" className="text-slate-400 hover:text-white" aria-label={`Remove ${a.name}`} onClick={() => set('attachments', f.attachments.filter((_, j) => j !== i))}>✕</button>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">{editing ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
