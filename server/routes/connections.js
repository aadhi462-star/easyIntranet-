// Connections (request → accept/decline, cancel, remove) and blocks. A block always wins:
// it removes any connection or request between the two, and stops new ones either way.
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { pairOf, relation } from '../lib/relations.js';

const MAX_PENDING_OUT = 100; // limits request spam

export default async function connectionRoutes(app, { ctx }) {
  const { db } = ctx;
  const me = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const activeTarget = async (id) => {
    const { rows } = await db.query(`select id, status from users where id = $1`, [id]);
    if (!rows[0] || rows[0].status !== 'active') throw notFound('That member doesn’t exist.');
    return rows[0];
  };

  app.get('/connections', async (req) => {
    const uid = me(req);
    const { rows } = await db.query(
      // Only the connection's own status is selected: a second "status" column (the user's)
      // would overwrite it in the row and every list would come back empty.
      `select c.status, c.requested_by, c.created_at, c.responded_at, case when c.user_a = $1 then c.user_b else c.user_a end as other_id, u.name
         from connections c join users u on u.id = case when c.user_a = $1 then c.user_b else c.user_a end
        where (c.user_a = $1 or c.user_b = $1) and u.status = 'active'
        order by coalesce(c.responded_at, c.created_at) desc`, [uid]);
    const pick = (fn) => rows.filter(fn).map((r) => ({ id: r.other_id, name: r.name, since: r.responded_at ?? r.created_at }));
    return {
      connected: pick((r) => r.status === 'accepted'),
      incoming: pick((r) => r.status === 'pending' && r.requested_by !== uid),
      outgoing: pick((r) => r.status === 'pending' && r.requested_by === uid),
    };
  });

  app.get('/connections/:id', async (req) => ({ relation: await relation(db, me(req), req.params.id) }));

  // Send a request. If they already asked you, this accepts theirs instead of making a second
  // one; repeating a request is a no-op (MEM-01 pattern: one record per pair).
  app.post('/connections/:id', async (req) => {
    const uid = me(req);
    const other = req.params.id;
    if (other === uid) throw badRequest('SELF_ACTION', 'You can’t connect with yourself.');
    await activeTarget(other);
    const rel = await relation(db, uid, other);
    if (rel.blockedByMe) throw conflict('BLOCKED', 'You’ve blocked this member. Unblock them first.');
    // Same answer as "not found" for someone who blocked you, so blocks aren't revealed.
    if (rel.blockedMe) throw notFound('That member doesn’t exist.');
    if (rel.connection === 'connected') return { relation: rel };
    if (rel.connection === 'outgoing') return { relation: rel };
    const [a, b] = pairOf(uid, other);
    if (rel.connection === 'incoming') {
      await db.query(`update connections set status = 'accepted', responded_at = now() where user_a = $1 and user_b = $2 and status = 'pending'`, [a, b]);
      await audit(db, { actorId: uid, action: 'connection.accept', targetType: 'user', targetId: other, ip: req.ip });
      return { relation: await relation(db, uid, other) };
    }
    const pending = (await db.query(`select count(*)::int as n from connections where requested_by = $1 and status = 'pending'`, [uid])).rows[0].n;
    if (pending >= MAX_PENDING_OUT) throw conflict('TOO_MANY_PENDING', 'You have too many requests waiting. Cancel some before sending more.');
    // `on conflict do nothing` makes two simultaneous requests (or double clicks) end with one row.
    await db.query(`insert into connections (user_a, user_b, requested_by) values ($1, $2, $3) on conflict do nothing`, [a, b, uid]);
    await audit(db, { actorId: uid, action: 'connection.request', targetType: 'user', targetId: other, ip: req.ip });
    return { relation: await relation(db, uid, other) };
  });

  // Accept / decline only a request the other person sent you; stale actions are refused
  // cleanly (MEM-03 pattern).
  for (const action of ['accept', 'decline']) {
    app.post(`/connections/:id/${action}`, async (req) => {
      const uid = me(req);
      const [a, b] = pairOf(uid, req.params.id);
      const q = action === 'accept'
        ? `update connections set status = 'accepted', responded_at = now() where user_a = $1 and user_b = $2 and status = 'pending' and requested_by <> $3 returning 1`
        : `delete from connections where user_a = $1 and user_b = $2 and status = 'pending' and requested_by <> $3 returning 1`;
      const { rows } = await db.query(q, [a, b, uid]);
      if (!rows.length) throw conflict('NO_REQUEST', 'There’s no request from this member to respond to any more.');
      await audit(db, { actorId: uid, action: `connection.${action}`, targetType: 'user', targetId: req.params.id, ip: req.ip });
      return { relation: await relation(db, uid, req.params.id) };
    });
  }

  // Cancel your own request, or remove an existing connection.
  app.delete('/connections/:id', async (req) => {
    const uid = me(req);
    const [a, b] = pairOf(uid, req.params.id);
    const { rows } = await db.query(
      `delete from connections where user_a = $1 and user_b = $2 and (status = 'accepted' or requested_by = $3) returning status`, [a, b, uid]);
    if (rows.length) await audit(db, { actorId: uid, action: rows[0].status === 'accepted' ? 'connection.remove' : 'connection.cancel', targetType: 'user', targetId: req.params.id, ip: req.ip });
    return { relation: await relation(db, uid, req.params.id) };
  });

  app.post('/blocks/:id', async (req) => {
    const uid = me(req);
    const other = req.params.id;
    if (other === uid) throw badRequest('SELF_ACTION', 'You can’t block yourself.');
    const { rows } = await db.query(`select status from users where id = $1`, [other]);
    if (!rows[0]) throw notFound('That member doesn’t exist.');
    // Blocking staff doesn't limit their platform authority (PER-11); it only hides them socially.
    const [a, b] = pairOf(uid, other);
    await db.tx(async (t) => {
      await t.query(`insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [uid, other]);
      await t.query(`delete from connections where user_a = $1 and user_b = $2`, [a, b]);
    });
    await audit(db, { actorId: uid, action: 'block.add', targetType: 'user', targetId: other, ip: req.ip });
    return { relation: await relation(db, uid, other) };
  });

  app.delete('/blocks/:id', async (req) => {
    const uid = me(req);
    await db.query(`delete from blocks where blocker_id = $1 and blocked_id = $2`, [uid, req.params.id]);
    await audit(db, { actorId: uid, action: 'block.remove', targetType: 'user', targetId: req.params.id, ip: req.ip });
    return { relation: await relation(db, uid, req.params.id) };
  });

  app.get('/blocks', async (req) => {
    const uid = me(req);
    const { rows } = await db.query(`select b.blocked_id as id, u.name, b.created_at from blocks b join users u on u.id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`, [uid]);
    return { blocked: rows };
  });
}
