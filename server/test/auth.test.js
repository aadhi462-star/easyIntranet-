// Account lifecycle tests. Each test names the edge-case IDs it proves (EDGE_CASE_REGISTER.md).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, lastToken, makeUser, setup, signIn } from './helpers.js';

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const register = (c, email, extra = {}) => c.post('/api/auth/register', { name: 'New Member', email, password: 'a-good-password', ...extra });

describe('registration', () => {
  test('REG-01 duplicate email (any case) is rejected and no second identity exists', async () => {
    const c = client(env.app);
    assert.equal((await register(c, 'dup@example.com')).status, 201);
    const again = await register(client(env.app), 'DUP@Example.com');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'EMAIL_TAKEN');
    const n = (await env.db.query(`select count(*)::int n from users where email_norm = 'dup@example.com'`)).rows[0].n;
    assert.equal(n, 1);
  });

  test('REG-02 simultaneous registrations for one email create exactly one account', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(() => register(client(env.app), 'race@example.com')));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409]);
    const n = (await env.db.query(`select count(*)::int n from users where email_norm = 'race@example.com'`)).rows[0].n;
    assert.equal(n, 1);
  });

  test('REG-03 invalid email and weak password are rejected with a field', async () => {
    const c = client(env.app);
    const bad = await register(c, 'not-an-email');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.field, 'email');
    const weak = await c.post('/api/auth/register', { name: 'X', email: 'weak@example.com', password: 'short' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.code, 'WEAK_PASSWORD');
  });

  test('COM-05 style idempotent retry: same Idempotency-Key returns the first result, no duplicate', async () => {
    const c = client(env.app);
    const h = { 'idempotency-key': 'retry-key-1' };
    const first = await c.post('/api/auth/register', { name: 'Retry', email: 'retry@example.com', password: 'a-good-password' }, h);
    const second = await c.post('/api/auth/register', { name: 'Retry', email: 'retry@example.com', password: 'a-good-password' }, h);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.headers['idempotent-replay'], 'true');
    assert.equal(second.body.user.id, first.body.user.id);
  });

  test('registration closed / domain allow-list are enforced by the server', async () => {
    await env.db.query(`update platform_settings set value = value || '{"allowedDomains":["alumni.edu"]}' where key = 'registration'`);
    const r = await register(client(env.app), 'out@gmail.com');
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'DOMAIN_NOT_ALLOWED');
    await env.db.query(`update platform_settings set value = value || '{"allowedDomains":[], "open": false}' where key = 'registration'`);
    assert.equal((await register(client(env.app), 'closed@example.com')).body.error.code, 'REGISTRATION_CLOSED');
    await env.db.query(`update platform_settings set value = value || '{"open": true}' where key = 'registration'`);
  });
});

describe('verification', () => {
  test('REG-04 unverified accounts cannot sign in', async () => {
    const c = client(env.app);
    await register(c, 'unverified@example.com');
    const res = await c.post('/api/auth/login', { email: 'unverified@example.com', password: 'a-good-password' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'EMAIL_NOT_VERIFIED');
  });

  test('REG-05/06 used tokens fail; a newer link supersedes the older one', async () => {
    const c = client(env.app);
    await register(c, 'verify@example.com');
    const older = await lastToken(env.db, 'verify@example.com');
    await c.post('/api/auth/verify/resend', { email: 'verify@example.com' });
    const newer = await lastToken(env.db, 'verify@example.com');
    assert.notEqual(older, newer);
    assert.equal((await c.post('/api/auth/verify', { token: older })).body.error.code, 'INVALID_TOKEN');
    const ok = await c.post('/api/auth/verify', { token: newer });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.status, 'active');
    assert.ok(c.jar.c1_sid, 'confirming signs the member in');
    assert.equal((await c.post('/api/auth/verify', { token: newer })).body.error.code, 'INVALID_TOKEN');
    assert.equal((await c.post('/api/auth/verify', { token: 'garbage' })).status, 400);
  });

  test('approval policy: verified accounts wait for approval when required', async () => {
    await env.db.query(`update platform_settings set value = value || '{"requireApproval": true}' where key = 'registration'`);
    const c = client(env.app);
    await register(c, 'approve-me@example.com');
    const v = await c.post('/api/auth/verify', { token: await lastToken(env.db, 'approve-me@example.com') });
    assert.equal(v.body.user.status, 'pending_approval');
    assert.equal(c.jar.c1_sid, undefined, 'no session until approved');
    const login = await c.post('/api/auth/login', { email: 'approve-me@example.com', password: 'a-good-password' });
    assert.equal(login.body.error.code, 'PENDING_APPROVAL');
    await env.db.query(`update platform_settings set value = value || '{"requireApproval": false}' where key = 'registration'`);
  });
});

describe('sign-in and sessions', () => {
  test('REG-10 password reset never reveals whether an account exists', async () => {
    await makeUser(env.db, { id: 'u_reset', email: 'known@example.com' });
    const known = await client(env.app).post('/api/auth/password/forgot', { email: 'known@example.com' });
    const unknown = await client(env.app).post('/api/auth/password/forgot', { email: 'nobody@example.com' });
    assert.equal(known.status, unknown.status);
    assert.deepEqual(known.body, unknown.body);
  });

  test('REG-11/12 reset token works once and ends every existing session', async () => {
    const u = await makeUser(env.db, { id: 'u_sessions', email: 'sessions@example.com' });
    const laptop = await signIn(env.app, u);
    const phone = await signIn(env.app, u);
    await client(env.app).post('/api/auth/password/forgot', { email: u.email });
    const token = await lastToken(env.db, u.email);
    const c = client(env.app);
    assert.equal((await c.post('/api/auth/password/reset', { token, password: 'brand-new-password' })).status, 200);
    assert.equal((await c.post('/api/auth/password/reset', { token, password: 'another-password' })).body.error.code, 'INVALID_TOKEN');
    assert.equal((await laptop.get('/api/auth/me')).status, 401);
    assert.equal((await phone.get('/api/auth/me')).status, 401);
    assert.equal((await client(env.app).post('/api/auth/login', { email: u.email, password: u.password })).status, 401);
    assert.equal((await client(env.app).post('/api/auth/login', { email: u.email, password: 'brand-new-password' })).status, 200);
  });

  test('REG-12 changing password keeps this session and signs out the others', async () => {
    const u = await makeUser(env.db, { id: 'u_change', email: 'change@example.com' });
    const here = await signIn(env.app, u);
    const other = await signIn(env.app, u);
    assert.equal((await here.post('/api/auth/password/change', { currentPassword: u.password, newPassword: 'changed-password' })).status, 200);
    assert.equal((await here.get('/api/auth/me')).status, 200);
    assert.equal((await other.get('/api/auth/me')).status, 401);
  });

  test('REG-17 repeated failures lock the account with a generic message', async () => {
    const u = await makeUser(env.db, { id: 'u_lock', email: 'lock@example.com' });
    const c = client(env.app);
    for (let i = 0; i < 5; i += 1) assert.equal((await c.post('/api/auth/login', { email: u.email, password: 'wrong' })).status, 401);
    const locked = await c.post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'LOCKED');
    const unknown = await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'wrong' });
    assert.equal(unknown.body.error.code, 'INVALID_CREDENTIALS');
  });

  test('REG-18 a revoked session (sign out everywhere) is rejected', async () => {
    const u = await makeUser(env.db, { id: 'u_revoke', email: 'revoke@example.com' });
    const a = await signIn(env.app, u);
    const b = await signIn(env.app, u);
    assert.equal((await a.post('/api/auth/logout-all')).status, 200);
    assert.equal((await b.get('/api/auth/me')).status, 401);
    assert.equal((await a.get('/api/auth/me')).status, 401);
  });

  test('CSRF: state-changing requests without the token are refused', async () => {
    const res = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'x@example.com', password: 'y' } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'CSRF');
  });

  test('protected responses are never cached', async () => {
    const u = await makeUser(env.db, { id: 'u_cache', email: 'cache@example.com' });
    const c = await signIn(env.app, u);
    assert.equal((await c.get('/api/auth/me')).headers['cache-control'], 'no-store');
  });
});

describe('email change', () => {
  test('REG-08/09 new email stays pending; taken addresses are refused', async () => {
    const u = await makeUser(env.db, { id: 'u_email', email: 'old@example.com' });
    await makeUser(env.db, { id: 'u_other', email: 'taken@example.com' });
    const c = await signIn(env.app, u);
    const taken = await c.post('/api/auth/email/change', { newEmail: 'TAKEN@example.com', password: u.password });
    assert.equal(taken.status, 409);
    assert.equal((await c.post('/api/auth/email/change', { newEmail: 'new@example.com', password: u.password })).status, 200);
    const me = await c.get('/api/auth/me');
    assert.equal(me.body.user.email, 'old@example.com', 'verified email unchanged until confirmed');
    assert.equal(me.body.user.pendingEmail, 'new@example.com');
    const token = await lastToken(env.db, 'new@example.com');
    // Someone else grabs the address before confirmation → confirm must fail cleanly.
    await makeUser(env.db, { id: 'u_sniper', email: 'new@example.com' });
    assert.equal((await c.post('/api/auth/email/confirm', { token })).status, 409);
    assert.equal((await c.get('/api/auth/me')).body.user.email, 'old@example.com');
  });
});

describe('account lifecycle', () => {
  test('REG-14 deactivated account reactivates the same identity, no duplicate', async () => {
    const u = await makeUser(env.db, { id: 'u_deact', email: 'deact@example.com' });
    const c = await signIn(env.app, u);
    assert.equal((await c.post('/api/account/deactivate', { password: u.password })).status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    const login = await client(env.app).post('/api/auth/login', { email: u.email, password: u.password });
    assert.equal(login.body.error.code, 'ACCOUNT_DEACTIVATED');
    assert.equal((await register(client(env.app), 'deact@example.com')).status, 409);
    const back = await client(env.app).post('/api/auth/reactivate', { email: u.email, password: u.password });
    assert.equal(back.status, 200);
    assert.equal(back.body.user.id, 'u_deact');
  });

  test('REG-15 the only Super Admin cannot delete their account', async () => {
    const u = await makeUser(env.db, { id: 'u_super_only', email: 'superonly@example.com', roles: ['super_admin'] });
    const c = await signIn(env.app, u);
    const res = await c.post('/api/account/delete', { password: u.password });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'HANDOVER_REQUIRED');
    await env.db.query(`delete from platform_roles where user_id = 'u_super_only'`);
  });

  test('USR-09 deleting an account anonymises it and ends sessions', async () => {
    const u = await makeUser(env.db, { id: 'u_delete', email: 'delete@example.com' });
    const c = await signIn(env.app, u);
    assert.equal((await c.post('/api/account/delete', { password: u.password })).status, 200);
    const row = (await env.db.query(`select name, email, status from users where id = 'u_delete'`)).rows[0];
    assert.equal(row.status, 'deleted');
    assert.equal(row.name, 'Deleted member');
    assert.ok(!row.email.includes('delete@example.com'));
    assert.equal((await client(env.app).post('/api/auth/login', { email: u.email, password: u.password })).body.error.code, 'INVALID_CREDENTIALS');
  });
});

describe('rate limiting', () => {
  test('REG-17 sign-in attempts from one address are throttled', async () => {
    const limited = await setup({ rateLimits: true });
    try {
      const c = client(limited.app);
      const codes = [];
      for (let i = 0; i < 12; i += 1) codes.push((await c.post('/api/auth/login', { email: 'any@example.com', password: 'x' })).status);
      assert.ok(codes.slice(0, 10).every((s) => s === 401), 'first 10 are normal failures');
      assert.equal(codes[10], 429);
      const body = (await c.post('/api/auth/login', { email: 'any@example.com', password: 'x' })).body;
      assert.equal(body.error.code, 'RATE_LIMITED');
    } finally { await limited.close(); }
  });
});

describe('request handling', () => {
  test('sign-out with no body works (the web app sends none)', async () => {
    const u = await makeUser(env.db, { id: 'u_nobody', email: 'nobody-body@example.com' });
    const c = await signIn(env.app, u);
    const res = await env.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: Object.entries(c.jar).map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': c.jar.c1_csrf } });
    assert.equal(res.statusCode, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('malformed JSON is a 400, never a 500', async () => {
    const c = client(env.app);
    await c.get('/api/health');
    const res = await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: '{bad json', headers: { 'content-type': 'application/json', cookie: `c1_csrf=${c.jar.c1_csrf}`, 'x-csrf-token': c.jar.c1_csrf } });
    assert.equal(res.statusCode, 400);
  });
});

describe('session check', () => {
  test('/auth/session answers "nobody" without an error, and the member when signed in', async () => {
    assert.deepEqual((await client(env.app).get('/api/auth/session')).body, { user: null });
    const u = await makeUser(env.db, { id: 'u_sess', email: 'sess@example.com' });
    const c = await signIn(env.app, u);
    assert.equal((await c.get('/api/auth/session')).body.user.id, 'u_sess');
  });
});

describe('static files', () => {
  test('a missing asset is a 404, not index.html; page paths still get the app', async () => {
    const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { buildApp } = await import('../app.js');
    const dir = await mkdtemp(path.join(tmpdir(), 'c1-static-'));
    await mkdir(path.join(dir, 'assets'));
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>app</title>');
    await writeFile(path.join(dir, 'assets', 'real.js'), 'export {}');
    const app = await buildApp({ db: env.db, staticDir: dir });
    try {
      assert.equal((await app.inject('/assets/gone-123.js')).statusCode, 404);
      assert.equal((await app.inject('/assets/real.js')).statusCode, 200);
      // A file added after startup (a new deploy) is served without a restart.
      await writeFile(path.join(dir, 'assets', 'later.js'), 'export {}');
      assert.equal((await app.inject('/assets/later.js')).statusCode, 200);
      const page = await app.inject('/some/page');
      assert.equal(page.statusCode, 200);
      assert.match(page.body, /<title>app<\/title>/);
    } finally { await app.close(); }
  });
});
