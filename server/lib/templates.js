// Community templates (v2 brief, Part 4; PROPOSAL_V2 §3.3 and §5).
//
// A template version holds a questionnaire and a blueprint. Answers fill the blueprint ({key}
// slots and simple rules) into a suggested configuration with the same shape as the body of
// POST /communities, so the person can change any of it before creating. The community keeps its
// own copy of that configuration and records only which template and version it came from: a
// template is never read again for an existing community.
//
// The configuration checks here (category, topics, setting values) run for every new community,
// from a template or from scratch, so both paths accept and refuse exactly the same things.
import { badRequest, conflict, forbidden, HttpError, unauthorized } from './errors.js';
import { newId } from './crypto.js';
import { can } from './permissions.js';
import { checkCategory } from './categories.js';
import { MAX_TOPICS, topicName } from '../routes/topics.js';
import { EVENT_TYPES } from '../routes/events.js';
import { LIBRARY } from './template-library.js';

// ---- Configuration ------------------------------------------------------------------------------

// Community sections a configuration can switch on (Overview and About are always there). The
// older app names are still accepted because the current settings screens send them.
export const SECTIONS = ['discussions', 'events', 'resources', 'members', 'learning'];
const OLDER_APPS = ['dashboard', 'feed', 'forums', 'files', 'manuals', 'tasks', 'ideas', 'townhalls', 'webtabs'];
const APP_NAMES = new Set([...SECTIONS, ...OLDER_APPS]);
// Community roles a configuration can say are in use (Owner, Admin and Member always are).
export const OPTIONAL_ROLES = ['moderator', 'instructor', 'teaching_assistant'];
// Settings keys added for templates; communities.js adds them to its allow-list.
// `audience` is the "Who this is for" line on the join screen; `joinQuestion` is asked with a
// Private community's join requests (F7).
export const CONFIG_SETTING_KEYS = ['resourceCategories', 'eventCategories', 'eventDefaults', 'roles', 'audience', 'joinQuestion'];
export const SHORT_TEXT_MAX = 200;
// A community's own category lists (F13): up to 12 names of up to 40 characters each.
export const CATEGORY_LIST = { max: 12, len: 40 };
const EVENT_DEFAULT_KEYS = new Set(['eventType', 'durationMinutes', 'location', 'capacity', 'rsvpEnabled']);

const invalid = (field, message) => badRequest('INVALID_INPUT', message, { field });
const shortList = (v, field, { max, len, label }) => {
  if (!Array.isArray(v) || v.length > max) throw invalid(field, `${label}: up to ${max}.`);
  const out = [];
  for (const x of v) {
    const s = typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '';
    if (!s || s.length > len) throw invalid(field, `${label}: each needs 1–${len} characters.`);
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) throw invalid(field, `${label}: “${s}” is listed twice.`);
    out.push(s);
  }
  return out;
};

/**
 * Checks the values of the settings keys whose shape matters (called from cleanSettings in
 * routes/communities.js, after its allow-list). Returns nothing; throws on the first problem.
 */
export function checkSettings(s) {
  if ('apps' in s) {
    if (!Array.isArray(s.apps) || s.apps.length > APP_NAMES.size || s.apps.some((a) => !APP_NAMES.has(a)) || new Set(s.apps).size !== s.apps.length) {
      throw invalid('settings.apps', `Sections can be: ${SECTIONS.join(', ')}.`);
    }
  }
  if ('guidelines' in s && s.guidelines != null && (typeof s.guidelines !== 'string' || s.guidelines.length > 5000)) throw invalid('settings.guidelines', 'Keep the guidelines under 5,000 characters.');
  for (const k of ['requireApproval', 'membersAddResources']) {
    if (k in s && typeof s[k] !== 'boolean') throw invalid(`settings.${k}`, `“${k}” must be on or off.`);
  }
  if ('resourceCategories' in s) s.resourceCategories = shortList(s.resourceCategories, 'settings.resourceCategories', { ...CATEGORY_LIST, label: 'Resource categories' });
  if ('eventCategories' in s) s.eventCategories = shortList(s.eventCategories, 'settings.eventCategories', { ...CATEGORY_LIST, label: 'Event categories' });
  for (const k of ['audience', 'joinQuestion']) {
    if (!(k in s)) continue;
    if (s[k] != null && typeof s[k] !== 'string') throw invalid(`settings.${k}`, `“${k}” must be text.`);
    s[k] = s[k] == null ? null : (s[k].replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim() || null);
    if (s[k] && s[k].length > SHORT_TEXT_MAX) throw invalid(`settings.${k}`, `Keep it under ${SHORT_TEXT_MAX} characters.`);
  }
  if ('roles' in s) {
    if (!Array.isArray(s.roles) || s.roles.some((r) => !OPTIONAL_ROLES.includes(r)) || new Set(s.roles).size !== s.roles.length) {
      throw invalid('settings.roles', `Roles in use can be: ${OPTIONAL_ROLES.join(', ')}.`);
    }
  }
  if ('eventDefaults' in s) {
    const e = s.eventDefaults;
    if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some((k) => !EVENT_DEFAULT_KEYS.has(k))) throw invalid('settings.eventDefaults', 'Event defaults can set the type, length, place, capacity and RSVP.');
    if ('eventType' in e && !EVENT_TYPES.includes(e.eventType)) throw invalid('settings.eventDefaults', `Event type can be: ${EVENT_TYPES.join(', ')}.`);
    if ('durationMinutes' in e && !(Number.isInteger(e.durationMinutes) && e.durationMinutes >= 15 && e.durationMinutes <= 1440)) throw invalid('settings.eventDefaults', 'Event length must be 15 minutes to 24 hours.');
    if ('location' in e && e.location != null && (typeof e.location !== 'string' || e.location.length > 200)) throw invalid('settings.eventDefaults', 'Keep the place under 200 characters.');
    if ('capacity' in e && e.capacity != null && !(Number.isInteger(e.capacity) && e.capacity >= 1 && e.capacity <= 100000)) throw invalid('settings.eventDefaults', 'Capacity must be a whole number of at least 1.');
    if ('rsvpEnabled' in e && typeof e.rsvpEnabled !== 'boolean') throw invalid('settings.eventDefaults', 'RSVP must be on or off.');
  }
}

/** Discussion topics to create with a new community: up to 12 distinct names. */
export function cleanTopics(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw invalid('topics', 'Topics must be a list.');
  if (list.length > MAX_TOPICS) throw badRequest('TOO_MANY_TOPICS', `A community can have up to ${MAX_TOPICS} topics.`, { field: 'topics' });
  const out = [];
  for (const v of list) {
    const n = topicName(v);
    if (out.some((o) => o.toLowerCase() === n.toLowerCase())) throw badRequest('DUPLICATE_TOPIC', `“${n}” is listed twice.`, { field: 'topics' });
    out.push(n);
  }
  return out;
}

/** Creating communities can be limited to platform staff (Stage 7 setting). */
export async function assertCanCreate(db, user) {
  if (!user) throw unauthorized();
  const { rows: [who] } = await db.query(`select value->>'whoCanCreate' as v from platform_settings where key = 'communities'`);
  if (who?.v === 'staff' && !can(user, 'communities.manage')) throw forbidden('Only platform staff can create communities at the moment.', 'CREATE_RESTRICTED');
}

/**
 * A published template a person may use, at `version` (any published version, TPL-02) or its
 * current one, or the reason they can't. A draft, inactive or unknown template is refused first
 * (TPL-01); then a version that is a draft or doesn't exist.
 */
export async function usableTemplate(db, key, version = null) {
  const { rows: [t] } = await db.query(`select * from community_templates where lower(key) = lower($1)`, [String(key ?? '')]);
  if (!t) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'That template doesn’t exist.');
  if (t.status !== 'published' || !t.current_version) throw conflict('TEMPLATE_INACTIVE', 'This template isn’t available any more. Choose another, or start from scratch.');
  const v = version ?? t.current_version;
  const { rows: [row] } = Number.isInteger(v)
    ? await db.query(`select questionnaire, blueprint from template_versions where template_id = $1 and version = $2 and published_at is not null`, [t.id, v])
    : { rows: [] };
  if (!row) {
    throw badRequest('TEMPLATE_VERSION_UNKNOWN', `This template has no published version ${String(v).slice(0, 12)}. Start again from the current version.`,
      { field: 'template', currentVersion: t.current_version });
  }
  return { ...t, version: v, questionnaire: row.questionnaire, blueprint: row.blueprint };
}

/**
 * The parts of a new community's configuration that communities.js doesn't check itself. Runs
 * before the transaction: a refused template or topic list writes nothing.
 */
export async function prepareCommunity(db, body) {
  const plan = { category: checkCategory(body.category), topics: cleanTopics(body.topics), template: null };
  if (body.template) {
    const t = await usableTemplate(db, body.template.key, body.template.version);
    plan.template = { id: t.id, key: t.key, version: t.version };
  }
  return plan;
}

/** Inside the creation transaction (only `t`): the template record and the topics. */
export async function recordCreation(t, communityId, plan) {
  if (plan.template) await t.query(`update communities set template_id = $2, template_version = $3 where id = $1`, [communityId, plan.template.id, plan.template.version]);
  for (const [position, name] of plan.topics.entries()) {
    await t.query(`insert into topics (id, community_id, name, position) values ($1, $2, $3, $4)`, [newId('top'), communityId, name, position]);
  }
}

// ---- Questionnaires (F12) -----------------------------------------------------------------------
//
// Five safe question types. Every question can be skipped by the person creating (F3);
// `required` only matters when the template itself is checked for publishing.
//   text         a short answer: a string of up to `maxLength` (at most 200) characters
//   list         up to 12 short items (each up to 60 characters): a string array
//   choice       one of `options` ({ value, label }), or with `multiple` an array of values
//   years        a range { from, to }: whole years 1900–2100, from ≤ to
//   institution  the id of an institution from GET /api/institutions; its slot gets the name

export const QUESTION_TYPES = ['text', 'list', 'choice', 'years', 'institution'];
const QUESTION_KEYS = new Set(['key', 'label', 'help', 'type', 'required', 'showIf', 'maxLength', 'options', 'multiple']);
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_QUESTIONS = 15;
export const TEXT_MAX = 200;
export const LIST_MAX_ITEMS = 12;
export const LIST_ITEM_MAX = 60;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;
const adminInvalid = (code, message, field) => badRequest(code, message, { field });

const isYear = (n) => Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX;

/**
 * Whether a condition (a rule's `when`, a question's `showIf`) is one the question it names can
 * meet: a choice's values, a list's items, or simply answered. Returns an error message or null.
 */
function conditionProblem(cond, q) {
  if (!q) return `{${cond.key}} isn’t a question in this template.`;
  if ('answered' in cond) return typeof cond.answered === 'boolean' ? null : '“answered” must be true or false.';
  const [op, v] = 'equals' in cond ? ['equals', cond.equals] : ['includes', cond.includes];
  if (q.type === 'choice') {
    if (op === 'equals' && q.multiple) return `{${q.key}} allows several answers: use “includes”.`;
    if (op === 'includes' && !q.multiple) return `{${q.key}} allows one answer: use “equals”.`;
    if (!q.options.some((o) => o.value === v)) return `“${String(v).slice(0, 80)}” isn’t one of the options of {${q.key}}.`;
    return null;
  }
  if (q.type === 'list') return op === 'includes' && typeof v === 'string' && v.trim() ? null : `{${q.key}} is a list: use “includes” with an item, or “answered”.`;
  if (q.type === 'text') return op === 'equals' && typeof v === 'string' ? null : `{${q.key}} is text: use “equals” with text, or “answered”.`;
  return `{${q.key}} can only be checked with “answered”.`;
}

export function validateQuestionnaire(q) {
  if (!Array.isArray(q) || q.length > MAX_QUESTIONS) throw adminInvalid('INVALID_QUESTIONNAIRE', `A questionnaire is a list of up to ${MAX_QUESTIONS} questions.`, 'questionnaire');
  const seen = new Map();
  return q.map((x, i) => {
    const at = `questionnaire[${i}]`;
    const fail = (message) => adminInvalid('INVALID_QUESTIONNAIRE', `Question ${i + 1}: ${message}`, at);
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw fail('each question must be an object.');
    const extra = Object.keys(x).find((k) => !QUESTION_KEYS.has(k));
    if (extra) throw fail(`“${extra}” isn’t a question field.`);
    if (typeof x.key !== 'string' || !KEY.test(x.key)) throw fail('a slot name is lowercase letters, digits and _, starting with a letter.');
    if (seen.has(x.key)) throw fail(`two questions use the slot {${x.key}}.`);
    if (!QUESTION_TYPES.includes(x.type)) throw fail(`the answer type can be: ${QUESTION_TYPES.join(', ')}.`);
    const label = typeof x.label === 'string' ? x.label.trim() : '';
    if (!label || label.length > 160) throw fail('it needs the question people will read, up to 160 characters.');
    if (x.help != null && (typeof x.help !== 'string' || x.help.length > 300)) throw fail('keep help text under 300 characters.');
    if ('required' in x && typeof x.required !== 'boolean') throw fail('“required” must be true or false.');
    const out = { key: x.key, label, help: x.help?.trim() ?? '', type: x.type, required: !!x.required };
    if (x.type === 'text') {
      if (x.maxLength != null) {
        if (!(Number.isInteger(x.maxLength) && x.maxLength >= 1 && x.maxLength <= TEXT_MAX)) throw fail(`a short answer can be 1–${TEXT_MAX} characters long.`);
        out.maxLength = x.maxLength;
      }
    } else if (x.maxLength != null) throw fail('only short text answers have a maximum length.');
    if (x.type === 'choice') {
      const o = x.options;
      const ok = Array.isArray(o) && o.length >= 2 && o.length <= 20 && o.every((v) => v && typeof v === 'object' && !Array.isArray(v)
        && Object.keys(v).every((k) => k === 'value' || k === 'label')
        && typeof v.value === 'string' && v.value.trim() && v.value.trim().length <= 80
        && typeof v.label === 'string' && v.label.trim() && v.label.trim().length <= 80);
      if (!ok) throw fail('a choice needs 2–20 options, each with a label and a saved value of up to 80 characters.');
      out.options = o.map((v) => ({ value: v.value.trim(), label: v.label.trim() }));
      if (new Set(out.options.map((v) => v.value)).size !== out.options.length) throw fail('two options are saved with the same value.');
      if ('multiple' in x && typeof x.multiple !== 'boolean') throw fail('“multiple” must be true or false.');
      out.multiple = !!x.multiple;
    } else if (x.options != null || x.multiple != null) throw fail('only choice questions have options.');
    // Only the relevant questions are asked: one can depend on an earlier answer.
    if (x.showIf != null) {
      const s = x.showIf;
      const shape = s && typeof s === 'object' && typeof s.key === 'string' && Object.keys(s).length === 2 && ('equals' in s || 'includes' in s || 'answered' in s);
      if (!shape || !seen.has(s.key)) throw fail('“Show this question” names an earlier question and the answer that shows this one.');
      const problem = conditionProblem(s, seen.get(s.key));
      if (problem) throw fail(problem);
      out.showIf = { key: s.key, ...('equals' in s ? { equals: s.equals } : 'includes' in s ? { includes: s.includes } : { answered: s.answered }) };
    }
    seen.set(x.key, out);
    return out;
  });
}

const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const matches = (cond, answers) => {
  const v = answers[cond.key];
  if ('equals' in cond) return v === cond.equals;
  if ('includes' in cond) return Array.isArray(v) && v.some((x) => x === cond.includes || (typeof x === 'string' && typeof cond.includes === 'string' && x.toLowerCase() === cond.includes.toLowerCase()));
  if ('answered' in cond) return empty(v) !== cond.answered;
  return false;
};

/** The name of an institution from the platform's list, or null. */
export const institutionLookup = (db) => async (id) => (await db.query(`select name from institutions where id = $1`, [String(id)])).rows[0]?.name ?? null;

/**
 * Checks answers against a questionnaire and returns them cleaned. Any question can be left out
 * (F3). Questions hidden by an earlier answer are skipped (their answers are dropped). An
 * institution answer becomes { id, name }; `institutionName(id)` gives the name, or null.
 */
export async function checkAnswers(questionnaire, input, { institutionName = async () => null } = {}) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw badRequest('INVALID_INPUT', 'Answers must be an object.', { field: 'answers' });
  const known = new Set(questionnaire.map((q) => q.key));
  const unknown = Object.keys(input).find((k) => !known.has(k));
  if (unknown) throw badRequest('UNKNOWN_ANSWER', `“${unknown.slice(0, 40)}” isn’t one of this template’s questions.`, { field: unknown.slice(0, 40) });
  const out = {};
  const bad = (q, msg) => badRequest('INVALID_ANSWER', `${q.label} ${msg}`, { field: q.key });
  for (const q of questionnaire) {
    if (q.showIf && !matches(q.showIf, out)) continue;
    let v = input[q.key];
    if (typeof v === 'string') v = v.trim();
    if (empty(v)) continue;
    switch (q.type) {
      case 'text': {
        const max = q.maxLength ?? TEXT_MAX;
        if (typeof v !== 'string') throw bad(q, 'needs a written answer.');
        v = v.replace(/\s+/g, ' ');
        if (v.length > max) throw bad(q, `can be up to ${max} characters.`);
        break;
      }
      case 'list':
        if (!Array.isArray(v) || v.length > LIST_MAX_ITEMS) throw bad(q, `can list up to ${LIST_MAX_ITEMS} items.`);
        v = v.map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : ''));
        if (v.some((x) => !x || x.length > LIST_ITEM_MAX)) throw bad(q, `needs items of 1–${LIST_ITEM_MAX} characters.`);
        v = v.filter((x, i) => v.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
        break;
      case 'choice': {
        const values = new Set(q.options.map((o) => o.value));
        if (q.multiple) {
          if (!Array.isArray(v) || v.some((x) => !values.has(x)) || new Set(v).size !== v.length) throw bad(q, 'needs options from the list, each once.');
        } else if (!values.has(v)) throw bad(q, 'needs one of the listed options.');
        break;
      }
      case 'years':
        if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some((k) => k !== 'from' && k !== 'to') || !isYear(v.from) || !isYear(v.to)) {
          throw bad(q, `needs a range of years from ${YEAR_MIN} to ${YEAR_MAX}.`);
        }
        if (v.from > v.to) throw bad(q, 'needs the first year before the last.');
        v = { from: v.from, to: v.to };
        break;
      case 'institution': {
        if (typeof v !== 'string' || v.length > 64) throw bad(q, 'needs an institution from the list.');
        const name = await institutionName(v);
        if (!name) throw bad(q, 'needs an institution from the list.');
        v = { id: v, name };
        break;
      }
      default:
        throw bad(q, 'has a type this version doesn’t support.');
    }
    out[q.key] = v;
  }
  return out;
}

// ---- Blueprints and suggestions -----------------------------------------------------------------

const BLUEPRINT_KEYS = new Set(['name', 'description', 'audience', 'joinQuestion', 'sections', 'learning', 'topics', 'membership', 'resourceCategories', 'eventCategories', 'eventDefaults', 'guidelines', 'roles', 'rules']);
const TEXT_FIELDS = ['name', 'description', 'audience', 'joinQuestion', 'guidelines'];
const MEMBERSHIP_KEYS = new Set(['visibility', 'requireApproval', 'whoCanPost', 'whoCanCreateEvents', 'membersAddResources']);
const LIST_FIELDS = ['sections', 'topics', 'resourceCategories', 'eventCategories', 'roles'];
const SET_FIELDS = new Set(['name', 'description', 'audience', 'joinQuestion', 'guidelines', 'learning', 'membership', 'eventDefaults']);
// A slot is {key}; the older {{answer.key}} spelling is still read.
const SLOT = /\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}|\{([a-z][a-z0-9_]*)\}/g;
const WHOLE_SLOT = /^(?:\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}|\{([a-z][a-z0-9_]*)\})$/;

/** What a slot becomes for one answer: the text people read (choice labels, the institution's name). */
const slotText = (q, v) => {
  if (v == null) return '';
  const label = (x) => q?.options?.find((o) => o.value === x)?.label ?? String(x);
  switch (q?.type) {
    case 'list': return v.join(', ');
    case 'choice': return Array.isArray(v) ? v.map(label).join(', ') : label(v);
    case 'years': return v.from === v.to ? String(v.from) : `${v.from} to ${v.to}`;
    case 'institution': return v.name ?? '';
    default: return String(v);
  }
};
// Slot texts for every answer, and the item lists of list and multiple-choice answers.
const slotsFor = (questionnaire, answers) => {
  const text = {}; const items = {};
  for (const q of questionnaire ?? []) {
    const v = answers[q.key];
    if (v == null) continue;
    text[q.key] = slotText(q, v);
    if (q.type === 'list') items[q.key] = v;
    if (q.type === 'choice' && q.multiple) items[q.key] = v.map((x) => slotText(q, x));
  }
  return { text, items };
};
// Fills slots; an unanswered question never leaves broken text. A bracket holding only an
// unanswered slot disappears. In prose (`sentences`: descriptions, guidelines, the join screen's
// lines) a sentence that still needs an unanswered slot is left out whole, so "The alumni
// community of {institution}." never reads "The alumni community of."; elsewhere (a name, a
// place) the empty slot is closed up. The pattern is split before filling, so an answer's own
// full stops don't count.
const ONLY_SLOT_IN_BRACKETS = /\(\s*(?:\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}|\{([a-z][a-z0-9_]*)\})\s*\)/g;
const fill = (s, slots, { sentences = false } = {}) => {
  const missing = (k) => !slots.text[k];
  let p = String(s ?? '').replace(ONLY_SLOT_IN_BRACKETS, (m, a, b) => (missing(a ?? b) ? '' : m));
  if (sentences) {
    p = p.split('\n').map((line) => line.split(/(?<=[.!?])\s+/)
      .filter((part) => ![...part.matchAll(SLOT)].some((m) => missing(m[1] ?? m[2]))).join(' ')).join('\n');
  }
  return p.replace(SLOT, (_, a, b) => slots.text[a ?? b] ?? '')
    .replace(/\(\s*\)/g, '').replace(/[ \t]+/g, ' ').replace(/ +([,.;:)])/g, '$1').replace(/\( +/g, '(')
    .split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
// A list item that is exactly one slot for a list answer becomes one item per answer.
const fillList = (list, slots) => {
  const out = [];
  for (const item of list ?? []) {
    const whole = WHOLE_SLOT.exec(String(item).trim());
    const k = whole && (whole[1] ?? whole[2]);
    const values = k && slots.items[k] ? slots.items[k] : [fill(item, slots)];
    for (const v of values) if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
};
const slotsIn = (v) => [...JSON.stringify(v ?? null).matchAll(SLOT)].map((m) => m[1] ?? m[2]);

/**
 * Structure checks for a blueprint. `complete` (publishing) also needs a name pattern. Every slot
 * must be filled by a question, and every rule must name a question and a value it can have
 * (TPL-05): the message names the problem and the field says where it is.
 */
export function validateBlueprint(bp, questionnaire, { complete = false } = {}) {
  const fail = (message, field = 'blueprint') => adminInvalid('INVALID_BLUEPRINT', message, field);
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) throw fail('A blueprint must be an object.');
  const extra = Object.keys(bp).find((k) => !BLUEPRINT_KEYS.has(k));
  if (extra) throw fail(`“${extra}” isn’t a blueprint field.`);
  for (const k of TEXT_FIELDS) if (k in bp && typeof bp[k] !== 'string') throw fail(`“${k}” must be text.`, `blueprint.${k}`);
  for (const k of ['audience', 'joinQuestion']) if (k in bp && bp[k].length > SHORT_TEXT_MAX) throw fail(`Keep “${k}” under ${SHORT_TEXT_MAX} characters.`, `blueprint.${k}`);
  if (complete && !String(bp.name ?? '').trim()) throw fail('Give the blueprint a name pattern.', 'blueprint.name');
  for (const k of LIST_FIELDS) if (k in bp && (!Array.isArray(bp[k]) || bp[k].some((x) => typeof x !== 'string'))) throw fail(`“${k}” must be a list of text.`, `blueprint.${k}`);
  if ((bp.sections ?? []).some((s) => !SECTIONS.includes(s))) throw fail(`Sections can be: ${SECTIONS.join(', ')}.`, 'blueprint.sections');
  if ((bp.roles ?? []).some((r) => !OPTIONAL_ROLES.includes(r))) throw fail(`Roles can be: ${OPTIONAL_ROLES.join(', ')}.`, 'blueprint.roles');
  if ((bp.topics ?? []).length > MAX_TOPICS) throw fail(`A community can have up to ${MAX_TOPICS} topics.`, 'blueprint.topics');
  for (const k of ['resourceCategories', 'eventCategories']) {
    if ((bp[k] ?? []).length > CATEGORY_LIST.max || (bp[k] ?? []).some((x) => !x.trim() || x.length > CATEGORY_LIST.len)) {
      throw fail(`Categories: up to ${CATEGORY_LIST.max}, each of 1–${CATEGORY_LIST.len} characters.`, `blueprint.${k}`);
    }
  }
  if ('learning' in bp && typeof bp.learning !== 'boolean') throw fail('“learning” must be true or false.', 'blueprint.learning');
  const membership = (m, field) => {
    if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some((k) => !MEMBERSHIP_KEYS.has(k))) throw fail(`Membership can set ${[...MEMBERSHIP_KEYS].join(', ')}.`, field);
    if ('visibility' in m && !['public', 'private', 'closed'].includes(m.visibility)) throw fail('Visibility is public, private or closed.', field);
    for (const k of ['whoCanPost', 'whoCanCreateEvents']) if (k in m && !['members', 'admins'].includes(m[k])) throw fail(`“${k}” is members or admins.`, field);
    for (const k of ['requireApproval', 'membersAddResources']) if (k in m && typeof m[k] !== 'boolean') throw fail(`“${k}” must be true or false.`, field);
  };
  const eventDefaults = (e, field) => {
    try { checkSettings({ eventDefaults: e }); } catch (err) { throw fail(err.message, field); }
  };
  if ('membership' in bp) membership(bp.membership, 'blueprint.membership');
  if ('eventDefaults' in bp) eventDefaults(bp.eventDefaults, 'blueprint.eventDefaults');
  const byKey = new Map(questionnaire.map((q) => [q.key, q]));
  if ('rules' in bp) {
    if (!Array.isArray(bp.rules) || bp.rules.length > 30) throw fail('Rules are a list of up to 30.', 'blueprint.rules');
    bp.rules.forEach((r, i) => {
      const field = `blueprint.rules[${i}]`;
      if (!r || typeof r !== 'object' || Object.keys(r).some((k) => !['when', 'set', 'add'].includes(k)) || !r.when || !(r.set || r.add)) throw fail(`Rule ${i + 1} needs “when” and “set” or “add”.`, field);
      const w = r.when;
      if (typeof w !== 'object' || Object.keys(w).length !== 2 || typeof w.key !== 'string' || !('equals' in w || 'includes' in w || 'answered' in w)) throw fail(`Rule ${i + 1}: “when” names a question and equals, includes or answered.`, field);
      const problem = conditionProblem(w, byKey.get(w.key));
      if (problem) throw fail(`Rule ${i + 1}: ${problem}`, field);
      if (r.set) {
        if (typeof r.set !== 'object' || Object.keys(r.set).some((k) => !SET_FIELDS.has(k))) throw fail(`A rule can set ${[...SET_FIELDS].join(', ')}.`, field);
        for (const k of TEXT_FIELDS) if (k in r.set && typeof r.set[k] !== 'string') throw fail(`Rule ${i + 1}: “${k}” must be text.`, field);
        if (r.set.membership) membership(r.set.membership, field);
        if (r.set.eventDefaults) eventDefaults(r.set.eventDefaults, field);
        if ('learning' in r.set && typeof r.set.learning !== 'boolean') throw fail('“learning” must be true or false.', field);
      }
      if (r.add) {
        if (typeof r.add !== 'object' || Object.keys(r.add).some((k) => !LIST_FIELDS.includes(k))) throw fail(`A rule can add to ${LIST_FIELDS.join(', ')}.`, field);
        for (const [k, v] of Object.entries(r.add)) if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw fail(`“${k}” must be a list of text.`, field);
        if ((r.add.sections ?? []).some((s) => !SECTIONS.includes(s)) || (r.add.roles ?? []).some((x) => !OPTIONAL_ROLES.includes(x))) throw fail('A rule adds only known sections and roles.', field);
      }
    });
  }
  // Every slot must be filled by a question in the same version (TPL-05).
  for (const [k, v] of Object.entries(bp)) {
    const unknown = slotsIn(k === 'rules' ? v.map((r) => ({ set: r.set, add: r.add })) : v).find((s) => !byKey.has(s));
    if (unknown) throw fail(`The blueprint uses the slot {${unknown}}, but no question fills it. Remove it or add a question with that slot.`, `blueprint.${k}`);
  }
  return bp;
}

/**
 * Answers + blueprint → a suggested configuration, shaped like the body of POST /communities.
 * Pure: no database, no writes. `template` carries its questionnaire, blueprint and version.
 * Lists are trimmed to their limits because it's a suggestion; creating checks everything again.
 */
export function suggestConfig(template, answers) {
  const bp = structuredClone(template.blueprint ?? {});
  for (const r of bp.rules ?? []) {
    if (!matches(r.when, answers)) continue;
    for (const [k, v] of Object.entries(r.set ?? {})) bp[k] = (k === 'membership' || k === 'eventDefaults') ? { ...bp[k], ...v } : v;
    for (const [k, v] of Object.entries(r.add ?? {})) bp[k] = [...(bp[k] ?? []), ...v];
  }
  const slots = slotsFor(template.questionnaire, answers);
  const m = bp.membership ?? {};
  const sections = [...new Set(bp.sections ?? ['discussions', 'events', 'resources', 'members'])].filter((s) => s !== 'learning');
  const ev = bp.eventDefaults ? { ...bp.eventDefaults } : undefined;
  if (ev && typeof ev.location === 'string') ev.location = fill(ev.location, slots).slice(0, 200) || null;
  const categories = (list) => fillList(list, slots).map((x) => x.slice(0, CATEGORY_LIST.len).trim()).filter(Boolean).slice(0, CATEGORY_LIST.max);
  return {
    name: fill(bp.name, slots).slice(0, 80).trim() || template.name,
    description: fill(bp.description, slots, { sentences: true }).slice(0, 1000) || null,
    category: template.category,
    visibility: m.visibility ?? 'public',
    settings: {
      // The section switches' list (lib/community.js sectionOn); Members always shows.
      sections: (bp.learning ? [...sections, 'learning'] : sections).filter((s) => s !== 'members'),
      guidelines: fill(bp.guidelines, slots, { sentences: true }).slice(0, 5000),
      audience: fill(bp.audience, slots, { sentences: true }).slice(0, SHORT_TEXT_MAX) || null,
      joinQuestion: fill(bp.joinQuestion, slots, { sentences: true }).slice(0, SHORT_TEXT_MAX) || null,
      requireApproval: m.requireApproval ?? false,
      whoCanPost: m.whoCanPost ?? 'members',
      whoCanCreateEvents: m.whoCanCreateEvents ?? 'members',
      membersAddResources: m.membersAddResources ?? false,
      resourceCategories: categories(bp.resourceCategories),
      eventCategories: categories(bp.eventCategories),
      ...(ev ? { eventDefaults: ev } : {}),
      roles: OPTIONAL_ROLES.filter((r) => (bp.roles ?? []).includes(r)),
    },
    topics: fillList(bp.topics, slots).map((x) => x.slice(0, 40).trim()).filter(Boolean).slice(0, MAX_TOPICS),
    template: { key: template.key, version: template.version ?? template.current_version },
  };
}

// A valid answer for every question, for checking a blueprint before it's published.
const sampleAnswer = (q) => ({
  text: 'Sample', list: ['Sample one', 'Sample two'], years: { from: 2000, to: 2010 }, institution: 'sample',
  choice: q.multiple ? q.options?.slice(0, 1).map((o) => o.value) : q.options?.[0]?.value,
})[q.type];

/**
 * Publishing check (TPL-05): the version must be complete, and the suggestion must be a
 * configuration that creating a community would accept, whether every question is answered, only
 * the required ones, or none (people may skip any question).
 */
export async function checkPublishable(template, questionnaire, blueprint) {
  const q = validateQuestionnaire(questionnaire);
  validateBlueprint(blueprint, q, { complete: true });
  const samples = [
    Object.fromEntries(q.map((x) => [x.key, sampleAnswer(x)])),
    Object.fromEntries(q.filter((x) => x.required).map((x) => [x.key, sampleAnswer(x)])),
    {},
  ];
  for (const sample of samples) {
    const answers = await checkAnswers(q, sample, { institutionName: async () => 'Sample Institution' });
    const config = suggestConfig({ ...template, questionnaire: q, blueprint, version: 1 }, answers);
    if (config.name.length < 2) throw adminInvalid('INVALID_BLUEPRINT', 'The name pattern gives a name that is too short.', 'blueprint.name');
    try {
      checkSettings(config.settings);
      cleanTopics(config.topics);
    } catch (err) {
      throw adminInvalid('INVALID_BLUEPRINT', `With sample answers the blueprint gives an invalid configuration: ${err.message}`, err.extra?.field?.replace(/^settings\./, 'blueprint.') ?? 'blueprint');
    }
  }
}

// ---- Converting questionnaires saved before F12 -------------------------------------------------
//
// Earlier versions had six types. long_text becomes text, single_choice and multiple_choice
// become choice (with `multiple`), yes_no becomes a choice of Yes and No, and a list loses its own
// maximum (every list allows 12). Option texts become { value, label } with a value made from the
// label, and the rules and conditions that used the old option texts (or true and false) use the
// new values. Questions already in the new shape are left as they are. Pure: used by the data
// migration (lib/data-migrations.js, F12).

export const valueFor = (label) => String(label).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'option';
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export function convertVersion(questionnaire, blueprint) {
  const maps = new Map();
  const qs = (Array.isArray(questionnaire) ? questionnaire : []).map((x) => {
    if (!x || typeof x !== 'object') return x;
    const { max, ...rest } = x;
    if (x.type === 'long_text') return { ...rest, type: 'text' };
    if (x.type === 'list') return rest;
    if (x.type === 'yes_no') {
      maps.set(x.key, new Map([[true, 'yes'], [false, 'no']]));
      return { ...rest, type: 'choice', options: YES_NO, multiple: false };
    }
    if ((x.type === 'single_choice' || x.type === 'multiple_choice') && Array.isArray(x.options) && x.options.every((o) => typeof o === 'string')) {
      const map = new Map(); const used = new Set();
      const options = x.options.map((o) => {
        const base = valueFor(o); let v = base; let n = 2;
        while (used.has(v)) v = `${base.slice(0, 36)}_${n++}`;
        used.add(v); map.set(o, v);
        return { value: v, label: o };
      });
      maps.set(x.key, map);
      return { ...rest, type: 'choice', options, multiple: x.type === 'multiple_choice' };
    }
    return x;
  });
  const cond = (c) => {
    const map = c && maps.get(c.key);
    if (!map) return c;
    if ('equals' in c && map.has(c.equals)) return { ...c, equals: map.get(c.equals) };
    if ('includes' in c && map.has(c.includes)) return { ...c, includes: map.get(c.includes) };
    return c;
  };
  const q = qs.map((x) => (x?.showIf ? { ...x, showIf: cond(x.showIf) } : x));
  const bp = blueprint && typeof blueprint === 'object' && Array.isArray(blueprint.rules)
    ? { ...blueprint, rules: blueprint.rules.map((r) => (r?.when ? { ...r, when: cond(r.when) } : r)) } : blueprint;
  return { questionnaire: q, blueprint: bp };
}

// ---- The starting library -----------------------------------------------------------------------

/**
 * Adds the library's templates (server/lib/template-library.js) that the database doesn't have
 * yet, each as published version 1. Runs at start-up; a template a Platform Admin has since
 * edited or deactivated is left exactly as it is.
 */
export async function seedTemplates(db) {
  const { rows } = await db.query(`select lower(key) as key from community_templates`);
  const have = new Set(rows.map((r) => r.key));
  for (const t of LIBRARY) {
    if (have.has(t.key)) continue;
    const questionnaire = validateQuestionnaire(t.questionnaire);
    validateBlueprint(t.blueprint, questionnaire, { complete: true });
    const id = newId('tpl');
    await db.tx(async (tx) => {
      const ins = await tx.query(`insert into community_templates (id, key, category, name, description, status, current_version) values ($1, $2, $3, $4, $5, 'published', 1)
        on conflict (lower(key)) do nothing returning id`, [id, t.key, t.category, t.name, t.description]);
      if (!ins.rows.length) return;
      await tx.query(`insert into template_versions (template_id, version, questionnaire, blueprint, published_at) values ($1, 1, $2, $3, now())`,
        [id, JSON.stringify(questionnaire), JSON.stringify(t.blueprint)]);
    });
  }
}
