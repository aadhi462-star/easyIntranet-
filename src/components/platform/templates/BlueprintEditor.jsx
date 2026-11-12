// The blueprint of a template version as structured fields, one per blueprint key: name and
// description patterns with {slot} placeholders, sections, learning, topics, membership, resource
// and event categories, event defaults, guidelines, roles in use, and rules that change the
// suggestion when an answer matches. Nothing here runs: answers only fill named slots (F12).
import { Button, IconButton } from '../../ui/Controls.jsx';
import Condition, { defaultCondition } from './Condition.jsx';
import { Check, CheckGroup, Fld, ListField, PatternField } from './Fields.jsx';
import { EVENT_TYPES, MAX_TOPICS, ROLES, SECTIONS, VISIBILITY, slot } from './shared.js';

const without = (o, k) => { const { [k]: _, ...rest } = o; return rest; };
// Lists that may be left out of the blueprint when empty (event categories are new in F13).
const DROP_WHEN_EMPTY = new Set(['eventCategories', 'resourceCategories', 'topics', 'roles', 'rules']);

function Group({ id, title, intro, children }) {
  return (
    <section aria-labelledby={id} className="panel flex flex-col gap-4 p-4 md:p-5">
      <div>
        <h3 id={id} className="t-h3">{title}</h3>
        {intro && <p className="t-small mt-1">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

export default function BlueprintEditor({ blueprint: bp, onChange, questions, errors = {}, readOnly = false }) {
  const keys = questions.map((q) => q.key).filter(Boolean);
  const set = (k, v) => onChange(v === undefined || (DROP_WHEN_EMPTY.has(k) && Array.isArray(v) && !v.length) ? without(bp, k) : { ...bp, [k]: v });
  const m = bp.membership ?? {};
  const setM = (k, v) => set('membership', { ...m, [k]: v });
  const ev = bp.eventDefaults;
  const setEv = (k, v) => {
    const next = v === undefined || v === '' ? without(ev ?? {}, k) : { ...(ev ?? {}), [k]: v };
    set('eventDefaults', Object.keys(next).length ? next : undefined);
  };

  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
      <legend className="sr-only">Blueprint</legend>
      {errors.blueprint && <p role="alert" className="notice notice-bad"><strong>Fix the blueprint.</strong> {errors.blueprint}</p>}

      <Group id="bp-text" title="Name and description" intro={`Write ${slot('slot')} where an answer goes. An unanswered optional question leaves no gap.`}>
        <PatternField id="bp-name" label="Name pattern" value={bp.name} onChange={(v) => set('name', v)} keys={keys} maxLength={200}
          hint="Required to publish. For example {institution} Alumni." error={errors.name} />
        <PatternField id="bp-description" label="Description pattern" multiline value={bp.description} onChange={(v) => set('description', v)} keys={keys} maxLength={1000}
          error={errors.description} />
      </Group>

      <Group id="bp-sections" title="Sections and learning" intro="Overview and About are always there; Members always shows.">
        <CheckGroup id="bp-sec" legend="Sections switched on" options={SECTIONS} value={bp.sections ?? []} onChange={(v) => set('sections', v)} error={errors.sections} />
        <Check id="bp-learning" label="Learning (courses and lessons)" checked={bp.learning} onChange={(v) => set('learning', v)} />
        {errors.learning && <p className="field-error">{errors.learning}</p>}
      </Group>

      <Group id="bp-topics" title="Discussion topics">
        <ListField id="bp-topic-list" label="Topics" itemLabel="topic" max={MAX_TOPICS} maxLength={60} value={bp.topics ?? []} onChange={(v) => set('topics', v)}
          placeholder="A topic, or a slot such as {departments}" error={errors.topics}
          hint={`Up to ${MAX_TOPICS} once the answers are in. A topic that is only a list question’s slot becomes one topic per item.`} />
      </Group>

      <Group id="bp-membership" title="Membership" intro="Who can join is the visibility; templates never add anyone automatically.">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <Fld id="bp-vis" label="Visibility" error={errors.membership}>
            {(p) => (
              <select {...p} className="input" value={m.visibility ?? 'public'} onChange={(e) => setM('visibility', e.target.value)}>
                {VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            )}
          </Fld>
          <Fld id="bp-post" label="Who can post">
            {(p) => (
              <select {...p} className="input" value={m.whoCanPost ?? 'members'} onChange={(e) => setM('whoCanPost', e.target.value)}>
                <option value="members">Members</option><option value="admins">Owners and Admins</option>
              </select>
            )}
          </Fld>
          <Fld id="bp-events" label="Who can create events">
            {(p) => (
              <select {...p} className="input" value={m.whoCanCreateEvents ?? 'members'} onChange={(e) => setM('whoCanCreateEvents', e.target.value)}>
                <option value="members">Members</option><option value="admins">Owners and Admins</option>
              </select>
            )}
          </Fld>
          <div className="flex flex-col justify-end gap-2">
            <Check id="bp-approval" label="Join requests need approval" checked={m.requireApproval} onChange={(v) => setM('requireApproval', v)} />
            <Check id="bp-addres" label="Members can add resources" checked={m.membersAddResources} onChange={(v) => setM('membersAddResources', v)} />
          </div>
        </div>
      </Group>

      <Group id="bp-cats" title="Resource and event categories">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
          <ListField id="bp-rescat" label="Resource categories" itemLabel="category" max={12} maxLength={40} value={bp.resourceCategories ?? []}
            onChange={(v) => set('resourceCategories', v)} error={errors.resourceCategories} />
          <ListField id="bp-evcat" label="Event categories" itemLabel="category" max={12} maxLength={40} value={bp.eventCategories ?? []}
            onChange={(v) => set('eventCategories', v)} error={errors.eventCategories} />
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
          <Fld id="bp-evtype" label="Default event type" error={errors.eventDefaults}>
            {(p) => (
              <select {...p} className="input" value={ev?.eventType ?? ''} onChange={(e) => setEv('eventType', e.target.value || undefined)}>
                <option value="">None</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </Fld>
          <Fld id="bp-evlen" label="Default length" hint="Minutes, 15 to 1440.">
            {(p) => <input {...p} type="number" inputMode="numeric" min={15} max={1440} step={15} className="input" value={ev?.durationMinutes ?? ''}
              onChange={(e) => { const n = parseInt(e.target.value, 10); setEv('durationMinutes', Number.isFinite(n) ? n : undefined); }} />}
          </Fld>
          <div className="flex items-end pb-2.5">
            <Check id="bp-rsvp" label="RSVP on by default" checked={ev?.rsvpEnabled} onChange={(v) => setEv('rsvpEnabled', v || undefined)} />
          </div>
        </div>
      </Group>

      <Group id="bp-guidelines" title="Guidelines">
        <PatternField id="bp-guide" label="Community guidelines" multiline rows={5} value={bp.guidelines} onChange={(v) => set('guidelines', v)} keys={keys} maxLength={5000}
          error={errors.guidelines} hint="Under 5,000 characters once filled in. Owners can change them after creating." />
      </Group>

      <Group id="bp-roles" title="Roles in use" intro="Owner, Admin and Member are always in use. Others are hidden from menus unless switched on.">
        <CheckGroup id="bp-role" legend="Also in use" options={ROLES} value={bp.roles ?? []} onChange={(v) => set('roles', v)} error={errors.roles} />
      </Group>

      <Rules rules={bp.rules ?? []} questions={questions} errors={errors} readOnly={readOnly} onChange={(v) => set('rules', v)} />
    </fieldset>
  );
}

// ---- Rules ---------------------------------------------------------------------------------------

function Rules({ rules, questions, errors, readOnly, onChange }) {
  const setRule = (i, r) => onChange(rules.map((x, j) => (j === i ? r : x)));
  const add = () => {
    const q = questions.find((x) => x.type === 'choice') ?? questions[0];
    onChange([...rules, { when: defaultCondition(q), add: { topics: [] } }]);
  };
  const move = (i, d) => { const next = [...rules]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <Group id="bp-rules" title="Rules" intro="Applied in order after the answers are in. A rule can switch settings or add to the lists above.">
      {errors.rules && <p className="field-error">{errors.rules}</p>}
      {!rules.length && <p className="t-small">No rules. Every answer only fills its slot.</p>}
      <ol className="flex flex-col gap-3">
        {rules.map((r, i) => (
          <li key={i} className="sunken p-3 md:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="t-label">Rule {i + 1}</span>
              {!readOnly && (
                <span className="flex gap-1">
                  <IconButton size="sm" icon="up" label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton size="sm" icon="down" label={`Move rule ${i + 1} down`} disabled={i === rules.length - 1} onClick={() => move(i, 1)} />
                  <IconButton size="sm" icon="x" label={`Remove rule ${i + 1}`} onClick={() => onChange(rules.filter((_, j) => j !== i))} />
                </span>
              )}
            </div>
            <Rule id={`rule-${i}`} r={r} questions={questions} error={errors[`rules[${i}]`]} onChange={(next) => setRule(i, next)} />
          </li>
        ))}
      </ol>
      {!readOnly && <div><Button size="sm" icon="plus" onClick={add} disabled={!questions.length || rules.length >= 30}>Add rule</Button></div>}
      {!questions.length && <p className="t-small">Add a question first: every rule depends on an answer.</p>}
    </Group>
  );
}

function Rule({ id, r, questions, error, onChange }) {
  const s = r.set ?? {};
  const a = r.add ?? {};
  const clean = (o) => (Object.keys(o).length ? o : undefined);
  const setSet = (k, v) => {
    const next = v === undefined ? without(s, k) : { ...s, [k]: v };
    const out = { ...r, set: clean(next) };
    if (!out.set) { delete out.set; if (!out.add) out.add = {}; } else if (out.add && !Object.values(out.add).some((x) => x?.length)) delete out.add;
    onChange(out);
  };
  const setAdd = (k, v) => { const next = !v?.length ? without(a, k) : { ...a, [k]: v }; const out = { ...r, add: clean(next) ?? (r.set ? undefined : {}) }; if (!out.add) delete out.add; onChange(out); };
  const vis = s.membership?.visibility ?? '';
  const otherSet = Object.keys(s).filter((k) => !['membership', 'learning'].includes(k));
  const otherMembership = Object.keys(s.membership ?? {}).filter((k) => k !== 'visibility');
  const empty = !Object.keys(s).length && !Object.values(a).some((v) => v?.length);

  return (
    <div className="flex flex-col gap-4">
      <Condition id={`${id}-when`} label="When the answer to" questions={questions} value={r.when ?? null} error={error}
        onChange={(when) => { if (when) onChange({ ...r, when }); }} />

      <div className="grid min-w-0 gap-3 sm:grid-cols-2" role="group" aria-label="Then">
        <Fld id={`${id}-vis`} label="Then set visibility">
          {(p) => (
            <select {...p} className="input" value={vis} onChange={(e) => {
              const mm = e.target.value ? { ...(s.membership ?? {}), visibility: e.target.value } : without(s.membership ?? {}, 'visibility');
              setSet('membership', Object.keys(mm).length ? mm : undefined);
            }}>
              <option value="">No change</option>
              {VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          )}
        </Fld>
        <Fld id={`${id}-learn`} label="Then set learning">
          {(p) => (
            <select {...p} className="input" value={'learning' in s ? String(s.learning) : ''} onChange={(e) => setSet('learning', e.target.value === '' ? undefined : e.target.value === 'true')}>
              <option value="">No change</option><option value="true">On</option><option value="false">Off</option>
            </select>
          )}
        </Fld>
      </div>
      {(otherSet.length > 0 || otherMembership.length > 0) && (
        <p className="t-small">This rule also sets {[...otherSet, ...otherMembership.map((k) => `membership ${k}`)].join(', ')}; that part is kept as it is.</p>
      )}
      <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
        <ListField id={`${id}-topics`} label="And add topics" itemLabel="topic" maxLength={60} value={a.topics ?? []} onChange={(v) => setAdd('topics', v)} />
        <ListField id={`${id}-res`} label="And add resource categories" itemLabel="category" maxLength={40} value={a.resourceCategories ?? []} onChange={(v) => setAdd('resourceCategories', v)} />
        <CheckGroup id={`${id}-sec`} legend="And switch on sections" options={SECTIONS} value={a.sections ?? []} onChange={(v) => setAdd('sections', v)} />
        <CheckGroup id={`${id}-roles`} legend="And use roles" options={ROLES} value={a.roles ?? []} onChange={(v) => setAdd('roles', v)} />
      </div>
      {empty && <p className="notice notice-warn">This rule doesn’t change anything yet. Choose a setting or add something, or remove the rule.</p>}
    </div>
  );
}
