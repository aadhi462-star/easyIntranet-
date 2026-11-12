// Invitations to a community (v2 workstream F; MASTER_BRIEF_V2 Part 5). Owners and Admins invite
// people by account or by email; an invitation is the only way into a Closed community, and for a
// Private one it counts as the admins' approval. MEM-*, VIS-* and NTF-* cases are referenced where
// handled.
//
// - The token is in the emailed link only. The database keeps its SHA-256 (like sessions), and
//   the token never goes into the audit log, notifications or request logs: the routes that take
//   it in their path log at warn level, so Fastify's "incoming request" lines (which carry the
//   URL) are not written for them.
// - Every rule is checked again when the invitation is accepted: the community's status, the
//   inviter's authority (MEM-11), the person's membership state (blocked, removed since) and the
//   account it was sent to (VIS-09).
// - An invitation by email is about the address only, as far as the Admin can tell: the answer,
//   the list row and the audit entry are the same whichever account (if any) holds the address,
//   so invitations can't be used to look accounts up by email. The account behind it decides only
//   whether anything is sent (a member, a blocked person or a suspended account gets nothing).
// - PGlite has one connection: inside db.tx only `t` is used; checks run before it.
import { audit } from '../lib/audit.js';
import { access, atLeast } from '../lib/community.js';
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { newId, newToken, sha256 } from '../lib/crypto.js';
import { notify } from '../lib/notify.js';
import { idempotent } from '../lib/session.js';

const DAYS = 14;
const PER_CALL = 50;
// Emails sent for one community (new invitations and resends, by every inviter together) over 24
// hours: bulk invitations are a spam route.
const PER_DAY = 200;
// One invitation is sent again at most once an hour, so a resend can't flood one person.
const RESEND_AFTER = '1 hour';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const text = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

const OPEN = `i.accepted_at is null and i.revoked_at is null and i.superseded_at is null and i.declined_at is null`;
const STATUS = `case when i.accepted_at is not null then 'accepted' when i.declined_at is not null then 'declined' when i.revoked_at is not null then 'revoked'
  when i.superseded_at is not null or i.expires_at <= now() then 'expired' else 'open' end`;
const STATUSES = ['open', 'accepted', 'declined', 'expired', 'revoked'];

// A dead link says why, and what to do next (VIS-10, NTF-05). 410: the link existed but is spent.
const ASK = 'Ask the person who invited you for a new one.';
const DEAD = {
  expired: () => new HttpError(410, 'INVITE_EXPIRED', `This invitation has expired. ${ASK}`),
  revoked: () => new HttpError(410, 'INVITE_REVOKED', `This invitation was withdrawn. ${ASK}`),
  accepted: () => new HttpError(410, 'INVITE_USED', `This invitation has already been used. ${ASK}`),
  declined: () => new HttpError(410, 'INVITE_DECLINED', `You declined this invitation. ${ASK}`),
};
const invalid = () => new HttpError(404, 'INVITE_INVALID', `This invitation link isn’t valid. Check the link, or ${ASK.charAt(0).toLowerCase()}${ASK.slice(1)}`);

export default async function invitationRoutes(app, { ctx }) {
  const { db, mailer } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };
  const origin = (req) => ctx.appOrigin || `${req.protocol}://${req.headers.host}`;
  // Per signed-in person for invite and resend, per address for the token routes. Tests turn
  // them off except where the limit itself is under test.
  const limit = (max, byUser) => ({ config: { rateLimit: ctx.rateLimits ? { max, timeWindow: '1 minute', ...(byUser ? { keyGenerator: (req) => req.user?.id ?? req.ip } : {}) } : false } });
  const quiet = { logLevel: 'warn' };

  const load = async (where, params) => (await db.query(
    `select i.*, ${STATUS} as status, c.name as community_name, c.slug as community_slug, c.visibility, c.status as community_status, c.merged_into,
            u.name as user_name, ib.name as invited_by_name, ab.name as accepted_by_name, rb.name as revoked_by_name
       from community_invitations i join communities c on c.id = i.community_id
       left join users u on u.id = i.user_id left join users ib on ib.id = i.invited_by
       left join users ab on ab.id = i.accepted_by left join users rb on rb.id = i.revoked_by
      where ${where}`, params)).rows;

  // What Owners and Admins see. An email invitation shows the address they typed, never which
  // account (if any) it belongs to, so the list can't be used to look accounts up by email.
  const present = (i) => ({
    id: i.id, email: i.email, user: i.user_id ? { id: i.user_id, name: i.user_name } : null, role: i.role, status: i.status, message: i.message,
    invitedBy: i.invited_by ? { id: i.invited_by, name: i.invited_by_name } : null, createdAt: i.created_at, sentAt: i.sent_at, expiresAt: i.expires_at,
    acceptedAt: i.accepted_at, acceptedBy: i.accepted_by ? { id: i.accepted_by, name: i.accepted_by_name } : null,
    revokedAt: i.revoked_at, revokedBy: i.revoked_by ? { id: i.revoked_by, name: i.revoked_by_name } : null,
    declinedAt: i.declined_at,
  });

  // Owners and Admins with a real membership invite. Administrative Mode never changes
  // membership, so platform staff don't invite through it.
  const inviterAccess = async (req, communityId) => {
    const a = await access(db, req, communityId);
    if (!atLeast(a.role, 'admin')) throw forbidden('Only Owners and Admins can invite people.');
    if (a.community.status !== 'active') throw conflict('COMMUNITY_UNAVAILABLE', 'This community isn’t accepting new members right now.');
    return a;
  };

  /**
   * Throws unless the invitation can still be used: open, not expired, the community active, and
   * the inviter still an Owner or Admin who outranks the role offered (MEM-11, MEM-14). The
   * community's visibility may have changed since; the invitation still applies to it.
   */
  async function usable(i) {
    if (i.status !== 'open') throw DEAD[i.status]();
    if (i.community_status === 'deleted') throw new HttpError(404, 'COMMUNITY_REMOVED', 'This community has been removed.');
    // A merged community (R4) takes no members of its own any more.
    if (i.community_status !== 'active' || i.merged_into) throw conflict('COMMUNITY_UNAVAILABLE', 'This community isn’t accepting new members right now.');
    const { rows: [by] } = await db.query(`select m.role, m.state, u.status from memberships m join users u on u.id = m.user_id
      where m.community_id = $1 and m.user_id = $2`, [i.community_id, i.invited_by]);
    if (!by || by.state !== 'active' || by.status !== 'active' || !atLeast(by.role, 'admin') || atLeast(i.role, by.role)) {
      throw conflict('INVITER_NOT_ALLOWED', 'The person who invited you can no longer invite people to this community. Ask a community admin for a new invitation.');
    }
  }

  // An invitation by account is for that account only; one by email, for the account whose
  // verified email it is (VIS-09: a forwarded link doesn't work for anyone else).
  const forAccount = (i, user) => (i.user_id ? i.user_id === user.id : user.emailVerified && i.email === normEmail(user.email));

  /**
   * Why `me` can't invite this account now, or null if they can (MEM-05): the same rules for a new
   * invitation and a resend. Blocked from the community comes first; an invitation can't undo it.
   * A person who was removed can be invited back by an Owner or Admin (the only inviters), and
   * accepting brings them back.
   */
  async function ineligible(communityId, userId, me) {
    const { rows: [u] } = await db.query(`select status from users where id = $1`, [userId]);
    if (!u || u.status === 'deleted') return { code: 'NOT_FOUND', message: 'There’s no account like that.' };
    if (u.status !== 'active') return { code: 'ACCOUNT_UNAVAILABLE', message: 'This account isn’t active, so it can’t be invited.' };
    if (userId === me.id) return { code: 'SELF_INVITE', message: 'You can’t invite yourself.' };
    const { rows: [m] } = await db.query(`select state from memberships where community_id = $1 and user_id = $2`, [communityId, userId]);
    if (m?.state === 'active' || m?.state === 'restricted') return { code: 'ALREADY_MEMBER', message: 'This person is already a member.' };
    if (m?.state === 'blocked') return { code: 'BLOCKED', message: 'This person is blocked from this community. Unblock them before inviting them.' };
    const { rows: [b] } = await db.query(`select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`, [me.id, userId]);
    if (b) return { code: 'CANNOT_INVITE', message: 'You can’t invite this person.' };
    return null;
  }

  // The account whose verified email an address is (a deleted account has given its address up).
  const holderOf = async (email) => (await db.query(`select id from users where email_norm = $1 and email_verified_at is not null and status <> 'deleted'`, [email])).rows[0]?.id ?? null;

  // Removed from the community after this link was sent: that decision is newer, so it's void.
  const removedSince = async (i, userId) => {
    const { rows: [m] } = await db.query(`select state, updated_at from memberships where community_id = $1 and user_id = $2`, [i.community_id, userId]);
    return m?.state === 'removed' && new Date(m.updated_at) > new Date(i.sent_at);
  };

  // Emails sent for a community in the last 24 hours. Every new invitation and every resend is in
  // the audit log, which is the record of what went out.
  const sentToday = async (communityId) => (await db.query(`select count(*)::int as n from audit_log
    where target_type = 'community' and target_id = $1 and action in ('community.invite', 'community.invite_resend') and at > now() - interval '1 day'`, [communityId])).rows[0].n;

  // `notifyId`: the account to tell in the app too (an account invitation's, or the holder of the
  // address an email invitation went to).
  async function sendInvite(req, i, { to, token, inviter, communityName, notifyId }) {
    // The community and the inviter only: no message, no content (NTF-06).
    await mailer.send(to, 'community_invite', { community: communityName, inviter, link: `${origin(req)}/#/invite/c/${token}`, days: DAYS }, { req });
    // People already on CommunityOne also see it in the app (without the token: the
    // notification points at their list of invitations).
    if (notifyId) {
      await notify(ctx, req, { to: [notifyId], type: 'community_invite', actorId: req.user.id, communityId: i.community_id,
        targetType: 'invitation', targetId: i.id, dedupe: `invite:${i.id}:${Date.now()}`, email: false });
    }
  }

  // ---- Owners and Admins --------------------------------------------------------------------

  // Invite up to 50 people by account or email. Each person gets one result: `invited`, `open`
  // (they already have an open invitation, which is returned: MEM-12) or `skipped` with a code.
  app.post('/communities/:id/invitations', {
    ...limit(10, true),
    schema: { body: { type: 'object', additionalProperties: false, properties: {
      userIds: { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: PER_CALL },
      emails: { type: 'array', items: { type: 'string', maxLength: 254 }, maxItems: PER_CALL },
      role: { type: 'string', enum: ['member', 'moderator', 'admin'] }, message: { type: ['string', 'null'], maxLength: 500 } } } },
  }, async (req, reply) => idempotent(db, req, reply, () => invite(req, reply, req.body)));

  // F10: "adding" people to a community invites them, through exactly the same path and with the
  // same answer as POST /communities/:id/invitations: nobody becomes a member without accepting.
  // `source: 'rule'` (an automatic membership rule) also skips people who left on their own.
  app.post('/communities/:id/members', {
    ...limit(10, true),
    schema: { body: { type: 'object', required: ['userIds'], additionalProperties: false, properties: {
      userIds: { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: PER_CALL }, source: { type: 'string', enum: ['admin', 'rule'] } } } },
  }, async (req, reply) => idempotent(db, req, reply, () => invite(req, reply, { userIds: req.body.userIds, role: 'member' }, { rule: req.body.source === 'rule' })));

  async function invite(req, reply, body, { rule = false } = {}) {
    signedIn(req);
    const a = await inviterAccess(req, req.params.id);
    const c = a.community;
    const role = body.role ?? 'member';
    // Nobody offers a role equal to or above their own (PER-02): Owners can invite Admins,
    // Admins can invite Moderators.
    if (atLeast(role, a.role)) throw forbidden('You can’t invite someone to a role equal to or above your own.', 'ROLE_TOO_HIGH');
    const emails = [...new Set((body.emails ?? []).map(normEmail))];
    const userIds = [...new Set(body.userIds ?? [])];
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) throw badRequest('INVALID_EMAIL', `“${bad.slice(0, 80)}” isn’t a valid email address.`, { field: 'emails' });
    const total = emails.length + userIds.length;
    if (!total) throw badRequest('INVALID_INPUT', 'Choose at least one person to invite.');
    if (total > PER_CALL) throw badRequest('TOO_MANY', `Invite up to ${PER_CALL} people at a time.`);
    // Checked once for the batch, so two batches at the same moment can go over by one batch at
    // most (and each person makes at most 10 calls a minute).
    const n = await sentToday(c.id);
    if (n + total > PER_DAY) throw new HttpError(429, 'INVITE_LIMIT', `This community can send up to ${PER_DAY} invitations a day. Try again tomorrow, or invite fewer people.`, { remaining: Math.max(0, PER_DAY - n) });
    const message = text(body.message, 500);
    const results = [];
    for (const userId of userIds) results.push(await inviteOne(req, a, { userId }, { role, message, rule }));
    for (const email of emails) results.push(await inviteOne(req, a, { email }, { role, message }));
    if (results.some((r) => r.status === 'invited')) reply.status(201);
    return { results };
  }

  async function inviteOne(req, a, to, { role, message, rule = false }) {
    const c = a.community;
    const me = req.user;
    const skip = (code, msg) => ({ ...to, status: 'skipped', code, message: msg });
    // Who this is: an account, or an address. For an account, the Admin is told why it can't be
    // invited. For an address, only whether it's their own: the account that holds it (if any)
    // decides whether anything is sent, never the answer (see the top of this file).
    let userId = null; let email = null; let address = null; let notifyId = null; let send = true;
    if (to.userId) {
      const no = await ineligible(c.id, to.userId, me);
      if (no) return skip(no.code, no.message);
      if (rule) {
        const { rows: [m] } = await db.query(`select state from memberships where community_id = $1 and user_id = $2`, [c.id, to.userId]);
        if (m?.state === 'left') return skip('LEFT', 'This person left the community, so a membership rule doesn’t invite them again.');
      }
      userId = to.userId; notifyId = userId;
      address = (await db.query(`select email from users where id = $1`, [userId])).rows[0].email;
    } else {
      email = to.email; address = email;
      if (email === normEmail(me.email)) return skip('SELF_INVITE', 'You can’t invite yourself.');
      const holder = await holderOf(email);
      if (holder) { send = !(await ineligible(c.id, holder, me)); notifyId = holder; }
    }
    const key = userId ? ['user_id', userId] : ['email', email];
    const openFor = () => load(`i.community_id = $1 and ${OPEN} and i.${key[0]} = $2`, [c.id, key[1]]);
    // One open invitation per community and account (or address): a second invite returns it
    // (MEM-12). An expired one is set aside (kept for the history) and a new one is made, and so is
    // one the account was removed since (it can't be accepted any more). For an address the open
    // one is returned even then, as for anyone else; resending it renews it.
    for (const i of await openFor()) {
      if (i.status === 'open' && !(userId && await removedSince(i, userId))) return { ...to, status: 'open', invitation: present(i) };
      await db.query(`update community_invitations set superseded_at = now() where id = $1 and superseded_at is null`, [i.id]);
    }
    const { token, hash } = newToken();
    const id = newId('inv');
    const { rows } = await db.query(
      `insert into community_invitations (id, community_id, email, user_id, role, token_hash, invited_by, message, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9::int)) on conflict do nothing returning id`,
      [id, c.id, email, userId, role, hash, me.id, message, DAYS]);
    if (!rows.length) {
      // Another request invited them a moment ago.
      const [i] = await openFor();
      if (i) return { ...to, status: 'open', invitation: present(i) };
      throw conflict('IN_PROGRESS', 'Someone is inviting this person right now. Try again in a moment.');
    }
    const [i] = await load(`i.id = $1`, [id]);
    // The same entry whether or not anything is sent (an inviter's data export includes it).
    await audit(db, { actorId: me.id, action: 'community.invite', targetType: 'community', targetId: c.id, context: { invitationId: id, userId, byEmail: !!email, role, ...(rule ? { source: 'rule' } : {}) }, ip: req.ip });
    if (send) await sendInvite(req, i, { to: address, token, inviter: me.name, communityName: c.name, notifyId });
    return { ...to, status: 'invited', invitation: present(i) };
  }

  // Every invitation of a community, newest first: open, accepted, declined, expired and revoked.
  app.get('/communities/:id/invitations', async (req) => {
    signedIn(req);
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only Owners and Admins can see invitations.');
    const status = STATUSES.includes(req.query.status) ? req.query.status : null;
    const rows = await load(`i.community_id = $1 and ($2::text is null or ${STATUS} = $2::text) order by i.created_at desc limit 500`, [a.community.id, status]);
    return { invitations: rows.map(present) };
  });

  // Revoke. Safe to repeat; an accepted invitation can't be revoked (remove the member instead).
  app.delete('/invitations/:id', async (req) => {
    const uid = signedIn(req);
    const [i] = await load(`i.id = $1`, [req.params.id]);
    if (!i) throw notFound('That invitation doesn’t exist.');
    const a = await access(db, req, i.community_id);
    if (!a.canAdmin) throw notFound('That invitation doesn’t exist.');
    if (i.status === 'accepted') throw conflict('INVITE_USED', 'This invitation was already accepted. Remove the member instead.');
    if (!i.revoked_at && !i.declined_at) {
      await db.query(`update community_invitations set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null and accepted_at is null and declined_at is null`, [i.id, uid]);
      await audit(db, { actorId: uid, action: 'community.invite_revoke', targetType: 'community', targetId: i.community_id, context: { invitationId: i.id, adminMode: a.adminMode }, ip: req.ip });
    }
    const [now] = await load(`i.id = $1`, [i.id]);
    return { invitation: present(now) };
  });

  // Send again: a new link and 14 more days. The old link stops working (MEM-12), so a resend
  // can also renew an expired invitation.
  app.post('/invitations/:id/resend', { ...limit(10, true) }, async (req) => {
    const uid = signedIn(req);
    const [i] = await load(`i.id = $1`, [req.params.id]);
    if (!i) throw notFound('That invitation doesn’t exist.');
    const a = await inviterAccess(req, i.community_id);
    if (['accepted', 'revoked', 'declined'].includes(i.status)) throw DEAD[i.status]();
    if (i.superseded_at) throw conflict('INVITE_REPLACED', 'A newer invitation replaced this one.');
    if (atLeast(i.role, a.role)) throw forbidden('You can’t invite someone to a role equal to or above your own.', 'ROLE_TOO_HIGH');
    // The same per-person rules as a new invitation, for whoever resends (MEM-05). An account
    // invitation is refused with the reason; an email one, like a new one, just isn't sent.
    let send = true; let notifyId = i.user_id;
    if (i.user_id) {
      const no = await ineligible(i.community_id, i.user_id, req.user);
      if (no) throw conflict(no.code, no.message);
    } else {
      notifyId = await holderOf(i.email);
      if (notifyId) send = !(await ineligible(i.community_id, notifyId, req.user));
    }
    const { rows: [{ recent }] } = await db.query(`select $1::timestamptz > now() - $2::interval as recent`, [i.sent_at, RESEND_AFTER]);
    if (recent) throw new HttpError(429, 'RESEND_TOO_SOON', 'This invitation was sent less than an hour ago. Try again later.');
    if (await sentToday(i.community_id) >= PER_DAY) throw new HttpError(429, 'INVITE_LIMIT', `This community can send up to ${PER_DAY} invitations a day. Try again tomorrow.`, { remaining: 0 });
    const { token, hash } = newToken();
    // A new link moves `sent_at`, so a removal before now no longer voids it.
    const { rows } = await db.query(`update community_invitations set token_hash = $2, invited_by = $3, sent_at = now(), expires_at = now() + make_interval(days => $4::int)
      where id = $1 and accepted_at is null and revoked_at is null and superseded_at is null and declined_at is null returning id`, [i.id, hash, uid, DAYS]);
    if (!rows.length) throw conflict('INVITE_CHANGED', 'This invitation changed. Reload to see it.');
    await audit(db, { actorId: uid, action: 'community.invite_resend', targetType: 'community', targetId: i.community_id, context: { invitationId: i.id }, ip: req.ip });
    const [now] = await load(`i.id = $1`, [i.id]);
    const to = i.email ?? (await db.query(`select email from users where id = $1`, [i.user_id])).rows[0].email;
    if (send) await sendInvite(req, now, { to, token, inviter: req.user.name, communityName: i.community_name, notifyId });
    return { invitation: present(now) };
  });

  // ---- The person invited -------------------------------------------------------------------

  // Your open invitations (for the in-app notification, which never carries the token). One per
  // community: someone invited both by account and by address sees the newer.
  app.get('/me/invitations', async (req) => {
    signedIn(req);
    const seen = new Set();
    const rows = (await load(`${OPEN} and i.expires_at > now() and c.status = 'active' and c.merged_into is null
      and ((i.user_id = $1) or (i.user_id is null and $3::boolean and i.email = $2)) order by i.created_at desc`,
    [req.user.id, normEmail(req.user.email), req.user.emailVerified])).filter((i) => !seen.has(i.community_id) && seen.add(i.community_id));
    return { invitations: rows.map((i) => ({ id: i.id, community: { name: i.community_name, visibility: i.visibility }, inviter: { name: i.invited_by_name }, role: i.role, message: i.message, expiresAt: i.expires_at })) };
  });

  // Preview: who invited you and to what, only while the invitation can be used. Signed out is
  // fine (the person may need to create an account first).
  app.get('/invitations/:token', { ...quiet, ...limit(30) }, async (req) => {
    const [i] = await load(`i.token_hash = $1`, [sha256(req.params.token)]);
    if (!i) throw invalid();
    await usable(i);
    const forYou = req.user ? forAccount(i, req.user) : null;
    return { invitation: {
      community: { name: i.community_name, visibility: i.visibility }, inviter: { name: i.invited_by_name }, role: i.role, expiresAt: i.expires_at, forYou,
      // The inviter's note is for the person invited, so only their own account sees it.
      message: forYou ? i.message : undefined,
    } };
  });

  app.post('/invitations/:token/accept', { ...quiet, ...limit(30) }, async (req) => {
    signedIn(req);
    const [i] = await load(`i.token_hash = $1`, [sha256(req.params.token)]);
    if (!i) throw invalid();
    return accept(req, i);
  });

  // The same, from the in-app list: only for the account the invitation is for.
  app.post('/me/invitations/:id/accept', async (req) => {
    signedIn(req);
    const [i] = await load(`i.id = $1`, [req.params.id]);
    if (!i || !forAccount(i, req.user)) throw notFound('That invitation doesn’t exist.');
    return accept(req, i);
  });

  // F9: decline. By link (signed in as the account it's for, or signed out: the link is the
  // invitee's alone) or from the in-app list. Safe to repeat: a second decline gives the same
  // answer. An accepted invitation can't be declined (leave the community instead); an expired or
  // revoked one is over already and says so. The inviter is told in the app, never by email.
  app.post('/invitations/:token/decline', { ...quiet, ...limit(30) }, async (req) => {
    const [i] = await load(`i.token_hash = $1`, [sha256(req.params.token)]);
    if (!i) throw invalid();
    return decline(req, i);
  });

  app.post('/me/invitations/:id/decline', async (req) => {
    signedIn(req);
    const [i] = await load(`i.id = $1`, [req.params.id]);
    if (!i || !forAccount(i, req.user)) throw notFound('That invitation doesn’t exist.');
    return decline(req, i);
  });

  async function decline(req, i) {
    const uid = req.user?.id ?? null;
    if (req.user && !forAccount(i, req.user)) {
      throw forbidden(`This invitation was sent to someone else. Sign in with the account it was sent to, or ${ASK.charAt(0).toLowerCase()}${ASK.slice(1)}`, 'WRONG_ACCOUNT');
    }
    if (i.status === 'declined') return declined(i);
    if (i.status !== 'open') throw DEAD[i.status]();
    try {
      await db.tx(async (t) => {
        const { rows } = await t.query(`update community_invitations set declined_at = now(), declined_by = $2
          where id = $1 and accepted_at is null and revoked_at is null and superseded_at is null and declined_at is null returning id`, [i.id, uid]);
        if (!rows.length) throw conflict('INVITE_CHANGED', 'This invitation just changed.');
        // Invited both by account and by address: saying no to one says no to both.
        if (req.user) {
          await t.query(`update community_invitations i set declined_at = now(), declined_by = $2
            where i.community_id = $3 and i.id <> $1 and ${OPEN} and (i.user_id = $2 or (i.user_id is null and $5::boolean and i.email = $4))`,
          [i.id, uid, i.community_id, normEmail(req.user.email), req.user.emailVerified]);
        }
      });
    } catch (err) {
      if (err.code !== 'INVITE_CHANGED') throw err;
      const [now] = await load(`i.id = $1`, [i.id]);
      if (now.status === 'declined') return declined(now);
      throw DEAD[now.status]?.() ?? err;
    }
    await audit(db, { actorId: uid, action: 'community.invite_decline', targetType: 'community', targetId: i.community_id, context: { invitationId: i.id, signedIn: !!uid }, ip: req.ip });
    // The inviter learns who said no only for an invitation by account: an email invitation
    // never reveals which account (if any) holds the address.
    if (i.invited_by) {
      await notify(ctx, req, { to: [i.invited_by], type: 'invite_declined', actorId: i.user_id ?? null, communityId: i.community_id,
        targetType: 'community', targetId: i.community_id, dedupe: `invite_declined:${i.id}`, email: false });
    }
    const [now] = await load(`i.id = $1`, [i.id]);
    return declined(now);
  }

  const declined = (i) => ({ invitation: { id: i.id, status: 'declined', declinedAt: i.declined_at, community: { name: i.community_name, visibility: i.visibility } } });

  async function accept(req, i) {
    const uid = req.user.id;
    // A second click (or a second tab) after it worked: the same answer, not an error.
    if (i.status === 'accepted' && i.accepted_by === uid) return accepted(i, uid);
    await usable(i);
    if (!forAccount(i, req.user)) {
      throw forbidden(`This invitation was sent to someone else. Sign in with the account it was sent to, or ${ASK.charAt(0).toLowerCase()}${ASK.slice(1)}`, 'WRONG_ACCOUNT');
    }
    const { rows: [m] } = await db.query(`select state from memberships where community_id = $1 and user_id = $2`, [i.community_id, uid]);
    if (m?.state === 'blocked') throw forbidden('You can’t join this community.', 'BLOCKED');
    // Removed after this link was sent (a resend sends a new one): that decision is newer.
    if (await removedSince(i, uid)) {
      throw conflict('REMOVED_AFTER_INVITE', `You were removed from this community after this invitation was sent. ${ASK}`);
    }
    const already = m?.state === 'active' || m?.state === 'restricted';
    try {
      await db.tx(async (t) => {
        const { rows } = await t.query(`update community_invitations set accepted_at = now(), accepted_by = $2
          where id = $1 and accepted_at is null and revoked_at is null and superseded_at is null and declined_at is null and expires_at > now() returning id`, [i.id, uid]);
        if (!rows.length) throw conflict('INVITE_CHANGED', 'This invitation just changed.');
        // Invited both by account and by address: the other one is used up with this one.
        await t.query(`update community_invitations i set accepted_at = now(), accepted_by = $2
          where i.community_id = $3 and i.id <> $1 and ${OPEN} and (i.user_id = $2 or (i.user_id is null and $5::boolean and i.email = $4))`,
        [i.id, uid, i.community_id, normEmail(req.user.email), req.user.emailVerified]);
        // A pending request becomes the membership (MEM-13: one record, one path); a Private
        // community's approval step is skipped, since the invitation is the approval.
        if (!already) {
          await t.query(
            `insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now())
             on conflict (community_id, user_id) do update set state = 'active', role = excluded.role, joined_at = now(), request_message = null, updated_at = now()
               where memberships.state in ('left', 'invited', 'pending', 'removed')`, [i.community_id, uid, i.role]);
        }
      });
    } catch (err) {
      if (err.code !== 'INVITE_CHANGED') throw err;
      const [now] = await load(`i.id = $1`, [i.id]);
      if (now.status === 'accepted' && now.accepted_by === uid) return accepted(now, uid);
      throw DEAD[now.status]?.() ?? err;
    }
    await audit(db, { actorId: uid, action: 'community.invite_accept', targetType: 'community', targetId: i.community_id, context: { invitationId: i.id, role: i.role, from: m?.state ?? null }, ip: req.ip });
    return accepted(i, uid);
  }

  async function accepted(i, uid) {
    const { rows: [m] } = await db.query(`select state, role from memberships where community_id = $1 and user_id = $2`, [i.community_id, uid]);
    return { community: { id: i.community_id, slug: i.community_slug, name: i.community_name }, membership: m ? { state: m.state, role: m.role } : null };
  }
}
