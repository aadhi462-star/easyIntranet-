// Step 1, Choose (F2, board V2FStart): two equal paths, nothing pre-selected on a fresh visit;
// the active templates as cards, each with what it sets up; and an unfinished draft to continue
// or discard. Start from scratch works while the templates load or if they fail to.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { communityKind } from './draft.js';
import { StepBar, StepTitle } from './parts.jsx';

// What each starting template sets up (board V2FStart), used when the server's card doesn't
// carry its own summary. Keyed by category, which the starting library has one template each of.
const SETS_UP = {
  Alumni: ['Discussion topics by department and interest', 'Reunion and meet-up events', 'Member filters by graduation year and department', 'Mentorship and jobs topics if you want them'],
  Education: ['Learning, with Instructors and Teaching Assistants', 'Discussion topics by subject', 'Resource categories for notes and readings', 'Office hours as an event category'],
  'Professional Networking': ['Introductions, jobs and referrals topics', 'Meet-up and talk events', 'Resource categories for guides and templates', 'Guidelines on recruiting and promotion'],
  Technology: ['Help, show-and-tell and release topics', 'Talk and workshop events', 'Docs and links as resource categories', 'Learning, if you want to run courses'],
  Business: ['Private by default: people ask to join', 'Advice, hiring and partnership topics', 'Pitch session and round-table events', 'Guidelines on confidentiality'],
  'Hobbies and Interests': ['Public, so people can join at once', 'Open discussion with a few starter topics', 'Meet-up events', 'Guides as a resource category'],
  Organisation: ['Closed: people join by invitation', 'Announcements that only admins post', 'Topics by department or team', 'Policies and handbooks as resources'],
  'General Community': ['Discussions, Events and Members', 'One “Introductions” topic', 'Everything else off until you turn it on', 'Starter guidelines you can rewrite'],
};
const ICON = { Alumni: 'cap', Education: 'manuals', 'Professional Networking': 'idcard', Technology: 'code', Business: 'wall', 'Hobbies and Interests': 'sparkle', Organisation: 'structure', 'General Community': 'groups' };

export const setsUpOf = (t) => {
  const own = Array.isArray(t.setsUp) ? t.setsUp : typeof t.setsUp === 'string' ? t.setsUp.split('\n') : null;
  return (own?.map((x) => String(x).trim()).filter(Boolean)) ?? SETS_UP[t.category] ?? [];
};
const questionCount = (t) => (Array.isArray(t.questionnaire) ? t.questionnaire.length : Number(t.questions) || 0);

export default function StartStep({ draft, templates, other, onContinueOther, onDiscardOther, onContinue, onCancel, busy, error }) {
  const [path, setPath] = useState(draft.path);
  const [key, setKey] = useState(draft.path === 'template' ? draft.template?.key ?? null : null);

  if (templates.status === 'restricted') return <CreationClosed />;

  const list = templates.list ?? [];
  const chosen = path === 'template' ? list.find((t) => t.key === key) ?? (draft.template?.key === key ? draft.template : null) : null;
  const ready = path === 'scratch' || (path === 'template' && !!chosen);
  const n = chosen ? questionCount(chosen) : 0;
  const hint = path === 'scratch' ? 'Next: the full setup, with nothing chosen for you.'
    : chosen ? (n ? `Next: ${n === 1 ? 'one question' : `${n} questions`} about your ${communityKind(chosen.name)}. Every one is optional.` : 'Next: the suggested setup, ready to change.')
      : path === 'template' ? 'Choose a template to continue.' : 'Choose a template or start from scratch.';

  const pick = (t) => { setPath('template'); setKey(t.key); };

  return (
    <div className="flex flex-col gap-6">
      <StepTitle sub="You’ll be the Owner. Nothing is published until the last step.">How do you want to start?</StepTitle>

      {other && (
        <div role="status" className="notice notice-info flex flex-wrap items-center gap-3">
          <Icon name="drafts" size={18} className="shrink-0" />
          <span className="min-w-0 flex-[1_1_220px]">
            <b>You have an unfinished draft:</b> “{other.config?.name?.trim() || 'Untitled community'}”, {other.path === 'scratch' ? 'started from scratch' : `from the ${other.template?.name ?? ''} template`}, last changed {new Date(other.updatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. It’s kept in this browser only.
          </span>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onDiscardOther}>Discard draft</Button>
            <Button size="sm" variant="primary" onClick={onContinueOther}>Continue draft</Button>
          </span>
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">How do you want to start?</legend>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
          <PathCard value="template" checked={path === 'template'} onSelect={() => setPath('template')} icon="shape" title="Use a template"
            text="Pick the kind of community and answer a few questions about it. You get a suggested setup and can change every part of it." />
          <PathCard value="scratch" checked={path === 'scratch'} onSelect={() => { setPath('scratch'); setKey(null); }} icon="pen" title="Start from scratch"
            text="No questions. Go straight to the full setup and choose everything yourself. Same options, same checks." />
        </div>
      </fieldset>

      <section aria-labelledby="cc-tpl-h" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cc-tpl-h" className="t-h3">Choose a template</h2>
          <span className="t-small">Templates are kept by the CommunityOne team. Nothing here is fixed.</span>
        </div>
        {templates.status === 'loading' && (
          <div aria-busy="true" aria-label="Loading templates" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr))]">
            {[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-64 !rounded-xl" />)}
          </div>
        )}
        {templates.status === 'error' && (
          <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
            <Icon name="alert" size={18} className="shrink-0 text-[var(--az-danger)]" />
            <span className="min-w-0 flex-1">We couldn’t load the templates. Start from scratch still works.</span>
            <Button size="sm" onClick={templates.retry}>Try again</Button>
          </div>
        )}
        {templates.status === 'ready' && !list.length && <p className="notice notice-info">No templates are offered at the moment. Start from scratch has every option.</p>}
        {templates.status === 'ready' && list.length > 0 && (
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,270px),1fr))]">
            {list.map((t) => <TemplateCard key={t.key} t={t} selected={path === 'template' && key === t.key} onPick={() => pick(t)} />)}
          </ul>
        )}
      </section>

      {error && <p role="alert" className="notice notice-bad">{error}</p>}

      <StepBar hint={hint}
        back={{ label: 'Cancel', short: 'Cancel', onClick: onCancel }}
        next={{ label: 'Continue', onClick: () => onContinue({ path, template: chosen }), disabled: !ready, busy }} />
    </div>
  );
}

function PathCard({ value, checked, onSelect, icon, title, text }) {
  return (
    <label className={`panel flex cursor-pointer items-start gap-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--az-focus)] ${checked ? '!border-2 !border-[var(--az-ok)] p-[23px]' : 'p-6'}`}>
      <input type="radio" name="cc-start" value={value} checked={checked} onChange={onSelect} className="mt-1 h-5 w-5 shrink-0 accent-[var(--az-ok)]" />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-2.5"><Icon name={icon} size={20} /><span className="t-h3">{title}</span></span>
        <span className="text-sm leading-[22px] text-[var(--az-text-2)]">{text}</span>
      </span>
    </label>
  );
}

function TemplateCard({ t, selected, onPick }) {
  const items = setsUpOf(t).slice(0, 4);
  const n = questionCount(t);
  return (
    <li className={`panel flex min-w-0 flex-col gap-3 ${selected ? '!border-2 !border-[var(--az-ok)] p-[19px]' : 'p-5'}`}>
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--az-ok-soft)] text-[var(--az-ok)]"><Icon name={ICON[t.category] ?? 'groups'} size={20} /></span>
        {selected && <Badge tone="ok" icon="check">Selected</Badge>}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="t-h3">{t.name}</h3>
        {t.description && <p className="text-sm leading-[22px] text-[var(--az-text-2)]">{t.description}</p>}
      </div>
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="t-label">Sets up</span>
          <ul className="flex flex-col gap-1.5 text-sm leading-5 text-[var(--az-text)]">
            {items.map((x) => <li key={x} className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 text-[var(--az-ok)]" /><span>{x}</span></li>)}
          </ul>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="t-small">{n === 0 ? 'No questions' : `${n} ${n === 1 ? 'question' : 'questions'}`}</span>
        <Button size="sm" aria-pressed={selected} onClick={onPick}>Use {t.name}</Button>
      </div>
    </li>
  );
}

/** COM-07: creating is limited to platform staff. */
export function CreationClosed({ changed = false }) {
  return (
    <div className="flex flex-col gap-4">
      <StepTitle>Creating communities is closed</StepTitle>
      <div role="alert" className="notice notice-warn flex items-start gap-2">
        <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
        <span>
          <b>Only platform staff can create communities at the moment.</b>{' '}
          {changed ? 'This changed while you were working. Your draft stays in this browser.' : 'You can still join or ask to join communities in Explore.'}
        </span>
      </div>
      <div><Link to="/explore" className="btn btn-secondary">Go to Explore</Link></div>
    </div>
  );
}
