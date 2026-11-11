// Merging one community into another (decision R4: All Hands → AlumniZone), and undoing it.
// The merge moves posts and events, adds the source's active members who have no membership in
// the target yet (never re-adding someone who left, was removed or blocked: the MEM-05 rule),
// then hides the source. Everything moved is recorded, so undo moves back exactly that.
import { audit } from './audit.js';
import { newId } from './crypto.js';
import { badRequest, notFound } from './errors.js';

export async function mergeCommunity(db, { from, to, actorId = null }) {
  if (from === to) throw badRequest('INVALID_INPUT', 'A community can’t be merged into itself.');
  return db.tx(async (t) => {
    const { rows } = await t.query(`select id, status, merged_into from communities where id = any($1) for update`, [[from, to]]);
    const src = rows.find((r) => r.id === from); const dst = rows.find((r) => r.id === to);
    if (!src || !dst) throw notFound('That community doesn’t exist.');
    if (src.merged_into) return null; // already merged: running it again changes nothing
    if (dst.merged_into) throw badRequest('INVALID_INPUT', 'That community was itself merged into another one.');
    const ids = (r) => r.rows.map((x) => x.id);
    const posts = ids(await t.query(`update posts set community_id = $2 where community_id = $1 returning id`, [from, to]));
    const events = ids(await t.query(`update events set community_id = $2 where community_id = $1 returning id`, [from, to]));
    const added = (await t.query(
      `insert into memberships (community_id, user_id, role, state, joined_at)
       select $2, m.user_id, 'member', 'active', now() from memberships m where m.community_id = $1 and m.state = 'active'
       on conflict (community_id, user_id) do nothing returning user_id`, [from, to])).rows.map((r) => r.user_id);
    await t.query(`update communities set merged_into = $2, status = 'archived', version = version + 1 where id = $1`, [from, to]);
    const id = newId('merge');
    await t.query(`insert into community_merges (id, from_id, to_id, moved_posts, moved_events, added_members, previous_status, merged_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8)`, [id, from, to, posts, events, added, src.status, actorId]);
    await audit(t, { actorId, action: 'community.merge', targetType: 'community', targetId: from, context: { into: to, posts: posts.length, events: events.length, members: added.length } });
    return { id, posts: posts.length, events: events.length, members: added.length };
  });
}

/**
 * Undoes a merge: the recorded posts and events that are still in the target move back, and the
 * source comes back with its old status. Posts written in the target since stay there. Members
 * the merge added stay in the target: it's the default community everyone joins (R5) anyway.
 */
export async function undoMerge(db, { from, actorId = null }) {
  return db.tx(async (t) => {
    const { rows: [m] } = await t.query(`select * from community_merges where from_id = $1 and undone_at is null order by merged_at desc limit 1 for update`, [from]);
    if (!m) throw notFound('That community hasn’t been merged.');
    const posts = (await t.query(`update posts set community_id = $1 where id = any($2) and community_id = $3 returning id`, [m.from_id, m.moved_posts, m.to_id])).rows.length;
    const events = (await t.query(`update events set community_id = $1 where id = any($2) and community_id = $3 returning id`, [m.from_id, m.moved_events, m.to_id])).rows.length;
    await t.query(`update communities set merged_into = null, status = $2, version = version + 1 where id = $1`, [m.from_id, m.previous_status]);
    await t.query(`update community_merges set undone_at = now() where id = $1`, [m.id]);
    await audit(t, { actorId, action: 'community.merge_undone', targetType: 'community', targetId: m.from_id, context: { from: m.to_id, posts, events } });
    return { posts, events };
  });
}
