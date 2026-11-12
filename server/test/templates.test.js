// Community templates (v2 brief, Part 4; PROPOSAL_V2 §5): categories, questionnaires and
// suggestions, creating from a template and from scratch, versions and template administration.
// EDGE_CASE_REGISTER.md IDs are in the names where the register has them.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { CATEGORIES } from '../lib/categories.js';
import { convertQuestionTypes, F12, undoDataMigration } from '../lib/data-migrations.js';

let env; const c = {};
const PEOPLE = { mem: [], two: [], pa: ['platform_admin'], sa: ['super_admin'], cm: ['community_manager'], sup: ['support_agent'] };
const q = (s, p) => env.db.query(s, p);
before(async () => {
  env = await setup();
  for (const [id, roles] of Object.entries(PEOPLE)) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase(), roles });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
  await q(`insert into institutions (id, name) values ('inst_riv', 'Riverside College'), ('inst_hill', 'Hill School')`);
});
after(async () => { await env.close(); });

const ALUMNI = { institution: 'inst_riv', departments: ['Civil Engineering', 'Physics'], who_can_join: 'approved', goals: ['mentoring', 'jobs'], talks: 'yes' };
const suggest = async (who, key, answers, extra = {}) => c[who].post(`/api/templates/${key}/suggest`, { answers, ...extra });
const configFor = async (key, answers, name) => {
  const res = await suggest('mem', key, answers);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { ...res.body.config, ...(name ? { name } : {}) };
};
const count = async (sql, p) => (await q(sql, p)).rows[0].n;
const revisionOf = async (key) => (await c.pa.get(`/api/admin/templates/${key}`)).body.template.revision;

describe('categories and the template library', () => {
  test('the category list is exactly the 9 values', () => {
    assert.deepEqual(CATEGORIES, ['Alumni', 'Education', 'Professional Networking', 'Technology', 'Business', 'Hobbies and Interests', 'Organisation', 'General Community', 'Other']);
  });

  test('8 published templates are offered, one per category except Other', async () => {
    const res = await c.mem.get('/api/templates');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.templates.map((t) => t.category), CATEGORIES.slice(0, 8));
    assert.ok(res.body.templates.every((t) => t.version === 1 && t.questions > 0));
    const one = (await c.mem.get('/api/templates/alumni')).body.template;
    assert.ok(one.questionnaire.every((x) => x.key && x.label && 'help' in x && typeof x.required === 'boolean'));
    const all = (await Promise.all(res.body.templates.map(async (t) => (await c.mem.get(`/api/templates/${t.key}`)).body.template.questionnaire))).flat();
    assert.deepEqual([...new Set(all.map((x) => x.type))].sort(), ['choice', 'institution', 'list', 'text', 'years']);
    // F12 shapes: a choice has { value, label } options and says whether it allows several.
    for (const x of all.filter((y) => y.type === 'choice')) {
      assert.equal(typeof x.multiple, 'boolean');
      assert.ok(x.options.every((o) => Object.keys(o).sort().join() === 'label,value'));
    }
    assert.ok(all.filter((y) => y.type === 'text' && 'maxLength' in y).every((y) => y.maxLength <= 200));
    // Templates fill both category lists (F13).
    const config = await configFor('technology', {});
    assert.deepEqual(config.settings.eventCategories, ['Meetups', 'Talks', 'Workshops', 'Hackathons']);
    assert.deepEqual(config.settings.resourceCategories, ['Docs and guides', 'Talks and slides', 'Tools']);
  });

  test('COM-10 categories are enforced on create and edit; older categories keep working', async () => {
    assert.equal((await c.mem.post('/api/communities', { name: 'Interest Group', visibility: 'public', category: 'Interest' })).body.error.code, 'INVALID_CATEGORY');
    const made = await c.mem.post('/api/communities', { name: 'Spelling Club', visibility: 'public', category: 'hobbies and interests' });
    assert.equal(made.status, 201);
    assert.equal((await q(`select category from communities where id = $1`, [made.body.community.id])).rows[0].category, 'Hobbies and Interests');
    // A community saved before the list existed: readable, editable, and its category stays.
    await q(`insert into communities (id, slug, name, visibility, category, created_by) values ('old', 'old', 'Old City Group', 'public', 'City', 'mem')`);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('old', 'mem', 'owner', 'active', now())`);
    const before = (await c.mem.get('/api/communities/old')).body.community;
    assert.equal(before.category, 'City');
    let edit = await c.mem.patch('/api/communities/old', { version: 1, description: 'Still here', category: 'City' });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    edit = await c.mem.patch('/api/communities/old', { version: 2, category: 'Batch' });
    assert.equal(edit.body.error.code, 'INVALID_CATEGORY');
    assert.equal((await c.mem.patch('/api/communities/old', { version: 2, category: 'Alumni' })).body.community.category, 'Alumni');
  });
});

describe('questionnaires and suggestions', () => {
  test('F12 any question can be skipped; each of the five types refuses an invalid answer; nothing is written', async () => {
    const n = await count(`select count(*)::int as n from communities`);
    // Skipping everything (F3) gives the template's defaults.
    const skipped = await suggest('mem', 'alumni', {});
    assert.equal(skipped.status, 200, JSON.stringify(skipped.body));
    assert.equal(skipped.body.config.name, 'Alumni');
    assert.equal(skipped.body.config.visibility, 'public');
    const refused = async (answers, field) => {
      const res = await suggest('mem', 'alumni', { ...ALUMNI, ...answers });
      assert.equal(res.body.error?.code, 'INVALID_ANSWER', JSON.stringify(answers));
      assert.equal(res.body.error.field, field);
    };
    assert.equal((await suggest('mem', 'alumni', { ...ALUMNI, favourite: 'x' })).body.error.code, 'UNKNOWN_ANSWER');
    await refused({ who_can_join: 'everyone_on_earth' }, 'who_can_join');
    await refused({ who_can_join: ['approved'] }, 'who_can_join');
    await refused({ goals: 'mentoring' }, 'goals');
    await refused({ goals: ['mentoring', 'mentoring'] }, 'goals');
    await refused({ talks: true }, 'talks');
    await refused({ departments: Array.from({ length: 13 }, (_, i) => `Dept ${i}`) }, 'departments');
    await refused({ departments: ['x'.repeat(61)] }, 'departments');
    await refused({ grad_years: '2015 to 2020' }, 'grad_years');
    await refused({ grad_years: { from: 2020, to: 2015 } }, 'grad_years');
    await refused({ grad_years: { from: 1899, to: 2015 } }, 'grad_years');
    await refused({ grad_years: { from: 2010, to: 2015, extra: 1 } }, 'grad_years');
    await refused({ institution: 'inst_nowhere' }, 'institution');
    // Short text: up to the question's maxLength (Education's programme allows 80).
    const long = await suggest('mem', 'education', { programme: 'x'.repeat(81) });
    assert.equal(long.body.error.code, 'INVALID_ANSWER');
    assert.equal((await suggest('mem', 'education', { programme: 'x'.repeat(80) })).status, 200);
    assert.equal(await count(`select count(*)::int as n from communities`), n);
  });

  test('answers fill the placeholders and rules into a plain configuration', async () => {
    const config = await configFor('alumni', ALUMNI);
    // The institution slot is filled with its name, not its id.
    assert.equal(config.name, 'Riverside College Alumni');
    // The unanswered graduation years leave no empty brackets.
    assert.equal(config.description, 'The alumni community of Riverside College. Stay in touch with classmates, find mentors and hear about reunions.');
    assert.equal(config.category, 'Alumni');
    assert.equal(config.visibility, 'private');
    assert.deepEqual(config.topics, ['Introductions', 'Announcements', 'Civil Engineering', 'Physics', 'Careers', 'Mentoring', 'Jobs and referrals']);
    assert.ok(config.settings.sections.includes('learning'));
    assert.deepEqual(config.settings.roles, ['moderator', 'instructor']);
    assert.ok(config.settings.resourceCategories.includes('Job leads'));
    assert.deepEqual(config.settings.eventCategories, ['Reunions', 'Networking', 'Talks', 'Careers', 'Mentoring']);
    assert.match(config.settings.guidelines, /alumni of Riverside College\./);
    assert.deepEqual(config.template, { key: 'alumni', version: 1 });
    assert.ok(!/\{[a-z_]+\}/.test(JSON.stringify(config)), 'no slot is left');
    // Without the rule's answers, the defaults stay.
    const plain = await configFor('alumni', { institution: 'inst_hill', who_can_join: 'anyone', goals: ['networking'], grad_years: { from: 1990, to: 2000 } });
    assert.equal(plain.visibility, 'public');
    assert.ok(!plain.settings.sections.includes('learning'));
    assert.match(plain.description, /of Hill School \(1990 to 2000\)\./);
    // A text answer fills its slot as written.
    assert.match((await configFor('general-community', { community_name: 'Night Owls', about: 'People who work late.', openness: 'invitation' })).description, /^People who work late\.$/);
  });

  test('F7 an unanswered slot never leaves broken text: its sentence is left out, an empty bracket disappears', async () => {
    const alumni = await configFor('alumni', { who_can_join: 'anyone' });
    assert.equal(alumni.description, 'Stay in touch with classmates, find mentors and hear about reunions.');
    assert.ok(alumni.settings.guidelines.startsWith('Be respectful'), alumni.settings.guidelines);
    assert.equal(alumni.settings.audience, null);
    assert.equal(alumni.settings.joinQuestion, 'Which year did you graduate, and in which department?');
    // Answered, the same sentences come back; an answer's own full stop doesn't split a sentence.
    await q(`insert into institutions (id, name) values ('inst_stm', 'St. Mary’s College') on conflict do nothing`);
    const full = await configFor('alumni', { institution: 'inst_stm', grad_years: { from: 2001, to: 2004 } });
    assert.equal(full.description, 'The alumni community of St. Mary’s College (2001 to 2004). Stay in touch with classmates, find mentors and hear about reunions.');
    assert.equal(full.settings.audience, 'Graduates of St. Mary’s College (2001 to 2004).');
    assert.match(full.settings.guidelines, /^This community is for alumni of St\. Mary’s College\. Be respectful/);
    // Every library template, with nothing answered: no dangling words or separators anywhere.
    const broken = /\b(of|for|at|with|about|in)\s*[.,:;)]|\s[.,:;)]|\(\s*\)|\{[a-z_]+\}|^[\s.,:;]|\s{2,}/;
    for (const t of (await c.mem.get('/api/templates')).body.templates) {
      const cfg = await configFor(t.key, {});
      for (const [field, text] of Object.entries({ name: cfg.name, description: cfg.description, guidelines: cfg.settings.guidelines, audience: cfg.settings.audience, joinQuestion: cfg.settings.joinQuestion })) {
        if (text) assert.ok(!broken.test(text), `${t.key} ${field}: “${text}”`);
      }
      assert.ok(cfg.name.length >= 2);
      // The suggestion is a configuration POST /communities accepts as it is.
      assert.equal((await c.mem.post('/api/communities/validate', { ...cfg, name: `${t.name} Skipped Everything` })).status, 200, t.key);
    }
  });

  test('F7 the “Who this is for” line and the join question are settings: on create, validate and edit, and on the community page', async () => {
    const body = { name: 'Audience Club', visibility: 'private', settings: { audience: '  Graduates of 2010  ', joinQuestion: 'Which batch?' } };
    assert.equal((await c.mem.post('/api/communities/validate', body)).status, 200);
    for (const bad of [{ audience: 'x'.repeat(201) }, { joinQuestion: 5 }]) {
      assert.equal((await c.mem.post('/api/communities/validate', { ...body, settings: bad })).body.error.code, 'INVALID_INPUT');
      assert.equal((await c.mem.post('/api/communities', { ...body, settings: bad })).body.error.code, 'INVALID_INPUT');
    }
    const made = (await c.mem.post('/api/communities', body)).body.community;
    const page = (await c.two.get(`/api/communities/${made.id}`)).body;
    assert.equal(page.permissions.canView, false);
    assert.equal(page.community.audience, 'Graduates of 2010');
    assert.equal(page.community.joinQuestion, 'Which batch?');
    const v = (await c.mem.get(`/api/communities/${made.id}`)).body.community.version;
    assert.equal((await c.mem.patch(`/api/communities/${made.id}`, { version: v, settings: { joinQuestion: null, audience: 'Anyone from the class of 2010' } })).status, 200);
    const after = (await c.two.get(`/api/communities/${made.id}`)).body.community;
    assert.deepEqual([after.audience, after.joinQuestion], ['Anyone from the class of 2010', null]);
  });

  test('only the relevant questions count: a hidden question’s answer is ignored', async () => {
    const base = { organisation: 'Northwind', who: 'invited', volunteers: 'yes' };
    const company = await configFor('organisation', { ...base, kind: 'company' });
    assert.ok(!company.topics.includes('Volunteering'));
    const charity = await configFor('organisation', { ...base, kind: 'nonprofit' });
    assert.ok(charity.topics.includes('Volunteering'));
    assert.equal(charity.visibility, 'closed');
  });

  test('every library template turns sample answers into a configuration that can be created', async () => {
    const answers = {
      education: { programme: 'Grade 10 Science', institution: 'inst_hill', subjects: ['Physics', 'Chemistry'], audience: 'class', co_teachers: 'yes' },
      'professional-networking': { field: 'Product Design', region: 'Pune', career_stage: ['early'], offerings: ['jobs', 'skills'], vetted: 'no' },
      technology: { focus: 'Rust', kind: 'open_source', events: 'hackathons', areas: ['Compiler'] },
      business: { business: 'Acme Tools', audience: 'customers', support: 'yes', admins_post: 'yes' },
      'hobbies-and-interests': { interest: 'Film photography', location: 'Kochi', experience: 'beginners', activities: ['meet'] },
      'general-community': { community_name: 'Night Owls', about: 'People who work late.', openness: 'invitation', features: ['events'] },
    };
    for (const [key, a] of Object.entries(answers)) {
      const config = await configFor(key, a);
      const res = await c.two.post('/api/communities', config);
      assert.equal(res.status, 201, `${key}: ${JSON.stringify(res.body)}`);
    }
    const hobby = await configFor('hobbies-and-interests', answers['hobbies-and-interests']);
    assert.equal(hobby.name, 'Kochi Film photography Club');
    assert.equal(hobby.settings.eventDefaults.location, 'Kochi');
    assert.equal(hobby.settings.whoCanCreateEvents, 'members');
    const tech = await configFor('technology', answers.technology);
    assert.equal(tech.settings.eventDefaults.eventType, 'Contest');
    assert.equal((await configFor('business', answers.business)).settings.whoCanPost, 'admins');
    assert.match((await configFor('education', answers.education)).description, /^For learners of Grade 10 Science \(Hill School\)\. Subjects: Physics, Chemistry\./);
  });
});

describe('creating a community from a template or from scratch', () => {
  let a; let b;
  test('TPL-03 COM-12 two communities from one template are independent', async () => {
    const config = await configFor('alumni', ALUMNI);
    a = (await c.mem.post('/api/communities', { ...config, name: 'Riverside Alumni North' })).body.community;
    b = (await c.mem.post('/api/communities', { ...config, name: 'Riverside Alumni South' })).body.community;
    assert.ok(a?.id && b?.id && a.id !== b.id);
    const rows = (await q(`select id, template_id, template_version, settings, category, visibility from communities where id = any($1) order by name`, [[a.id, b.id]])).rows;
    const tpl = (await q(`select id from community_templates where key = 'alumni'`)).rows[0].id;
    assert.ok(rows.every((r) => r.template_id === tpl && r.template_version === 1 && r.category === 'Alumni' && r.visibility === 'private'));
    // The template's sections become the community's section switches (lib/community.js sectionOn).
    const page = (await c.mem.get(`/api/communities/${a.id}`)).body;
    assert.deepEqual(page.sections, Object.fromEntries(['discussions', 'events', 'resources', 'learning'].map((s) => [s, config.settings.sections.includes(s)])));
    const topicsOf = async (id) => (await c.mem.get(`/api/communities/${id}/topics`)).body.topics;
    assert.deepEqual((await topicsOf(a.id)).map((t) => t.name), config.topics);
    // Changing one (settings, a topic, its name) changes nothing in the other.
    const edit = await c.mem.patch(`/api/communities/${a.id}`, { version: 1, name: 'Riverside North Alumni', settings: { guidelines: 'North rules only.', roles: [] } });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    await c.mem.delete(`/api/topics/${(await topicsOf(a.id))[0].id}`);
    await c.mem.post(`/api/communities/${a.id}/topics`, { name: 'North only' });
    const other = (await q(`select name, settings from communities where id = $1`, [b.id])).rows[0];
    assert.equal(other.name, 'Riverside Alumni South');
    assert.equal(other.settings.guidelines, config.settings.guidelines);
    assert.deepEqual(other.settings.roles, ['moderator', 'instructor']);
    assert.deepEqual((await topicsOf(b.id)).map((t) => t.name), config.topics);
    assert.ok(!(await topicsOf(b.id)).some((t) => t.name === 'North only'));
  });

  test('from scratch still works, accepts the same configuration and records no template', async () => {
    const res = await c.mem.post('/api/communities', { name: 'Scratch Garden', visibility: 'public', topics: ['Seeds', 'Tools'], settings: { apps: ['discussions', 'members'], roles: ['moderator'] } });
    assert.equal(res.status, 201);
    const row = (await q(`select template_id, template_version, category from communities where id = $1`, [res.body.community.id])).rows[0];
    assert.deepEqual(row, { template_id: null, template_version: null, category: 'Other' });
    assert.equal(await count(`select count(*)::int as n from topics where community_id = $1`, [res.body.community.id]), 2);
    const audit = (await q(`select context from audit_log where action = 'community.create' and target_id = $1`, [a.id])).rows[0];
    assert.deepEqual(audit.context.template, { key: 'alumni', version: 1 });
  });

  test('an invalid configuration is refused the same way with or without a template, and writes nothing', async () => {
    const config = await configFor('alumni', ALUMNI);
    const n = await count(`select count(*)::int as n from communities`);
    const t = await count(`select count(*)::int as n from topics`);
    const cases = [
      [{ topics: Array.from({ length: 13 }, (_, i) => `Topic ${i}`) }, 'TOO_MANY_TOPICS'],
      [{ topics: ['Same', 'same'] }, 'DUPLICATE_TOPIC'],
      [{ category: 'Batch' }, 'INVALID_CATEGORY'],
      [{ settings: { roles: ['owner'] } }, 'INVALID_INPUT'],
      [{ settings: { apps: ['discussions', 'payments'] } }, 'INVALID_INPUT'],
      [{ settings: { eventDefaults: { durationMinutes: 5 } } }, 'INVALID_INPUT'],
      [{ settings: { eventCategories: Array.from({ length: 13 }, (_, i) => `Kind ${i}`) } }, 'INVALID_INPUT'],
      [{ settings: { eventCategories: ['Talks', 'talks'] } }, 'INVALID_INPUT'],
      [{ settings: { status: 'active' } }, 'FIELD_NOT_ALLOWED'],
      [{ name: 'x' }, 'INVALID_NAME'],
    ];
    for (const [change, code] of cases) {
      const withTemplate = await c.mem.post('/api/communities', { ...config, name: 'Bad Config Place', ...change });
      const scratch = await c.mem.post('/api/communities', { name: 'Bad Config Place', visibility: 'public', ...change });
      assert.equal(withTemplate.body.error?.code, code, `template path: ${JSON.stringify(change)}`);
      assert.equal(scratch.body.error?.code, code, `scratch path: ${JSON.stringify(change)}`);
    }
    assert.equal((await c.mem.post('/api/communities', { ...config, name: 'Bad Config Place', template: { key: 'alumni', version: 1, extra: true } })).body.error.code, 'INVALID_INPUT');
    assert.equal(await count(`select count(*)::int as n from communities`), n);
    assert.equal(await count(`select count(*)::int as n from topics`), t);
  });

  test('COM-05 COM-06 a duplicate submit creates one community with one set of topics', async () => {
    const config = await configFor('alumni', ALUMNI, 'Riverside Retry Club');
    const h = { 'idempotency-key': 'tpl-create-1' };
    const first = await c.mem.post('/api/communities', config, h);
    const again = await c.mem.post('/api/communities', config, h);
    assert.equal(first.status, 201);
    assert.equal(again.status, 201);
    assert.equal(again.headers['idempotent-replay'], 'true');
    assert.equal(again.body.community.id, first.body.community.id);
    assert.equal(await count(`select count(*)::int as n from communities where name = 'Riverside Retry Club'`), 1);
    assert.equal(await count(`select count(*)::int as n from topics where community_id = $1`, [first.body.community.id]), config.topics.length);
    // Without the key, the second submit is caught by the name rule (COM-01), not doubled.
    assert.equal((await c.mem.post('/api/communities', config)).body.error.code, 'DUPLICATE_NAME');
  });

  test('COM-07 creation turned off for members mid-wizard blocks the templates and the final submit', async () => {
    const config = await configFor('alumni', ALUMNI, 'Late Wizard Club');
    await q(`update platform_settings set value = value || '{"whoCanCreate": "staff"}' where key = 'communities'`);
    try {
      assert.equal((await c.mem.get('/api/templates')).body.error.code, 'CREATE_RESTRICTED');
      assert.equal((await suggest('mem', 'alumni', ALUMNI)).body.error.code, 'CREATE_RESTRICTED');
      assert.equal((await c.mem.post('/api/communities', config)).body.error.code, 'CREATE_RESTRICTED');
      assert.equal((await c.pa.get('/api/templates')).status, 200, 'platform staff still can');
    } finally {
      await q(`update platform_settings set value = value || '{"whoCanCreate": "anyone"}' where key = 'communities'`);
    }
  });
});

describe('POST /communities/validate (F5)', () => {
  const tables = ['communities', 'memberships', 'topics', 'audit_log', 'idempotency_keys', 'notifications'];
  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(`select count(*)::int as n from ${t}`)])));

  test('F5 a valid configuration answers ok and writes nothing', async () => {
    const config = await configFor('alumni', ALUMNI, 'Riverside Validate Only');
    const before = await snapshot();
    const res = await c.mem.post('/api/communities/validate', config, { 'idempotency-key': 'validate-1' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await c.mem.post('/api/communities/validate', { name: 'Scratch Validate', visibility: 'closed', topics: ['One'], settings: { eventCategories: ['Talks'] } })).status, 200);
    assert.deepEqual(await snapshot(), before, 'the database is unchanged');
    // The same body then publishes.
    assert.equal((await c.mem.post('/api/communities', config)).status, 201);
  });

  test('F5 validate refuses exactly what POST /communities refuses, with the same code and field', async () => {
    const config = await configFor('alumni', ALUMNI);
    const cases = [
      { name: 'Riverside Validate Only' },
      { name: 'riverside validate only!' },
      { name: 'x' },
      { category: 'Batch' },
      { topics: ['Same', 'same'] },
      { settings: { status: 'active' } },
      { settings: { eventCategories: ['x'.repeat(41)] } },
      { template: { key: 'alumni', version: 99 } },
      { template: { key: 'nope', version: 1 } },
      { visibility: 'secret' },
      { extra: true },
    ];
    const before = await snapshot();
    for (const change of cases) {
      const body = { ...config, name: 'Validate Mirror Club', ...change };
      const check = await c.mem.post('/api/communities/validate', body);
      const real = await c.mem.post('/api/communities', body);
      assert.notEqual(real.status, 201, JSON.stringify(change));
      assert.equal(check.status, real.status, JSON.stringify(change));
      assert.equal(check.body.error.code, real.body.error.code, JSON.stringify(change));
      assert.equal(check.body.error.field, real.body.error.field, JSON.stringify(change));
    }
    assert.equal((await c.mem.post('/api/communities/validate', { ...config, name: 'Riverside Validate Only' })).body.error.code, 'DUPLICATE_NAME');
    assert.deepEqual(await snapshot(), before);
  });

  test('F5 validate has the same permissions: signed in, and who can create', async () => {
    const config = await configFor('alumni', ALUMNI, 'Validate Permission Club');
    const { client } = await import('./helpers.js');
    assert.equal((await client(env.app).post('/api/communities/validate', config)).status, 401);
    await q(`update platform_settings set value = value || '{"whoCanCreate": "staff"}' where key = 'communities'`);
    try {
      assert.equal((await c.mem.post('/api/communities/validate', config)).body.error.code, 'CREATE_RESTRICTED');
      assert.equal((await c.pa.post('/api/communities/validate', config)).status, 200);
    } finally {
      await q(`update platform_settings set value = value || '{"whoCanCreate": "anyone"}' where key = 'communities'`);
    }
  });
});

describe('template administration and versions', () => {
  test('PER-16 Platform Admins, Community Managers and Super Admins manage templates (F11)', async () => {
    for (const who of ['mem', 'sup']) {
      assert.equal((await c[who].get('/api/admin/templates')).status, 403, who);
      assert.equal((await c[who].post('/api/admin/templates/alumni/deactivate')).status, 403, who);
      assert.equal((await c[who].post('/api/admin/templates', { key: 'nope', category: 'Other', name: 'Nope' })).status, 403, who);
    }
    assert.equal((await c.pa.get('/api/admin/templates')).status, 200);
    assert.equal((await c.sa.get('/api/admin/templates')).status, 200);
    assert.equal((await c.cm.get('/api/admin/templates')).status, 200, 'Community Managers hold templates.manage (F11)');
  });

  test('a new template is a draft nobody can use until it is published', async () => {
    const body = {
      key: 'book-club', category: 'Hobbies and Interests', name: 'Book club', description: 'Read together.',
      questionnaire: [{ key: 'genre', type: 'text', label: 'What do you read?', help: '', required: true }],
      blueprint: { name: '{{answer.genre}} Readers', topics: ['Now reading'], membership: { visibility: 'public' } },
    };
    assert.equal((await c.pa.post('/api/admin/templates', { ...body, category: 'Books' })).body.error.code, 'INVALID_CATEGORY');
    assert.equal((await c.pa.post('/api/admin/templates', { ...body, blueprint: { name: '{{answer.author}}' } })).body.error.code, 'INVALID_BLUEPRINT');
    assert.equal((await c.pa.post('/api/admin/templates', { ...body, questionnaire: [{ key: 'genre', type: 'essay', label: 'x' }] })).body.error.code, 'INVALID_QUESTIONNAIRE');
    const made = await c.pa.post('/api/admin/templates', body, { 'idempotency-key': 'tpl-admin-1' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal((await c.pa.post('/api/admin/templates', body, { 'idempotency-key': 'tpl-admin-1' })).body.template.key, 'book-club');
    assert.equal((await c.pa.post('/api/admin/templates', body)).body.error.code, 'DUPLICATE_KEY');
    assert.equal(made.body.template.status, 'draft');
    assert.equal(made.body.template.draft.version, 1);
    assert.ok(!(await c.mem.get('/api/templates')).body.templates.some((t) => t.key === 'book-club'));
    assert.equal((await c.mem.get('/api/templates/book-club')).body.error.code, 'TEMPLATE_INACTIVE');
    assert.equal((await c.mem.post('/api/communities', { name: 'Draft Readers', visibility: 'public', template: { key: 'book-club', version: 1 } })).body.error.code, 'TEMPLATE_INACTIVE');
    // Two admins: the second save with an old revision is refused (no silent overwrite).
    const rev = made.body.template.revision;
    assert.equal((await c.pa.patch('/api/admin/templates/book-club', { revision: rev, description: 'Read and talk.' })).status, 200);
    assert.equal((await c.sa.patch('/api/admin/templates/book-club', { revision: rev, description: 'Overwrite' })).body.error.code, 'STALE_VERSION');
    const pub = await c.pa.post('/api/admin/templates/book-club/publish', { revision: rev + 1 });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal(pub.body.template.status, 'published');
    assert.equal(pub.body.template.currentVersion, 1);
    assert.equal((await c.mem.get('/api/templates/book-club')).body.template.version, 1);
    assert.equal((await c.pa.post('/api/admin/templates/book-club/publish', { revision: pub.body.template.revision })).body.error.code, 'NO_DRAFT');
  });

  test('TPL-01 an inactive template is refused at publish and validate; the same body without it publishes; communities made from it keep working', async () => {
    const config = await configFor('alumni', ALUMNI, 'Riverside Before Pause');
    const made = (await c.mem.post('/api/communities', config)).body.community;
    assert.equal((await c.pa.post('/api/admin/templates/alumni/deactivate')).body.template.status, 'inactive');
    try {
      assert.ok(!(await c.mem.get('/api/templates')).body.templates.some((t) => t.key === 'alumni'));
      assert.equal((await c.mem.get('/api/templates/alumni')).body.error.code, 'TEMPLATE_INACTIVE');
      assert.equal((await suggest('mem', 'alumni', ALUMNI)).body.error.code, 'TEMPLATE_INACTIVE');
      const refused = await c.mem.post('/api/communities', { ...config, name: 'Riverside After Pause' });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error.code, 'TEMPLATE_INACTIVE');
      assert.equal((await c.mem.post('/api/communities/validate', { ...config, name: 'Riverside After Pause' })).body.error.code, 'TEMPLATE_INACTIVE');
      assert.equal(await count(`select count(*)::int as n from communities where name = 'Riverside After Pause'`), 0);
      assert.equal((await c.mem.get(`/api/communities/${made.id}`)).status, 200);
      // The same configuration without the template is an ordinary scratch community.
      const { template, ...scratch } = config;
      assert.equal((await c.mem.post('/api/communities', { ...scratch, name: 'Riverside After Pause' })).status, 201);
    } finally {
      assert.equal((await c.pa.post('/api/admin/templates/alumni/reactivate')).body.template.status, 'published');
    }
    assert.equal((await c.mem.post('/api/communities', { ...config, name: 'Riverside After Return' })).status, 201);
  });

  test('TPL-02 publishing v2 leaves v1 communities unchanged; a configuration from v1 still publishes as v1; drafts and unknown versions are refused', async () => {
    const v1 = await configFor('alumni', ALUMNI, 'Riverside Version One');
    const old = (await c.mem.post('/api/communities', v1)).body.community;
    const snapshot = async (id) => ({
      row: (await q(`select name, description, category, visibility, settings, template_version from communities where id = $1`, [id])).rows[0],
      topics: (await q(`select name from topics where community_id = $1 order by position`, [id])).rows.map((r) => r.name),
    });
    const before = await snapshot(old.id);

    const admin = (await c.pa.get('/api/admin/templates/alumni')).body.template;
    const blueprint = { ...admin.current.blueprint, topics: ['Welcome', 'Careers'], guidelines: 'Version two guidelines for {institution}.' };
    const questionnaire = [...admin.current.questionnaire, { key: 'city', type: 'text', maxLength: 40, label: 'Which city is the chapter in?', help: '', required: false }];
    const edited = await c.pa.patch('/api/admin/templates/alumni', { revision: admin.revision, blueprint, questionnaire });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.template.draft.version, 2);
    assert.equal(edited.body.template.currentVersion, 1, 'the draft isn’t offered yet');
    assert.equal((await c.mem.get('/api/templates/alumni')).body.template.version, 1);
    assert.equal((await c.pa.post('/api/admin/templates/alumni/publish', { revision: edited.body.template.revision })).body.template.currentVersion, 2);

    // A draft started on version 1 can still finish with it, and is recorded as version 1.
    assert.equal((await c.mem.post('/api/communities/validate', { ...v1, name: 'Riverside Old Wizard' })).status, 200);
    const oldWizard = await c.mem.post('/api/communities', { ...v1, name: 'Riverside Old Wizard' });
    assert.equal(oldWizard.status, 201, JSON.stringify(oldWizard.body));
    assert.equal((await snapshot(oldWizard.body.community.id)).row.template_version, 1);
    // Going back to an answer: version 1's questions and suggestion are still there.
    const again = await suggest('mem', 'alumni', ALUMNI, { version: 1 });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.config.template, { key: 'alumni', version: 1 });
    assert.equal((await c.mem.get('/api/templates/alumni?version=1')).body.template.version, 1);
    assert.equal((await c.mem.get('/api/templates/alumni?version=1')).body.template.currentVersion, 2);
    // A version that doesn't exist, or is only a draft, is refused (400 TEMPLATE_VERSION_UNKNOWN).
    const unknown = await c.mem.post('/api/communities', { ...v1, name: 'Riverside Future Wizard', template: { key: 'alumni', version: 7 } });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'TEMPLATE_VERSION_UNKNOWN');
    assert.equal(unknown.body.error.currentVersion, 2);
    const latest = (await c.pa.get('/api/admin/templates/alumni')).body.template;
    const draft = await c.pa.patch('/api/admin/templates/alumni', { revision: latest.revision, blueprint: { ...latest.current.blueprint, topics: ['Draft topic'] } });
    assert.equal(draft.body.template.draft.version, 3);
    for (const res of [
      await c.mem.post('/api/communities', { ...v1, name: 'Riverside Draft Wizard', template: { key: 'alumni', version: 3 } }),
      await suggest('mem', 'alumni', ALUMNI, { version: 3 }),
      await c.mem.get('/api/templates/alumni?version=3'),
    ]) assert.equal(res.body.error.code, 'TEMPLATE_VERSION_UNKNOWN');
    assert.equal(await count(`select count(*)::int as n from communities where name in ('Riverside Future Wizard', 'Riverside Draft Wizard')`), 0);

    const v2 = await configFor('alumni', { ...ALUMNI, city: 'Pune' }, 'Riverside Version Two');
    assert.deepEqual(v2.template, { key: 'alumni', version: 2 });
    assert.deepEqual(v2.topics, ['Welcome', 'Careers', 'Mentoring', 'Jobs and referrals']);
    const fresh = (await c.mem.post('/api/communities', v2)).body.community;
    assert.equal((await snapshot(fresh.id)).row.template_version, 2);
    assert.deepEqual(await snapshot(old.id), before, 'the v1 community is exactly as it was');
    assert.equal(before.row.template_version, 1);

    const usage = (await c.pa.get('/api/admin/templates')).body.templates.find((t) => t.key === 'alumni');
    assert.equal(usage.versions.find((v) => v.version === 2).communities, 1);
    assert.ok(usage.versions.find((v) => v.version === 1).communities >= 6);
    assert.equal(usage.communities, usage.versions.reduce((n, v) => n + v.communities, 0));
    assert.equal((await c.pa.get('/api/admin/templates/alumni/versions/1')).body.version.blueprint.topics[0], 'Introductions');
  });

  test('TPL-05 a slot no question fills, a rule value no question can have, or an older type is refused, naming the problem', async () => {
    const body = { key: 'garden-club', category: 'Hobbies and Interests', name: 'Garden club',
      questionnaire: [
        { key: 'plant', type: 'text', label: 'What do you grow?', required: true },
        { key: 'size', type: 'choice', multiple: false, label: 'How big?', options: [{ value: 'small', label: 'Small' }, { value: 'large', label: 'Large' }] },
        { key: 'years', type: 'years', label: 'Since when?' },
        { key: 'where', type: 'institution', label: 'Which school garden?' },
      ],
      blueprint: { name: '{plant} Growers', description: 'At {where} since {years}.', eventCategories: ['Planting days'] } };
    const made = await c.pa.post('/api/admin/templates', body);
    assert.equal(made.status, 201, JSON.stringify(made.body));
    let rev = made.body.template.revision;
    const refused = async (change, code, field, pattern) => {
      const res = await c.pa.patch('/api/admin/templates/garden-club', { revision: rev, ...change });
      assert.equal(res.body.error?.code, code, JSON.stringify(change));
      if (field) assert.equal(res.body.error.field, field);
      if (pattern) assert.match(res.body.error.message, pattern);
    };
    await refused({ blueprint: { ...body.blueprint, guidelines: 'Ask {gardener} first.' } }, 'INVALID_BLUEPRINT', 'blueprint.guidelines', /\{gardener\}/);
    await refused({ blueprint: { ...body.blueprint, rules: [{ when: { key: 'size', equals: 'huge' }, add: { topics: ['Big'] } }] } }, 'INVALID_BLUEPRINT', 'blueprint.rules[0]', /huge/);
    await refused({ blueprint: { ...body.blueprint, rules: [{ when: { key: 'size', includes: 'small' }, add: { topics: ['Small'] } }] } }, 'INVALID_BLUEPRINT', 'blueprint.rules[0]', /equals/);
    await refused({ blueprint: { ...body.blueprint, rules: [{ when: { key: 'years', equals: 2000 }, add: { topics: ['Old'] } }] } }, 'INVALID_BLUEPRINT', 'blueprint.rules[0]', /answered/);
    await refused({ blueprint: { ...body.blueprint, eventCategories: ['x'.repeat(41)] } }, 'INVALID_BLUEPRINT', 'blueprint.eventCategories');
    for (const type of ['long_text', 'single_choice', 'multiple_choice', 'yes_no', 'essay']) {
      await refused({ questionnaire: [...body.questionnaire, { key: 'extra', type, label: 'Extra?' }] }, 'INVALID_QUESTIONNAIRE', 'questionnaire[4]', /answer type/);
    }
    await refused({ questionnaire: [{ ...body.questionnaire[0], maxLength: 201 }, ...body.questionnaire.slice(1)] }, 'INVALID_QUESTIONNAIRE', 'questionnaire[0]');
    await refused({ questionnaire: [body.questionnaire[0], { ...body.questionnaire[1], options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] }, ...body.questionnaire.slice(2)] }, 'INVALID_QUESTIONNAIRE', 'questionnaire[1]');
    await refused({ questionnaire: [...body.questionnaire, { key: 'extra', type: 'text', label: 'Extra?', showIf: { key: 'size', equals: 'tiny' } }] }, 'INVALID_QUESTIONNAIRE', 'questionnaire[4]', /tiny/);
    // A draft saved before these checks (here written directly) is refused when published.
    const { rows: [t] } = await q(`select id from community_templates where key = 'garden-club'`);
    await q(`update template_versions set questionnaire = $2 where template_id = $1 and published_at is null`,
      [t.id, JSON.stringify([...body.questionnaire, { key: 'old', type: 'yes_no', label: 'Old style?' }])]);
    const pub = await c.pa.post('/api/admin/templates/garden-club/publish', { revision: rev });
    assert.equal(pub.body.error.code, 'INVALID_QUESTIONNAIRE');
    assert.equal(pub.body.error.field, 'questionnaire[4]');
    await q(`update template_versions set questionnaire = $2, blueprint = $3 where template_id = $1 and published_at is null`,
      [t.id, JSON.stringify(body.questionnaire), JSON.stringify({ ...body.blueprint, topics: ['{nothing}'] })]);
    const slot = await c.pa.post('/api/admin/templates/garden-club/publish', { revision: rev });
    assert.equal(slot.body.error.code, 'INVALID_BLUEPRINT');
    assert.match(slot.body.error.message, /\{nothing\}/);
    await q(`update template_versions set blueprint = $2 where template_id = $1 and published_at is null`, [t.id, JSON.stringify(body.blueprint)]);
    const ok = await c.pa.post('/api/admin/templates/garden-club/publish', { revision: rev });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    rev = ok.body.template.revision;
    const config = await configFor('garden-club', { plant: 'Tomato', years: { from: 2019, to: 2019 }, where: 'inst_riv', size: 'small' });
    assert.equal(config.name, 'Tomato Growers');
    assert.equal(config.description, 'At Riverside College since 2019.');
    assert.deepEqual(config.settings.eventCategories, ['Planting days']);
  });

  test('TPL-06 two staff save the same draft: the second is refused as stale and the first is kept', async () => {
    const t = (await c.pa.get('/api/admin/templates/garden-club')).body.template;
    const first = { ...t.current.blueprint, topics: ['First edit'] };
    const second = { ...t.current.blueprint, topics: ['Second edit'] };
    const a = await c.pa.patch('/api/admin/templates/garden-club', { revision: t.revision, blueprint: first });
    const b = await c.sa.patch('/api/admin/templates/garden-club', { revision: t.revision, blueprint: second });
    assert.equal(a.status, 200);
    assert.equal(b.status, 409);
    assert.equal(b.body.error.code, 'STALE_VERSION');
    const now = (await c.pa.get('/api/admin/templates/garden-club')).body.template;
    assert.deepEqual(now.draft.blueprint.topics, ['First edit']);
    // Publishing with the old revision is refused too.
    assert.equal((await c.sa.post('/api/admin/templates/garden-club/publish', { revision: t.revision })).body.error.code, 'STALE_VERSION');
  });

  test('template administration is audited', async () => {
    const actions = (await q(`select action from audit_log where target_type = 'template' and actor_id in ('pa', 'sa')`)).rows.map((r) => r.action);
    for (const a of ['template.create', 'template.update', 'template.publish', 'template.deactivate', 'template.reactivate']) assert.ok(actions.includes(a), a);
  });
});

describe('F12 data migration: stored questionnaires move to the five types', () => {
  test('F12 converts older question types once, logged, and can be undone', async () => {
    // A template saved before F12, with the six older types and rules on their answers.
    await q(`insert into community_templates (id, key, category, name, status) values ('tpl_old', 'old-style', 'Other', 'Old style', 'draft')`);
    const questionnaire = [
      { key: 'name', type: 'text', label: 'Name?', help: '', required: true },
      { key: 'about', type: 'long_text', label: 'About?', help: '', required: false },
      { key: 'kind', type: 'single_choice', label: 'Kind?', help: '', required: true, options: ['Book club', 'Film club'] },
      { key: 'extras', type: 'multiple_choice', label: 'Extras?', help: '', required: false, options: ['Events', 'Shared resources'] },
      { key: 'tags', type: 'list', label: 'Tags?', help: '', required: false, max: 4 },
      { key: 'paid', type: 'yes_no', label: 'Paid?', help: '', required: false },
      { key: 'fee', type: 'text', label: 'Fee?', help: '', required: false, showIf: { key: 'kind', equals: 'Film club' } },
    ];
    const blueprint = { name: '{{answer.name}}', description: '{{answer.about}}', rules: [
      { when: { key: 'paid', equals: true }, add: { topics: ['Fees'] } },
      { when: { key: 'extras', includes: 'Shared resources' }, add: { sections: ['resources'] } },
    ] };
    await q(`insert into template_versions (template_id, version, questionnaire, blueprint) values ('tpl_old', 1, $1, $2)`, [JSON.stringify(questionnaire), JSON.stringify(blueprint)]);
    const libraryBefore = (await q(`select template_id, questionnaire from template_versions where template_id <> 'tpl_old' order by template_id, version`)).rows;

    const summary = await convertQuestionTypes(env.db);
    assert.deepEqual(summary, { versions: 1, templates: 1 }, 'the library, already converted, is left alone');
    const { rows: [v] } = await q(`select questionnaire, blueprint from template_versions where template_id = 'tpl_old'`);
    assert.deepEqual(v.questionnaire.map((x) => x.type), ['text', 'text', 'choice', 'choice', 'list', 'choice', 'text']);
    assert.deepEqual(v.questionnaire[2].options, [{ value: 'book_club', label: 'Book club' }, { value: 'film_club', label: 'Film club' }]);
    assert.equal(v.questionnaire[2].multiple, false);
    assert.equal(v.questionnaire[3].multiple, true);
    assert.ok(!('max' in v.questionnaire[4]));
    assert.deepEqual(v.questionnaire[5].options.map((o) => o.value), ['yes', 'no']);
    assert.deepEqual(v.questionnaire[6].showIf, { key: 'kind', equals: 'film_club' });
    assert.deepEqual(v.blueprint.rules.map((r) => r.when), [{ key: 'paid', equals: 'yes' }, { key: 'extras', includes: 'shared_resources' }]);
    assert.deepEqual(v.blueprint.name, '{{answer.name}}', 'the older slot spelling is still read, so it is left');
    // The converted version passes the publishing checks.
    const pub = await c.pa.post('/api/admin/templates/old-style/publish', { revision: 1 });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    const config = await configFor('old-style', { name: 'Readers', kind: 'film_club', fee: '5', paid: 'yes', extras: ['shared_resources'] });
    assert.equal(config.name, 'Readers');
    assert.ok(config.topics.includes('Fees'));
    assert.ok(config.settings.sections.includes('resources'));
    assert.deepEqual((await q(`select template_id, questionnaire from template_versions where template_id <> 'tpl_old' order by template_id, version`)).rows, libraryBefore);

    const { rows: log } = await q(`select row_key, before from migration_log where migration = $1`, [F12]);
    assert.deepEqual(log.map((r) => r.row_key), [{ template_id: 'tpl_old', version: 1 }]);
    assert.deepEqual(log[0].before.questionnaire, questionnaire);
    assert.equal(await convertQuestionTypes(env.db), null, 'runs once');
    assert.ok((await q(`select 1 from audit_log where action = 'data_migration.apply' and target_id = $1`, [F12])).rows.length);

    const undo = await undoDataMigration(env.db, F12);
    assert.deepEqual(undo, { restored: 1, skipped: 0 });
    assert.deepEqual((await q(`select questionnaire from template_versions where template_id = 'tpl_old'`)).rows[0].questionnaire, questionnaire);
    assert.equal(await convertQuestionTypes(env.db), null, 'an undone migration doesn’t run again by itself');
  });
});
