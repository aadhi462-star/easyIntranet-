import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { api, newKey } from '../../lib/api.js';
import { NETWORK_ID, fetchMyCommunities, isCommunityAdmin } from '../../lib/feed.js';
import { createEvent, editEvent, fetchEvent } from '../../lib/events.js';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import PeoplePicker from './PeoplePicker.jsx';
import { EVENT_TYPES, REMINDER_OPTIONS, fromInput, toInput } from './eventUtils.js';

const DAY = 864e5;

/** Form state from an event (edit) or a partial draft such as { start, groupId } (create). */
function formOf(initial, defScope, groupId) {
  const defStart = initial.start ?? (() => { const d = new Date(Date.now() + DAY); d.setHours(18, 0, 0, 0); return d.getTime(); })();
  return {
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
    groupId,
    inviteOnly: initial.inviteOnly ?? defScope === 'private',
    invitees: initial.invitees ?? [],
    assistants: initial.assistants ?? [],
    rsvpEnabled: initial.rsvpEnabled ?? true,
    capacity: initial.capacity ? String(initial.capacity) : '',
    rsvpDeadline: initial.rsvpDeadline ? toInput(initial.rsvpDeadline, false) : '',
    reminders: initial.reminders ?? [30],
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (l) => [...(l || [])].sort();

/**
 * Create or edit an event on the server. Creating picks the community: the AlumniZone wall
 * (company event), one of your groups, or an invite-only event in either. Editing keeps the
 * event's community and sends only the fields that changed, from the version that was opened.
 */
export default function EventForm({ initial = {}, onClose, onSaved }) {
  const { state, me } = useStore();
  const editing = !!initial.id;
  const [communities, setCommunities] = useState(null);
  const [base, setBase] = useState(initial); // the version edits are compared against and sent from
  const [f, setF] = useState(() => formOf(initial,
    initial.inviteOnly ? 'private' : initial.scope?.type ?? (initial.groupId ? 'group' : 'network'),
    initial.communityId ?? initial.scope?.id ?? initial.groupId ?? ''));
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const key = useRef(newKey()); // one per open form: a double submit creates one event
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const untilError = f.freq !== 'none' && !!f.until && f.until < f.start.slice(0, 10);

  useEffect(() => {
    fetchMyCommunities().then(setCommunities).catch((e) => setError(e.message));
  }, []);
  const network = communities?.find((c) => c.id === NETWORK_ID);
  const groups = (communities || []).filter((c) => c.id !== NETWORK_ID);
  // AlumniZone keeps open ("company") events to its admins; invite-only events are for anyone.
  const canNetwork = !!network && isCommunityAdmin(network);

  // Once communities load, settle on a share option the person can actually use.
  useEffect(() => {
    if (!communities || editing) return;
    setF((x) => {
      let share = x.share;
      if (share === 'network' && !canNetwork) share = x.groupId && groups.some((g) => g.id === x.groupId) ? 'group' : 'private';
      if (share === 'group' && !groups.length) share = 'private';
      const groupId = x.groupId && communities.some((c) => c.id === x.groupId) ? x.groupId : (share === 'group' ? groups[0]?.id : network?.id ?? groups[0]?.id) ?? '';
      return { ...x, share, groupId, inviteOnly: share === 'private' };
    });
  }, [communities]); // eslint-disable-line react-hooks/exhaustive-deps

  const communityId = editing ? initial.communityId : f.share === 'network' ? NETWORK_ID : f.groupId;
  const communityName = (communities || []).find((c) => c.id === communityId)?.name ?? initial.community?.name ?? '';

  // Guests and co-hosts must be members of the event's community, so only those are offered.
  useEffect(() => {
    if (!communityId) return undefined;
    let live = true;
    setMembers(null);
    api(`/communities/${encodeURIComponent(communityId)}/members`)
      .then(({ members: list }) => live && setMembers(list.filter((m) => m.state === 'active').map((m) => m.id)))
      .catch(() => live && setMembers([]));
    return () => { live = false; };
  }, [communityId]);

  const toggleAllDay = (allDay) => setF((x) => ({ ...x, allDay,
    start: allDay ? x.start.slice(0, 10) : `${x.start.slice(0, 10)}T18:00`,
    end: allDay ? x.end.slice(0, 10) : `${x.end.slice(0, 10)}T20:00` }));

  const nameOf = (id) => state.users.find((u) => u.id === id)?.name ?? 'Someone';

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    const start = fromInput(f.start);
    let end = fromInput(f.end);
    if (f.allDay) end = end + DAY - 60e3; // end of the last day
    if (!f.title.trim()) return setError('Give the event a name.');
    if (Number.isNaN(start) || Number.isNaN(end)) return setError('Choose a start and end time.');
    if (end < start) return setError('The event can’t end before it starts.');
    if (!communityId) return setError('Choose where to share this event.');
    if (f.share === 'network' && !editing && !canNetwork) return setError('Only AlumniZone admins can create company events. Choose a group or invite people instead.');
    const until = f.freq !== 'none' && f.until ? fromInput(f.until) + DAY - 1 : null;
    if (until != null && until < start) return setError('“Repeat until” can’t be before the start date.');
    const capacity = f.capacity.trim() ? Number(f.capacity) : null;
    if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) return setError('Capacity must be a whole number of at least 1, or empty for no limit.');
    const rsvpDeadline = f.rsvpDeadline ? fromInput(f.rsvpDeadline) : null;
    const inviteOnly = editing ? f.inviteOnly : f.share === 'private';

    const event = {
      title: f.title.trim(), eventType: f.eventType, allDay: f.allDay, start, end,
      recurrence: { freq: f.freq, until }, description: f.description.trim(), location: f.location.trim(),
      inviteOnly, invitees: inviteOnly ? sorted(f.invitees) : [], rsvpEnabled: f.rsvpEnabled, capacity, rsvpDeadline,
      reminders: [...f.reminders].sort((a, b) => b - a),
    };
    if (!editing || base.can?.manageCohosts) event.assistants = sorted(f.assistants);

    setPending(true);
    setError('');
    try {
      if (editing) {
        const was = { title: base.title, eventType: base.eventType, allDay: base.allDay, start: base.start, end: base.end,
          recurrence: { freq: base.recurrence?.freq ?? 'none', until: base.recurrence?.until ?? null }, description: base.description ?? '', location: base.location ?? '',
          inviteOnly: base.inviteOnly, invitees: sorted(base.invitees), rsvpEnabled: base.rsvpEnabled, capacity: base.capacity ?? null,
          rsvpDeadline: base.rsvpDeadline ?? null, reminders: base.reminders ?? [], assistants: sorted(base.assistants) };
        // The inputs work to the minute (or day): an untouched field keeps the stored instant,
        // so registrants aren't emailed about a "change" that is only rounding.
        if (f.allDay === base.allDay) {
          if (f.start === toInput(base.start, base.allDay)) event.start = base.start;
          if (f.end === toInput(base.end, base.allDay)) event.end = base.end;
        }
        if (until != null && was.recurrence.until != null && f.until === toInput(was.recurrence.until, true)) event.recurrence.until = was.recurrence.until;
        if (f.rsvpDeadline && was.rsvpDeadline != null && f.rsvpDeadline === toInput(was.rsvpDeadline, false)) event.rsvpDeadline = was.rsvpDeadline;
        const changes = Object.fromEntries(Object.entries(event).filter(([k, v]) => !same(v, was[k])));
        if (!Object.keys(changes).length) { onSaved?.(base.id); return; }
        const saved = await editEvent(base, changes);
        toast('Event updated');
        onSaved?.(saved.id);
      } else {
        const saved = await createEvent(communityId, event, key.current);
        toast('Event created');
        onSaved?.(saved.id);
      }
    } catch (err) {
      if (err.code === 'STALE_VERSION') {
        // Someone else saved first: load their version so the next save starts from it, and
        // keep what this person typed.
        const fresh = await fetchEvent(base.id).catch(() => null);
        if (fresh) setBase(fresh);
        setError('Someone else changed this event while you were editing. Their version is now loaded underneath your changes — check and save again.');
      } else if (err.code === 'NOT_MEMBERS') {
        setError(`Only members of ${communityName || 'this community'} can be added: ${(err.extra.userIds || []).map(nameOf).join(', ')}.`);
      } else {
        setError(err.message);
      }
    } finally {
      setPending(false);
    }
  };

  const shareOptions = [
    ['network', 'Network wall (company event)', !canNetwork],
    ['group', 'A group', groups.length === 0],
    ['private', 'Invited members only', !communities?.length],
  ];
  const pickable = members ?? [];

  return (
    <Modal title={editing ? 'Edit event' : 'Create event'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Event name"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Pune chapter dinner" maxLength={140} /></Field>
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

        <Field label="Description"><textarea className="input min-h-24" value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={5000} /></Field>
        <Field label="Location" hint="An address, “Online”, or a Google Maps short link (maps.app.goo.gl/…)">
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} maxLength={300} />
        </Field>

        {editing ? (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-slate-300">Shared in {communityName || 'its community'}</legend>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.inviteOnly} onChange={(e) => set('inviteOnly', e.target.checked)} /> Invited members only
            </label>
          </fieldset>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-slate-300">Share with</legend>
            {!communities && !error && <p className="text-sm text-slate-400">Loading your communities…</p>}
            <div className="flex flex-wrap gap-2">
              {shareOptions.map(([v, l, disabled]) => (
                <label key={v} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm ${f.share === v ? 'border-brand-500 bg-brand-500/15' : 'border-white/10'} ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                  <input type="radio" name="share" className="accent-brand-500" disabled={disabled} checked={f.share === v}
                    onChange={() => setF((x) => ({ ...x, share: v, inviteOnly: v === 'private',
                      groupId: v === 'group' ? (groups.some((g) => g.id === x.groupId) ? x.groupId : groups[0]?.id ?? '') : v === 'private' ? (x.groupId || network?.id || '') : x.groupId }))} />{l}
                </label>
              ))}
            </div>
            {communities && !canNetwork && <p className="mt-1 text-xs text-slate-500">Only AlumniZone admins can create company events.</p>}
            {f.share === 'group' && (
              <select className="input mt-2" value={f.groupId} onChange={(e) => set('groupId', e.target.value)} aria-label="Group">
                {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
              </select>
            )}
            {f.share === 'private' && (
              <select className="input mt-2" value={f.groupId} onChange={(e) => setF((x) => ({ ...x, groupId: e.target.value, invitees: [], assistants: [] }))} aria-label="Community for this event">
                {(communities || []).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            )}
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(editing ? f.inviteOnly : f.share === 'private') && (
            <Field label="Invitees" hint={communityName ? `Members of ${communityName}` : undefined}>
              <PeoplePicker value={f.invitees} onChange={(v) => set('invitees', v)} exclude={[me.id]} only={pickable} label="invitees" />
            </Field>
          )}
          {(!editing || base.can?.manageCohosts) && (
            <Field label="Co-hosts" hint="Co-hosts can edit and cancel the event with you.">
              <PeoplePicker value={f.assistants} onChange={(v) => set('assistants', v)} exclude={[me.id, initial.hostId].filter(Boolean)} only={pickable} label="co-hosts" />
            </Field>
          )}
        </div>

        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.rsvpEnabled} onChange={(e) => set('rsvpEnabled', e.target.checked)} /> Take RSVPs
        </label>
        {f.rsvpEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capacity" hint="Leave empty for no limit">
              <input className="input" type="number" min="1" step="1" inputMode="numeric" value={f.capacity} onChange={(e) => set('capacity', e.target.value)} />
            </Field>
            <Field label="RSVP deadline" hint="Optional. People can still say “Not going” afterwards.">
              <input className="input" type="datetime-local" value={f.rsvpDeadline} onChange={(e) => set('rsvpDeadline', e.target.value)} />
            </Field>
          </div>
        )}

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

        {/* Files need secure, access-checked storage (Resources, Phase 2), so none are faked here. */}
        <p className="text-xs text-slate-500">📎 Attachments are coming soon.</p>

        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={pending || (!editing && !communities)}>{pending ? 'Saving…' : editing ? 'Save changes' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}
