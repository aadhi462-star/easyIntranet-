// Community templates (v2 brief, Part 4; PROPOSAL_V2 §3.3 and §5).
//
// A template version holds a questionnaire and a blueprint. Answers fill the blueprint
// ({{answer.key}} placeholders and simple rules) into a suggested configuration with the same
// shape as the body of POST /communities, so the person can change any of it before creating.
// The community keeps its own copy of that configuration and records only which template and
// version it came from: a template is never read again for an existing community.
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
export const CONFIG_SETTING_KEYS = ['resourceCategories', 'eventDefaults', 'roles'];
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
  if ('resourceCategories' in s) s.resourceCategories = shortList(s.resourceCategories, 'settings.resourceCategories', { max: 12, len: 40, label: 'Resource categories' });
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

/** A published template a person may use, or the reason they can't. */
export async function usableTemplate(db, key) {
  const { rows: [t] } = await db.query(
    `select t.*, v.questionnaire, v.blueprint from community_templates t
       left join template_versions v on v.template_id = t.id and v.version = t.current_version
      where lower(t.key) = lower($1)`, [String(key ?? '')]);
  if (!t) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'That template doesn’t exist.');
  if (t.status !== 'published' || !t.current_version) throw conflict('TEMPLATE_INACTIVE', 'This template isn’t available any more. Choose another, or start from scratch.');
  return t;
}

/**
 * The parts of a new community's configuration that communities.js doesn't check itself. Runs
 * before the transaction: a refused template or topic list writes nothing.
 */
export async function prepareCommunity(db, body) {
  const plan = { category: checkCategory(body.category), topics: cleanTopics(body.topics), template: null };
  if (body.template) {
    const t = await usableTemplate(db, body.template.key);
    if (body.template.version !== t.current_version) {
      throw conflict('TEMPLATE_VERSION_CHANGED', `This template was updated to version ${t.current_version}. Review the new suggestion before creating.`, { currentVersion: t.current_version });
    }
    plan.template = { id: t.id, key: t.key, version: t.current_version };
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

// ---- Questionnaires -----------------------------------------------------------------------------

export const QUESTION_TYPES = ['text', 'long_text', 'single_choice', 'multiple_choice', 'list', 'yes_no'];
const QUESTION_KEYS = new Set(['key', 'label', 'help', 'type', 'required', 'options', 'max', 'showIf']);
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_QUESTIONS = 15;
const TEXT_MAX = { text: 120, long_text: 1000 };
const LIST_ITEM_MAX = 60;
const adminInvalid = (code, message, field) => badRequest(code, message, { field });

export function validateQuestionnaire(q) {
  if (!Array.isArray(q) || q.length > MAX_QUESTIONS) throw adminInvalid('INVALID_QUESTIONNAIRE', `A questionnaire is a list of up to ${MAX_QUESTIONS} questions.`, 'questionnaire');
  const seen = new Map();
  return q.map((x, i) => {
    const at = `questionnaire[${i}]`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw adminInvalid('INVALID_QUESTIONNAIRE', 'Each question must be an object.', at);
    const extra = Object.keys(x).find((k) => !QUESTION_KEYS.has(k));
    if (extra) throw adminInvalid('INVALID_QUESTIONNAIRE', `“${extra}” isn’t a question field.`, at);
    if (typeof x.key !== 'string' || !KEY.test(x.key)) throw adminInvalid('INVALID_QUESTIONNAIRE', 'A question key is lowercase letters, digits and _, starting with a letter.', at);
    if (seen.has(x.key)) throw adminInvalid('INVALID_QUESTIONNAIRE', `Two questions use the key “${x.key}”.`, at);
    if (!QUESTION_TYPES.includes(x.type)) throw adminInvalid('INVALID_QUESTIONNAIRE', `Question type can be: ${QUESTION_TYPES.join(', ')}.`, at);
    const label = typeof x.label === 'string' ? x.label.trim() : '';
    if (!label || label.length > 160) throw adminInvalid('INVALID_QUESTIONNAIRE', 'Each question needs a label of up to 160 characters.', at);
    if (x.help != null && (typeof x.help !== 'string' || x.help.length > 300)) throw adminInvalid('INVALID_QUESTIONNAIRE', 'Keep help text under 300 characters.', at);
    if ('required' in x && typeof x.required !== 'boolean') throw adminInvalid('INVALID_QUESTIONNAIRE', '“required” must be true or false.', at);
    const out = { key: x.key, label, help: x.help?.trim() ?? '', type: x.type, required: !!x.required };
    if (x.type === 'single_choice' || x.type === 'multiple_choice') {
      const o = x.options;
      if (!Array.isArray(o) || o.length < 2 || o.length > 20 || o.some((v) => typeof v !== 'string' || !v.trim() || v.length > 80) || new Set(o).size !== o.length) {
        throw adminInvalid('INVALID_QUESTIONNAIRE', 'A choice question needs 2–20 different options of up to 80 characters.', at);
      }
      out.options = o.map((v) => v.trim());
    } else if (x.options != null) throw adminInvalid('INVALID_QUESTIONNAIRE', 'Only choice questions have options.', at);
    if (x.type === 'list') {
      if (x.max != null && !(Number.isInteger(x.max) && x.max >= 1 && x.max <= 20)) throw adminInvalid('INVALID_QUESTIONNAIRE', 'A list allows 1–20 items.', at);
      out.max = x.max ?? 10;
    } else if (x.max != null) throw adminInvalid('INVALID_QUESTIONNAIRE', 'Only list questions have a maximum.', at);
    // Only the relevant questions are asked: one can depend on an earlier answer.
    if (x.showIf != null) {
      const s = x.showIf; const dep = seen.get(s?.key);
      if (!dep || Object.keys(s).length !== 2 || !('equals' in s || 'includes' in s)) throw adminInvalid('INVALID_QUESTIONNAIRE', '“showIf” names an earlier question and the answer that shows this one.', at);
      out.showIf = { key: s.key, ...('equals' in s ? { equals: s.equals } : { includes: s.includes }) };
    }
    seen.set(x.key, out);
    return out;
  });
}

const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const matches = (cond, answers) => {
  const v = answers[cond.key];
  if ('equals' in cond) return v === cond.equals;
  if ('includes' in cond) return Array.isArray(v) && v.includes(cond.includes);
  if ('answered' in cond) return empty(v) !== cond.answered;
  return false;
};

/**
 * Checks answers against a questionnaire and returns them cleaned. Questions hidden by an
 * earlier answer are skipped (their answers are dropped); every missing required answer is
 * named at once so the form can mark them all.
 */
export function checkAnswers(questionnaire, input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) throw badRequest('INVALID_INPUT', 'Answers must be an object.', { field: 'answers' });
  const known = new Set(questionnaire.map((q) => q.key));
  const unknown = Object.keys(input).find((k) => !known.has(k));
  if (unknown) throw badRequest('UNKNOWN_ANSWER', `“${unknown}” isn’t one of this template’s questions.`, { field: unknown });
  const out = {}; const missing = [];
  const bad = (q, msg) => badRequest('INVALID_ANSWER', `${q.label} ${msg}`, { field: q.key });
  for (const q of questionnaire) {
    if (q.showIf && !matches(q.showIf, out)) continue;
    let v = input[q.key];
    if (typeof v === 'string') v = v.trim();
    if (empty(v)) { if (q.required) missing.push(q.key); continue; }
    switch (q.type) {
      case 'text': case 'long_text':
        if (typeof v !== 'string') throw bad(q, 'needs a written answer.');
        if (v.length > TEXT_MAX[q.type]) throw bad(q, `can be up to ${TEXT_MAX[q.type]} characters.`);
        v = q.type === 'text' ? v.replace(/\s+/g, ' ') : v;
        break;
      case 'single_choice':
        if (!q.options.includes(v)) throw bad(q, 'needs one of the listed options.');
        break;
      case 'multiple_choice':
        if (!Array.isArray(v) || v.some((x) => !q.options.includes(x)) || new Set(v).size !== v.length) throw bad(q, 'needs options from the list, each once.');
        break;
      case 'list':
        if (!Array.isArray(v) || v.length > q.max) throw bad(q, `can list up to ${q.max} items.`);
        v = v.map((x) => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : ''));
        if (v.some((x) => !x || x.length > LIST_ITEM_MAX)) throw bad(q, `needs items of 1–${LIST_ITEM_MAX} characters.`);
        v = v.filter((x, i) => v.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
        break;
      case 'yes_no':
        if (typeof v !== 'boolean') throw bad(q, 'needs yes or no.');
        break;
      default:
    }
    out[q.key] = v;
  }
  if (missing.length) throw badRequest('ANSWERS_REQUIRED', 'Answer the questions marked as required.', { fields: missing });
  return out;
}

// ---- Blueprints and suggestions -----------------------------------------------------------------

const BLUEPRINT_KEYS = new Set(['name', 'description', 'sections', 'learning', 'topics', 'membership', 'resourceCategories', 'eventDefaults', 'guidelines', 'roles', 'rules']);
const MEMBERSHIP_KEYS = new Set(['visibility', 'requireApproval', 'whoCanPost', 'whoCanCreateEvents', 'membersAddResources']);
const LIST_FIELDS = ['sections', 'topics', 'resourceCategories', 'roles'];
const SET_FIELDS = new Set(['name', 'description', 'guidelines', 'learning', 'membership', 'eventDefaults']);
const PLACEHOLDER = /\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}/g;

const asText = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? ''));
// Fills placeholders; an unanswered optional question leaves no gap, stray separator or "()".
const fill = (s, answers) => String(s ?? '').replace(PLACEHOLDER, (_, k) => asText(answers[k]))
  .replace(/\(\s*\)/g, '').replace(/[ \t]+/g, ' ').replace(/ +([,.;:)])/g, '$1').replace(/\( +/g, '(')
  .split('\n').map((l) => l.trim()).join('\n').trim();
// A list item that is exactly one placeholder for a list answer becomes one item per answer.
const fillList = (items, answers) => {
  const out = [];
  for (const item of items ?? []) {
    const whole = /^\{\{\s*answer\.([a-z][a-z0-9_]*)\s*\}\}$/.exec(String(item).trim());
    const values = whole && Array.isArray(answers[whole[1]]) ? answers[whole[1]] : [fill(item, answers)];
    for (const v of values) if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
};
const placeholdersIn = (v) => [...JSON.stringify(v ?? null).matchAll(PLACEHOLDER)].map((m) => m[1]);

/** Structure checks for a blueprint. `complete` (publishing) also needs a name pattern. */
export function validateBlueprint(bp, questionnaire, { complete = false } = {}) {
  const fail = (message, field = 'blueprint') => adminInvalid('INVALID_BLUEPRINT', message, field);
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) throw fail('A blueprint must be an object.');
  const extra = Object.keys(bp).find((k) => !BLUEPRINT_KEYS.has(k));
  if (extra) throw fail(`“${extra}” isn’t a blueprint field.`);
  for (const k of ['name', 'description', 'guidelines']) if (k in bp && typeof bp[k] !== 'string') throw fail(`“${k}” must be text.`, `blueprint.${k}`);
  if (complete && !String(bp.name ?? '').trim()) throw fail('Give the blueprint a name pattern.', 'blueprint.name');
  for (const k of LIST_FIELDS) if (k in bp && (!Array.isArray(bp[k]) || bp[k].some((x) => typeof x !== 'string'))) throw fail(`“${k}” must be a list of text.`, `blueprint.${k}`);
  if ((bp.sections ?? []).some((s) => !SECTIONS.includes(s))) throw fail(`Sections can be: ${SECTIONS.join(', ')}.`, 'blueprint.sections');
  if ((bp.roles ?? []).some((r) => !OPTIONAL_ROLES.includes(r))) throw fail(`Roles can be: ${OPTIONAL_ROLES.join(', ')}.`, 'blueprint.roles');
  if ('learning' in bp && typeof bp.learning !== 'boolean') throw fail('“learning” must be true or false.', 'blueprint.learning');
  const membership = (m, field) => {
    if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some((k) => !MEMBERSHIP_KEYS.has(k))) throw fail(`Membership can set ${[...MEMBERSHIP_KEYS].join(', ')}.`, field);
    if ('visibility' in m && !['public', 'private', 'closed'].includes(m.visibility)) throw fail('Visibility is public, private or closed.', field);
    for (const k of ['whoCanPost', 'whoCanCreateEvents']) if (k in m && !['members', 'admins'].includes(m[k])) throw fail(`“${k}” is members or admins.`, field);
    for (const k of ['requireApproval', 'membersAddResources']) if (k in m && typeof m[k] !== 'boolean') throw fail(`“${k}” must be true or false.`, field);
  };
  if ('membership' in bp) membership(bp.membership, 'blueprint.membership');
  if ('eventDefaults' in bp) checkSettings({ eventDefaults: bp.eventDefaults });
  if ('rules' in bp) {
    if (!Array.isArray(bp.rules) || bp.rules.length > 30) throw fail('Rules are a list of up to 30.', 'blueprint.rules');
    bp.rules.forEach((r, i) => {
      const field = `blueprint.rules[${i}]`;
      if (!r || typeof r !== 'object' || Object.keys(r).some((k) => !['when', 'set', 'add'].includes(k)) || !r.when || !(r.set || r.add)) throw fail('A rule has “when” and “set” or “add”.', field);
      const w = r.when;
      if (typeof w !== 'object' || Object.keys(w).length !== 2 || typeof w.key !== 'string' || !('equals' in w || 'includes' in w || typeof w.answered === 'boolean')) throw fail('“when” names a question and equals, includes or answered.', field);
      if (r.set) {
        if (typeof r.set !== 'object' || Object.keys(r.set).some((k) => !SET_FIELDS.has(k))) throw fail(`A rule can set ${[...SET_FIELDS].join(', ')}.`, field);
        if (r.set.membership) membership(r.set.membership, field);
        if (r.set.eventDefaults) checkSettings({ eventDefaults: r.set.eventDefaults });
        if ('learning' in r.set && typeof r.set.learning !== 'boolean') throw fail('“learning” must be true or false.', field);
      }
      if (r.add) {
        if (typeof r.add !== 'object' || Object.keys(r.add).some((k) => !LIST_FIELDS.includes(k))) throw fail(`A rule can add to ${LIST_FIELDS.join(', ')}.`, field);
        for (const [k, v] of Object.entries(r.add)) if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw fail(`“${k}” must be a list of text.`, field);
        if ((r.add.sections ?? []).some((s) => !SECTIONS.includes(s)) || (r.add.roles ?? []).some((x) => !OPTIONAL_ROLES.includes(x))) throw fail('A rule adds only known sections and roles.', field);
      }
    });
  }
  // Every placeholder and rule must refer to a question in the same version.
  const keys = new Set(questionnaire.map((q) => q.key));
  const unknown = [...placeholdersIn(bp), ...(bp.rules ?? []).map((r) => r.when.key)].find((k) => !keys.has(k));
  if (unknown) throw fail(`“${unknown}” isn’t a question in this template.`);
  return bp;
}

/**
 * Answers + blueprint → a suggested configuration, shaped like the body of POST /communities.
 * Pure: no database, no writes. Lists are trimmed to their limits because it's a suggestion;
 * creating the community checks everything again.
 */
export function suggestConfig(template, answers) {
  const bp = structuredClone(template.blueprint ?? {});
  for (const r of bp.rules ?? []) {
    if (!matches(r.when, answers)) continue;
    for (const [k, v] of Object.entries(r.set ?? {})) bp[k] = (k === 'membership' || k === 'eventDefaults') ? { ...bp[k], ...v } : v;
    for (const [k, v] of Object.entries(r.add ?? {})) bp[k] = [...(bp[k] ?? []), ...v];
  }
  const m = bp.membership ?? {};
  const sections = [...new Set(bp.sections ?? ['discussions', 'events', 'resources', 'members'])].filter((s) => s !== 'learning');
  const ev = bp.eventDefaults ? { ...bp.eventDefaults } : undefined;
  if (ev && typeof ev.location === 'string') ev.location = fill(ev.location, answers).slice(0, 200) || null;
  return {
    name: fill(bp.name, answers).slice(0, 80).trim() || template.name,
    description: fill(bp.description, answers).slice(0, 1000) || null,
    category: template.category,
    visibility: m.visibility ?? 'public',
    settings: {
      apps: bp.learning ? [...sections, 'learning'] : sections,
      guidelines: fill(bp.guidelines, answers).slice(0, 5000),
      requireApproval: m.requireApproval ?? false,
      whoCanPost: m.whoCanPost ?? 'members',
      whoCanCreateEvents: m.whoCanCreateEvents ?? 'members',
      membersAddResources: m.membersAddResources ?? false,
      resourceCategories: fillList(bp.resourceCategories, answers).map((x) => x.slice(0, 40)).slice(0, 12),
      ...(ev ? { eventDefaults: ev } : {}),
      roles: OPTIONAL_ROLES.filter((r) => (bp.roles ?? []).includes(r)),
    },
    topics: fillList(bp.topics, answers).map((x) => x.slice(0, 40)).slice(0, MAX_TOPICS),
    template: { key: template.key, version: template.current_version },
  };
}

// Answers that satisfy every required question, for checking a blueprint before it's published.
const sampleAnswers = (questionnaire) => {
  const out = {};
  for (const q of questionnaire) {
    if (!q.required) continue;
    out[q.key] = { text: 'Sample', long_text: 'Sample', single_choice: q.options?.[0], multiple_choice: q.options?.slice(0, 1), list: ['Sample'], yes_no: true }[q.type];
  }
  return out;
};

/**
 * Publishing check: the version must be complete, and a suggestion from sample answers must be a
 * configuration that creating a community would accept.
 */
export function checkPublishable(template, questionnaire, blueprint) {
  const q = validateQuestionnaire(questionnaire);
  validateBlueprint(blueprint, q, { complete: true });
  const config = suggestConfig({ ...template, blueprint, current_version: 1 }, checkAnswers(q, sampleAnswers(q)));
  if (config.name.length < 2) throw adminInvalid('INVALID_BLUEPRINT', 'The name pattern gives a name that is too short.', 'blueprint.name');
  checkSettings(config.settings);
  cleanTopics(config.topics);
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
