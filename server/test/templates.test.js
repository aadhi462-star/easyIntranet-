// Community templates (v2 brief, Part 4; PROPOSAL_V2 §5): categories, questionnaires and
// suggestions, creating from a template and from scratch, versions and template administration.
// EDGE_CASE_REGISTER.md IDs are in the names where the register has them.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { CATEGORIES } from '../lib/categories.js';

let env; const c = {};
const PEOPLE = { mem: [], two: [], pa: ['platform_admin'], sa: ['super_admin'], cm: ['community_manager'], sup: ['support_agent'] };
const q = (s, p) => env.db.query(s, p);
before(async () => {
  env = await setup();
  for (const [id, roles] of Object.entries(PEOPLE)) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase(), roles });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
});
after(async () => { await env.close(); });

const ALUMNI = { institution: 'Riverside College', departments: ['Civil Engineering', 'Physics'], who_can_join: 'Graduates approved by an admin', goals: ['Mentoring', 'Jobs and referrals'], talks: true };
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
    assert.deepEqual([...new Set((await Promise.all(res.body.templates.map(async (t) => (await c.mem.get(`/api/templates/${t.key}`)).body.template.questionnaire)))
      .flat().map((x) => x.type))].sort(), ['list', 'long_text', 'multiple_choice', 'single_choice', 'text', 'yes_no']);
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
  test('COM-10 a suggestion names every missing required answer and writes nothing', async () => {
    const n = await count(`select count(*)::int as n from communities`);
    const res = await suggest('mem', 'alumni', { grad_years: '2015 to 2020' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'ANSWERS_REQUIRED');
    assert.deepEqual(res.body.error.fields, ['institution', 'who_can_join', 'goals']);
    assert.equal((await suggest('mem', 'alumni', { ...ALUMNI, favourite: 'x' })).body.error.code, 'UNKNOWN_ANSWER');
    assert.equal((await suggest('mem', 'alumni', { ...ALUMNI, who_can_join: 'Everyone on Earth' })).body.error.code, 'INVALID_ANSWER');
    assert.equal((await suggest('mem', 'alumni', { ...ALUMNI, talks: 'yes' })).body.error.code, 'INVALID_ANSWER');
    assert.equal((await suggest('mem', 'alumni', { ...ALUMNI, departments: ['A', 'B', 'C', 'D', 'E'] })).body.error.code, 'INVALID_ANSWER');
    assert.equal(await count(`select count(*)::int as n from communities`), n);
  });

  test('answers fill the placeholders and rules into a plain configuration', async () => {
    const config = await configFor('alumni', ALUMNI);
    assert.equal(config.name, 'Riverside College Alumni');
    // The unanswered graduation years leave no empty brackets.
    assert.equal(config.description, 'The alumni community of Riverside College. Stay in touch with classmates, find mentors and hear about reunions.');
    assert.equal(config.category, 'Alumni');
    assert.equal(config.visibility, 'private');
    assert.deepEqual(config.topics, ['Introductions', 'Announcements', 'Civil Engineering', 'Physics', 'Careers', 'Mentoring', 'Jobs and referrals']);
    assert.ok(config.settings.apps.includes('learning'));
    assert.deepEqual(config.settings.roles, ['moderator', 'instructor']);
    assert.ok(config.settings.resourceCategories.includes('Job leads'));
    assert.match(config.settings.guidelines, /alumni of Riverside College\./);
    assert.deepEqual(config.template, { key: 'alumni', version: 1 });
    assert.ok(!JSON.stringify(config).includes('{{'), 'no placeholder is left');
    // Without the rule's answers, the defaults stay.
    const plain = await configFor('alumni', { institution: 'Hill School', who_can_join: 'Anyone who studied there', goals: ['Networking'], grad_years: '1990 to 2000' });
    assert.equal(plain.visibility, 'public');
    assert.ok(!plain.settings.apps.includes('learning'));
    assert.match(plain.description, /of Hill School \(1990 to 2000\)\./);
  });

  test('only the relevant questions count: a hidden question’s answer is ignored', async () => {
    const base = { organisation: 'Northwind', who: 'Staff or members, by invitation', volunteers: true };
    const company = await configFor('organisation', { ...base, kind: 'Company or employer' });
    assert.ok(!company.topics.includes('Volunteering'));
    const charity = await configFor('organisation', { ...base, kind: 'Non-profit or charity' });
    assert.ok(charity.topics.includes('Volunteering'));
    assert.equal(charity.visibility, 'closed');
  });

  test('every library template turns sample answers into a configuration that can be created', async () => {
    const answers = {
      education: { programme: 'Grade 10 Science', subjects: ['Physics', 'Chemistry'], audience: 'One class, by invitation', co_teachers: true },
      'professional-networking': { field: 'Product Design', region: 'Pune', career_stage: ['Early career'], offerings: ['Job posts', 'Skills sessions'], vetted: false },
      technology: { focus: 'Rust', kind: 'Open source project', events: 'Hackathons', areas: ['Compiler'] },
      business: { business: 'Acme Tools', audience: 'Customers', support: true, admins_post: true },
      'hobbies-and-interests': { interest: 'Film photography', location: 'Kochi', experience: 'Mostly beginners', activities: ['Meet up'] },
      'general-community': { community_name: 'Night Owls', about: 'People who work late.', openness: 'Invitation only', features: ['Events'] },
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
  });
});

describe('creating a community from a template or from scratch', () => {
  let a; let b;
  test('COM-12 two communities from one template are independent', async () => {
    const config = await configFor('alumni', ALUMNI);
    a = (await c.mem.post('/api/communities', { ...config, name: 'Riverside Alumni North' })).body.community;
    b = (await c.mem.post('/api/communities', { ...config, name: 'Riverside Alumni South' })).body.community;
    assert.ok(a?.id && b?.id && a.id !== b.id);
    const rows = (await q(`select id, template_id, template_version, settings, category, visibility from communities where id = any($1) order by name`, [[a.id, b.id]])).rows;
    const tpl = (await q(`select id from community_templates where key = 'alumni'`)).rows[0].id;
    assert.ok(rows.every((r) => r.template_id === tpl && r.template_version === 1 && r.category === 'Alumni' && r.visibility === 'private'));
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

describe('template administration and versions', () => {
  test('PER-16 only Platform Admins and Super Admins manage templates', async () => {
    for (const who of ['mem', 'cm', 'sup']) {
      assert.equal((await c[who].get('/api/admin/templates')).status, 403, who);
      assert.equal((await c[who].post('/api/admin/templates/alumni/deactivate')).status, 403, who);
      assert.equal((await c[who].post('/api/admin/templates', { key: 'nope', category: 'Other', name: 'Nope' })).status, 403, who);
    }
    assert.equal((await c.pa.get('/api/admin/templates')).status, 200);
    assert.equal((await c.sa.get('/api/admin/templates')).status, 200);
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

  test('an inactive template is refused; communities made from it keep working', async () => {
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

  test('publishing v2 leaves communities made from v1 unchanged and recorded as v1', async () => {
    const v1 = await configFor('alumni', ALUMNI, 'Riverside Version One');
    const old = (await c.mem.post('/api/communities', v1)).body.community;
    const snapshot = async (id) => ({
      row: (await q(`select name, description, category, visibility, settings, template_version from communities where id = $1`, [id])).rows[0],
      topics: (await q(`select name from topics where community_id = $1 order by position`, [id])).rows.map((r) => r.name),
    });
    const before = await snapshot(old.id);

    const admin = (await c.pa.get('/api/admin/templates/alumni')).body.template;
    const blueprint = { ...admin.current.blueprint, topics: ['Welcome', 'Careers'], guidelines: 'Version two guidelines for {{answer.institution}}.' };
    const questionnaire = [...admin.current.questionnaire, { key: 'city', type: 'text', label: 'Which city is the chapter in?', help: '', required: false }];
    const edited = await c.pa.patch('/api/admin/templates/alumni', { revision: admin.revision, blueprint, questionnaire });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.template.draft.version, 2);
    assert.equal(edited.body.template.currentVersion, 1, 'the draft isn’t offered yet');
    assert.equal((await c.mem.get('/api/templates/alumni')).body.template.version, 1);
    assert.equal((await c.pa.post('/api/admin/templates/alumni/publish', { revision: edited.body.template.revision })).body.template.currentVersion, 2);

    // A wizard still on version 1 is told the current version, for both steps.
    const stale = await c.mem.post('/api/communities', { ...v1, name: 'Riverside Stale Wizard' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'TEMPLATE_VERSION_CHANGED');
    assert.equal(stale.body.error.currentVersion, 2);
    assert.equal((await suggest('mem', 'alumni', ALUMNI, { version: 1 })).body.error.currentVersion, 2);

    const v2 = await configFor('alumni', { ...ALUMNI, city: 'Pune' }, 'Riverside Version Two');
    assert.deepEqual(v2.template, { key: 'alumni', version: 2 });
    assert.deepEqual(v2.topics, ['Welcome', 'Careers', 'Mentoring', 'Jobs and referrals']);
    const fresh = (await c.mem.post('/api/communities', v2)).body.community;
    assert.equal((await snapshot(fresh.id)).row.template_version, 2);
    assert.deepEqual(await snapshot(old.id), before, 'the v1 community is exactly as it was');
    assert.equal(before.row.template_version, 1);

    const usage = (await c.pa.get('/api/admin/templates')).body.templates.find((t) => t.key === 'alumni');
    assert.equal(usage.versions.find((v) => v.version === 2).communities, 1);
    assert.ok(usage.versions.find((v) => v.version === 1).communities >= 5);
    assert.equal(usage.communities, usage.versions.reduce((n, v) => n + v.communities, 0));
    assert.equal((await c.pa.get('/api/admin/templates/alumni/versions/1')).body.version.blueprint.topics[0], 'Introductions');
  });

  test('template administration is audited', async () => {
    const actions = (await q(`select action from audit_log where target_type = 'template' and actor_id in ('pa', 'sa')`)).rows.map((r) => r.action);
    for (const a of ['template.create', 'template.update', 'template.publish', 'template.deactivate', 'template.reactivate']) assert.ok(actions.includes(a), a);
  });
});
