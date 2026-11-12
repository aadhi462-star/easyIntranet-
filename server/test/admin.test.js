// Platform administration and permission tests (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; let superA; let admin; let support; let member;
before(async () => {
  env = await setup();
  superA = await signIn(env.app, await makeUser(env.db, { id: 'sa', email: 'super@example.com', roles: ['super_admin'] }));
  admin = await signIn(env.app, await makeUser(env.db, { id: 'pa', email: 'admin@example.com', roles: ['platform_admin'] }));
  support = await signIn(env.app, await makeUser(env.db, { id: 'sup', email: 'support@example.com', roles: ['support_agent'] }));
  member = await signIn(env.app, await makeUser(env.db, { id: 'm1', email: 'member@example.com' }));
});
after(async () => { await env.close(); });

describe('suspension', () => {
  test('REG-13 / USR-06 suspending a user ends their sessions on every device', async () => {
    const victim = await makeUser(env.db, { id: 'v1', email: 'victim@example.com' });
    const d1 = await signIn(env.app, victim);
    const d2 = await signIn(env.app, victim);
    const res = await admin.post('/api/admin/users/v1/suspend', { reason: 'Spam' });
    assert.equal(res.status, 200);
    assert.equal((await d1.get('/api/auth/me')).status, 401);
    assert.equal((await d2.get('/api/auth/me')).status, 401);
    const again = await client(env.app).post('/api/auth/login', { email: victim.email, password: victim.password });
    assert.equal(again.body.error.code, 'ACCOUNT_SUSPENDED');
    const log = (await env.db.query(`select action, actor_id, context from audit_log where target_id = 'v1' and action = 'user.suspend'`)).rows[0];
    assert.equal(log.actor_id, 'pa');
    assert.equal(log.context.reason, 'Spam');
    assert.equal((await admin.post('/api/admin/users/v1/reactivate')).status, 200);
    assert.equal((await client(env.app).post('/api/auth/login', { email: victim.email, password: victim.password })).status, 200);
  });

  test('a suspension needs a reason, and staff cannot suspend themselves', async () => {
    assert.equal((await admin.post('/api/admin/users/m1/suspend', {})).body.error.code, 'REASON_REQUIRED');
    assert.equal((await admin.post('/api/admin/users/pa/suspend', { reason: 'x' })).body.error.code, 'SELF_ACTION');
  });

  test('only a Super Admin can suspend a Super Admin', async () => {
    assert.equal((await admin.post('/api/admin/users/sa/suspend', { reason: 'x' })).status, 403);
  });
});

describe('roles and scope', () => {
  test('PER-16 specialist staff are limited to their scope', async () => {
    assert.equal((await support.get('/api/admin/users')).status, 200, 'support can view users');
    assert.equal((await support.post('/api/admin/users/m1/suspend', { reason: 'x' })).status, 403);
    assert.equal((await support.get('/api/admin/audit')).status, 403);
    assert.equal((await support.get('/api/admin/settings/registration')).status, 403);
  });

  test('members get nothing from admin endpoints', async () => {
    for (const url of ['/api/admin/users', '/api/admin/audit', '/api/admin/settings/registration']) {
      assert.equal((await member.get(url)).status, 403, url);
    }
    assert.equal((await client(env.app).get('/api/admin/users')).status, 401);
  });

  test('PER-02 / prompt §9 only Super Admin can grant Platform Admin; staff roles by Platform Admin', async () => {
    assert.equal((await admin.post('/api/admin/users/m1/roles', { role: 'platform_admin', grant: true })).status, 403);
    assert.equal((await admin.post('/api/admin/users/m1/roles', { role: 'support_agent', grant: true })).status, 200);
    assert.equal((await superA.post('/api/admin/users/m1/roles', { role: 'platform_admin', grant: true })).status, 200);
    assert.equal((await superA.post('/api/admin/users/m1/roles', { role: 'platform_admin', grant: false })).status, 200);
    assert.equal((await superA.post('/api/admin/users/m1/roles', { role: 'support_agent', grant: false })).status, 200);
    assert.equal((await member.post('/api/admin/users/m1/roles', { role: 'support_agent', grant: true })).status, 403, 'no self-grant');
  });

  test('the last Super Admin cannot be removed', async () => {
    // Stage 7 (PER-02): nobody changes their own platform role, so the last Super Admin can't
    // remove themselves; LAST_SUPER_ADMIN stays as a second guard in the server.
    const res = await superA.post('/api/admin/users/sa/roles', { role: 'super_admin', grant: false });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'SELF_ACTION');
    assert.equal((await env.db.query(`select count(*)::int as n from platform_roles where role = 'super_admin'`)).rows[0].n, 1);
  });

  test('role changes take effect on the very next request (PER-05)', async () => {
    await makeUser(env.db, { id: 'temp', email: 'temp@example.com' });
    const t = await signIn(env.app, { email: 'temp@example.com', password: 'correct-horse-battery' });
    await admin.post('/api/admin/users/temp/roles', { role: 'user_manager', grant: true });
    assert.equal((await t.get('/api/admin/users')).status, 200);
    await admin.post('/api/admin/users/temp/roles', { role: 'user_manager', grant: false });
    // Stage 7: losing a role also ends their sessions (PER-12), so the next request is 401.
    assert.equal((await t.get('/api/admin/users')).status, 401);
  });
});

describe('settings', () => {
  test('SET-08 unknown or hidden fields are rejected (no mass assignment)', async () => {
    const cur = (await admin.get('/api/admin/settings/registration')).body.value;
    const res = await admin.put('/api/admin/settings/registration', { version: cur._version, value: { open: true, isAdmin: true } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'FIELD_NOT_ALLOWED');
  });

  test('SET-03 a stale version cannot silently overwrite a newer save', async () => {
    const cur = (await admin.get('/api/admin/settings/registration')).body.value;
    assert.equal((await admin.put('/api/admin/settings/registration', { version: cur._version, value: { requireApproval: true } })).status, 200);
    const stale = await superA.put('/api/admin/settings/registration', { version: cur._version, value: { requireApproval: false } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'STALE_VERSION');
    const now = (await admin.get('/api/admin/settings/registration')).body.value;
    await admin.put('/api/admin/settings/registration', { version: now._version, value: { requireApproval: false } });
  });

  test('SET-10 / PER-07 security settings need Super Admin; the attempt is audited', async () => {
    const cur = (await superA.get('/api/admin/settings/security')).body.value;
    const denied = await admin.put('/api/admin/settings/security', { version: cur._version, value: { maxFailedLogins: 50 } });
    assert.equal(denied.status, 403);
    const logged = (await env.db.query(`select 1 from audit_log where action = 'settings.denied' and actor_id = 'pa'`)).rows.length;
    assert.equal(logged, 1);
    assert.equal((await superA.put('/api/admin/settings/security', { version: cur._version, value: { maxFailedLogins: 5 } })).status, 200);
    // `member` lost a platform role earlier, which signed them out (Stage 7): refused either way.
    assert.ok([401, 403].includes((await member.put('/api/admin/settings/general', { version: 1, value: { name: 'Hacked' } })).status));
  });
});

describe('approvals', () => {
  test('approving twice is a clean no-op (state-checked transition)', async () => {
    await makeUser(env.db, { id: 'pend', email: 'pend@example.com', status: 'pending_approval' });
    assert.equal((await admin.post('/api/admin/users/pend/approve')).status, 200);
    assert.equal((await admin.post('/api/admin/users/pend/approve')).status, 409);
    assert.equal((await admin.post('/api/admin/users/pend/decline')).status, 409);
  });
});
