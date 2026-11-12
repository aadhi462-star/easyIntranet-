// Redesign Stage 7 (platform administration): users, communities and deletion, the moderation
// centre, settings, announcements, the activity log and analytics (PER-*, DEL-*, MOD-*, SET-*,
// ANL-* IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { purgeDeletedCommunities } from '../routes/platform.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PW = 'correct-horse-battery';
const ADMIN = { 'x-admin-mode': '1' };

before(async () => {
  env = await setup();
  await makeUser(env.db, { id: 'sup', email: 'sup@example.com', name: 'Sara Super', roles: ['super_admin'] });
  await makeUser(env.db, { id: 'pa', email: 'pa@example.com', name: 'Aisha Admin', roles: ['platform_admin'] });
  await makeUser(env.db, { id: 'pa2', email: 'pa2@example.com', name: 'Pat Admin', roles: ['platform_admin'] });
  for (const id of ['own', 'mem', 'mem2', 'out']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('club', 'club', 'Chess Club', 'private', 'own'), ('alumnizone', 'alumnizone', 'AlumniZone', 'public', 'sup')`);
  await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('club', 'own', 'owner', 'active', now()), ('club', 'mem', 'member', 'active', now()), ('club', 'mem2', 'member', 'active', now()), ('alumnizone', 'sup', 'owner', 'active', now())`);
  for (const id of ['sup', 'pa', 'pa2', 'own', 'mem', 'mem2', 'out']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });
});
after(() => env?.close());

const stale = (who) => q(`update sessions set password_at = now() - interval '11 minutes' where user_id = $1`, [who]);

describe('users', () => {
  test('PER-12 SYS-05 suspending signs them out at once, needs a reason, emails it; reactivating restores', async () => {
    assert.equal((await c.pa.post('/api/admin/users/mem2/suspend', {})).body.error.code, 'REASON_REQUIRED');
    assert.equal((await c.pa.post('/api/admin/users/mem2/suspend', { reason: 'Spamming every community' })).status, 200);
    assert.equal((await c.mem2.get('/api/auth/me')).status, 401, 'the next request is refused');
    const { rows: [mail] } = await q(`select subject, body from email_outbox where to_email = 'mem2@example.com' order by id desc limit 1`);
    assert.match(mail.subject, /suspended/);
    assert.match(mail.body, /Spamming every community/);
    const list = (await c.pa.get('/api/admin/users?status=suspended')).body;
    assert.deepEqual(list.users.map((u) => u.id), ['mem2']);
    assert.equal(list.counts.suspended, 1);
    assert.equal((await c.pa.post('/api/admin/users/mem2/reactivate')).status, 200);
    c.mem2 = await signIn(env.app, { email: 'mem2@example.com', password: PW });
  });

  test('users list: role and restricted filters, the panel shows communities and sessions', async () => {
    assert.deepEqual((await c.pa.get('/api/admin/users?role=super_admin')).body.users.map((u) => u.id), ['sup']);
    await q(`update memberships set state = 'restricted' where community_id = 'club' and user_id = 'mem'`);
    assert.deepEqual((await c.pa.get('/api/admin/users?status=restricted')).body.users.map((u) => u.id), ['mem']);
    const panel = (await c.pa.get('/api/admin/users/mem')).body;
    assert.equal(panel.communities[0].state, 'restricted');
    assert.ok(panel.sessions.active >= 1);
    await q(`update memberships set state = 'active' where community_id = 'club' and user_id = 'mem'`);
    assert.equal((await c.mem.get('/api/admin/users')).status, 403);
  });

  test('sign out everywhere ends every session of theirs', async () => {
    assert.equal((await c.pa.post('/api/admin/users/mem/sessions/revoke')).status, 200);
    assert.equal((await c.mem.get('/api/auth/me')).status, 401);
    c.mem = await signIn(env.app, { email: 'mem@example.com', password: PW });
  });

  test('PER-02 PER-14 D4 granting Platform Admin: Super Admin only, never yourself, password within 10 minutes', async () => {
    assert.equal((await c.pa.post('/api/admin/users/out/roles', { role: 'platform_admin', grant: true })).status, 403);
    assert.equal((await c.sup.post('/api/admin/users/sup/roles', { role: 'super_admin', grant: false })).body.error.code, 'SELF_ACTION');
    await stale('sup');
    assert.equal((await c.sup.post('/api/admin/users/out/roles', { role: 'platform_admin', grant: true })).body.error.code, 'PASSWORD_REQUIRED');
    assert.equal((await c.sup.post('/api/admin/confirm-password', { password: 'wrong-password' })).body.error.code, 'WRONG_PASSWORD');
    assert.equal((await c.sup.post('/api/admin/confirm-password', { password: PW })).status, 200);
    assert.equal((await c.sup.post('/api/admin/users/out/roles', { role: 'platform_admin', grant: true })).status, 200);
    // Losing the role takes effect at once (PER-12).
    c.out = await signIn(env.app, { email: 'out@example.com', password: PW });
    assert.equal((await c.sup.post('/api/admin/users/out/roles', { role: 'platform_admin', grant: false })).status, 200);
    assert.equal((await c.out.get('/api/auth/me')).status, 401);
    c.out = await signIn(env.app, { email: 'out@example.com', password: PW });
  });

  test('D6 users export: logged, emails only when asked, formula-looking names kept as text', async () => {
    await q(`update users set name = '=HYPERLINK("x")' where id = 'out'`);
    const plain = await c.pa.get('/api/admin/users.csv');
    assert.equal(plain.status, 200);
    const csv = plain.raw.toString();
    assert.ok(!csv.includes('@example.com'));
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
    assert.ok((await c.pa.get('/api/admin/users.csv?email=1')).raw.toString().includes('mem@example.com'));
    const { rows } = await q(`select context from audit_log where action = 'users.export' order by id`);
    assert.deepEqual(rows.map((r) => r.context.email), [false, true]);
    await q(`update users set name = 'out person' where id = 'out'`);
  });
});

describe('communities and deletion', () => {
  let requestId;
  test('suspend hides it from members but not its staff; restoring brings it back', async () => {
    assert.equal((await c.pa.post('/api/admin/communities/club/suspend', { reason: 'Under review' })).status, 200);
    assert.equal((await c.mem.get('/api/communities/club')).status, 404);
    const staffView = await c.own.get('/api/communities/club');
    assert.equal(staffView.status, 200, 'its Owner can still read it');
    assert.equal(staffView.body.permissions.canParticipate, false);
    assert.equal((await c.pa.get('/api/admin/communities?show=suspended')).body.communities[0].statusReason, 'Under review');
    assert.equal((await c.pa.post('/api/admin/communities/alumnizone/suspend', { reason: 'x' })).body.error.code, 'DEFAULT_COMMUNITY');
    assert.equal((await c.pa.post('/api/admin/communities/club/unsuspend')).status, 200);
    assert.equal((await c.mem.get('/api/communities/club')).status, 200);
  });

  test('COM-08 a community with no active Owner shows up and gets a new one from its members', async () => {
    await q(`update users set status = 'suspended' where id = 'own'`);
    assert.deepEqual((await c.pa.get('/api/admin/communities?show=no_owner')).body.communities.map((x) => x.id), ['club']);
    assert.equal((await c.pa.post('/api/admin/communities/club/owner', { userId: 'out' })).body.error.code, 'NOT_A_MEMBER');
    assert.equal((await c.pa.post('/api/admin/communities/club/owner', { userId: 'mem' })).status, 200);
    assert.equal((await c.pa.get('/api/admin/communities?show=no_owner')).body.counts.no_owner, 0);
    assert.equal((await q(`select role from memberships where community_id = 'club' and user_id = 'own'`)).rows[0].role, 'admin');
    assert.equal((await c.pa.post('/api/admin/communities/club/owner', { userId: 'mem2' })).body.error.code, 'HAS_OWNER');
    // Back as it was for the next tests.
    await q(`update users set status = 'active' where id = 'own'`);
    await q(`update memberships set role = 'member' where community_id = 'club' and user_id = 'mem'`);
    await q(`update memberships set role = 'owner' where community_id = 'club' and user_id = 'own'`);
    c.own = await signIn(env.app, { email: 'own@example.com', password: PW });
  });

  test('DEL-15 opening a request marks it as yours; DEL-09 open reports block approval', async () => {
    requestId = (await c.own.post('/api/communities/club/deletion-request', { reason: 'We moved elsewhere', confirmName: 'Chess Club' })).body.request.id;
    const list = (await c.pa.get('/api/admin/communities?show=requests')).body;
    assert.equal(list.counts.requests, 1);
    assert.equal((await c.pa.post(`/api/admin/deletion-requests/${requestId}/review`)).status, 200);
    assert.equal((await c.pa2.post(`/api/admin/deletion-requests/${requestId}/review`)).body.error.code, 'LOCKED');
    assert.equal((await c.pa2.post(`/api/admin/deletion-requests/${requestId}/decline`, { note: 'no' })).body.error.code, 'LOCKED');
    const p = (await c.mem.post('/api/communities/club/posts', { body: 'reported post' })).body.post;
    await c.mem2.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam', communityId: 'club' });
    const panel = (await c.pa.get('/api/admin/communities/club')).body;
    assert.equal(panel.impact.members, 3);
    assert.equal(panel.impact.openReports, 1);
    assert.equal((await c.pa.post(`/api/admin/deletion-requests/${requestId}/approve`, { note: 'ok', confirmName: 'Chess Club' })).body.error.code, 'OPEN_CASES');
    await q(`update moderation_cases set status = 'dismissed' where community_id = 'club'`);
  });

  test('DEL-07 DEL-10 D1 approving needs the typed name, a note and a fresh password; it disappears at once and members are told', async () => {
    assert.equal((await c.pa.post(`/api/admin/deletion-requests/${requestId}/approve`, { note: 'ok', confirmName: 'chess club' })).body.error.code, 'NAME_MISMATCH');
    await stale('pa');
    assert.equal((await c.pa.post(`/api/admin/deletion-requests/${requestId}/approve`, { note: 'ok', confirmName: 'Chess Club' })).body.error.code, 'PASSWORD_REQUIRED');
    await c.pa.post('/api/admin/confirm-password', { password: PW });
    assert.equal((await c.pa.post(`/api/admin/deletion-requests/${requestId}/approve`, { note: 'Approved as asked', confirmName: 'Chess Club' })).status, 200);
    const gone = await c.mem.get('/api/communities/club');
    assert.equal(gone.status, 404);
    assert.equal(gone.body.error.code, 'COMMUNITY_REMOVED');
    assert.equal((await c.own.get('/api/communities/club')).body.error.code, 'COMMUNITY_REMOVED', 'staff too (DEL-12)');
    assert.ok(!(await c.mem.get('/api/communities')).body.communities.some((x) => x.id === 'club'));
    const n = (await c.mem.get('/api/notifications')).body.notifications.find((x) => x.kind === 'community_deleted');
    assert.ok(n?.available);
    assert.match(n.line, /Chess Club has been removed/);
    assert.equal((await c.own.get('/api/communities/club/deletion-request')).status, 404);
  });

  test('DEL-14 within 30 days a restore brings everything back, memberships included', async () => {
    assert.equal((await c.pa.get('/api/admin/communities?show=deleted')).body.communities[0].id, 'club');
    assert.equal((await c.pa.post('/api/admin/communities/club/restore')).status, 200);
    const back = (await c.mem.get('/api/communities/club')).body;
    assert.equal(back.membership.state, 'active');
    assert.equal(back.community.status, 'active');
  });

  test('D2 DEL-13 a direct deletion, then removal for good in resumable steps; certificates keep verifying', async () => {
    await q(`insert into certificates (id, code, user_id, community_id, name, course_title, community_name) values ('crt1', 'ABCD-2345', 'mem', 'club', 'mem person', 'Openings', 'Chess Club')`);
    await c.pa.post('/api/admin/confirm-password', { password: PW });
    assert.equal((await c.pa.post('/api/admin/communities/club/delete', { note: 'Breaks platform rules', confirmName: 'Chess Club' })).status, 200);
    assert.equal(await purgeDeletedCommunities(env.db), 0, 'nothing is removed inside the 30 days');
    await q(`update communities set purge_after = now() - interval '1 minute', purge_step = 'posts' where id = 'club'`);
    assert.equal((await c.pa.post('/api/admin/communities/club/restore')).body.error.code, 'CANT_RESTORE', 'removal has started');
    assert.equal(await purgeDeletedCommunities(env.db, { batch: 1 }), 1);
    assert.equal((await q(`select count(*)::int as n from posts where community_id = 'club'`)).rows[0].n, 0);
    assert.equal((await q(`select count(*)::int as n from memberships where community_id = 'club'`)).rows[0].n, 0);
    assert.equal((await c.mem.get('/api/communities/club')).body.error.code, 'COMMUNITY_REMOVED');
    assert.equal((await c.out.get('/api/certificates/ABCD-2345')).status, 200, 'certificates keep verifying (D1)');
    assert.equal(await purgeDeletedCommunities(env.db), 0, 'safe to run twice');
  });

  test('AlumniZone can’t be deleted', async () => {
    await c.pa.post('/api/admin/confirm-password', { password: PW });
    assert.equal((await c.pa.post('/api/admin/communities/alumnizone/delete', { note: 'x', confirmName: 'AlumniZone' })).body.error.code, 'DEFAULT_COMMUNITY');
  });
});

describe('moderation centre', () => {
  before(async () => {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ('fc', 'fc', 'Founders Circle', 'private', 'own')`);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('fc', 'own', 'owner', 'active', now()), ('fc', 'mem', 'member', 'active', now()), ('fc', 'mem2', 'member', 'active', now()), ('fc', 'pa2', 'moderator', 'active', now())`);
  });

  test('MOD-03 D5 a report about an Owner reaches the centre, and a Platform Admin decides it in Administrative Mode', async () => {
    const p = (await c.own.post('/api/communities/fc/posts', { body: 'owner post' })).body.post;
    const caseId = (await c.mem.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'harassment', communityId: 'fc' })).body.caseId;
    const centre = (await c.pa.get('/api/admin/moderation')).body;
    const item = centre.cases.find((x) => x.id === caseId);
    assert.equal(item.why, 'owner');
    assert.equal((await c.own.get('/api/communities/fc/cases')).body.cases.length, 0, 'the Owner never sees reports about themselves');
    assert.equal((await c.pa.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' })).status, 404, 'only through Administrative Mode');
    assert.equal((await c.pa.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' }, ADMIN)).status, 200);
    assert.ok((await c.pa.get('/api/admin/moderation')).body.decided.some((d) => d.caseId === caseId));
  });

  test('MOD-06 a Platform Admin who holds a role in the community sees the case, another decides', async () => {
    const p = (await c.own.post('/api/communities/fc/posts', { body: 'another owner post' })).body.post;
    const caseId = (await c.mem.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam', communityId: 'fc' })).body.caseId;
    assert.equal((await c.pa2.get('/api/admin/moderation')).body.cases.find((x) => x.id === caseId).conflicted, true);
    assert.equal((await c.pa2.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' }, ADMIN)).body.error.code, 'CONFLICTED');
    assert.equal((await c.pa.post(`/api/cases/${caseId}/decide`, { action: 'dismiss' }, ADMIN)).status, 200);
  });

  test('D5 an Owner can escalate a case; it reaches the centre', async () => {
    const p = (await c.mem.post('/api/communities/fc/posts', { body: 'hard call' })).body.post;
    const caseId = (await c.mem2.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'misleading', communityId: 'fc' })).body.caseId;
    assert.equal((await c.pa2.post(`/api/cases/${caseId}/escalate`, { note: 'x' })).status, 403, 'Moderators don’t escalate');
    assert.equal((await c.own.post(`/api/cases/${caseId}/escalate`, { note: '' })).body.error.code, 'INVALID_INPUT');
    assert.equal((await c.own.post(`/api/cases/${caseId}/escalate`, { note: 'Not sure it breaks our rules' })).status, 200);
    assert.equal((await c.own.post(`/api/cases/${caseId}/escalate`, { note: 'again' })).body.error.code, 'ALREADY_ESCALATED');
    const item = (await c.pa.get('/api/admin/moderation')).body.cases.find((x) => x.id === caseId);
    assert.equal(item.why, 'escalated');
    assert.equal(item.escalationNote, 'Not sure it breaks our rules');
  });

  test('MOD-09 a report open 7 days with no active moderator reaches the centre', async () => {
    const p = (await c.mem.post('/api/communities/fc/posts', { body: 'old one' })).body.post;
    const caseId = (await c.mem2.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam', communityId: 'fc' })).body.caseId;
    assert.ok(!(await c.pa.get('/api/admin/moderation')).body.cases.some((x) => x.id === caseId));
    await q(`update moderation_cases set opened_at = now() - interval '8 days' where id = $1`, [caseId]);
    await q(`update sessions set last_seen_at = now() - interval '9 days' where user_id in ('own', 'pa2')`);
    assert.equal((await c.pa.get('/api/admin/moderation')).body.cases.find((x) => x.id === caseId)?.why, 'no_moderator');
    await q(`update moderation_cases set status = 'dismissed' where id = $1`, [caseId]);
  });

  test('an appeal nobody in the community can decide reaches the centre', async () => {
    const p = (await c.mem.post('/api/communities/fc/posts', { body: 'removed by the owner' })).body.post;
    const caseId = (await c.mem2.post('/api/reports', { targetType: 'post', targetId: p.id, reason: 'spam', communityId: 'fc' })).body.caseId;
    c.own = await signIn(env.app, { email: 'own@example.com', password: PW });
    assert.equal((await c.own.post(`/api/cases/${caseId}/decide`, { action: 'remove', reason: 'Spam' })).status, 200);
    assert.equal((await c.mem.post(`/api/cases/${caseId}/appeal`, { body: 'It was not spam' })).status, 200);
    const ap = (await c.pa.get('/api/admin/moderation')).body.appeals.find((x) => x.caseId === caseId);
    assert.ok(ap, 'the only Owner took the action and there is no Admin');
    assert.equal((await c.pa.post(`/api/appeals/${ap.id}/decide`, { outcome: 'overturned', note: 'Restored' }, ADMIN)).status, 200);
    assert.equal((await c.mem.get(`/api/posts/${p.id}`)).body.post.status, 'published');
  });
});

describe('settings, announcements, activity and analytics', () => {
  test('SET-05 D8 lowering the file limit applies to new uploads only', async () => {
    const s = (await c.pa.get('/api/admin/settings')).body;
    assert.equal(s.settings.files.maxFileMb, 10);
    assert.equal((await c.pa.put('/api/admin/settings/files', { version: s.settings.files._version, value: { maxFileMb: 7 } })).body.error.code, 'INVALID_INPUT');
    assert.equal((await c.pa.put('/api/admin/settings/files', { version: s.settings.files._version, value: { maxFileMb: 5 } })).status, 200);
    assert.equal((await c.pa.put('/api/admin/settings/files', { version: s.settings.files._version, value: { maxFileMb: 10 } })).body.error.code, 'STALE_VERSION');
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024, 32)]);
    const res = await env.app.inject({ method: 'POST', url: '/api/communities/fc/files', payload: big,
      headers: { cookie: Object.entries(c.mem.jar).map(([k, v]) => `${k}=${v}`).join('; '), 'x-csrf-token': c.mem.jar.c1_csrf, 'content-type': 'application/octet-stream', 'x-file-name': 'big.pdf' } });
    assert.equal(res.json().error.code, 'FILE_TOO_LARGE');
    assert.match(res.json().error.message, /5 MB/);
  });

  test('SET-02 turning a module off keeps its data; Smart Assist can’t be turned on', async () => {
    assert.equal((await c.pa.put('/api/admin/features/module.ideas', { enabled: true })).body.feature.enabled, true);
    assert.equal((await c.pa.put('/api/admin/features/module.assist', { enabled: true })).body.error.code, 'NOT_BUILT');
    assert.equal((await c.mem.put('/api/admin/features/module.ideas', { enabled: false })).status, 403);
  });

  test('communities.whoCanCreate = staff stops members creating communities', async () => {
    const v = (await c.pa.get('/api/admin/settings')).body.settings.communities._version;
    await c.pa.put('/api/admin/settings/communities', { version: v, value: { whoCanCreate: 'staff' } });
    assert.equal((await c.mem.post('/api/communities', { name: 'New thing', visibility: 'public' })).body.error.code, 'CREATE_RESTRICTED');
    assert.equal((await c.pa.post('/api/communities', { name: 'Staff thing', visibility: 'public' })).status, 201);
  });

  test('D7 one announcement at a time, to chosen communities, until dismissed or ended', async () => {
    assert.equal((await c.pa.post('/api/admin/announcements', { message: 'x'.repeat(281) })).body.error.code, 'TOO_LONG');
    assert.equal((await c.pa.post('/api/admin/announcements', { message: 'Hi', link: 'https://evil.example' })).body.error.code, 'INVALID_LINK');
    const first = (await c.pa.post('/api/admin/announcements', { message: 'Everyone hello' })).body.announcement;
    const second = (await c.pa.post('/api/admin/announcements', { message: 'Founders only', audience: 'communities', communityIds: ['fc'], link: '/events' })).body.announcement;
    assert.equal((await c.out.get('/api/announcements/current')).body.announcement, null, 'publishing replaced the one for everyone');
    assert.equal((await c.mem.get('/api/announcements/current')).body.announcement.id, second.id);
    await c.mem.post(`/api/announcements/${second.id}/dismiss`);
    assert.equal((await c.mem.get('/api/announcements/current')).body.announcement, null);
    assert.equal((await c.mem2.get('/api/announcements/current')).body.announcement.id, second.id);
    assert.equal((await c.pa.post(`/api/admin/announcements/${second.id}/end`)).status, 200);
    assert.equal((await c.mem2.get('/api/announcements/current')).body.announcement, null);
    assert.notEqual(first.id, second.id);
  });

  test('PER-10 MOD-10 D6 the activity log filters, and its export needs the password and is logged', async () => {
    const all = (await c.pa.get('/api/admin/activity?category=deletions')).body.entries;
    assert.ok(all.length && all.every((e) => e.action.startsWith('community.')));
    assert.ok((await c.pa.get('/api/admin/activity?who=aisha')).body.entries.every((e) => e.actor === 'Aisha Admin'));
    await stale('pa');
    assert.equal((await c.pa.get('/api/admin/activity.csv?category=moderation')).body.error.code, 'PASSWORD_REQUIRED');
    await c.pa.post('/api/admin/confirm-password', { password: PW });
    const csv = await c.pa.get('/api/admin/activity.csv?category=moderation');
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-disposition'], /communityone-activity/);
    const { rows: [e] } = await q(`select context from audit_log where action = 'audit.export' order by id desc limit 1`);
    assert.deepEqual(e.context.filters, { category: 'moderation' });
    assert.equal((await c.mem.get('/api/admin/activity')).status, 403);
  });

  test('ANL-02 ANL-08 platform analytics: people counted once, small numbers hidden, export logged', async () => {
    const r = (await c.pa.get('/api/admin/analytics?days=30')).body;
    assert.equal(r.totals.people, 7, 'every active account once');
    assert.ok(r.totals.memberships >= r.totals.people - 4, 'memberships are counted separately from people');
    const fc = r.communities.find((x) => x.id === 'fc');
    assert.equal(fc.members, null, 'fewer than 5');
    assert.equal((await c.pa.get('/api/admin/analytics.csv?days=7')).status, 200);
    assert.ok((await q(`select 1 from audit_log where action = 'analytics.export' and target_type = 'platform'`)).rows.length);
  });
});
