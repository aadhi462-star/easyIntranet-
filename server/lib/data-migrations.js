// Data changes that run once, by name (migration 013). Each records every row it changes in
// migration_log, so it can be reported on and undone (server/scripts/undo-data-migration.mjs).
//
// P1 (v2 brief, approved 12 Nov 2026): AlumniZone is an ordinary community. Every account was
// added to it automatically (old decisions D3/R5). Members who took part keep their membership;
// members who were only added automatically become "left", which keeps the record and lets them
// rejoin in one click. Owners, Admins, Moderators, Instructors and Teaching Assistants keep their
// roles. Nobody gains a permission.
import { audit } from './audit.js';

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
      if (r.table_name !== 'memberships') { skipped += 1; continue; }
      const { community_id: cid, user_id: uid } = r.row_key;
      // Only if they haven't changed it themselves since (rejoined, been removed…).
      const res = await t.query(`update memberships set state = $3, updated_at = now() where community_id = $1 and user_id = $2 and state = $4 returning user_id`,
        [cid, uid, r.before.state, r.after.state]);
      if (res.rows.length) restored += 1; else skipped += 1;
    }
    await t.query(`update data_migrations set undone_at = now() where name = $1`, [name]);
    await audit(t, { action: 'data_migration.undo', targetType: 'data_migration', targetId: name, context: { restored, skipped } });
    return { restored, skipped };
  });
}
