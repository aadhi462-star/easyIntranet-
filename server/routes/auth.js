// Account lifecycle: register → verify → sign in → reset/change password → change email →
// deactivate/reactivate → delete. Edge cases REG-01…18 are referenced where they're handled.
import { UNIQUE_VIOLATION } from '../db/index.js';
import { audit } from '../lib/audit.js';
import { hashPassword, newId, newToken, passwordProblem, sha256, verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, HttpError, unauthorized } from '../lib/errors.js';
import { endSession, idempotent, revokeAllSessions, startSession } from '../lib/session.js';
import { getSetting } from '../lib/settings.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOUR = 3600e3;
const TTL = { verify_email: 24 * HOUR, reset_password: HOUR, change_email: 24 * HOUR };
// Same response whether or not the account exists (REG-10).
const PRIVACY_SAFE = { ok: true, message: 'If an account exists for that email, we’ve sent instructions to it.' };
// Spent on unknown emails so sign-in timing doesn't reveal which accounts exist.
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

const normEmail = (e) => String(e || '').trim().toLowerCase();
export const publicUser = (u, roles = []) => ({ id: u.id, name: u.name, email: u.email, status: u.status,
  emailVerified: !!(u.email_verified_at ?? u.emailVerified), pendingEmail: u.pending_email ?? u.pendingEmail ?? null, roles });

export default async function authRoutes(app, { ctx }) {
  const { db, mailer } = ctx;
  // Per-IP limits on every auth endpoint (REG-11, REG-17). Tests turn them off except where
  // the limit itself is under test.
  const authLimit = (max) => ({ config: { rateLimit: ctx.rateLimits ? { max, timeWindow: '1 minute' } : false } });
  const origin = (req) => ctx.appOrigin || `${req.protocol}://${req.headers.host}`;
  const link = (req, page, token) => `${origin(req)}/#/${page}?token=${encodeURIComponent(token)}`;

  // Issues a one-time token. Earlier unused tokens of the same purpose stop working (REG-06).
  async function issueToken(t, userId, purpose, payload = {}) {
    await t.query(`update auth_tokens set superseded_at = now() where user_id = $1 and purpose = $2 and used_at is null and superseded_at is null`, [userId, purpose]);
    const { token, hash } = newToken();
    await t.query(`insert into auth_tokens (user_id, purpose, token_hash, payload, expires_at) values ($1, $2, $3, $4, $5)`,
      [userId, purpose, hash, JSON.stringify(payload), new Date(Date.now() + TTL[purpose])]);
    return token;
  }

  // Consumes a token atomically: only one request can ever use it (REG-05, REG-11).
  async function consumeToken(t, token, purpose) {
    const { rows } = await t.query(
      `update auth_tokens set used_at = now()
        where token_hash = $1 and purpose = $2 and used_at is null and superseded_at is null and expires_at > now()
        returning user_id, payload`, [sha256(token), purpose]);
    if (!rows.length) throw badRequest('INVALID_TOKEN', 'This link has expired or was already used. Request a new one.');
    return rows[0];
  }

  const rolesOf = async (userId) => (await db.query(`select role from platform_roles where user_id = $1`, [userId])).rows.map((r) => r.role);
  const security = async () => (await getSetting(db, 'security')) ?? { sessionDays: 14, maxFailedLogins: 5, lockMinutes: 15 };
  const signIn = async (reply, req, user) => {
    await startSession(db, reply, user, req, { days: (await security()).sessionDays, secure: ctx.secure });
    return { user: publicUser(user, await rolesOf(user.id)) };
  };

  // ---- Registration -------------------------------------------------------------------------
  app.post('/auth/register', {
    ...authLimit(10),
    schema: { body: { type: 'object', required: ['name', 'email', 'password'], additionalProperties: false, properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 }, email: { type: 'string', maxLength: 254 },
      password: { type: 'string', maxLength: 200 }, acceptedGuidelines: { type: 'boolean' } } } },
  }, async (req, reply) => idempotent(db, req, reply, async () => {
    const name = req.body.name.trim();
    const email = req.body.email.trim();
    if (!name) throw badRequest('INVALID_INPUT', 'Enter your name.', { field: 'name' });
    if (!EMAIL_RE.test(email)) throw badRequest('INVALID_EMAIL', 'Enter a valid email address.', { field: 'email' });
    const pwProblem = passwordProblem(req.body.password);
    if (pwProblem) throw badRequest('WEAK_PASSWORD', pwProblem, { field: 'password' });
    const reg = await getSetting(db, 'registration');
    if (!reg.open) throw forbidden('Sign-ups are closed right now. Ask a community admin for an invitation.', 'REGISTRATION_CLOSED');
    const domain = email.split('@')[1].toLowerCase();
    if (reg.allowedDomains?.length && !reg.allowedDomains.includes(domain)) {
      throw forbidden(`Sign-ups are limited to: ${reg.allowedDomains.join(', ')}.`, 'DOMAIN_NOT_ALLOWED');
    }
    const id = newId('usr');
    const passwordHash = await hashPassword(req.body.password);
    try {
      const token = await db.tx(async (t) => {
        await t.query(`insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)`, [id, email, name, passwordHash]);
        await t.query(`insert into profiles (user_id, avatar_hue) values ($1, $2)`, [id, Math.floor(Math.random() * 360)]);
        return issueToken(t, id, 'verify_email');
      });
      await mailer.send(email, 'verify_email', { name, link: link(req, 'verify', token) });
      await audit(db, { actorId: id, action: 'account.register', targetType: 'user', targetId: id, ip: req.ip });
      reply.status(201);
      return { user: { id, name, email, status: 'unverified' }, message: 'Check your email to confirm your account.' };
    } catch (err) {
      // The unique index decides races between simultaneous sign-ups (REG-01, REG-02).
      if (err.code === UNIQUE_VIOLATION) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in, or reset your password if you’ve forgotten it.', { field: 'email' });
      throw err;
    }
  }));

  app.post('/auth/verify', { ...authLimit(20), schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 200 } } } } },
    async (req, reply) => {
      // Read outside the transaction: inside it, only `t` may be used (PGlite runs one
      // statement at a time, so a query on `db` would wait on the open transaction forever).
      const reg = await getSetting(db, 'registration');
      const user = await db.tx(async (t) => {
        const { user_id: userId } = await consumeToken(t, req.body.token, 'verify_email');
        const { rows } = await t.query(
          `update users set email_verified_at = coalesce(email_verified_at, now()),
                  status = case when status = 'unverified' then $2 else status end, updated_at = now(), version = version + 1
            where id = $1 returning *`, [userId, reg.requireApproval ? 'pending_approval' : 'active']);
        return rows[0];
      });
      await audit(db, { actorId: user.id, action: 'account.verify_email', targetType: 'user', targetId: user.id, ip: req.ip });
      if (user.status === 'pending_approval') return { user: publicUser(user), message: 'Email confirmed. A community admin will review your membership.' };
      if (user.status !== 'active') return { user: publicUser(user) };
      return signIn(reply, req, user);
    });

  app.post('/auth/verify/resend', { ...authLimit(5), schema: { body: { type: 'object', required: ['email'], properties: { email: { type: 'string', maxLength: 254 } } } } },
    async (req) => {
      const { rows } = await db.query(`select * from users where email_norm = $1`, [normEmail(req.body.email)]);
      const u = rows[0];
      if (u && u.status === 'unverified') {
        const token = await db.tx((t) => issueToken(t, u.id, 'verify_email'));
        await mailer.send(u.email, 'verify_email', { name: u.name, link: link(req, 'verify', token) });
      }
      return PRIVACY_SAFE;
    });

  // ---- Sign in / out ------------------------------------------------------------------------
  app.post('/auth/login', {
    ...authLimit(10),
    schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', maxLength: 254 }, password: { type: 'string', maxLength: 200 } } } },
  }, async (req, reply) => {
    const { rows } = await db.query(`select * from users where email_norm = $1`, [normEmail(req.body.email)]);
    const u = rows[0];
    const invalid = () => new HttpError(401, 'INVALID_CREDENTIALS', 'That email and password don’t match an account.');
    if (!u || u.status === 'deleted') { await verifyPassword(req.body.password, DUMMY_HASH); throw invalid(); }
    // Lockout after repeated failures (REG-17). Same wording for every account.
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      throw new HttpError(429, 'LOCKED', 'Too many sign-in attempts. Try again in a few minutes, or reset your password.');
    }
    if (!(await verifyPassword(req.body.password, u.password_hash))) {
      const sec = await security();
      await db.query(
        `update users set failed_login_count = failed_login_count + 1,
                locked_until = case when failed_login_count + 1 >= $2 then now() + ($3 || ' minutes')::interval else locked_until end
          where id = $1`, [u.id, sec.maxFailedLogins, String(sec.lockMinutes)]);
      await audit(db, { actorId: null, action: 'auth.login_failed', targetType: 'user', targetId: u.id, ip: req.ip });
      throw invalid();
    }
    await db.query(`update users set failed_login_count = 0, locked_until = null where id = $1`, [u.id]);
    // Status messages only after the password is proven, so they can't be used to probe accounts.
    const blocked = {
      unverified: ['EMAIL_NOT_VERIFIED', 'Confirm your email first. We can send the link again.'],
      pending_approval: ['PENDING_APPROVAL', 'Your membership is waiting for approval from a community admin.'],
      suspended: ['ACCOUNT_SUSPENDED', 'This account is suspended. Contact support if you think this is a mistake.'],
      deactivated: ['ACCOUNT_DEACTIVATED', 'This account is deactivated. You can reactivate it.'],
    }[u.status];
    if (blocked) throw forbidden(blocked[1], blocked[0]);
    await audit(db, { actorId: u.id, action: 'auth.login', targetType: 'user', targetId: u.id, ip: req.ip });
    return signIn(reply, req, u);
  });

  // A deactivated member comes back by proving their password (REG-14): same identity, no duplicate.
  app.post('/auth/reactivate', { ...authLimit(5), schema: { body: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
    async (req, reply) => {
      const { rows } = await db.query(`select * from users where email_norm = $1`, [normEmail(req.body.email)]);
      const u = rows[0];
      if (!u || u.status !== 'deactivated' || !(await verifyPassword(req.body.password, u.password_hash))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'That email and password don’t match a deactivated account.');
      }
      const { rows: [active] } = await db.query(`update users set status = 'active', status_reason = null, updated_at = now(), version = version + 1 where id = $1 returning *`, [u.id]);
      await audit(db, { actorId: u.id, action: 'account.reactivate', targetType: 'user', targetId: u.id, ip: req.ip });
      return signIn(reply, req, active);
    });

  app.post('/auth/logout', async (req, reply) => {
    await endSession(db, reply, req, { secure: ctx.secure });
    return { ok: true };
  });

  app.post('/auth/logout-all', async (req, reply) => {
    if (!req.user) throw unauthorized();
    await revokeAllSessions(db, req.user.id);
    await audit(db, { actorId: req.user.id, action: 'auth.logout_all', targetType: 'user', targetId: req.user.id, ip: req.ip });
    await endSession(db, reply, req, { secure: ctx.secure });
    return { ok: true };
  });

  // For the app's background check: "nobody" is a normal answer here, not an error.
  app.get('/auth/session', async (req) => ({ user: req.user ? publicUser(req.user, req.user.roles) : null }));

  app.get('/auth/me', async (req) => {
    if (!req.user) throw unauthorized();
    return { user: publicUser(req.user, req.user.roles) };
  });

  app.get('/auth/registration', async () => {
    const reg = await getSetting(db, 'registration');
    return { open: reg.open, requireApproval: reg.requireApproval, allowedDomains: reg.allowedDomains, devMailbox: process.env.NODE_ENV !== 'production' };
  });

  // ---- Passwords ----------------------------------------------------------------------------
  app.post('/auth/password/forgot', { ...authLimit(5), schema: { body: { type: 'object', required: ['email'], properties: { email: { type: 'string', maxLength: 254 } } } } },
    async (req) => {
      const { rows } = await db.query(`select * from users where email_norm = $1 and status <> 'deleted'`, [normEmail(req.body.email)]);
      const u = rows[0];
      if (u) {
        const token = await db.tx((t) => issueToken(t, u.id, 'reset_password'));
        await mailer.send(u.email, 'reset_password', { name: u.name, link: link(req, 'reset', token) });
        await audit(db, { actorId: null, action: 'auth.reset_requested', targetType: 'user', targetId: u.id, ip: req.ip });
      }
      return PRIVACY_SAFE;
    });

  app.post('/auth/password/reset', { ...authLimit(10), schema: { body: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string', maxLength: 200 }, password: { type: 'string', maxLength: 200 } } } } },
    async (req) => {
      const problem = passwordProblem(req.body.password);
      if (problem) throw badRequest('WEAK_PASSWORD', problem, { field: 'password' });
      const hash = await hashPassword(req.body.password);
      const u = await db.tx(async (t) => {
        const { user_id: userId } = await consumeToken(t, req.body.token, 'reset_password');
        const { rows } = await t.query(
          `update users set password_hash = $2, password_changed_at = now(), failed_login_count = 0, locked_until = null, updated_at = now(), version = version + 1
            where id = $1 and status <> 'deleted' returning *`, [userId, hash]);
        if (!rows.length) throw badRequest('INVALID_TOKEN', 'This link has expired or was already used. Request a new one.');
        // A reset means the old password may be compromised: every session ends (REG-12).
        await t.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
        await t.query(`update auth_tokens set superseded_at = now() where user_id = $1 and purpose = 'reset_password' and used_at is null`, [userId]);
        return rows[0];
      });
      await audit(db, { actorId: u.id, action: 'auth.password_reset', targetType: 'user', targetId: u.id, ip: req.ip });
      await mailer.send(u.email, 'password_changed', { name: u.name });
      return { ok: true, message: 'Password updated. Sign in with your new password.' };
    });

  app.post('/auth/password/change', { ...authLimit(10), schema: { body: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', maxLength: 200 } } } } },
    async (req) => {
      if (!req.user) throw unauthorized();
      const { rows: [u] } = await db.query(`select * from users where id = $1`, [req.user.id]);
      if (!(await verifyPassword(req.body.currentPassword, u.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your current password isn’t right.');
      const problem = passwordProblem(req.body.newPassword);
      if (problem) throw badRequest('WEAK_PASSWORD', problem, { field: 'newPassword' });
      await db.query(`update users set password_hash = $2, password_changed_at = now(), updated_at = now(), version = version + 1 where id = $1`, [u.id, await hashPassword(req.body.newPassword)]);
      // Keep this device signed in; sign out every other session (REG-12).
      await revokeAllSessions(db, u.id, { except: req.sessionHash });
      await audit(db, { actorId: u.id, action: 'auth.password_change', targetType: 'user', targetId: u.id, ip: req.ip });
      await mailer.send(u.email, 'password_changed', { name: u.name });
      return { ok: true, message: 'Password changed. Your other sessions were signed out.' };
    });

  // ---- Email change -------------------------------------------------------------------------
  // The new address is pending until confirmed; the verified one stays in use (REG-08, REG-09).
  app.post('/auth/email/change', { ...authLimit(5), schema: { body: { type: 'object', required: ['newEmail', 'password'], properties: { newEmail: { type: 'string', maxLength: 254 }, password: { type: 'string' } } } } },
    async (req) => {
      if (!req.user) throw unauthorized();
      const newEmail = req.body.newEmail.trim();
      if (!EMAIL_RE.test(newEmail)) throw badRequest('INVALID_EMAIL', 'Enter a valid email address.', { field: 'newEmail' });
      const { rows: [u] } = await db.query(`select * from users where id = $1`, [req.user.id]);
      if (!(await verifyPassword(req.body.password, u.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your password isn’t right.');
      if (normEmail(newEmail) === u.email_norm) throw badRequest('SAME_EMAIL', 'That’s already your email.');
      const taken = await db.query(`select 1 from users where email_norm = $1`, [normEmail(newEmail)]);
      if (taken.rows.length) throw conflict('EMAIL_TAKEN', 'That email is already used by another account.', { field: 'newEmail' });
      const token = await db.tx(async (t) => {
        await t.query(`update users set pending_email = $2, updated_at = now() where id = $1`, [u.id, newEmail]);
        return issueToken(t, u.id, 'change_email', { email: newEmail });
      });
      await mailer.send(newEmail, 'change_email', { name: u.name, link: link(req, 'confirm-email', token) });
      await audit(db, { actorId: u.id, action: 'account.email_change_requested', targetType: 'user', targetId: u.id, ip: req.ip });
      return { ok: true, message: `We sent a confirmation link to ${newEmail}. Your current email stays in use until you confirm.` };
    });

  app.post('/auth/email/confirm', { ...authLimit(10), schema: { body: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 200 } } } } },
    async (req) => {
      try {
        const u = await db.tx(async (t) => {
          const { user_id: userId, payload } = await consumeToken(t, req.body.token, 'change_email');
          // Re-checked here: someone may have taken the address since the request (REG-08).
          const { rows } = await t.query(
            `update users set email = $2, pending_email = null, email_verified_at = now(), updated_at = now(), version = version + 1
              where id = $1 and status <> 'deleted' returning *`, [userId, payload.email]);
          return rows[0];
        });
        await audit(db, { actorId: u.id, action: 'account.email_changed', targetType: 'user', targetId: u.id, ip: req.ip });
        return { ok: true, user: publicUser(u) };
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) throw conflict('EMAIL_TAKEN', 'That email was taken by another account before you confirmed it.');
        throw err;
      }
    });

  // ---- Deactivate / delete ------------------------------------------------------------------
  const requirePassword = async (req) => {
    if (!req.user) throw unauthorized();
    const { rows: [u] } = await db.query(`select * from users where id = $1`, [req.user.id]);
    if (!(await verifyPassword(String(req.body?.password ?? ''), u.password_hash))) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Your password isn’t right.');
    return u;
  };

  app.post('/account/deactivate', { ...authLimit(5) }, async (req, reply) => {
    const u = await requirePassword(req);
    await db.query(`update users set status = 'deactivated', updated_at = now(), version = version + 1 where id = $1`, [u.id]);
    await revokeAllSessions(db, u.id);
    await audit(db, { actorId: u.id, action: 'account.deactivate', targetType: 'user', targetId: u.id, ip: req.ip });
    await endSession(db, reply, req, { secure: ctx.secure });
    return { ok: true };
  });

  app.post('/account/delete', { ...authLimit(5) }, async (req, reply) => {
    const u = await requirePassword(req);
    // Things that must be handed over first (REG-15). Community ownership and teaching are
    // added to this list in Phase 2 / Phase 3 as those tables arrive.
    const blockers = [];
    const supers = await db.query(`select user_id from platform_roles where role = 'super_admin'`);
    if (supers.rows.length === 1 && supers.rows[0].user_id === u.id) blockers.push('You are the only Super Admin. Assign another Super Admin first.');
    if (blockers.length) throw conflict('HANDOVER_REQUIRED', blockers[0], { blockers });
    await db.tx(async (t) => {
      // Personal data is removed; the row stays (anonymised) so existing content and audit
      // records keep a valid reference (USR-09).
      await t.query(
        `update users set status = 'deleted', email = $2, name = 'Deleted member', password_hash = $3, pending_email = null,
                status_reason = 'self_deleted', updated_at = now(), version = version + 1 where id = $1`,
        [u.id, `deleted+${u.id}@invalid.communityone`, `deleted$${newToken().hash}`]);
      await t.query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [u.id]);
      await t.query(`delete from auth_tokens where user_id = $1`, [u.id]);
      await t.query(`delete from platform_roles where user_id = $1`, [u.id]);
    });
    await audit(db, { actorId: u.id, action: 'account.delete', targetType: 'user', targetId: u.id, ip: req.ip });
    await endSession(db, reply, req, { secure: ctx.secure });
    return { ok: true };
  });
}
