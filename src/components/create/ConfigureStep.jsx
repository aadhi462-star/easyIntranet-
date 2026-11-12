// Step 3, Configure (boards V2FConfigure and V2FPhone): one form for both paths. Basics,
// Sections, Discussion topics, Roles and permissions, Membership, Event and resource categories,
// Learning and Guidelines. On the template path a field that differs from what the answers
// suggested is marked Edited (F3). From 768 px the sections are one page with a list of links;
// on phones they open one at a time, each with a one-line summary when closed.
import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../../../shared/categories.js';
import { Icon } from '../icons.jsx';
import { Button, IconButton } from '../ui/Controls.jsx';
import Switch from '../manage/Switch.jsx';
import { CommunityTile } from '../public/CommunityCards.jsx';
import { countWord, DESCRIPTION_MAX, FIELDS, GUIDELINES_MAX, ITEM_MAX, lines, MAX_CATEGORIES, MAX_TOPICS, NAME_MAX, SECTION_LIST, SHORT_MAX, VISIBILITY } from './draft.js';
import { checkPicture } from './pictures.js';
import { ChipList, describedBy, EditedBadge, FieldLabel, StepBar, StepTitle, useIsPhone } from './parts.jsx';

const GROUPS = [
  { id: 'basics', title: 'Basics' },
  { id: 'sections', title: 'Sections' },
  { id: 'topics', title: 'Discussion topics' },
  { id: 'roles', title: 'Roles and permissions' },
  { id: 'membership', title: 'Membership' },
  { id: 'categories', title: 'Event and resource categories' },
  { id: 'learning', title: 'Learning', learning: true },
  { id: 'guidelines', title: 'Guidelines' },
];

/** The one-line summary a closed section shows on phones. */
function summaryOf(id, c) {
  switch (id) {
    case 'basics': return 'Name, description, category, logo and cover';
    case 'sections': return ['Overview', ...SECTION_LIST.filter((s) => c.sections.includes(s.id)).map((s) => s.label), ...(c.learning ? ['Learning'] : []), 'Members', 'About'].join(', ');
    case 'topics': { const t = c.topics.filter((x) => x.trim()); return t.length ? `${countWord(t.length, 'topic')} · ${t.slice(0, 3).join(', ')}${t.length > 3 ? '…' : ''}` : 'No topics'; }
    case 'roles': return [['Owner', 'Admin', ...(c.roles.includes('moderator') ? ['Moderator'] : []), ...(c.learning && c.roles.includes('instructor') ? ['Instructor'] : [])].join(', '),
      c.whoCanPost === 'admins' ? 'only admins start discussions' : 'members start discussions'].join(' · ');
    case 'membership': return c.visibility ? `${VISIBILITY[c.visibility].label} · ${VISIBILITY[c.visibility].short}` : 'Visibility not chosen yet';
    case 'categories': return `${c.eventCategories.length} event, ${c.resourceCategories.length} resource`;
    case 'learning': return c.learning ? 'On' : 'Off';
    case 'guidelines': { const n = lines(c.guidelines).length; return n ? countWord(n, 'rule') : 'None yet'; }
    default: return '';
  }
}

export default function ConfigureStep({ draft, onChange, edited, pictures, onPicture, errors, focus, onFocused, updated, onDismissUpdated,
  learningAllowed, onBack, onPreview, onPublish, onChangeAnswers, savedNote }) {
  const c = draft.config;
  const phone = useIsPhone();
  const groups = GROUPS.filter((g) => !g.learning || learningAllowed);
  const [open, setOpen] = useState('basics');
  const [current, setCurrent] = useState('basics');
  const isEdited = (f) => edited.includes(f);
  const groupEdited = (id) => edited.some((f) => FIELDS[f]?.section === id);
  const groupError = (id) => Object.keys(errors).some((f) => FIELDS[f]?.section === id);
  const set = (patch) => onChange({ ...c, ...patch });

  // Open the section holding `focus` (a problem's field) and put the cursor there.
  useEffect(() => {
    if (!focus) return undefined;
    const section = FIELDS[focus]?.section ?? 'basics';
    setOpen(section);
    const h = setTimeout(() => {
      const el = document.getElementById(`cf-${focus}`) ?? document.getElementById(`cs-${section}`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus({ preventScroll: true });
      onFocused();
    }, 60);
    return () => clearTimeout(h);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Which section is on screen, for the list of links (desktop).
  useEffect(() => {
    if (phone || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setCurrent(top.target.id.replace(/^cs-/, ''));
    }, { rootMargin: '-80px 0px -60% 0px' });
    groups.forEach((g) => { const el = document.getElementById(`cs-${g.id}`); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [phone, groups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (id) => {
    const p = { c, set, isEdited, errors };
    switch (id) {
      case 'basics': return <Basics {...p} pictures={pictures} onPicture={onPicture} />;
      case 'sections': return <Sections {...p} learningAllowed={learningAllowed} />;
      case 'topics': return <Topics {...p} />;
      case 'roles': return <Roles {...p} learningAllowed={learningAllowed} />;
      case 'membership': return <Membership {...p} />;
      case 'categories': return <Categories {...p} />;
      case 'learning': return <Learning {...p} />;
      case 'guidelines': return <Guidelines {...p} />;
      default: return null;
    }
  };

  const fromTemplate = draft.path === 'template' && draft.template && !draft.withoutTemplate;
  const answered = Object.keys(draft.answers ?? {}).filter((k) => { const v = draft.answers[k]; return v != null && v !== '' && !(Array.isArray(v) && !v.length); }).length;

  return (
    <div className="flex flex-col gap-5">
      <StepTitle sub={fromTemplate ? (phone ? `From the ${draft.template.name} template. Change anything.` : 'Everything the questions suggested, and everything else. Change any of it.') : 'Everything a community can have. Choose what yours needs.'}>Configure</StepTitle>

      {updated.length > 0 && (
        <div role="status" className="notice notice-info flex flex-wrap items-start gap-3">
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">Updated from your answers: {updated.map((f) => FIELDS[f]?.label ?? f).join(', ')}. Fields you edited were kept.</span>
          <button type="button" className="link text-sm" onClick={onDismissUpdated}>Dismiss</button>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {!phone && (
          <nav aria-label="Configure sections" className="lg:sticky lg:top-24 lg:w-[210px] lg:shrink-0">
            <ul className="flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
              {groups.map((g) => (
                <li key={g.id}>
                  <a href={`#cs-${g.id}`} aria-current={current === g.id ? 'true' : undefined}
                    onClick={(e) => { e.preventDefault(); const el = document.getElementById(`cs-${g.id}`); el?.scrollIntoView({ block: 'start', behavior: 'smooth' }); el?.focus({ preventScroll: true }); setCurrent(g.id); }}
                    className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)] ${current === g.id ? 'bg-[var(--az-surface)] font-semibold shadow-[inset_3px_0_0_var(--az-ok)]' : 'font-medium'}`}>
                    {g.title}
                    {groupError(g.id) && <Icon name="alert" size={14} className="text-[var(--az-danger)]" label="Needs a change" />}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {groups.map((g) => (phone ? (
            <section key={g.id} aria-labelledby={`cs-${g.id}-h`} className="panel overflow-hidden">
              <h2 id={`cs-${g.id}-h`} className="m-0">
                <button type="button" id={`cs-${g.id}`} aria-expanded={open === g.id} aria-controls={`cs-${g.id}-b`} onClick={() => setOpen(open === g.id ? null : g.id)}
                  className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--az-text)]">{g.title}{groupEdited(g.id) && <EditedBadge />}{groupError(g.id) && <Icon name="alert" size={16} className="text-[var(--az-danger)]" label="Needs a change" />}</span>
                    {open !== g.id && <span className="t-small block truncate">{summaryOf(g.id, c)}</span>}
                  </span>
                  <Icon name={open === g.id ? 'up' : 'down'} size={18} className="mt-0.5 text-[var(--az-text-3)]" />
                </button>
              </h2>
              {open === g.id && <div id={`cs-${g.id}-b`} className="flex flex-col gap-4 border-t border-[var(--az-divider)] px-4 py-4">{body(g.id)}</div>}
            </section>
          ) : (
            <section key={g.id} id={`cs-${g.id}`} tabIndex={-1} aria-labelledby={`cs-${g.id}-h`} className="panel flex scroll-mt-24 flex-col gap-4 p-6 outline-none">
              <h2 id={`cs-${g.id}-h`} className="t-h3 flex flex-wrap items-center gap-2">{g.title}</h2>
              {body(g.id)}
            </section>
          )))}
        </div>

        <aside aria-label="About this draft" className="flex w-full flex-col gap-4 lg:sticky lg:top-24 lg:w-[300px] lg:shrink-0">
          {fromTemplate && (
            <div className="panel flex flex-col gap-2.5 p-5">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-[var(--az-text)]"><Icon name="shape" size={18} />From the {draft.template.name} template</span>
              <p className="t-small">Version {draft.template.version} · {countWord(answered, 'answer')} · {countWord(edited.length, 'field')} edited</p>
              <p className="t-small">Your changes stay in this community. They never change the template, and later template changes never reach this community.</p>
              {(draft.template.questionnaire ?? []).length > 0 && <button type="button" className="link self-start text-sm" onClick={onChangeAnswers}>Change answers</button>}
            </div>
          )}
          {!phone && (
            <div className="panel flex flex-col gap-2.5 p-5">
              <span className="text-[15px] font-semibold text-[var(--az-text)]">Before you publish</span>
              <p className="t-small">Preview shows the page with sample content. Validate runs the same checks the server runs.</p>
              <Button icon="eye" onClick={onPreview}>Preview</Button>
              <Button variant="primary" onClick={onPublish}>Validate and publish</Button>
            </div>
          )}
          <p className="t-small">{savedNote}</p>
        </aside>
      </div>

      <StepBar back={{ label: draft.path === 'template' && (draft.template?.questionnaire ?? []).length ? 'Back to questions' : 'Back to start', onClick: onBack }}
        next={{ label: 'Preview', onClick: onPreview }} />
    </div>
  );
}

// ---- Sections of the form -------------------------------------------------------------------

function TextField({ id, label, value, onChange, hint, error, edited, max, rows, counter = false, className = '' }) {
  const fid = `cf-${id}`;
  const Tag = rows ? 'textarea' : 'input';
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <FieldLabel htmlFor={fid} edited={edited}>{label}</FieldLabel>
      <Tag id={fid} className="input" rows={rows} value={value} maxLength={max ? max + 200 : undefined} aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, { hint: !!hint || counter, error })} onChange={(e) => onChange(e.target.value)} />
      {(hint || counter) && <span id={`${fid}-h`} className="t-small">{hint}{counter && ` ${value.trim().length.toLocaleString('en')} of ${max.toLocaleString('en')} characters.`}</span>}
      {error && <p id={`${fid}-e`} className="field-error !mt-0">{error}</p>}
    </div>
  );
}

function Basics({ c, set, isEdited, errors, pictures, onPicture }) {
  return (
    <>
      <TextField id="name" label="Name" value={c.name} onChange={(v) => set({ name: v })} edited={isEdited('name')} error={errors.name} max={NAME_MAX}
        hint="2 to 80 characters. Shown on the community page and in Explore." />
      <TextField id="description" label="Description" rows={3} value={c.description} onChange={(v) => set({ description: v })} edited={isEdited('description')}
        error={errors.description} max={DESCRIPTION_MAX} hint="People read it before they join." counter />
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="cf-category" edited={isEdited('category')}>Category</FieldLabel>
        <select id="cf-category" className="input sm:max-w-sm" value={c.category} aria-invalid={errors.category ? true : undefined}
          aria-describedby={describedBy('cf-category', { error: errors.category })} onChange={(e) => set({ category: e.target.value })}>
          {!c.category && <option value="">Choose a category</option>}
          {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <span id="cf-category-h" className="t-small">Used for Explore’s filters. Changing it doesn’t change anything else.</span>
        {errors.category && <p id="cf-category-e" className="field-error !mt-0">{errors.category}</p>}
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
        <Picture kind="logo" label="Logo" name={c.name} picture={pictures.logo} onPicture={onPicture}
          hint="Square PNG, JPEG or WebP, at least 256 by 256 px, up to 2 MB. Until you add one, a lettered tile is used." />
        <Picture kind="cover" label="Cover" name={c.name} picture={pictures.cover} onPicture={onPicture}
          hint="Wide PNG, JPEG or WebP, 4:1, at least 1600 by 400 px, up to 5 MB." />
      </div>
      <p className="t-small">Pictures are added just after you publish. They aren’t kept in the draft, so if you leave this page, choose them again. If one doesn’t upload, everything else is still created.</p>
    </>
  );
}

function Picture({ kind, label, name, picture, onPicture, hint }) {
  const input = useRef(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const fid = `cf-${kind}`;
  const choose = async (file) => {
    if (!file) return;
    setChecking(true); setError('');
    const broken = await checkPicture(kind, file);
    setChecking(false);
    if (broken) { setError(broken); return; }
    onPicture(kind, file);
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${fid}-l`}>
      <span id={`${fid}-l`} className="text-sm font-medium text-[var(--az-text)]">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {kind === 'logo'
          ? (picture ? <img src={picture.url} alt="Chosen logo" className="h-11 w-11 rounded-[10px] object-cover" /> : <CommunityTile c={{ name: name.trim() || 'New community', accent: 'teal' }} size={44} />)
          : (picture ? <img src={picture.url} alt="Chosen cover" className="h-11 w-24 rounded-lg object-cover" />
            : <span aria-hidden="true" className="grid h-11 w-24 place-items-center rounded-lg bg-[var(--az-sunken)] text-[var(--az-text-3)]"><Icon name="image" size={18} /></span>)}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; choose(f); }} />
        <Button id={fid} size="sm" icon="image" busy={checking} onClick={() => input.current?.click()} aria-describedby={describedBy(fid, { error })}>{picture ? `Replace ${kind}` : `Upload ${kind}`}</Button>
        {picture && <Button size="sm" variant="ghost" onClick={() => { setError(''); onPicture(kind, null); }}>Remove</Button>}
      </div>
      <span id={`${fid}-h`} className="t-small">{hint}</span>
      {error && <p id={`${fid}-e`} className="field-error !mt-0" role="alert">{error}</p>}
    </div>
  );
}

function Sections({ c, set, isEdited, learningAllowed }) {
  const toggle = (id, on) => set({ sections: SECTION_LIST.map((s) => s.id).filter((s) => (s === id ? on : c.sections.includes(s))) });
  return (
    <>
      <p className="flex flex-wrap items-center gap-2 text-sm leading-[22px] text-[var(--az-text-2)]">Only sections that are on appear on the community page. Turning one off later hides it and keeps its content.{isEdited('sections') && <EditedBadge />}</p>
      <div className="flex flex-col divide-y divide-[var(--az-divider)]">
        <Switch id="cf-sec-overview" label="Overview" hint="Always on" checked disabled onChange={() => {}} />
        {SECTION_LIST.map((s, i) => (
          <div key={s.id} id={i === 0 ? 'cf-sections' : undefined} tabIndex={i === 0 ? -1 : undefined} className="outline-none">
            <Switch id={`cf-sec-${s.id}`} label={s.label} checked={c.sections.includes(s.id)} onChange={(on) => toggle(s.id, on)} />
          </div>
        ))}
        {learningAllowed && <Switch id="cf-sec-learning" label="Learning" hint="Set up in Learning below" checked={c.learning} onChange={(on) => set({ learning: on })} />}
        <Switch id="cf-sec-members" label="Members" hint="Always on" checked disabled onChange={() => {}} />
        <Switch id="cf-sec-about" label="About" hint="Always on: description, guidelines and Owners" checked disabled onChange={() => {}} />
      </div>
    </>
  );
}

function Topics({ c, set, isEdited, errors }) {
  const topics = c.topics;
  const put = (next) => set({ topics: next });
  const move = (i, d) => { const n = [...topics]; [n[i], n[i + d]] = [n[i + d], n[i]]; put(n); };
  const add = () => {
    put([...topics, '']);
    const n = topics.length;
    setTimeout(() => document.getElementById(n === 0 ? 'cf-topics' : `cf-topic-${n}`)?.focus(), 0);
  };
  const filled = topics.filter((x) => x.trim()).length;
  return (
    <>
      <p id="cf-topics-h" className="flex flex-wrap items-center gap-2 text-sm leading-[22px] text-[var(--az-text-2)]">Members choose one when they post. Names are 1 to {ITEM_MAX} characters and can’t repeat.{isEdited('topics') && <EditedBadge />}</p>
      {topics.length > 0 && (
        <ul className="flex flex-col gap-2">
          {topics.map((t, i) => {
            const label = t.trim() || `topic ${i + 1}`;
            return (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i} className="flex items-center gap-2">
                <input id={i === 0 ? 'cf-topics' : `cf-topic-${i}`} className="input min-w-0 flex-1" value={t} maxLength={ITEM_MAX + 20}
                  aria-label={`Topic ${i + 1}`} aria-describedby={describedBy('cf-topics', { error: errors.topics })} aria-invalid={errors.topics ? true : undefined}
                  onChange={(e) => put(topics.map((x, j) => (j === i ? e.target.value : x)))} />
                <IconButton icon="up" size="sm" variant="secondary" label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="down" size="sm" variant="secondary" label={`Move ${label} down`} disabled={i === topics.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon="x" size="sm" label={`Remove ${label}`} className="!text-[var(--az-danger)]" onClick={() => put(topics.filter((_, j) => j !== i))} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button id={topics.length ? undefined : 'cf-topics'} size="sm" variant="ghost" icon="plus" onClick={add} disabled={topics.length >= MAX_TOPICS}>Add topic</Button>
        <span className="t-small tabular-nums">{filled} of {MAX_TOPICS}</span>
      </div>
      {errors.topics && <p id="cf-topics-e" className="field-error !mt-0">{errors.topics}</p>}
    </>
  );
}

function Radios({ id, legend, value, options, onChange, edited, error }) {
  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? `cf-${id}-e` : undefined}>
      <legend className="t-label mb-2 flex flex-wrap items-center gap-2">{legend}{edited && <EditedBadge />}</legend>
      {options.map(([v, label], i) => (
        <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-[var(--az-text)]">
          <input id={i === 0 ? `cf-${id}` : undefined} type="radio" name={`cf-${id}`} checked={value === v} onChange={() => onChange(v)} className="h-[18px] w-[18px] shrink-0 accent-[var(--az-ok)]" />
          {label}
        </label>
      ))}
      {error && <p id={`cf-${id}-e`} className="field-error !mt-0">{error}</p>}
    </fieldset>
  );
}

function Check({ id, checked, onChange, disabled, label, hint }) {
  return (
    <label className={`flex items-start gap-2.5 text-[15px] leading-[22px] text-[var(--az-text)] ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} aria-describedby={hint ? `${id}-h` : undefined}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--az-ok)] disabled:opacity-60" />
      <span>{label}{hint && <span id={`${id}-h`} className="t-small block">{hint}</span>}</span>
    </label>
  );
}

function Roles({ c, set, isEdited, errors, learningAllowed }) {
  const has = (r) => c.roles.includes(r);
  const teaching = c.learning && learningAllowed;
  const setRole = (rs, on) => set({ roles: on ? [...new Set([...c.roles, ...rs])] : c.roles.filter((r) => !rs.includes(r)) });
  return (
    <>
      <p className="text-sm leading-[22px] text-[var(--az-text-2)]">Roles not in use are hidden from this community’s menus. What each role may do is fixed by the platform and checked by the server.</p>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="t-label mb-2 flex flex-wrap items-center gap-2">Roles in use{isEdited('roles') && <EditedBadge />}</legend>
        <Check id="cf-role-owner" checked disabled label="Owner" hint="You. Every community has exactly one." />
        <Check id="cf-role-admin" checked disabled label="Admin" hint="Always available: someone must be able to approve requests." />
        <Check id="cf-roles" checked={has('moderator')} onChange={(on) => setRole(['moderator'], on)} label="Moderator" hint="Reviews reports and held posts." />
        {learningAllowed && (
          <Check id="cf-role-teaching" checked={teaching && (has('instructor') || has('teaching_assistant'))} disabled={!teaching}
            onChange={(on) => setRole(['instructor', 'teaching_assistant'], on)} label="Instructor and Teaching Assistant"
            hint={teaching ? 'Teach courses in Learning. People get these roles only after they accept and join.' : 'Turn on Learning to use them.'} />
        )}
        {errors.roles && <p id="cf-roles-e" className="field-error !mt-0">{errors.roles}</p>}
      </fieldset>
      <hr className="border-[var(--az-divider)]" />
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
        <Radios id="whoCanPost" legend="Who can start discussions" value={c.whoCanPost} edited={isEdited('whoCanPost')} error={errors.whoCanPost}
          options={[['members', 'Members'], ['admins', 'Only Owners and Admins']]} onChange={(v) => set({ whoCanPost: v })} />
        <Radios id="whoCanCreateEvents" legend="Who can create events" value={c.whoCanCreateEvents} edited={isEdited('whoCanCreateEvents')} error={errors.whoCanCreateEvents}
          options={[['members', 'Members'], ['admins', 'Only Owners and Admins']]} onChange={(v) => set({ whoCanCreateEvents: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Check id="cf-membersAddResources" checked={c.membersAddResources} onChange={(on) => set({ membersAddResources: on })} label="Members can add resources" hint="Owners and Admins always can." />
        {isEdited('membersAddResources') && <EditedBadge />}
      </div>
    </>
  );
}

function Membership({ c, set, isEdited, errors }) {
  return (
    <>
      <fieldset className="flex flex-col gap-2.5" aria-describedby={errors.visibility ? 'cf-visibility-e' : undefined}>
        <legend className="t-label mb-2 flex flex-wrap items-center gap-2">Visibility{isEdited('visibility') && <EditedBadge />}</legend>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          {Object.entries(VISIBILITY).map(([v, x], i) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-[var(--az-surface)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--az-focus)] ${c.visibility === v ? 'border-2 border-[var(--az-ok)] p-[13px]' : 'border border-[var(--az-control)] p-3.5'}`}>
              <input id={i === 0 ? 'cf-visibility' : undefined} type="radio" name="cf-visibility" checked={c.visibility === v} aria-invalid={errors.visibility ? true : undefined}
                onChange={() => set({ visibility: v })} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--az-ok)]" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--az-text)]"><Icon name={x.icon} size={16} />{x.label}</span>
                <span className="t-small">{x.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {!c.visibility && !errors.visibility && <p className="t-small">Not chosen yet. You’ll need to choose one before publishing.</p>}
        {errors.visibility && <p id="cf-visibility-e" className="field-error !mt-0">{errors.visibility}</p>}
      </fieldset>
      <TextField id="audience" label="Who this is for" value={c.audience} onChange={(v) => set({ audience: v })} edited={isEdited('audience')} error={errors.audience} max={SHORT_MAX}
        hint="Shown in Explore and on the join screen. It describes; it doesn’t admit or refuse anyone." />
      {c.visibility === 'private' && (
        <TextField id="joinQuestion" label="Question asked with join requests (optional)" value={c.joinQuestion} onChange={(v) => set({ joinQuestion: v })}
          edited={isEdited('joinQuestion')} error={errors.joinQuestion} max={SHORT_MAX} hint="Admins see the answer when they review a request." />
      )}
      <p className="notice notice-info flex items-start gap-2"><Icon name="info" size={18} className="mt-0.5 shrink-0" /><span>Nobody is added automatically. With Closed, you invite people after publishing.</span></p>
    </>
  );
}

function Categories({ c, set, isEdited, errors }) {
  return (
    <>
      <p className="text-sm leading-[22px] text-[var(--az-text-2)]">Up to {MAX_CATEGORIES} each. People choose one when they add an event or a resource, or pick Other.</p>
      <ChipList id="cf-eventCategories" label="Event categories" items={c.eventCategories} onChange={(v) => set({ eventCategories: v })} max={MAX_CATEGORIES} itemMax={ITEM_MAX}
        error={errors.eventCategories} edited={isEdited('eventCategories')} />
      <ChipList id="cf-resourceCategories" label="Resource categories" items={c.resourceCategories} onChange={(v) => set({ resourceCategories: v })} max={MAX_CATEGORIES} itemMax={ITEM_MAX}
        error={errors.resourceCategories} edited={isEdited('resourceCategories')} />
    </>
  );
}

function Learning({ c, set, isEdited }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Switch id="cf-learning" label="Turn on Learning" checked={c.learning} onChange={(on) => set({ learning: on })}
          hint="Courses, lessons, quizzes and certificates inside this community. Also lets you use Instructor and Teaching Assistant." />
      </div>
      {isEdited('learning') && <span className="mt-3"><EditedBadge /></span>}
    </div>
  );
}

function Guidelines({ c, set, isEdited, errors }) {
  return (
    <TextField id="guidelines" label="Guidelines" rows={5} value={c.guidelines} onChange={(v) => set({ guidelines: v })} edited={isEdited('guidelines')} error={errors.guidelines}
      max={GUIDELINES_MAX} hint="One rule per line. Shown on About and when someone joins." />
  );
}

