// Data changes that run once, by name (migration 013). Each records every row it changes in
// migration_log, so it can be reported on and undone (server/scripts/undo-data-migration.mjs).
//
// P1 (v2 brief, approved 12 Nov 2026): AlumniZone is an ordinary community. Every account was
// added to it automatically (old decisions D3/R5). Members who took part keep their membership;
// members who were only added automatically become "left", which keeps the record and lets them
// rejoin in one click. Owners, Admins, Moderators, Instructors and Teaching Assistants keep their
// roles. Nobody gains a permission.
import { audit } from './audit.js';
import { CATEGORIES, categoryOf } from './categories.js';
import { badRequest, conflict } from './errors.js';
import { SECTIONS, sectionOn } from './community.js';
import { convertVersion } from './templates.js';

export const P1 = 'p1-alumnizone-ordinary';

// Took part in the community: posted, replied, reacted, voted, acknowledged, hosted or went to an
// event, or enrolled in a course.
const TOOK_PART = `(
     exists (select 1 from posts p where p.community_id = m.community_id and p.author_id = m.user_id)
  or exists (select 1 from comments c join posts p on p.id = c.post_id where p.community_id = m.community_id and c.author_id = m.user_id)
  or exists (select 1 from reactions r join posts p on p.id = r.post_id where p.community_id = m.community_id and r.user_id = m.user_id)
  or exists (select 1 from poll_votes v join posts p on p.id = v.post_id where p.community_id = m.community_id and v.user_id = m.user_id)
  or exists (select 1 from post_acks a join posts p on p.id = a.post_id where p.community_id = m.community_id and a.user_id = m.user_id)
  or exists (select 1 from events e where e.community_id = m.community_id and e.host_id = m.user_id)
  or exists (select 1 from event_rsvps r join events e on e.id = r.event_id where e.community_id = m.community_id and r.user_id = m.user_id)
  or exists (select 1 from enrollments en join courses co on co.id = en.course_id where co.community_id = m.community_id and en.user_id = m.user_id))`;

/** Runs P1 once. Returns its summary, or null if it already ran (or there's nothing to change). */
export async function retireDefaultCommunity(db, { communityId = 'alumnizone' } = {}) {
  const { rows: [done] } = await db.query(`select 1 from data_migrations where name = $1`, [P1]);
  if (done) return null;
  const { rows: [c] } = await db.query(`select id from communities where id = $1`, [communityId]);
  if (!c) return null; // a database without AlumniZone has nothing to change; run again once it's seeded
  return db.tx(async (t) => {
    const { rows } = await t.query(`select m.community_id, m.user_id, m.role, m.state from memberships m
      where m.community_id = $1 and m.state = 'active' and m.role = 'member' and not ${TOOK_PART} for update of m`, [communityId]);
    const summary = { community: communityId, movedToLeft: rows.length,
      kept: (await t.query(`select count(*)::int as n from memberships where community_id = $1 and state in ('active', 'restricted')`, [communityId])).rows[0].n - rows.length };
    await t.query(`insert into data_migrations (name, summary) values ($1, $2)`, [P1, JSON.stringify(summary)]);
    for (const r of rows) {
      await t.query(`update memberships set state = 'left', updated_at = now() where community_id = $1 and user_id = $2`, [r.community_id, r.user_id]);
      await t.query(`insert into migration_log (migration, table_name, row_key, before, after) values ($1, 'memberships', $2, $3, $4)`,
        [P1, JSON.stringify({ community_id: r.community_id, user_id: r.user_id }), JSON.stringify({ state: r.state }), JSON.stringify({ state: 'left' })]);
    }
    await audit(t, { action: 'data_migration.apply', targetType: 'community', targetId: communityId, context: { name: P1, ...summary } });
    return summary;
  });
}

/** Undoes a data migration: rows still as it left them go back; rows changed since are reported. */
export async function undoDataMigration(db, name) {
  const { rows: [m] } = await db.query(`select * from data_migrations where name = $1`, [name]);
  if (!m) throw new Error(`No data migration called ${name}.`);
  if (m.undone_at) return { restored: 0, skipped: 0, alreadyUndone: true };
  return db.tx(async (t) => {
    const { rows } = await t.query(`select * from migration_log where migration = $1 order by id desc`, [name]);
    let restored = 0; let skipped = 0;
    for (const r of rows) {
      let res;
      if (r.table_name === 'memberships') {
        const { community_id: cid, user_id: uid } = r.row_key;
        // Only if they haven't changed it themselves since (rejoined, been removed…).
        res = await t.query(`update memberships set state = $3, updated_at = now() where community_id = $1 and user_id = $2 and state = $4 returning user_id`,
          [cid, uid, r.before.state, r.after.state]);
      } else if (r.table_name === 'communities' && name === E2) {
        // E2: only if nobody has switched sections since (the list is still the one E2 wrote).
        res = await t.query(`update communities set settings = (settings - 'sections') || jsonb_build_object('apps', $2::jsonb), version = version + 1
            where id = $1 and settings->'sections' = $3::jsonb and not (settings ? 'apps') returning id`,
          [r.row_key.id, JSON.stringify(r.before.apps), JSON.stringify(r.after.sections)]);
      } else if (r.table_name === 'communities' && name === G2) {
        // G2: only if no rule has been stored since (the settings allow-list refuses new ones).
        res = await t.query(`update communities set settings = settings || jsonb_build_object('dynamicRule', $2::jsonb), version = version + 1
            where id = $1 and not (settings ? 'dynamicRule') returning id`, [r.row_key.id, JSON.stringify(r.before.dynamicRule)]);
      } else if (r.table_name === 'template_versions' && name === F12) {
        // F12: only if the version hasn't been edited since (a draft can be).
        res = await t.query(`update template_versions set questionnaire = $3::jsonb, blueprint = $4::jsonb
            where template_id = $1 and version = $2 and questionnaire = $5::jsonb and blueprint = $6::jsonb returning version`,
          [r.row_key.template_id, r.row_key.version, JSON.stringify(r.before.questionnaire), JSON.stringify(r.before.blueprint),
            JSON.stringify(r.after.questionnaire), JSON.stringify(r.after.blueprint)]);
      } else if (r.table_name === 'communities') {
        // D6: only if the Owner hasn't picked another category since.
        res = await t.query(`update communities set category = $2, version = version + 1 where id = $1 and category is not distinct from $3 returning id`,
          [r.row_key.id, r.before.category ?? null, r.after.category]);
      } else { skipped += 1; continue; }
      if (res.rows.length) restored += 1; else skipped += 1;
    }
    await t.query(`update data_migrations set undone_at = now() where name = $1`, [name]);
    await audit(t, { action: 'data_migration.undo', targetType: 'data_migration', targetId: name, context: { restored, skipped } });
    return { restored, skipped };
  });
}

// ---- D6 (v2 workstream D, approved 12 Nov 2026): categories set by a reviewed list -------------
// A dry run proposes one of the nine categories for every community from its old type. Platform
// staff check the whole list in Administration and confirm it; only then is it written, once,
// logged row by row (so the undo script can put each previous category back) and audited.
export const D6 = 'd6-categories';
const OLD_TYPES = { department: 'Alumni', batch: 'Alumni', city: 'Alumni', interest: 'Hobbies and Interests', project: 'Organisation' };

/** The category the dry run proposes for a stored category or old type (case-insensitive). */
export function proposeCategory(current) {
  const s = String(current ?? '').trim().toLowerCase();
  return OLD_TYPES[s] ?? categoryOf(s) ?? 'Other';
}

/** Every community that isn't deleted (or merged away), with the proposal. Writes nothing. */
export async function categoryDryRun(db) {
  const { rows } = await db.query(`select id, name, category from communities where status <> 'deleted' and merged_into is null order by lower(name), id`);
  return rows.map((r) => ({ id: r.id, name: r.name, current: r.category ?? null, proposed: proposeCategory(r.category) }));
}

/** What Administration shows: the dry run, or once applied, the confirmed record (read-only). */
export async function categoryReview(db) {
  const { rows: [m] } = await db.query(`select applied_at, summary, undone_at from data_migrations where name = $1`, [D6]);
  if (m && !m.undone_at) return { applied: { at: m.applied_at, by: m.summary.byName ?? null }, rows: m.summary.rows ?? [] };
  return { applied: null, rows: await categoryDryRun(db) };
}

/**
 * Applies the confirmed list: `rows` is [{ id, category }] covering every community the dry run
 * lists. Rows whose category doesn't change aren't written but stay in the confirmed record.
 * The caller has already checked the permission (one connection: nothing else runs inside).
 */
export async function applyCategoryReview(db, { rows: input, actor, ip = null }) {
  const chosen = new Map();
  for (const r of input) {
    const category = categoryOf(r.category);
    if (!category) throw badRequest('INVALID_CATEGORY', `Choose a category for every community: ${CATEGORIES.join(', ')}.`, { field: 'category', id: r.id, categories: CATEGORIES });
    if (chosen.has(r.id)) throw badRequest('DUPLICATE_COMMUNITY', 'Each community can appear only once in the list.', { id: r.id });
    chosen.set(r.id, category);
  }
  return db.tx(async (t) => {
    const { rows: [m] } = await t.query(`select undone_at from data_migrations where name = $1 for update`, [D6]);
    if (m && !m.undone_at) throw conflict('ALREADY_APPLIED', 'The category review has already been applied. Owners can change their own category in community settings.');
    const dry = await categoryDryRun(t);
    const listed = new Set(dry.map((r) => r.id));
    const unknown = [...chosen.keys()].filter((id) => !listed.has(id));
    if (unknown.length) throw badRequest('UNKNOWN_COMMUNITY', 'The list names communities that don’t exist or were deleted. Reload the review and try again.', { ids: unknown });
    const missing = dry.filter((r) => !chosen.has(r.id)).map((r) => r.id);
    if (missing.length) throw badRequest('INCOMPLETE_LIST', 'The list leaves out some communities. Reload the review so every community is included, then try again.', { ids: missing });
    const rows = dry.map((r) => ({ ...r, confirmed: chosen.get(r.id) }));
    const written = rows.filter((r) => r.confirmed !== r.current);
    const summary = { by: actor.id, byName: actor.name ?? null, communities: rows.length, changed: written.length,
      changedByStaff: rows.filter((r) => r.confirmed !== r.proposed).length, rows };
    if (m) {
      // Undone earlier: this run replaces that one (its audit entries keep the history).
      await t.query(`delete from migration_log where migration = $1`, [D6]);
      await t.query(`update data_migrations set applied_at = now(), summary = $2, undone_at = null where name = $1`, [D6, JSON.stringify(summary)]);
    } else {
      await t.query(`insert into data_migrations (name, summary) values ($1, $2)`, [D6, JSON.stringify(summary)]);
    }
    for (const r of written) {
      await t.query(`update communities set category = $2, version = version + 1 where id = $1`, [r.id, r.confirmed]);
      await t.query(`insert into migration_log (migration, table_name, row_key, before, after) values ($1, 'communities', $2, $3, $4)`,
        [D6, JSON.stringify({ id: r.id }), JSON.stringify({ category: r.current }), JSON.stringify({ category: r.confirmed })]);
    }
    const { communities, changed, changedByStaff } = summary;
    await audit(t, { actorId: actor.id, action: 'data_migration.apply', targetType: 'data_migration', targetId: D6, ip,
      context: { name: D6, communities, changed, changedByStaff, staffChanges: rows.filter((r) => r.confirmed !== r.proposed).map((r) => ({ id: r.id, proposed: r.proposed, confirmed: r.confirmed })) } });
    const { rows: [done] } = await t.query(`select applied_at from data_migrations where name = $1`, [D6]);
    return { applied: { at: done.applied_at, by: summary.byName }, rows };
  });
}

// ---- E2 (v2 workstream E, approved 12 Nov 2026): old module lists become section switches -----
// The older settings screens stored settings.apps with the prototype's app names. Each such list
// is replaced, once, by settings.sections holding exactly the sections it shows today
// (lib/community.js sectionOn): feed and forums give Discussions, files and manuals Resources,
// events Events, learning Learning; dashboard and members are dropped (Overview and Members
// always show) and so are the parked apps. Learning follows the read-time rule, so a list from
// the screens that never offered Learning keeps it on, and nobody loses a section they see now.
// A community with no stored list (or one that already has settings.sections, which decides)
// is left alone. Every changed row is logged with its old list, so the undo script puts it back.
export const E2 = 'e2-sections';

/** Runs E2 once. Returns its summary, or null if it already ran (undone counts as ran). */
export async function convertSectionLists(db) {
  const { rows: [done] } = await db.query(`select 1 from data_migrations where name = $1`, [E2]);
  if (done) return null;
  return db.tx(async (t) => {
    const { rows } = await t.query(`select id, settings from communities
      where jsonb_typeof(settings->'apps') = 'array' and not (settings ? 'sections') order by id for update`);
    const changed = rows.map((r) => ({ id: r.id, apps: r.settings.apps, sections: SECTIONS.filter((s) => sectionOn({ settings: { apps: r.settings.apps } }, s)) }));
    const summary = { communities: changed.length, sectionsOff: changed.filter((r) => r.sections.length < SECTIONS.length).length };
    await t.query(`insert into data_migrations (name, summary) values ($1, $2)`, [E2, JSON.stringify(summary)]);
    for (const r of changed) {
      await t.query(`update communities set settings = (settings - 'apps') || jsonb_build_object('sections', $2::jsonb), version = version + 1 where id = $1`,
        [r.id, JSON.stringify(r.sections)]);
      await t.query(`insert into migration_log (migration, table_name, row_key, before, after) values ($1, 'communities', $2, $3, $4)`,
        [E2, JSON.stringify({ id: r.id }), JSON.stringify({ apps: r.apps }), JSON.stringify({ sections: r.sections })]);
    }
    await audit(t, { action: 'data_migration.apply', targetType: 'data_migration', targetId: E2, context: { name: E2, ...summary } });
    return summary;
  });
}

// ---- F12 (v2 workstream F, approved 12 Nov 2026): five question types -------------------------
// Template versions saved before F12 used six question types. Each stored questionnaire (every
// version, published or draft) is converted, once, by lib/templates.js convertVersion: long_text
// becomes text, single_choice and multiple_choice become choice, yes_no becomes a choice of Yes
// and No, and the rules and conditions that used the old answers use the new option values. The
// version number doesn't change: the questions ask the same things and suggest the same
// configuration. Every changed row is logged with its old content, so the undo script puts it back.
export const F12 = 'f12-question-types';

/** Runs F12 once. Returns its summary, or null if it already ran (undone counts as ran). */
export async function convertQuestionTypes(db) {
  const { rows: [done] } = await db.query(`select 1 from data_migrations where name = $1`, [F12]);
  if (done) return null;
  return db.tx(async (t) => {
    const { rows } = await t.query(`select template_id, version, questionnaire, blueprint from template_versions order by template_id, version for update`);
    const changed = [];
    for (const r of rows) {
      const after = convertVersion(r.questionnaire, r.blueprint);
      if (JSON.stringify(after.questionnaire) === JSON.stringify(r.questionnaire) && JSON.stringify(after.blueprint) === JSON.stringify(r.blueprint)) continue;
      changed.push({ ...r, after });
    }
    const summary = { versions: changed.length, templates: new Set(changed.map((r) => r.template_id)).size };
    await t.query(`insert into data_migrations (name, summary) values ($1, $2)`, [F12, JSON.stringify(summary)]);
    for (const r of changed) {
      await t.query(`update template_versions set questionnaire = $3::jsonb, blueprint = $4::jsonb where template_id = $1 and version = $2`,
        [r.template_id, r.version, JSON.stringify(r.after.questionnaire), JSON.stringify(r.after.blueprint)]);
      await t.query(`insert into migration_log (migration, table_name, row_key, before, after) values ($1, 'template_versions', $2, $3, $4)`,
        [F12, JSON.stringify({ template_id: r.template_id, version: r.version }), JSON.stringify({ questionnaire: r.questionnaire, blueprint: r.blueprint }),
          JSON.stringify({ questionnaire: r.after.questionnaire, blueprint: r.after.blueprint })]);
    }
    await audit(t, { action: 'data_migration.apply', targetType: 'data_migration', targetId: F12, context: { name: F12, ...summary } });
    return summary;
  });
}

// ---- G2 (v2 workstream G, approved 12 Nov 2026): automatic membership rules retire -----------
// The older settings screens stored settings.dynamicRule ({ field, op, value }), which added
// everyone who matched straight into the community. Nobody is added to a community they didn't
// choose any more: the rule is replaced by "Invite people who match" (POST
// /communities/:id/invite-matching), which only sends invitations. Every stored rule is switched
// off, once, by taking it out of the settings; the old rule is logged so the undo script puts it
// back. Nobody already added is removed: memberships aren't touched.
export const G2 = 'g2-retire-membership-rules';

/** Runs G2 once. Returns its summary, or null if it already ran (undone counts as ran). */
export async function retireMembershipRules(db) {
  const { rows: [done] } = await db.query(`select 1 from data_migrations where name = $1`, [G2]);
  if (done) return null;
  return db.tx(async (t) => {
    const { rows } = await t.query(`select id, settings->'dynamicRule' as rule from communities where settings ? 'dynamicRule' order by id for update`);
    const summary = { communities: rows.length, rules: rows.filter((r) => r.rule && String(r.rule.value ?? '').trim()).length };
    await t.query(`insert into data_migrations (name, summary) values ($1, $2)`, [G2, JSON.stringify(summary)]);
    for (const r of rows) {
      await t.query(`update communities set settings = settings - 'dynamicRule', version = version + 1 where id = $1`, [r.id]);
      await t.query(`insert into migration_log (migration, table_name, row_key, before, after) values ($1, 'communities', $2, $3, $4)`,
        [G2, JSON.stringify({ id: r.id }), JSON.stringify({ dynamicRule: r.rule }), JSON.stringify({ dynamicRule: null })]);
    }
    await audit(t, { action: 'data_migration.apply', targetType: 'data_migration', targetId: G2, context: { name: G2, ...summary } });
    return summary;
  });
}
