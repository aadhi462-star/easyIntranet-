import { Glyph, Icon } from '../icons.jsx';
import { useEffect, useId, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { api } from '../../lib/api.js';
import { ACCESS, RULE_FIELDS, matchesRule } from './helpers.js';
import { errorText, onCommunityChange, visibilityOf } from '../../lib/communities.js';
import { useCommunityLifecycle, useCommunityWrite } from './useCommunity.js';
import { isOn, useFeatures } from '../../lib/features.js';
import Switch from '../manage/Switch.jsx';
import Field from '../events/FormField.jsx';
import { Badge, Button, IconButton } from '../ui/Controls.jsx';

// Event and resource categories (v2 workstream F, F13): lists in the community's settings, up to
// 12 each, 40 characters each. The store's group doesn't carry them, so they are read from the
// community itself (GET /communities/:id, settings) and re-read when it changes.
export const CATEGORY_MAX = 12;
export const CATEGORY_LEN = 40;
const cache = new Map(); // community id → { eventCategories, resourceCategories }
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);

/** { eventCategories, resourceCategories } of a community, or null while loading. */
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

// The sections an Owner or Admin can switch off (v2 E1, board V2EModules "Sections settings").
// Overview, Members and About always show. The server decides from settings.sections, which is
// all this screen writes; older lists (settings.apps) were converted once (E2) and are mapped at
// read time until then, so `group.sections` (from the server) is the starting point.
const SECTIONS = [
  ['discussions', 'Discussions', 'Posts, comments, polls, questions and announcements.'],
  ['events', 'Events', 'Events, RSVPs and the month view.'],
  ['resources', 'Resources', 'Files and links members can save and download.'],
  ['learning', 'Learning', 'Courses, enrolments and certificates.'],
];
const sectionsOn = (group) => SECTIONS.map(([id]) => id).filter((id) => group.sections?.[id] ?? true);

export default function Settings({ group }) {
  const { state, me } = useStore();
  const { patch } = useCommunityWrite();
  const lifecycle = useCommunityLifecycle();
  const learningOn = isOn(useFeatures(), 'learning');
  const archived = group.status === 'archived';
  const fromGroup = () => ({ name: group.name, description: group.description, guidelines: group.guidelines || '', accessType: group.accessType, sections: sectionsOn(group), announceOnly: !!group.announceOnly });
  const [v, setV] = useState(fromGroup);
  const lists = useCategoryLists(group.id);
  const fromLists = () => ({ eventCategories: lists?.eventCategories ?? [], resourceCategories: lists?.resourceCategories ?? [] });
  const [cats, setCats] = useState(fromLists);
  useEffect(() => { setCats(fromLists()); }, [JSON.stringify(lists)]); // eslint-disable-line react-hooks/exhaustive-deps
  const setCat = (k) => (list) => { setSaved(false); setError(''); setCats((c) => ({ ...c, [k]: list })); };
  const [rule, setRule] = useState(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Re-sync when the group changes elsewhere (e.g. the Edit group modal) so a later save doesn't revert it.
  const sig = JSON.stringify([group.name, group.description, group.guidelines, group.accessType, group.sections, group.announceOnly, group.dynamicRule]);
  useEffect(() => {
    setV(fromGroup());
    setRule(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setSaved(false); setError(''); setV({ ...v, [k]: e.target.value }); };
  const ruleValue = String(rule.value ?? '').trim();
  // Unsaved changes: a bar to save or discard, and a warning before leaving the page (SET-09).
  const dirty = JSON.stringify([v, rule, cats]) !== JSON.stringify([fromGroup(), group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' }, fromLists()]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const preview = ruleValue ? state.users.filter((u) => matchesRule(u, rule)) : [];

  // Saved on the server; pending requests are re-evaluated there when the access type changes.
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await patch(group, {
        name: v.name.trim() || group.name, description: v.description || null, visibility: visibilityOf(v.accessType),
        settings: {
          guidelines: v.guidelines, sections: v.sections,
          announceOnly: v.announceOnly, whoCanPost: v.announceOnly ? 'admins' : 'members',
          dynamicRule: ruleValue ? { ...rule, value: ruleValue } : null,
          // Only once the lists have loaded, so a save can never empty them by accident.
          ...(lists && !lists.failed ? { eventCategories: cats.eventCategories, resourceCategories: cats.resourceCategories } : {}),
        },
      }, { inline: true });
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      {/* The brief's sections (Stage 6, board S6Settings); each jumps to its part of the form. */}
      <nav aria-label="Settings sections" className="no-scrollbar flex gap-2 overflow-x-auto">
        {[['set-general', 'General'], ['set-privacy', 'Privacy and visibility'], ['set-content', 'Discussions and content'], ['set-categories', 'Categories'], ['set-modules', 'Sections'], ['set-membership', 'Membership'], ['set-safety', 'Moderation and safety'], ['danger', 'Danger Zone']].map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full border border-[var(--az-hairline)] px-3.5 text-sm hover:bg-[var(--az-sunken)] ${id === 'danger' ? 'text-[var(--az-danger)]' : 'text-[var(--az-text-2)]'}`}>{label}</a>
        ))}
      </nav>
      <section id="set-general" className="panel space-y-4 p-5">
        <h3 className="t-h3">General</h3>
        <Field label="Name"><input className="input" value={v.name} onChange={set('name')} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={v.description} onChange={set('description')} /></Field>
        <Field label="Guidelines" hint="Shown on the dashboard Guidelines widget."><textarea className="input min-h-20" value={v.guidelines} onChange={set('guidelines')} /></Field>
      </section>

      <section id="set-content" className="panel space-y-3 p-5">
        <h3 className="t-h3">Discussions and content</h3>
        <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--az-text)]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={v.announceOnly} onChange={(e) => setV({ ...v, announceOnly: e.target.checked })} />
          Only admins can post in the feed (announcement group)
        </label>
      </section>

      <fieldset id="set-privacy" className="panel p-5">
        <legend className="sr-only">Privacy and visibility</legend>
        <h3 className="t-h3 mb-3" aria-hidden="true">Privacy and visibility</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(ACCESS).map(([k, a]) => (
            <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm text-[var(--az-text)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--az-focus)] ${v.accessType === k ? 'border-[var(--az-focus)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-control)] hover:bg-[var(--az-sunken)]'}`}>
              <input type="radio" name="access" className="sr-only" checked={v.accessType === k} onChange={() => setV({ ...v, accessType: k })} />
              <div className="font-semibold"><span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span></div><div className="t-small mt-1">{a.desc}</div>
            </label>
          ))}
        </div>
      </fieldset>

      <section id="set-categories" aria-labelledby="set-categories-h" className="panel space-y-5 p-5">
        <div>
          <h3 id="set-categories-h" className="t-h3">Categories</h3>
          <p className="t-small mt-1">Members choose from these when they add an event or a resource. Up to {CATEGORY_MAX} each. Removing one leaves the events and resources that use it as they are.</p>
        </div>
        {!lists ? <p className="t-small" role="status">Loading the categories…</p>
          : lists.failed ? <p role="alert" className="notice notice-bad">Couldn’t load the categories. Reload the page to edit them.</p> : (
            <>
              <CategoryEditor label="Event categories" hint="For example Reunions, Talks or Volunteering. With none, events have no category." value={cats.eventCategories} onChange={setCat('eventCategories')} />
              <CategoryEditor label="Resource categories" hint="For example Guides or Slides. With none, people type their own; with a list, they pick one or Other." value={cats.resourceCategories} onChange={setCat('resourceCategories')} />
            </>
          )}
      </section>

      <fieldset id="set-modules" className="panel p-5" aria-describedby="set-sections-hint">
        <legend className="sr-only">Sections</legend>
        <h3 className="t-h3" aria-hidden="true">Sections</h3>
        <p id="set-sections-hint" className="t-small mt-1">Overview, Members and About are always on. Switching a section off hides its tab and its address; nothing in it is deleted, and it all comes back when you switch it on again.</p>
        <div className="mt-2 divide-y divide-[var(--az-divider)]">
          {SECTIONS.map(([id, label, hint]) => {
            const parked = id === 'learning' && !learningOn;
            return (
              <Switch key={id} id={`set-section-${id}`} label={label}
                hint={parked ? 'Learning is switched off for the whole platform. Ask a Platform Admin to turn it on.' : hint}
                checked={!parked && v.sections.includes(id)} disabled={parked}
                onChange={(on) => { setSaved(false); setError(''); setV({ ...v, sections: SECTIONS.map(([x]) => x).filter((x) => (x === id ? on : v.sections.includes(x))) }); }} />
            );
          })}
        </div>
        {!learningOn && <p className="t-small mt-2">The community’s own choice for Learning is kept: if it had Learning on, the tab returns when the platform switch does.</p>}
      </fieldset>

      <section id="set-membership" className="panel space-y-3 p-5">
        <h3 className="t-h3">Membership</h3>
        <Locked text="Removed members can ask to join again after 7 days" />
        <h4 className="pt-2 text-sm font-semibold text-[var(--az-text)]">Dynamic membership</h4>
        <p className="text-2 text-sm">People whose profile matches this rule are sent an invitation, now and when they join CommunityOne later. Nobody joins until they accept. For now this runs while an admin of this group has CommunityOne open.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="input" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} aria-label="Profile field">
            {RULE_FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value })} aria-label="Condition">
            <option value="eq">is</option><option value="contains">contains</option>
          </select>
          <input className="input" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} placeholder="Value (blank = off)" aria-label="Value" />
        </div>
        {ruleValue && <p className="t-small">Matches {preview.length} {preview.length === 1 ? 'person' : 'people'}: {preview.map((u) => u.name).join(', ') || 'none'}</p>}
      </section>

      <section id="set-safety" className="panel space-y-3 p-5">
        <h3 className="t-h3">Moderation and safety</h3>
        <p className="text-2 text-sm">Members report posts, replies, events and other members; reports go to this community’s moderators (Manage → Queue).</p>
        <Locked text="Report reasons: Spam · Harassment or bullying · Hate · False or misleading · Off-topic · Something else" />
        <Locked text="Files: up to 10 MB; PDF, images, Office documents and plain text" />
      </section>

      {dirty && (
        <div role="region" aria-label="Unsaved changes" className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--az-warning)] bg-[var(--az-surface)] p-3 shadow-[var(--az-shadow)] lg:bottom-4">
          <span className="flex-1 text-sm text-[var(--az-text)]">You have unsaved changes.</span>
          <button type="button" className="btn btn-secondary" onClick={() => { setV(fromGroup()); setRule(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' }); setCats(fromLists()); setError(''); }}>Discard</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {archived
            ? <button type="button" className="btn btn-secondary" onClick={() => lifecycle.archive(group, false)}>Restore community</button>
            : <button type="button" className="btn btn-ghost !text-[var(--az-danger)]" onClick={() => lifecycle.archive(group, true)} disabled={group.allHands}>Archive community</button>}
          {me.admin && <button type="button" className="btn btn-ghost !text-[var(--az-danger)]" onClick={() => lifecycle.remove(group)} disabled={group.allHands}>Delete community</button>}
        </div>
        <div className="flex items-center gap-3">
          {error && <span role="alert" className="text-sm font-medium text-[var(--az-danger)]">{error}</span>}
          {saved && <span role="status"><Badge tone="ok" icon="check">Saved</Badge></span>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
    </form>
  );
}

/** A rule the platform sets: shown, never editable here (SET-01). */
function Locked({ text }) {
  return (
    <p className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--az-sunken)] px-3 py-2.5 text-sm">
      <Badge>Managed by CommunityOne</Badge>
      <span className="min-w-0 flex-1 text-[var(--az-text)]">{text}</span>
    </p>
  );
}

/** A list of up to 12 short names: chips with Remove, and a field with Add (Enter adds too). */
function CategoryEditor({ label, hint, value, onChange }) {
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
          aria-label={`New ${label.toLowerCase().replace(/ies$/, 'y')}`} aria-invalid={!!error || undefined} aria-describedby={`${id}-h${error ? ` ${id}-e` : ''}`}
          placeholder={full ? `The list is full (${CATEGORY_MAX})` : 'New category'}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button icon="plus" onClick={add} disabled={full}>Add</Button>
      </div>
      <span id={`${id}-h`} className="t-small">{hint}</span>
      {error && <span id={`${id}-e`} role="alert" className="field-error">{error}</span>}
    </div>
  );
}
