// Community invitations (v2 workstream F). EDGE_CASE_REGISTER.md IDs in each name.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { client, makeUser, setup, signIn } from './helpers.js';
import { buildApp } from '../app.js';
import { sha256 } from '../lib/crypto.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
before(async () => {
  env = await setup();
  for (const id of ['own', 'adm', 'mod', 'mem', 'pa']) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id.toUpperCase(), roles: id === 'pa' ? ['platform_admin'] : [] });
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
  for (const [id, vis] of [['clo', 'closed'], ['pri', 'private'], ['pub', 'public'], ['tmp', 'public'], ['cap', 'closed']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `${id} ${vis} community`, vis]);
    for (const [uid, role] of [['own', 'owner'], ['adm', 'admin'], ['mod', 'moderator'], ['mem', 'member']]) {
      await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now())`, [id, uid, role]);
    }
  }
});
after(async () => { await env.close(); });

// A new person on the platform, signed in.
async function person(id) {
  await makeUser(env.db, { id, email: `${id}@example.com`, name: `Person ${id}` });
  c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  return c[id];
}
const invite = (who, cid, body) => c[who].post(`/api/communities/${cid}/invitations`, body);
// The token from the newest invitation email to `to`.
async function tokenFor(to) {
  const { rows } = await q(`select body from email_outbox where lower(to_email) = lower($1) and template = 'community_invite' order by id desc limit 1`, [to]);
  return rows[0].body.match(/#\/invite\/c\/([A-Za-z0-9_-]+)/)[1];
}
const stateIn = async (cid, uid) => (await q(`select state, role from memberships where community_id = $1 and user_id = $2`, [cid, uid])).rows[0] ?? null;

describe('accepting', () => {
  test('VIS-03 a Closed community is joined only by invitation; accepting makes you a member', async () => {
    const x = await person('x1');
    assert.equal((await x.post('/api/communities/clo/join')).status, 404, 'Closed is not even found');
    const res = await invite('adm', 'clo', { userIds: ['x1'], message: 'Welcome aboard' });
    assert.equal(res.status, 201);
    assert.equal(res.body.results[0].status, 'invited');
    assert.equal(res.body.results[0].invitation.status, 'open');
    const token = await tokenFor('x1@example.com');
    // Preview: community name, visibility and inviter; the note only for the account invited.
    const anon = await client(env.app).get(`/api/invitations/${token}`);
    assert.equal(anon.status, 200);
    assert.deepEqual(anon.body.invitation.community, { name: 'clo closed community', visibility: 'closed' });
    assert.equal(anon.body.invitation.inviter.name, 'ADM');
    assert.equal(anon.body.invitation.message, undefined);
    assert.equal(anon.body.invitation.forYou, null);
    const mine = await x.get(`/api/invitations/${token}`);
    assert.equal(mine.body.invitation.forYou, true);
    assert.equal(mine.body.invitation.message, 'Welcome aboard');
    // The in-app notification names who and where, and points at the list, not the token.
    const n = (await x.get('/api/notifications')).body.notifications.find((r) => r.kind === 'community_invite');
    assert.equal(n.line, 'ADM invited you to join clo closed community');
    assert.equal(n.href, '/invitations');
    const ok = await x.post(`/api/invitations/${token}/accept`);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.membership, { state: 'active', role: 'member' });
    assert.equal(ok.body.community.id, 'clo');
    assert.equal((await x.get('/api/communities/clo')).status, 200);
    // A second click gets the same answer; anyone else is told it was used.
    assert.equal((await x.post(`/api/invitations/${token}/accept`)).status, 200);
    assert.equal((await client(env.app).get(`/api/invitations/${token}`)).body.error.code, 'INVITE_USED');
    const audit = (await q(`select action from audit_log where target_id = 'clo' and action like 'community.invite%' order by id`)).rows.map((r) => r.action);
    assert.deepEqual(audit, ['community.invite', 'community.invite_accept']);
  });

  test('the token is never stored in clear, nor in the audit log, notifications or the subject line', async () => {
    await person('x2');
    await invite('adm', 'clo', { userIds: ['x2'] });
    const token = await tokenFor('x2@example.com');
    const { rows: [row] } = await q(`select * from community_invitations where user_id = 'x2'`);
    assert.equal(row.token_hash, sha256(token));
    assert.ok(!JSON.stringify(row).includes(token));
    assert.ok(!JSON.stringify((await q(`select * from audit_log`)).rows).includes(token));
    assert.ok(!JSON.stringify((await q(`select * from notifications`)).rows).includes(token));
    assert.ok(!(await q(`select subject from email_outbox where template = 'community_invite'`)).rows.some((r) => r.subject.includes(token)));
    // The email names the community and the inviter, never the note.
    await invite('adm', 'clo', { emails: ['note-check@example.com'], message: 'private note text' });
    const { rows: [mail] } = await q(`select subject, body from email_outbox where to_email = 'note-check@example.com'`);
    assert.match(mail.subject, /ADM invited you to join clo closed community/);
    assert.ok(!mail.body.includes('private note text'));
  });

  test('the routes that take the token don’t write it to the request log', async () => {
    let log = '';
    const stream = new Writable({ write(chunk, _enc, done) { log += chunk; done(); } });
    const logged = await buildApp({ db: env.db, logger: { level: 'info', stream } });
    try {
      await person('x21');
      await invite('adm', 'clo', { userIds: ['x21'] });
      const token = await tokenFor('x21@example.com');
      assert.equal((await logged.inject({ method: 'GET', url: `/api/invitations/${token}` })).statusCode, 200);
      await logged.inject({ method: 'GET', url: '/api/health' });
      assert.ok(log.includes('/api/health'), 'other requests are logged as usual');
      assert.ok(!log.includes(token));
    } finally { await logged.close(); }
  });

  test('VIS-10 / NTF-05 an expired invitation is refused with a next step; a new invite replaces it', async () => {
    const x = await person('x3');
    await invite('adm', 'clo', { userIds: ['x3'] });
    const token = await tokenFor('x3@example.com');
    await q(`update community_invitations set expires_at = now() - interval '1 minute' where user_id = 'x3'`);
    const pre = await client(env.app).get(`/api/invitations/${token}`);
    assert.equal(pre.status, 410);
    assert.equal(pre.body.error.code, 'INVITE_EXPIRED');
    assert.match(pre.body.error.message, /Ask the person who invited you for a new one/);
    assert.equal((await x.post(`/api/invitations/${token}/accept`)).body.error.code, 'INVITE_EXPIRED');
    assert.equal(await stateIn('clo', 'x3'), null, 'no membership');
    const n = (await x.get('/api/notifications')).body.notifications.find((r) => r.kind === 'community_invite');
    assert.equal(n.available, false);
    assert.equal((await x.get('/api/me/invitations')).body.invitations.length, 0);
    // Inviting again sets the expired one aside and sends a fresh link.
    assert.equal((await invite('adm', 'clo', { userIds: ['x3'] })).body.results[0].status, 'invited');
    const list = (await c.adm.get('/api/communities/clo/invitations')).body.invitations.filter((i) => i.user?.id === 'x3');
    assert.deepEqual(list.map((i) => i.status), ['open', 'expired']);
    assert.equal((await x.post(`/api/invitations/${await tokenFor('x3@example.com')}/accept`)).status, 200);
  });

  test('VIS-10 a revoked invitation is refused; revoking is for Owners and Admins and safe to repeat', async () => {
    const x = await person('x4');
    const inv = (await invite('adm', 'clo', { userIds: ['x4'] })).body.results[0].invitation;
    const token = await tokenFor('x4@example.com');
    assert.equal((await c.mem.delete(`/api/invitations/${inv.id}`)).status, 404);
    assert.equal((await c.mod.delete(`/api/invitations/${inv.id}`)).status, 404);
    const r = await c.own.delete(`/api/invitations/${inv.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.invitation.status, 'revoked');
    assert.equal(r.body.invitation.revokedBy.id, 'own');
    assert.equal((await c.adm.delete(`/api/invitations/${inv.id}`)).status, 200, 'repeat is fine');
    assert.equal((await client(env.app).get(`/api/invitations/${token}`)).body.error.code, 'INVITE_REVOKED');
    const acc = await x.post(`/api/invitations/${token}/accept`);
    assert.equal(acc.status, 410);
    assert.equal(acc.body.error.code, 'INVITE_REVOKED');
    assert.equal(await stateIn('clo', 'x4'), null);
    assert.equal((await q(`select count(*)::int n from audit_log where action = 'community.invite_revoke'`)).rows[0].n, 1);
    assert.equal((await client(env.app).get('/api/invitations/not-a-real-token')).body.error.code, 'INVITE_INVALID');
  });

  test('VIS-09 a forwarded invitation doesn’t work for another account; an email invitation needs that verified email', async () => {
    const other = await person('x5');
    await invite('adm', 'clo', { emails: ['New.Person@Example.com'] });
    const token = await tokenFor('new.person@example.com');
    assert.equal((await q(`select email, user_id from community_invitations where email = 'new.person@example.com'`)).rows[0].user_id, null, 'no account yet');
    assert.equal((await other.get(`/api/invitations/${token}`)).body.invitation.forYou, false);
    const wrong = await other.post(`/api/invitations/${token}/accept`);
    assert.equal(wrong.status, 403);
    assert.equal(wrong.body.error.code, 'WRONG_ACCOUNT');
    assert.ok(!wrong.body.error.message.includes('new.person'), 'the address isn’t revealed');
    // The address's owner signs up; until the email is verified the invitation isn't theirs.
    await makeUser(env.db, { id: 'np', email: 'new.person@example.com', name: 'New Person' });
    const np = await signIn(env.app, { email: 'new.person@example.com', password: 'correct-horse-battery' });
    await q(`update users set email_verified_at = null where id = 'np'`);
    assert.equal((await np.post(`/api/invitations/${token}/accept`)).body.error.code, 'WRONG_ACCOUNT');
    await q(`update users set email_verified_at = now() where id = 'np'`);
    assert.equal((await np.post(`/api/invitations/${token}/accept`)).status, 200);
    assert.equal((await stateIn('clo', 'np')).state, 'active');
  });
});

describe('who can be invited', () => {
  test('MEM-05 blocked people can’t be invited or accept; removed people can be invited back', async () => {
    await person('blk'); await person('rem');
    await q(`insert into memberships (community_id, user_id, role, state) values ('clo', 'blk', 'member', 'blocked'), ('clo', 'rem', 'member', 'removed')`);
    await q(`update memberships set updated_at = now() - interval '1 day' where user_id in ('blk', 'rem')`);
    const res = (await invite('adm', 'clo', { userIds: ['blk', 'rem'] })).body.results;
    assert.equal(res[0].status, 'skipped');
    assert.equal(res[0].code, 'BLOCKED');
    assert.equal(res[1].status, 'invited');
    assert.equal((await c.rem.post(`/api/invitations/${await tokenFor('rem@example.com')}/accept`)).body.membership.state, 'active');
    // An invitation sent before a block can't be used after it.
    await person('blk2');
    await invite('adm', 'clo', { userIds: ['blk2'] });
    await q(`insert into memberships (community_id, user_id, role, state) values ('clo', 'blk2', 'member', 'blocked')`);
    assert.equal((await c.blk2.post(`/api/invitations/${await tokenFor('blk2@example.com')}/accept`)).body.error.code, 'BLOCKED');
    assert.equal((await stateIn('clo', 'blk2')).state, 'blocked');
  });

  test('removed after the invitation was sent: the invitation is void', async () => {
    const x = await person('x6');
    await invite('adm', 'clo', { userIds: ['x6'] });
    const token = await tokenFor('x6@example.com');
    await q(`update community_invitations set created_at = now() - interval '1 hour' where user_id = 'x6'`);
    await q(`insert into memberships (community_id, user_id, role, state) values ('clo', 'x6', 'member', 'removed')`);
    const r = await x.post(`/api/invitations/${token}/accept`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'REMOVED_AFTER_INVITE');
  });

  test('already members, yourself, inactive and unknown accounts are skipped with a code', async () => {
    await makeUser(env.db, { id: 'sus', email: 'sus@example.com', status: 'suspended' });
    const res = (await invite('adm', 'clo', { userIds: ['mem', 'adm', 'sus', 'nobody'], emails: ['adm@example.com', 'MEM@example.com'] })).body.results;
    assert.deepEqual(res.map((r) => r.code), ['ALREADY_MEMBER', 'SELF_INVITE', 'ACCOUNT_UNAVAILABLE', 'NOT_FOUND', 'SELF_INVITE', 'ALREADY_MEMBER']);
    assert.equal((await q(`select count(*)::int n from community_invitations where user_id in ('mem', 'adm', 'sus')`)).rows[0].n, 0);
  });

  test('a person who blocked the inviter can’t be invited by them', async () => {
    await person('x7');
    await q(`insert into blocks (blocker_id, blocked_id) values ('x7', 'adm')`);
    assert.equal((await invite('adm', 'clo', { userIds: ['x7'] })).body.results[0].code, 'CANNOT_INVITE');
    assert.equal((await invite('own', 'clo', { userIds: ['x7'] })).body.results[0].status, 'invited');
  });

  test('suspended accounts can’t accept (their session ends)', async () => {
    const x = await person('x8');
    await invite('adm', 'clo', { userIds: ['x8'] });
    const token = await tokenFor('x8@example.com');
    await q(`update users set status = 'suspended' where id = 'x8'`);
    assert.equal((await x.post(`/api/invitations/${token}/accept`)).status, 401);
    assert.equal(await stateIn('clo', 'x8'), null);
  });
});

describe('duplicates and policy changes', () => {
  test('MEM-12 a second invite returns the open one; resending makes a new link and retires the old', async () => {
    const x = await person('x9');
    const first = (await invite('adm', 'clo', { userIds: ['x9'] })).body.results[0];
    const oldToken = await tokenFor('x9@example.com');
    const again = await invite('own', 'clo', { userIds: ['x9'], emails: ['x9@example.com'] });
    assert.equal(again.status, 200, 'nothing new was made');
    assert.deepEqual(again.body.results.map((r) => [r.status, r.invitation.id]), [['open', first.invitation.id], ['open', first.invitation.id]]);
    assert.equal((await q(`select count(*)::int n from community_invitations where user_id = 'x9'`)).rows[0].n, 1);
    const rs = await c.own.post(`/api/invitations/${first.invitation.id}/resend`);
    assert.equal(rs.status, 200);
    assert.equal(rs.body.invitation.invitedBy.id, 'own');
    const newToken = await tokenFor('x9@example.com');
    assert.notEqual(newToken, oldToken);
    assert.equal((await x.post(`/api/invitations/${oldToken}/accept`)).body.error.code, 'INVITE_INVALID');
    assert.equal((await x.post(`/api/invitations/${newToken}/accept`)).status, 200);
    assert.equal((await c.own.post(`/api/invitations/${first.invitation.id}/resend`)).body.error.code, 'INVITE_USED');
  });

  test('two simultaneous invites for one person make one invitation', async () => {
    await person('x10');
    const r = await Promise.all([1, 2, 3].map(() => invite('adm', 'clo', { userIds: ['x10'] })));
    assert.ok(r.every((x) => x.body.results[0].invitation));
    assert.equal((await q(`select count(*)::int n from community_invitations where user_id = 'x10'`)).rows[0].n, 1);
  });

  test('creating is idempotent with the same Idempotency-Key', async () => {
    await person('x11');
    const h = { 'idempotency-key': 'inv-x11' };
    const a = await c.adm.post('/api/communities/clo/invitations', { emails: ['someone-x11@example.com'] }, h);
    const b = await c.adm.post('/api/communities/clo/invitations', { emails: ['someone-x11@example.com'] }, h);
    assert.equal(b.headers['idempotent-replay'], 'true');
    assert.deepEqual(a.body, b.body);
    assert.equal((await q(`select count(*)::int n from email_outbox where to_email = 'someone-x11@example.com'`)).rows[0].n, 1);
  });

  test('Private: accepting skips the join request (MEM-13: a pending request becomes the membership)', async () => {
    const x = await person('x12');
    assert.equal((await x.post('/api/communities/pri/join', { message: 'Hello' })).body.membership.state, 'pending');
    await invite('adm', 'pri', { userIds: ['x12'] });
    const r = await x.post(`/api/invitations/${await tokenFor('x12@example.com')}/accept`);
    assert.deepEqual(r.body.membership, { state: 'active', role: 'member' });
    assert.equal((await q(`select count(*)::int n from memberships where community_id = 'pri' and user_id = 'x12'`)).rows[0].n, 1);
    assert.ok(!(await c.adm.get('/api/communities/pri/requests')).body.requests.some((p) => p.id === 'x12'));
  });

  test('MEM-11 an inviter who is no longer an Admin: the invitation stops working', async () => {
    const x = await person('x13');
    await invite('adm', 'tmp', { userIds: ['x13'] });
    const token = await tokenFor('x13@example.com');
    assert.equal((await c.own.post('/api/communities/tmp/members/adm', { role: 'member' })).status, 200);
    const pre = await client(env.app).get(`/api/invitations/${token}`);
    assert.equal(pre.status, 409);
    assert.equal(pre.body.error.code, 'INVITER_NOT_ALLOWED');
    assert.equal((await x.post(`/api/invitations/${token}/accept`)).body.error.code, 'INVITER_NOT_ALLOWED');
    assert.equal((await c.own.post('/api/communities/tmp/members/adm', { role: 'admin' })).status, 200);
    assert.equal((await x.post(`/api/invitations/${token}/accept`)).status, 200, 'works again once they are');
  });

  test('MEM-14 / VIS-06 policy is rechecked at acceptance: a Private community made Closed still takes the invitation; suspended or deleted ones refuse', async () => {
    const x = await person('x14'); const y = await person('x15'); const z = await person('x16');
    await q(`update communities set visibility = 'private' where id = 'tmp'`);
    await invite('adm', 'tmp', { userIds: ['x14', 'x15', 'x16'] });
    const [t14, t15, t16] = [await tokenFor('x14@example.com'), await tokenFor('x15@example.com'), await tokenFor('x16@example.com')];
    await q(`update communities set visibility = 'closed' where id = 'tmp'`);
    assert.equal((await x.post('/api/communities/tmp/join')).status, 404, 'Closed now: joining needs the invitation');
    assert.equal((await x.post(`/api/invitations/${t14}/accept`)).body.membership.state, 'active');
    await q(`update communities set status = 'suspended' where id = 'tmp'`);
    assert.equal((await y.post(`/api/invitations/${t15}/accept`)).body.error.code, 'COMMUNITY_UNAVAILABLE');
    await q(`update communities set status = 'deleted' where id = 'tmp'`);
    assert.equal((await z.post(`/api/invitations/${t16}/accept`)).body.error.code, 'COMMUNITY_REMOVED');
    assert.equal(await stateIn('tmp', 'x15'), null);
    await q(`update communities set status = 'active', visibility = 'public' where id = 'tmp'`);
  });
});

describe('permissions and limits', () => {
  test('PER-02 only Owners and Admins invite, below their own role; Administrative Mode can’t invite', async () => {
    await person('x17');
    assert.equal((await invite('mod', 'clo', { userIds: ['x17'] })).status, 403);
    assert.equal((await invite('mem', 'clo', { userIds: ['x17'] })).status, 403);
    assert.equal((await c.pa.post('/api/communities/clo/invitations', { userIds: ['x17'] }, { 'x-admin-mode': '1' })).status, 403);
    assert.equal((await invite('adm', 'clo', { userIds: ['x17'], role: 'admin' })).body.error.code, 'ROLE_TOO_HIGH');
    const mod = await invite('adm', 'clo', { userIds: ['x17'], role: 'moderator' });
    assert.equal(mod.body.results[0].invitation.role, 'moderator');
    await c.own.delete(`/api/invitations/${mod.body.results[0].invitation.id}`);
    assert.equal((await invite('own', 'clo', { userIds: ['x17'], role: 'admin' })).body.results[0].status, 'invited');
    assert.deepEqual((await c.x17.post(`/api/invitations/${await tokenFor('x17@example.com')}/accept`)).body.membership, { state: 'active', role: 'admin' });
    // Outsiders can't even see that a Closed community has invitations.
    assert.equal((await c.x1.get('/api/communities/pri/invitations')).status, 403);
    const outsider = await person('x18');
    assert.equal((await outsider.get('/api/communities/clo/invitations')).status, 404);
    assert.equal((await c.mem.get('/api/communities/clo/invitations')).status, 403);
  });

  test('the list shows open, accepted, expired and revoked invitations, filterable; email invitations show the address only', async () => {
    const all = (await c.own.get('/api/communities/clo/invitations')).body.invitations;
    assert.deepEqual([...new Set(all.map((i) => i.status))].sort(), ['accepted', 'expired', 'open', 'revoked']);
    const np = all.find((i) => i.email === 'new.person@example.com');
    assert.equal(np.user, null);
    assert.equal(np.acceptedBy.id, 'np');
    const open = (await c.own.get('/api/communities/clo/invitations?status=open')).body.invitations;
    assert.ok(open.length && open.every((i) => i.status === 'open'));
  });

  test('invitees see their own open invitations and can accept from the list; nobody else can', async () => {
    const x = await person('x19'); await person('x20');
    const inv = (await invite('adm', 'clo', { userIds: ['x19'] })).body.results[0].invitation;
    const list = (await x.get('/api/me/invitations')).body.invitations;
    assert.deepEqual(list.map((i) => [i.id, i.community.name, i.inviter.name]), [[inv.id, 'clo closed community', 'ADM']]);
    assert.equal((await c.x20.post(`/api/me/invitations/${inv.id}/accept`)).status, 404);
    assert.equal((await x.post(`/api/me/invitations/${inv.id}/accept`)).body.membership.state, 'active');
  });

  test('size limits: 50 people per call, valid emails only, nothing unknown in the body', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `n${i}`);
    assert.equal((await invite('adm', 'cap', { userIds: ids })).status, 400);
    const r = await invite('adm', 'cap', { userIds: ids.slice(0, 30), emails: ids.slice(0, 30).map((i) => `${i}@example.com`) });
    assert.equal(r.body.error.code, 'TOO_MANY');
    assert.equal((await invite('adm', 'cap', { emails: ['not-an-email'] })).body.error.code, 'INVALID_EMAIL');
    assert.equal((await invite('adm', 'cap', {})).body.error.code, 'INVALID_INPUT');
    assert.equal((await invite('adm', 'cap', { emails: ['a@example.com'], status: 'accepted' })).status, 400);
    assert.equal((await q(`select count(*)::int n from community_invitations where community_id = 'cap'`)).rows[0].n, 0);
  });

  test('a community sends at most 200 invitations a day', async () => {
    await q(`insert into community_invitations (id, community_id, email, token_hash, invited_by)
      select 'bulk' || g, 'cap', 'bulk' || g || '@example.com', 'hash' || g, 'adm' from generate_series(1, 199) g`);
    const r = await invite('adm', 'cap', { emails: ['one@example.com', 'two@example.com'] });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, 'INVITE_LIMIT');
    assert.equal(r.body.error.remaining, 1);
    assert.equal((await invite('adm', 'cap', { emails: ['one@example.com'] })).status, 201);
  });

  test('inviting is rate limited per person', async () => {
    const limited = await setup({ rateLimits: true });
    try {
      await makeUser(limited.db, { id: 'o', email: 'o@example.com' });
      await limited.db.query(`insert into communities (id, slug, name, visibility, created_by) values ('k', 'k', 'Kay community', 'closed', 'o')`);
      await limited.db.query(`insert into memberships (community_id, user_id, role, state, joined_at) values ('k', 'o', 'owner', 'active', now())`);
      const o = await signIn(limited.app, { email: 'o@example.com', password: 'correct-horse-battery' });
      const codes = [];
      for (let i = 0; i < 11; i += 1) codes.push((await o.post('/api/communities/k/invitations', { emails: [`p${i}@example.com`] })).status);
      assert.ok(codes.slice(0, 10).every((s) => s === 201));
      assert.equal(codes[10], 429);
    } finally { await limited.close(); }
  });
});
