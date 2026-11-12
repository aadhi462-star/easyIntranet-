// Community templates (v2 brief, Part 4; PROPOSAL_V2 §5). Two plugins:
//   - templateRoutes (/api): the published templates a person can create from, and the
//     suggestion step (answers → configuration). Creating the community is POST /communities.
//   - templateAdminRoutes (/api/admin): Platform Admin template administration: create a draft,
//     edit it, publish it as the next version, deactivate and reactivate, and see usage.
//
// PGlite has one connection: inside db.tx only `t` is used, and permission checks run first.
import { audit } from '../lib/audit.js';
import { CATEGORIES, checkCategory } from '../lib/categories.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, HttpError } from '../lib/errors.js';
import { authorize } from '../lib/permissions.js';
import { idempotent } from '../lib/session.js';
import { assertCanCreate, checkAnswers, checkPublishable, seedTemplates, suggestConfig, usableTemplate, validateBlueprint, validateQuestionnaire } from '../lib/templates.js';
import { UNIQUE_VIOLATION } from '../db/index.js';

const card = (t) => ({ key: t.key, category: t.category, name: t.name, description: t.description, version: t.current_version, questions: (t.questionnaire ?? []).length });

export default async function templateRoutes(app, { ctx }) {
  const { db } = ctx;
  // The starting library, once per database (a no-op when every key is already there).
  await seedTemplates(db);

  // Shown only to people who may create a community (the Stage 7 "who can create" setting).
  app.get('/templates', async (req) => {
    await assertCanCreate(db, req.user);
    const { rows } = await db.query(
      `select t.*, v.questionnaire from community_templates t join template_versions v on v.template_id = t.id and v.version = t.current_version
        where t.status = 'published'`);
    const order = (t) => { const i = CATEGORIES.indexOf(t.category); return i < 0 ? CATEGORIES.length : i; };
    return { templates: rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)).map(card) };
  });

  app.get('/templates/:key', async (req) => {
    await assertCanCreate(db, req.user);
    const t = await usableTemplate(db, req.params.key);
    return { template: { ...card(t), questionnaire: t.questionnaire, blueprint: t.blueprint } };
  });

  // Answers → a suggested configuration. Pure: nothing is written. Sending the version the form
  // was built from catches a template republished while someone was answering.
  app.post('/templates/:key/suggest', { schema: { body: { type: 'object', required: ['answers'], additionalProperties: false, properties: {
    answers: { type: 'object' }, version: { type: 'integer' } } } } }, async (req) => {
    await assertCanCreate(db, req.user);
    const t = await usableTemplate(db, req.params.key);
    if (req.body.version != null && req.body.version !== t.current_version) {
      throw conflict('TEMPLATE_VERSION_CHANGED', `This template was updated to version ${t.current_version}. Its questions may have changed.`, { currentVersion: t.current_version });
    }
    return { config: suggestConfig(t, checkAnswers(t.questionnaire, req.body.answers)) };
  });
}

export async function templateAdminRoutes(app, { ctx }) {
  const { db } = ctx;
  const manage = (req) => authorize(req.user, 'templates.manage');
  const load = async (key) => {
    const { rows: [t] } = await db.query(`select * from community_templates where lower(key) = lower($1)`, [String(key)]);
    if (!t) throw new HttpError(404, 'TEMPLATE_NOT_FOUND', 'That template doesn’t exist.');
    return t;
  };
  const text = (v, field, { min = 0, max }) => {
    const s = String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    if (s.length < min || s.length > max) throw badRequest('INVALID_INPUT', `Use ${min}–${max} characters.`, { field });
    return s || null;
  };
  // Versions with how many communities (not deleted) were made from each.
  const versionsOf = async (id) => (await db.query(
    `select v.version, v.created_at, v.published_at, u.name as published_by,
            (select count(*)::int from communities c where c.template_id = v.template_id and c.template_version = v.version and c.status <> 'deleted') as communities
       from template_versions v left join users u on u.id = v.published_by where v.template_id = $1 order by v.version desc`, [id])).rows
    .map((v) => ({ version: v.version, createdAt: v.created_at, publishedAt: v.published_at, publishedBy: v.published_by, communities: v.communities, draft: !v.published_at }));
  const summary = async (t) => {
    const versions = await versionsOf(t.id);
    return { key: t.key, category: t.category, name: t.name, description: t.description, status: t.status, currentVersion: t.current_version, revision: t.revision,
      createdAt: t.created_at, communities: versions.reduce((n, v) => n + v.communities, 0), versions };
  };
  const detail = async (t) => {
    const { rows } = await db.query(`select version, questionnaire, blueprint, published_at from template_versions where template_id = $1 and (version = $2 or published_at is null)`, [t.id, t.current_version ?? 0]);
    const pick = (draft) => rows.find((r) => !r.published_at === draft);
    const content = (r) => r && { version: r.version, questionnaire: r.questionnaire, blueprint: r.blueprint };
    return { ...(await summary(t)), current: content(pick(false)) ?? null, draft: content(pick(true)) ?? null };
  };

  app.get('/templates', async (req) => {
    manage(req);
    const { rows } = await db.query(`select * from community_templates order by status = 'inactive', name`);
    return { templates: await Promise.all(rows.map(summary)) };
  });

  app.get('/templates/:key', async (req) => {
    manage(req);
    return { template: await detail(await load(req.params.key)) };
  });

  app.get('/templates/:key/versions/:version', async (req) => {
    manage(req);
    const t = await load(req.params.key);
    const { rows: [v] } = await db.query(`select version, questionnaire, blueprint, published_at from template_versions where template_id = $1 and version = $2`, [t.id, Number(req.params.version) || 0]);
    if (!v) throw new HttpError(404, 'VERSION_NOT_FOUND', 'That version doesn’t exist.');
    return { version: { version: v.version, questionnaire: v.questionnaire, blueprint: v.blueprint, publishedAt: v.published_at } };
  });

  // A new template starts as a draft (version 1, unpublished): nobody can use it yet.
  app.post('/templates', { schema: { body: { type: 'object', required: ['key', 'category', 'name'], additionalProperties: false, properties: {
    key: { type: 'string' }, category: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] },
    questionnaire: { type: 'array' }, blueprint: { type: 'object' } } } } }, async (req, reply) => idempotent(db, req, reply, async () => {
    manage(req);
    const b = req.body;
    const key = String(b.key).trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(key)) throw badRequest('INVALID_INPUT', 'A key is 2–40 lowercase letters, digits and hyphens, starting with a letter.', { field: 'key' });
    const category = checkCategory(b.category);
    const name = text(b.name, 'name', { min: 2, max: 80 });
    const description = text(b.description, 'description', { max: 1000 });
    const questionnaire = validateQuestionnaire(b.questionnaire ?? []);
    const blueprint = validateBlueprint(b.blueprint ?? {}, questionnaire);
    const id = newId('tpl');
    try {
      await db.tx(async (t) => {
        await t.query(`insert into community_templates (id, key, category, name, description, created_by) values ($1, $2, $3, $4, $5, $6)`, [id, key, category, name, description, req.user.id]);
        await t.query(`insert into template_versions (template_id, version, questionnaire, blueprint) values ($1, 1, $2, $3)`, [id, JSON.stringify(questionnaire), JSON.stringify(blueprint)]);
      });
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE_KEY', 'Another template already uses that key.', { field: 'key' });
      throw err;
    }
    await audit(db, { actorId: req.user.id, action: 'template.create', targetType: 'template', targetId: id, context: { key, name }, ip: req.ip });
    reply.status(201);
    return { template: await detail(await load(key)) };
  }));

  // Edits go to the draft; the published versions never change. Editing a published template's
  // questions or blueprint starts a draft for the next version from the current one. Name,
  // description and category are not versioned. `revision` stops two admins overwriting each other.
  app.patch('/templates/:key', { schema: { body: { type: 'object', required: ['revision'], additionalProperties: false, properties: {
    revision: { type: 'integer' }, category: { type: 'string' }, name: { type: 'string' }, description: { type: ['string', 'null'] },
    questionnaire: { type: 'array' }, blueprint: { type: 'object' } } } } }, async (req) => {
    manage(req);
    const t = await load(req.params.key);
    const b = req.body;
    const category = 'category' in b ? checkCategory(b.category) : t.category;
    const name = 'name' in b ? text(b.name, 'name', { min: 2, max: 80 }) : t.name;
    const description = 'description' in b ? text(b.description, 'description', { max: 1000 }) : t.description;
    const content = 'questionnaire' in b || 'blueprint' in b;
    let draft = null;
    if (content) {
      const { rows: [base] } = await db.query(`select version, questionnaire, blueprint, published_at from template_versions where template_id = $1 and (published_at is null or version = $2)
        order by published_at is null desc limit 1`, [t.id, t.current_version ?? 0]);
      const questionnaire = validateQuestionnaire(b.questionnaire ?? base.questionnaire);
      const blueprint = validateBlueprint(b.blueprint ?? base.blueprint, questionnaire);
      draft = { version: base.published_at ? base.version + 1 : base.version, questionnaire, blueprint, isNew: !!base.published_at };
    }
    await db.tx(async (tx) => {
      const { rows } = await tx.query(`update community_templates set category = $3, name = $4, description = $5, revision = revision + 1 where id = $1 and revision = $2 returning id`,
        [t.id, b.revision, category, name, description]);
      if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed this template. Reload to see the latest version.');
      if (draft?.isNew) {
        await tx.query(`insert into template_versions (template_id, version, questionnaire, blueprint) values ($1, $2, $3, $4)`, [t.id, draft.version, JSON.stringify(draft.questionnaire), JSON.stringify(draft.blueprint)]);
      } else if (draft) {
        await tx.query(`update template_versions set questionnaire = $3, blueprint = $4 where template_id = $1 and version = $2 and published_at is null`, [t.id, draft.version, JSON.stringify(draft.questionnaire), JSON.stringify(draft.blueprint)]);
      }
    });
    await audit(db, { actorId: req.user.id, action: 'template.update', targetType: 'template', targetId: t.id,
      context: { key: t.key, fields: Object.keys(b).filter((k) => k !== 'revision'), draftVersion: draft?.version }, ip: req.ip });
    return { template: await detail(await load(t.key)) };
  });

  // Publishing makes the draft the current version. Communities made from earlier versions keep
  // their own configuration and their recorded version; new ones get this version.
  app.post('/templates/:key/publish', { schema: { body: { type: 'object', required: ['revision'], additionalProperties: false, properties: { revision: { type: 'integer' } } } } }, async (req) => {
    manage(req);
    const t = await load(req.params.key);
    const { rows: [d] } = await db.query(`select version, questionnaire, blueprint from template_versions where template_id = $1 and published_at is null`, [t.id]);
    if (!d) throw conflict('NO_DRAFT', 'There are no unpublished changes to publish.');
    checkPublishable(t, d.questionnaire, d.blueprint);
    await db.tx(async (tx) => {
      const { rows } = await tx.query(`update community_templates set current_version = $3, status = case when status = 'draft' then 'published' else status end, revision = revision + 1
        where id = $1 and revision = $2 returning id`, [t.id, req.body.revision, d.version]);
      if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed this template. Reload to see the latest version.');
      await tx.query(`update template_versions set published_at = now(), published_by = $3 where template_id = $1 and version = $2`, [t.id, d.version, req.user.id]);
    });
    await audit(db, { actorId: req.user.id, action: 'template.publish', targetType: 'template', targetId: t.id, context: { key: t.key, version: d.version, previous: t.current_version }, ip: req.ip });
    return { template: await detail(await load(t.key)) };
  });

  // Inactive: hidden from creation; communities already made from it keep working.
  for (const [action, from, to] of [['deactivate', 'published', 'inactive'], ['reactivate', 'inactive', 'published']]) {
    app.post(`/templates/:key/${action}`, async (req) => {
      manage(req);
      const t = await load(req.params.key);
      if (t.status === to) return { template: await detail(t) };
      if (t.status !== from) throw conflict('NOT_PUBLISHED', 'Publish this template before changing whether it’s offered.');
      await db.query(`update community_templates set status = $2, revision = revision + 1 where id = $1 and status = $3`, [t.id, to, from]);
      await audit(db, { actorId: req.user.id, action: `template.${action}`, targetType: 'template', targetId: t.id, context: { key: t.key }, ip: req.ip });
      return { template: await detail(await load(t.key)) };
    });
  }
}
