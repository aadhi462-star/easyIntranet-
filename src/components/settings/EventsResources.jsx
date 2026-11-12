// Settings, Events and resources (G3 switches, F13 categories; board V2GSettings): whether the
// Events and Resources sections are on, who can create events, whether members add resources,
// and the event and resource category lists (up to 12 each, 40 characters each).
import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { onCommunityChange } from '../../lib/communities.js';
import Switch from '../manage/Switch.jsx';
import { CheckRow } from '../events/FormField.jsx';
import { Button, IconButton } from '../ui/Controls.jsx';
import { withSections } from './Content.jsx';
import { changedText, Choices, Group, Locked, SectionForm, useSectionDraft } from './shared.jsx';

export const CATEGORY_MAX = 12;
export const CATEGORY_LEN = 40;
const cache = new Map(); // community id → { eventCategories, resourceCategories }
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);

/**
 * { eventCategories, resourceCategories } of a community, or null while loading (the event and
 * resource forms). The store's group doesn't carry them, so they are read from the community
 * itself and re-read when it changes.
 */
export function useCategoryLists(communityId) {
  const [lists, setLists] = useState(() => cache.get(communityId) ?? null);
  useEffect(() => {
    if (!communityId) return undefined;
    let live = true;
    const read = () => api(`/communities/${encodeURIComponent(communityId)}`).then(({ community }) => {
      const v = { eventCategories: listOf(community.settings?.eventCategories), resourceCategories: listOf(community.settings?.resourceCategories) };
      cache.set(communityId, v);
      if (live) setLists(v);
    }).catch(() => { if (live) setLists((prev) => prev ?? { eventCategories: [], resourceCategories: [], failed: true }); });
    setLists(cache.get(communityId) ?? null);
    read();
    const off = onCommunityChange((id) => { if (id === communityId) read(); });
    return () => { live = false; off(); };
  }, [communityId]);
  return lists;
}

const LABEL = { events: 'Events', resources: 'Resources', whoCanCreateEvents: 'Who can create events', membersAddResources: 'Members can add resources', eventCategories: 'Event categories', resourceCategories: 'Resource categories' };

export default function EventsResources({ g, src }) {
  const s = src.settings;
  const base = useMemo(() => ({
    events: src.sections?.events ?? true, resources: src.sections?.resources ?? true,
    whoCanCreateEvents: s.whoCanCreateEvents ?? 'members', membersAddResources: !!s.membersAddResources,
    eventCategories: listOf(s.eventCategories), resourceCategories: listOf(s.resourceCategories),
  }), [src.sections?.events, src.sections?.resources, s.whoCanCreateEvents, s.membersAddResources, s.eventCategories, s.resourceCategories]);
  const d = useSectionDraft(src, base);
  const v = d.value;
  const save = () => {
    const settings = {};
    for (const k of d.changed) if (!['events', 'resources'].includes(k)) settings[k] = v[k];
    if (d.changed.includes('events') || d.changed.includes('resources')) settings.sections = withSections(src, { events: v.events, resources: v.resources });
    return d.submit({ settings });
  };
  return (
    <SectionForm title="Events and resources" draft={d} onSave={save} summary={changedText(d.changed.map((k) => LABEL[k]))}
      fields={['settings.eventCategories', 'settings.resourceCategories']}
      lede={`Who adds events and resources to ${g.name}, and the categories members choose from.`}>
      <Group title="Events">
        <Switch id="set-events" label="Events in this community" checked={v.events} onChange={(on) => d.set('events', on)}
          hint="Off hides the Events section and its address. Nothing is deleted." />
        <Choices legend="Who can create events" value={v.whoCanCreateEvents} onChange={(x) => d.set('whoCanCreateEvents', x)}
          options={[{ value: 'members', label: 'Members' }, { value: 'admins', label: 'Only Owners and Admins' }]} />
        <CategoryEditor label="Event categories" hint="For example Meet-up, Talks or Volunteering. With none, events have no category. Removing one leaves the events that use it as they are."
          value={v.eventCategories} onChange={(x) => d.set('eventCategories', x)} error={d.fieldError('settings.eventCategories')} />
      </Group>
      <Group title="Resources">
        <Switch id="set-resources" label="Resources in this community" checked={v.resources} onChange={(on) => d.set('resources', on)}
          hint="Off hides the Resources section and its address. Nothing is deleted." />
        <CheckRow checked={v.membersAddResources} onChange={(on) => d.set('membersAddResources', on)}>
          <span><span className="font-semibold">Members can add resources</span><span className="t-small block">Owners and Admins can always add them.</span></span>
        </CheckRow>
        <CategoryEditor label="Resource categories" hint="For example Guides or Slides. With none, people type their own; with a list, they pick one or Other."
          value={v.resourceCategories} onChange={(x) => d.set('resourceCategories', x)} error={d.fieldError('settings.resourceCategories')} />
        <p className="t-small">Categories come from the template the community was made from and can be edited here.</p>
        <Locked>Files up to 10 MB: PDF, images, Office documents and plain text.</Locked>
      </Group>
    </SectionForm>
  );
}

/** A list of up to 12 short names: chips with Remove, and a field with Add (Enter adds too). */
function CategoryEditor({ label, hint, value, onChange, error: serverError }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const full = value.length >= CATEGORY_MAX;
  const add = () => {
    const name = text.trim().replace(/\s+/g, ' ');
    if (!name) { setError('Type a category name first.'); return; }
    if (name.length > CATEGORY_LEN) { setError(`Keep it to ${CATEGORY_LEN} characters or fewer.`); return; }
    if (value.some((x) => x.toLowerCase() === name.toLowerCase())) { setError(`“${name}” is already in the list.`); return; }
    if (name.toLowerCase() === 'other') { setError('Other is always offered, so it doesn’t need adding.'); return; }
    if (full) { setError(`Up to ${CATEGORY_MAX} categories. Remove one to add another.`); return; }
    onChange([...value, name]); setText(''); setError('');
  };
  const shown = error || serverError;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={`${id}-l`} className="text-sm font-semibold text-[var(--az-text)]">{label} <span className="t-small font-normal">· {value.length} of {CATEGORY_MAX}</span></span>
      {value.length > 0 ? (
        <ul aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2">
          {value.map((x) => (
            <li key={x} className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-[var(--az-control)] bg-[var(--az-surface)] pl-3.5 text-sm font-medium text-[var(--az-text)]">
              <span className="truncate">{x}</span>
              <IconButton icon="x" size="sm" label={`Remove ${x}`} className="!min-h-9 !w-9 shrink-0 !border-transparent !bg-transparent" onClick={() => onChange(value.filter((y) => y !== x))} />
            </li>
          ))}
        </ul>
      ) : <p className="t-small">None yet.</p>}
      <div className="flex min-w-0 flex-wrap gap-2">
        <input id={`${id}-in`} className="input min-w-0 flex-[1_1_200px]" value={text} maxLength={CATEGORY_LEN + 20} disabled={full}
          aria-label={`New ${label.toLowerCase().replace(/ies$/, 'y')}`} aria-invalid={!!shown || undefined} aria-describedby={`${id}-h${shown ? ` ${id}-e` : ''}`}
          placeholder={full ? `The list is full (${CATEGORY_MAX})` : 'New category'}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button icon="plus" onClick={add} disabled={full}>Add</Button>
      </div>
      <span id={`${id}-h`} className="t-small">{hint}</span>
      {shown && <span id={`${id}-e`} role="alert" className="field-error">{shown}</span>}
    </div>
  );
}
