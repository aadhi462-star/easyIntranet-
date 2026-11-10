// How two members relate: connection state and blocks. Shared by connections, profiles and
// the directory so privacy decisions always use the same answer.
export const pairOf = (x, y) => (x < y ? [x, y] : [y, x]);

/** { connection: 'none'|'outgoing'|'incoming'|'connected', blockedByMe, blockedMe } */
export async function relation(db, viewerId, otherId) {
  if (!viewerId || !otherId || viewerId === otherId) return { connection: 'self', blockedByMe: false, blockedMe: false };
  const [a, b] = pairOf(viewerId, otherId);
  const { rows } = await db.query(
    `select (select status from connections where user_a = $1 and user_b = $2) as status,
            (select requested_by from connections where user_a = $1 and user_b = $2) as requested_by,
            exists (select 1 from blocks where blocker_id = $3 and blocked_id = $4) as blocked_by_me,
            exists (select 1 from blocks where blocker_id = $4 and blocked_id = $3) as blocked_me`, [a, b, viewerId, otherId]);
  const r = rows[0];
  const connection = !r.status ? 'none' : r.status === 'accepted' ? 'connected' : r.requested_by === viewerId ? 'outgoing' : 'incoming';
  return { connection, blockedByMe: r.blocked_by_me, blockedMe: r.blocked_me };
}

/** SQL condition: neither `viewerParam` nor the row's `userCol` has blocked the other. */
export const notBlockedSql = (userCol, viewerParam) =>
  `not exists (select 1 from blocks bl where (bl.blocker_id = ${viewerParam} and bl.blocked_id = ${userCol}) or (bl.blocker_id = ${userCol} and bl.blocked_id = ${viewerParam}))`;
