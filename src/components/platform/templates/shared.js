// Shared pieces for Administration → Templates (v2 workstream F, decisions F11, F12, F14).
import { useEffect, useState } from 'react';

// The five question types (F12). A choice can allow one answer or several.
export const QUESTION_TYPES = ['text', 'list', 'choice', 'years', 'institution'];
// What the "Answer type" menu offers: a choice is split into one and several.
export const ANSWER_KINDS = [
  { id: 'text', label: 'Short text', type: 'text' },
  { id: 'list', label: 'List of items', type: 'list' },
  { id: 'one', label: 'One choice', type: 'choice', multiple: false },
  { id: 'several', label: 'Several from a list', type: 'choice', multiple: true },
  { id: 'years', label: 'Year range', type: 'years' },
  { id: 'institution', label: 'Institution', type: 'institution' },
];
export const kindOf = (q) => (q.type === 'choice' ? (q.multiple ? 'several' : 'one') : q.type);
export const kindLabel = (q) => ANSWER_KINDS.find((k) => k.id === kindOf(q))?.label ?? q.type;

export const SECTIONS = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'events', label: 'Events' },
  { id: 'resources', label: 'Resources' },
  { id: 'members', label: 'Members' },
];
export const ROLES = [
  { id: 'moderator', label: 'Moderator' },
  { id: 'instructor', label: 'Instructor' },
  { id: 'teaching_assistant', label: 'Teaching Assistant' },
];
export const VISIBILITY = [
  { id: 'public', label: 'Public' },
  { id: 'private', label: 'Private' },
  { id: 'closed', label: 'Closed' },
];
export const EVENT_TYPES = ['Meetup', 'Reunion', 'Conference', 'Contest', 'Webinar', 'ShowTime', 'Meeting'];
export const MAX_QUESTIONS = 15;
export const MAX_TOPICS = 12;

export const STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Active', tone: 'ok' },
  inactive: { label: 'Inactive', tone: 'warn' },
};

// A slot is a question's key, written {key} in the blueprint's text. The older {{answer.key}}
// spelling is still recognised so templates saved before F12 read correctly.
export const slot = (key) => `{${key}}`;
const SLOT_RE = /\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}|\{([a-z][a-z0-9_]*)\}/g;
export const slotsIn = (value) => [...JSON.stringify(value ?? null).matchAll(SLOT_RE)].map((m) => m[1] ?? m[2]);
const asText = (v) => {
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') return [v.from, v.to].filter(Boolean).join(' to ');
  return String(v ?? '');
};
/** Fills slots with sample answers, closing the gaps an unanswered one leaves. */
export const fill = (s, answers) => String(s ?? '').replace(SLOT_RE, (_, a, b) => asText(answers[a ?? b]))
  .replace(/\(\s*\)/g, '').replace(/[ \t]+/g, ' ').replace(/ +([,.;:)])/g, '$1').trim();
const wholeSlot = (s) => { const m = /^\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}$|^\{([a-z][a-z0-9_]*)\}$/.exec(String(s).trim()); return m ? (m[1] ?? m[2]) : null; };
/** A list item that is only one slot for a list answer becomes one item per answer. */
export const fillList = (items, answers) => {
  const out = [];
  for (const item of items ?? []) {
    const k = wholeSlot(item);
    const values = k && Array.isArray(answers[k]) ? answers[k] : [fill(item, answers)];
    for (const v of values) if (v && !out.some((o) => o.toLowerCase() === String(v).toLowerCase())) out.push(String(v));
  }
  return out;
};

const matches = (cond, answers) => {
  if (!cond) return true;
  const v = answers[cond.key];
  if ('equals' in cond) return v === cond.equals;
  if ('includes' in cond) return Array.isArray(v) && v.includes(cond.includes);
  if ('answered' in cond) return (v == null || v === '' || (Array.isArray(v) && !v.length)) !== cond.answered;
  return false;
};
export const shown = (q, answers) => matches(q.showIf, answers);

/** What the sample answers would suggest: a quick look in the page; the server checks again. */
export function preview(blueprint, answers, fallbackName) {
  const bp = structuredClone(blueprint ?? {});
  for (const r of bp.rules ?? []) {
    if (!matches(r.when, answers)) continue;
    for (const [k, v] of Object.entries(r.set ?? {})) bp[k] = (k === 'membership' || k === 'eventDefaults') ? { ...bp[k], ...v } : v;
    for (const [k, v] of Object.entries(r.add ?? {})) bp[k] = [...(bp[k] ?? []), ...v];
  }
  return {
    name: fill(bp.name, answers) || fallbackName,
    description: fill(bp.description, answers),
    visibility: bp.membership?.visibility ?? 'public',
    sections: [...new Set(bp.sections ?? [])],
    learning: !!bp.learning,
    topics: fillList(bp.topics, answers),
    resourceCategories: fillList(bp.resourceCategories, answers),
    eventCategories: fillList(bp.eventCategories, answers),
    roles: [...new Set(bp.roles ?? [])],
    guidelines: fill(bp.guidelines, answers),
  };
}

/** Which blueprint fields use each slot, for the questions table's "Fills" column. */
export const BLUEPRINT_LABELS = {
  name: 'Name', description: 'Description', sections: 'Sections', learning: 'Learning', topics: 'Topics',
  membership: 'Membership', resourceCategories: 'Resource categories', eventCategories: 'Event categories',
  eventDefaults: 'Event defaults', guidelines: 'Guidelines', roles: 'Roles in use', rules: 'Rules',
};
export function fills(key, blueprint) {
  const out = [];
  for (const [k, v] of Object.entries(blueprint ?? {})) {
    if (k === 'rules') { if ((v ?? []).some((r) => r?.when?.key === key || slotsIn(r).includes(key))) out.push('Rules'); continue; }
    if (slotsIn(v).includes(key)) out.push(BLUEPRINT_LABELS[k] ?? k);
  }
  return out;
}

/** Problems the page can see before the server is asked (the server decides). */
export function localChecks(questionnaire, blueprint) {
  const keys = new Set(questionnaire.map((q) => q.key));
  const problems = [];
  const seen = new Set();
  questionnaire.forEach((q, i) => {
    const field = `questionnaire[${i}]`;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(q.key ?? '')) problems.push({ field, message: `Question ${i + 1} needs a slot name: lowercase letters, digits and _, starting with a letter.` });
    else if (seen.has(q.key)) problems.push({ field, message: `Two questions use the slot ${slot(q.key)}.` });
    seen.add(q.key);
    if (!q.label?.trim()) problems.push({ field, message: `Question ${i + 1} needs the question people will read.` });
    if (q.type === 'choice' && (q.options ?? []).filter((o) => o.label?.trim()).length < 2) problems.push({ field, message: `Question ${i + 1} needs at least 2 options.` });
    if (q.showIf && !questionnaire.slice(0, i).some((p) => p.key === q.showIf.key)) problems.push({ field, message: `Question ${i + 1} depends on ${slot(q.showIf.key)}, which must be an earlier question.` });
  });
  for (const [k, v] of Object.entries(blueprint ?? {})) {
    for (const s of new Set(slotsIn(k === 'rules' ? (v ?? []).map((r) => ({ ...r, when: undefined })) : v))) {
      if (!keys.has(s)) problems.push({ field: `blueprint.${k}`, message: `${BLUEPRINT_LABELS[k] ?? k} uses ${slot(s)}, but no question fills it. Remove it or add a question.` });
    }
  }
  (blueprint?.rules ?? []).forEach((r, i) => {
    if (r?.when?.key && !keys.has(r.when.key)) problems.push({ field: `blueprint.rules[${i}]`, message: `Rule ${i + 1} depends on ${slot(r.when.key)}, but no question has that slot.` });
  });
  if ((blueprint?.topics ?? []).length > MAX_TOPICS) problems.push({ field: 'blueprint.topics', message: `A community can have up to ${MAX_TOPICS} topics.` });
  if (!String(blueprint?.name ?? '').trim()) problems.push({ field: 'blueprint.name', message: 'Give the blueprint a name pattern.' });
  return problems;
}

/** A server refusal → problems by field (one or several, whichever the server sends). */
export function serverProblems(err) {
  const x = err?.extra ?? {};
  if (Array.isArray(x.problems) && x.problems.length) return x.problems.map((p) => ({ field: p.field ?? '', message: p.message ?? String(p) }));
  if (Array.isArray(x.fields) && x.fields.length && !x.field) return x.fields.map((f) => ({ field: String(f).replace(/^\//, '').replace(/\//g, '.'), message: err.message }));
  return [{ field: x.field ?? '', message: err?.message ?? 'Something went wrong. Try again.' }];
}

/** Where a field lives: which tab, and which question or rule. */
export function placeOf(field = '') {
  const q = /^questionnaire\[(\d+)\]/.exec(field);
  if (q) return { tab: 'questions', question: Number(q[1]) };
  if (field === 'questionnaire' || field === 'answers') return { tab: 'questions' };
  if (/^(blueprint|settings|topics|visibility)/.test(field)) return { tab: 'blueprint' };
  if (['name', 'description', 'category', 'key'].includes(field)) return { tab: 'details' };
  return { tab: null };
}
/** The blueprint field a problem belongs to, so the field can show it. */
export function blueprintKey(field = '') {
  const m = /^blueprint\.([a-zA-Z]+)(?:\[(\d+)\])?/.exec(field);
  if (m) return m[2] != null ? `${m[1]}[${m[2]}]` : m[1];
  if (field.startsWith('settings.')) return ({ apps: 'sections', resourceCategories: 'resourceCategories', guidelines: 'guidelines', roles: 'roles', eventDefaults: 'eventDefaults' })[field.slice(9)] ?? 'blueprint';
  if (field === 'topics') return 'topics';
  if (field === 'visibility') return 'membership';
  return field === 'blueprint' ? 'blueprint' : null;
}

export const blankQuestion = (n) => ({ key: `question_${n}`, label: '', help: '', type: 'text', required: false });
export const valueFor = (label) => label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
export const keyFor = (name) => {
  const k = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return /^[a-z]/.test(k) ? k : k ? `t-${k}`.slice(0, 40) : '';
};

/** Template editing needs a tablet or desktop (F14), like the course builder. */
const WIDE = '(min-width: 768px)';
export function useWide() {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(WIDE);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

/** aria-describedby for a field's hint and error. */
export const describedBy = (id, { hint, error } = {}) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
