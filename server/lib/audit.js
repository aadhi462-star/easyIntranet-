// Append-only audit trail for sensitive actions (who, what, target, when, from where, context).
export async function audit(db, { actorId = null, action, targetType = null, targetId = null, context = {}, ip = null }) {
  await db.query(
    `insert into audit_log (actor_id, action, target_type, target_id, context, ip) values ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, targetType, targetId, JSON.stringify(context), ip],
  );
}
