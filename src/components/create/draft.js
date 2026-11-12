// The creation wizard's draft (v2 workstream F, decisions F2 to F5, boards V2FStart to V2FPhone).
// A draft lives only in this browser until Publish (F4): one localStorage entry per draft id, so
// two tabs with two wizards never mix (COM-12). Logo and cover are never stored here (they stay
// in memory until they're uploaded after publishing). Every storage call is wrapped: a browser
// that can't store still runs the whole wizard, and the page says the draft isn't kept.
import { newKey } from '../../lib/api.js';

const PREFIX = 'c1-create-draft:';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // drafts untouched for 30 days are dropped

export const STEPS = [
  { id: 'choose', label: 'Choose' },
  { id: 'questions', label: 'Questions' },
  { id: 'configure', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
  { id: 'publish', label: 'Publish' },
];
export const stepIndex = (id) => Math.max(0, STEPS.findIndex((s) => s.id === id));

export const MAX_TOPICS = 12;
export const MAX_CATEGORIES = 12;
export const ITEM_MAX = 40;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const GUIDELINES_MAX = 5000;
export const SHORT_MAX = 200; // "Who this is for" and the join question

// The sections a community can switch on (server lib/community.js SECTIONS). Learning has its
// own switch; Overview, Members and About are always on.
export const SECTION_LIST = [
  { id: 'discussions', label: 'Discussions' },
  { id: 'events', label: 'Events' },
  { id: 'resources', label: 'Resources' },
];

export const VISIBILITY = {
  public: { label: 'Public', icon: 'globe', hint: 'Anyone can find it, read it and join at once.', short: 'people join at once' },
  private: { label: 'Private', icon: 'lock', hint: 'Anyone can find it and see its card. People ask to join; Admins approve.', short: 'people ask to join' },
  closed: { label: 'Closed', icon: 'eyeoff', hint: 'Hidden from Explore and search. People join by invitation.', short: 'by invitation' },
};

const STARTER_GUIDELINES = [
  'Be respectful. Disagree with ideas, not people.',
  'Stay on topic, and pick the topic that fits your post.',
  'Don’t share other members’ contact details outside the community.',
  'Report anything that worries you; moderators review every report.',
].join('\n');

/** The scratch path's starting setup (F2): Discussions, Events and Members on, no visibility yet. */
export function neutralConfig() {
  return {
    name: '', description: '', category: '', visibility: null,
    sections: ['discussions', 'events'], learning: false,
    topics: ['Introductions'], roles: ['moderator'],
    whoCanPost: 'members', whoCanCreateEvents: 'members', membersAddResources: false,
    eventCategories: [], resourceCategories: [],
    guidelines: STARTER_GUIDELINES, audience: '', joinQuestion: '',
    eventDefaults: null,
  };
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const str = (v) => (typeof v === 'string' ? v : '');

/** A suggestion from POST /templates/:key/suggest (the POST /communities body) → the form's shape. */
export function fromSuggestion(c) {
  const s = c?.settings ?? {};
  const sections = list(s.sections);
  return {
    name: str(c?.name), description: str(c?.description), category: str(c?.category),
    visibility: ['public', 'private', 'closed'].includes(c?.visibility) ? c.visibility : null,
    sections: SECTION_LIST.map((x) => x.id).filter((id) => sections.includes(id)),
    learning: sections.includes('learning'),
    topics: list(c?.topics), roles: list(s.roles),
    whoCanPost: s.whoCanPost === 'admins' ? 'admins' : 'members',
    whoCanCreateEvents: s.whoCanCreateEvents === 'admins' ? 'admins' : 'members',
    membersAddResources: !!s.membersAddResources,
    eventCategories: list(s.eventCategories), resourceCategories: list(s.resourceCategories),
    guidelines: str(s.guidelines),
    audience: str(s.audience ?? c?.audience), joinQuestion: str(s.joinQuestion ?? c?.joinQuestion),
    eventDefaults: s.eventDefaults && typeof s.eventDefaults === 'object' ? s.eventDefaults : null,
  };
}

// The fields the Edited marks and TPL-04 compare, with the Configure section each lives in.
export const FIELDS = {
  name: { section: 'basics', label: 'Name' },
  description: { section: 'basics', label: 'Description' },
  category: { section: 'basics', label: 'Category' },
  sections: { section: 'sections', label: 'Sections' },
  topics: { section: 'topics', label: 'Discussion topics' },
  roles: { section: 'roles', label: 'Roles in use' },
  whoCanPost: { section: 'roles', label: 'Who can start discussions' },
  whoCanCreateEvents: { section: 'roles', label: 'Who can create events' },
  membersAddResources: { section: 'roles', label: 'Members can add resources' },
  visibility: { section: 'membership', label: 'Visibility' },
  audience: { section: 'membership', label: 'Who this is for' },
  joinQuestion: { section: 'membership', label: 'Join request question' },
  eventCategories: { section: 'categories', label: 'Event categories' },
  resourceCategories: { section: 'categories', label: 'Resource categories' },
  learning: { section: 'learning', label: 'Learning' },
  guidelines: { section: 'guidelines', label: 'Guidelines' },
};

export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields that differ from what the answers suggested (empty on the scratch path). */
export function editedFields(d) {
  if (!d.base || !d.config) return [];
  return Object.keys(FIELDS).filter((f) => !same(d.config[f], d.base[f]));
}

/**
 * TPL-04: a new suggestion replaces only the fields still equal to the previous suggestion.
 * Returns the next config, its new base, and the fields the new answers changed.
 */
export function applySuggestion(config, base, suggestion) {
  if (!config || !base) return { config: { ...suggestion }, base: suggestion, updated: [] };
  const next = { ...config };
  const updated = [];
  for (const f of Object.keys(FIELDS)) {
    if (same(config[f], base[f]) && !same(base[f], suggestion[f])) { next[f] = suggestion[f]; updated.push(f); }
  }
  next.eventDefaults = suggestion.eventDefaults ?? config.eventDefaults ?? null;
  return { config: next, base: suggestion, updated };
}

/** A brand new draft. */
export function newDraft(id) {
  return { id, v: 1, step: 'choose', path: null, template: null, answers: {}, config: null, base: null, publishKey: null, withoutTemplate: false, updatedAt: Date.now() };
}

// ---- Questions ------------------------------------------------------------------------------

const emptyAnswer = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => x == null || x === ''));
// An institution typed in because it isn't listed: the server takes only ids from the list.
const typedInstitution = (q, v) => q.type === 'institution' && v && typeof v === 'object';

/** Whether a question's showIf condition holds for these answers. */
export function shown(q, answers) {
  const c = q.showIf;
  if (!c || !c.key) return true;
  const v = answers[c.key];
  if ('equals' in c) return Array.isArray(v) ? v.includes(c.equals) : v === c.equals;
  if ('includes' in c) return Array.isArray(v) ? v.includes(c.includes) : v === c.includes;
  if ('answered' in c) return emptyAnswer(v) !== c.answered;
  return true;
}

/** The answers to send: only questions shown and answered (every question is optional, F3). */
export function cleanAnswers(questions, answers) {
  const out = {};
  for (const q of questions ?? []) {
    if (!shown(q, out)) continue; // depends on an earlier answer, as the server decides it
    let v = answers[q.key];
    if (typeof v === 'string') v = v.trim();
    if (q.type === 'years' && v) {
      let from = v.from ? Number(v.from) : null; let to = v.to ? Number(v.to) : null;
      if (from == null && to == null) continue;
      // The server takes a complete range: one year alone means that year onwards (or just it).
      if (to == null) to = Math.max(from, new Date().getFullYear());
      if (from == null) from = to;
      if (from > to) [from, to] = [to, from];
      v = { from, to };
    }
    if (emptyAnswer(v) || typedInstitution(q, v)) continue;
    out[q.key] = v;
  }
  return out;
}

// What each blueprint field is called in "Fills: …" (F3: every question says what it fills).
const FILLS = {
  name: 'the suggested name', description: 'the description', guidelines: 'the guidelines', topics: 'discussion topics',
  eventCategories: 'event categories', resourceCategories: 'resource categories', roles: 'roles in use', sections: 'which sections are on',
  learning: 'Learning', eventDefaults: 'event defaults', visibility: 'visibility', whoCanPost: 'who can start discussions',
  whoCanCreateEvents: 'who can create events', membersAddResources: 'who can add resources', requireApproval: 'join approval',
  audience: 'the “Who this is for” line', joinQuestion: 'the join request question',
};
const mentions = (v, key) => {
  const json = JSON.stringify(v ?? null);
  return json.includes(`{${key}}`) || json.includes(`{{answer.${key}}}`);
};

/** "the suggested name, the description and discussion topics", from the template's blueprint. */
export function fillsOf(q, blueprint) {
  if (q.fills) return q.fills;
  if (!blueprint || typeof blueprint !== 'object') return '';
  const out = [];
  const push = (k) => { const l = FILLS[k]; if (l && !out.includes(l)) out.push(l); };
  for (const [k, v] of Object.entries(blueprint)) {
    if (k === 'rules') continue;
    if (k === 'membership' && v && typeof v === 'object') { for (const [mk, mv] of Object.entries(v)) if (mentions(mv, q.key)) push(mk); continue; }
    if (mentions(v, q.key)) push(k);
  }
  for (const r of Array.isArray(blueprint.rules) ? blueprint.rules : []) {
    if (r?.when?.key !== q.key) continue;
    for (const [k, v] of Object.entries(r.set ?? {})) {
      if (k === 'membership' && v && typeof v === 'object') Object.keys(v).forEach(push); else push(k);
    }
    Object.keys(r.add ?? {}).forEach(push);
  }
  const order = Object.values(FILLS);
  out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (out.length < 2) return out.join('');
  return `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`;
}

/** Choice options as {value, label, help}; older templates list plain strings. */
export const optionsOf = (q) => (q.options ?? []).map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? String(o.value), help: o.help ?? o.description }));

// ---- The request -----------------------------------------------------------------------------

// "Who this is for" and the join question (F7) aren't settings keys the server accepts yet
// (routes/communities.js SETTING_KEYS): they're kept in the draft and sent once it does.
export const SEND_JOIN_TEXT = true;

/** The POST /communities body from the draft (with or without its template reference). */
export function buildBody(d, { learningAllowed = true } = {}) {
  const c = d.config;
  const items = (xs) => (xs ?? []).map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const sections = [...c.sections, ...(c.learning && learningAllowed ? ['learning'] : [])];
  const roles = (c.roles ?? []).filter((r) => r === 'moderator' || (c.learning && learningAllowed));
  const settings = {
    sections,
    guidelines: c.guidelines.trim(),
    requireApproval: c.visibility === 'private',
    whoCanPost: c.whoCanPost,
    whoCanCreateEvents: c.whoCanCreateEvents,
    membersAddResources: c.membersAddResources,
    resourceCategories: items(c.resourceCategories),
    eventCategories: items(c.eventCategories),
    roles,
  };
  if (c.eventDefaults) settings.eventDefaults = c.eventDefaults;
  if (SEND_JOIN_TEXT) {
    if (c.audience.trim()) settings.audience = c.audience.trim();
    if (c.visibility === 'private' && c.joinQuestion.trim()) settings.joinQuestion = c.joinQuestion.trim();
  }
  const body = {
    name: c.name.trim(),
    description: c.description.trim() || null,
    category: c.category || null,
    visibility: c.visibility,
    settings,
    topics: items(c.topics),
  };
  if (d.template && !d.withoutTemplate) body.template = { key: d.template.key, version: d.template.version };
  return body;
}

/** One Idempotency-Key per publish attempt: kept while the body is the same, new when it changes. */
export function publishKeyFor(d, body) {
  const sig = JSON.stringify(body);
  if (d.publishKey?.sig === sig) return d.publishKey;
  return { key: newKey(), sig };
}

// The server's field names (extra.field) → the form's.
const SERVER_FIELD = {
  name: 'name', description: 'description', category: 'category', visibility: 'visibility', topics: 'topics',
  'settings.sections': 'sections', 'settings.apps': 'sections', sections: 'sections', 'settings.guidelines': 'guidelines',
  'settings.roles': 'roles', 'settings.whoCanPost': 'whoCanPost', 'settings.whoCanCreateEvents': 'whoCanCreateEvents',
  'settings.membersAddResources': 'membersAddResources', 'settings.resourceCategories': 'resourceCategories',
  'settings.eventCategories': 'eventCategories', 'settings.audience': 'audience', 'settings.joinQuestion': 'joinQuestion',
  'settings.requireApproval': 'visibility',
};
export const formField = (serverField) => SERVER_FIELD[serverField] ?? null;

const countWord = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export { countWord };

function checkItems(xs, field, label) {
  const out = [];
  const seen = new Set();
  const items = (xs ?? []).map((x) => x.trim()).filter(Boolean);
  if (items.length > (field === 'topics' ? MAX_TOPICS : MAX_CATEGORIES)) out.push({ field, message: `${label}: up to ${field === 'topics' ? MAX_TOPICS : MAX_CATEGORIES}.` });
  for (const x of items) {
    if (x.length > ITEM_MAX) { out.push({ field, message: `${label}: “${x.slice(0, 20)}…” is longer than ${ITEM_MAX} characters.` }); break; }
    const k = x.toLowerCase();
    if (seen.has(k)) { out.push({ field, message: `${label}: “${x}” is listed twice.` }); break; }
    seen.add(k);
  }
  return out;
}

/** The quick checks in the page (the server checks everything again, F5). */
export function localProblems(c) {
  const p = [];
  const name = c.name.trim();
  if (name.length < NAME_MIN) p.push({ field: 'name', title: name ? 'Name is too short' : 'Name is empty', message: `Give the community a name of ${NAME_MIN} to ${NAME_MAX} characters.`, fix: name ? 'Change name' : 'Add a name' });
  else if (name.length > NAME_MAX) p.push({ field: 'name', title: 'Name is too long', message: `Use up to ${NAME_MAX} characters.`, fix: 'Change name' });
  if (!c.description.trim()) p.push({ field: 'description', title: 'Description is empty', message: 'Add a short description: people read it before joining.', fix: 'Add description' });
  else if (c.description.trim().length > DESCRIPTION_MAX) p.push({ field: 'description', title: 'Description is too long', message: `Use up to ${DESCRIPTION_MAX.toLocaleString('en')} characters.`, fix: 'Shorten description' });
  if (!c.category) p.push({ field: 'category', title: 'No category chosen', message: 'Choose a category: Explore uses it for its filters.', fix: 'Choose category' });
  if (!c.visibility) p.push({ field: 'visibility', title: 'Visibility isn’t chosen', message: 'Choose Public, Private or Closed: it decides who can find the community and how people join.', fix: 'Choose visibility' });
  for (const x of checkItems(c.topics, 'topics', 'Discussion topics')) p.push({ ...x, title: 'Discussion topics need a change', fix: 'Change topics' });
  for (const x of checkItems(c.eventCategories, 'eventCategories', 'Event categories')) p.push({ ...x, title: 'Event categories need a change', fix: 'Change categories' });
  for (const x of checkItems(c.resourceCategories, 'resourceCategories', 'Resource categories')) p.push({ ...x, title: 'Resource categories need a change', fix: 'Change categories' });
  if (c.guidelines.length > GUIDELINES_MAX) p.push({ field: 'guidelines', title: 'Guidelines are too long', message: `Keep the guidelines under ${GUIDELINES_MAX.toLocaleString('en')} characters.`, fix: 'Shorten guidelines' });
  if (c.audience.trim().length > SHORT_MAX) p.push({ field: 'audience', title: '“Who this is for” is too long', message: `Use up to ${SHORT_MAX} characters.`, fix: 'Shorten it' });
  if (c.joinQuestion.trim().length > SHORT_MAX) p.push({ field: 'joinQuestion', title: 'The join question is too long', message: `Use up to ${SHORT_MAX} characters.`, fix: 'Shorten it' });
  return p;
}

/** Field → its first problem's message, for showing next to the field. */
export const problemsByField = (problems) => {
  const out = {};
  for (const x of problems ?? []) if (x.field && !out[x.field]) out[x.field] = x.message;
  return out;
};

// ---- Storage ------------------------------------------------------------------------------------

export function newDraftId() {
  return newKey().replace(/-/g, '').slice(0, 16);
}

/** Reads one draft; null when missing, unreadable or storage is unavailable. */
export function loadDraft(id) {
  try {
    const raw = window.localStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.id === id && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

/** Saves a draft. Returns false when the browser won't store it. */
export function saveDraft(d) {
  try {
    window.localStorage.setItem(PREFIX + d.id, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(id) {
  try { window.localStorage.removeItem(PREFIX + id); } catch { /* storage unavailable: nothing kept anyway */ }
}

/** Whether storage works at all in this browser (private windows, blocked site data). */
export function storageWorks() {
  try {
    const k = `${PREFIX}probe`;
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** The most recently changed draft other than `exceptId`; old ones are cleared on the way. */
export function latestOtherDraft(exceptId) {
  let best = null;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX) && !k.endsWith('probe')) keys.push(k);
    }
    for (const k of keys) {
      const d = loadDraft(k.slice(PREFIX.length));
      if (!d) continue;
      if (Date.now() - (d.updatedAt ?? 0) > MAX_AGE) { removeDraft(d.id); continue; }
      if (d.id === exceptId || !d.path) continue;
      if (!best || d.updatedAt > best.updatedAt) best = d;
    }
  } catch {
    return null;
  }
  return best;
}

/** A draft worth keeping: a path has been chosen. */
export const hasProgress = (d) => !!d?.path;

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
export const numberWord = (n) => NUMBER_WORDS[n] ?? String(n);

/** "alumni community", "general community". */
export const communityKind = (name) => {
  const n = String(name ?? '').trim();
  const lower = n.toLowerCase();
  return /community$/.test(lower) ? lower : `${lower} community`;
};

export const lines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
