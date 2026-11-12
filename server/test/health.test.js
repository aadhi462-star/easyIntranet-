// v2 brief Part 11: system health for Platform Admin (GET /api/admin/health) and the job runs it
// reads (lib/jobs.js records each run in job_runs and prunes those older than 7 days).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';
import { JOBS, runJobs } from '../lib/jobs.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PW = 'correct-horse-battery';
const EMAIL = /[^\s"'<>(),;:]+@[^\s"'<>(),;:]+/;
const quiet = () => { const errors = []; return { errors, error: (obj, msg) => errors.push({ ...obj, msg }) }; };
const health = async (who = 'pa') => { const res = await c[who].get('/api/admin/health'); assert.equal(res.status, 200); return res.body; };

before(async () => {
  env = await setup();
  await makeUser(env.db, { id: 'sup', email: 'sup@example.com', name: 'Sara Super', roles: ['super_admin'] });
  await makeUser(env.db, { id: 'pa', email: 'pa@example.com', name: 'Aisha Admin', roles: ['platform_admin'] });
  await makeUser(env.db, { id: 'cm', email: 'cm@example.com', name: 'Cam Manager', roles: ['community_manager'] });
  await makeUser(env.db, { id: 'own', email: 'own@example.com', name: 'Olu Owner' });
  await makeUser(env.db, { id: 'mem', email: 'mem@example.com', name: 'Mei Member' });
  await q(`insert into communities (id, slug, name, visibility, created_by) values ('club', 'club', 'Chess Club', 'public', 'own')`);
  await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ('club', 'own', 'owner', 'active', now()), ('club', 'mem', 'member', 'active', now())`);
  for (const id of ['sup', 'pa', 'cm', 'own', 'mem']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: PW });
});
after(() => env?.close());

describe('permissions', () => {
  test('health.view: Platform Admin and Super Admin see it; members, Owners and other staff roles get 403; signed out 401', async () => {
    assert.equal((await c.pa.get('/api/admin/health')).status, 200);
    assert.equal((await c.sup.get('/api/admin/health')).status, 200);
    for (const who of ['mem', 'own', 'cm']) assert.equal((await c[who].get('/api/admin/health')).status, 403, who);
    assert.equal((await env.app.inject({ method: 'GET', url: '/api/admin/health' })).statusCode, 401);
    assert.equal((await c.pa.get('/api/admin/me/permissions')).body.can['health.view'], true);
    assert.equal((await c.cm.get('/api/admin/me/permissions')).body.can['health.view'], false);
  });
});

describe('job runs', () => {
  test('every job run is recorded with its count; a failing job is recorded and the others still run', async () => {
    await q(`delete from job_runs`);
    const log = quiet();
    await runJobs(env.app.ctx, log);
    const { rows } = await q(`select job, ok, error, count, finished_at >= started_at as ordered from job_runs order by id`);
    assert.deepEqual(rows.map((r) => r.job), JOBS.map(([n]) => n), 'one row per job, in run order');
    assert.ok(rows.every((r) => r.ok && r.error === null && r.ordered));
    assert.ok(rows.every((r) => Number.isInteger(r.count)), 'counts and rows returned become counts');

    await q(`delete from job_runs`);
    const ran = [];
    await runJobs(env.app.ctx, log, { jobs: [
      ['boom', () => { throw new Error(`could not send to mem@example.com: ${'x'.repeat(2000)}`); }],
      ['after', () => { ran.push('after'); return 3; }],
      ['rows', () => [{ id: 1 }, { id: 2 }]],
    ] });
    assert.deepEqual(ran, ['after'], 'a failing job does not stop the next one');
    const { rows: runs } = await q(`select job, ok, error, count from job_runs order by id`);
    assert.deepEqual(runs.map((r) => [r.job, r.ok, r.count]), [['boom', false, null], ['after', true, 3], ['rows', true, 2]]);
    assert.ok(runs[0].error.length <= 500, 'error text is truncated');
    assert.match(runs[0].error, /could not send to \[email\]/);
    assert.doesNotMatch(runs[0].error, EMAIL, 'email addresses are masked');
    assert.equal(log.errors.at(-1)?.msg, 'job boom failed');
  });

  test('runJobs never throws, even when runs cannot be recorded', async () => {
    const log = quiet();
    let ran = 0;
    const broken = { db: { query: async () => { throw new Error('database unavailable'); } } };
    await runJobs(broken, log, { jobs: [['one', () => { ran += 1; return 1; }], ['two', () => { ran += 1; throw new Error('nope'); }], ['three', () => { ran += 1; }]] });
    assert.equal(ran, 3);
    assert.ok(log.errors.some((e) => e.msg === 'job one: run not recorded'));
    assert.ok(log.errors.some((e) => e.msg === 'job runs not pruned'));
    await runJobs({}, log, { jobs: [['no-db', () => 1]] }); // no database at all: still resolves
  });

  test('runs older than 7 days are pruned by the runner; newer ones stay', async () => {
    await q(`delete from job_runs`);
    await q(`insert into job_runs (job, started_at, finished_at, ok) values
      ('posts', now() - interval '8 days', now() - interval '8 days', true),
      ('posts', now() - interval '6 days', now() - interval '6 days', true)`);
    await runJobs(env.app.ctx, quiet(), { jobs: [] });
    const { rows } = await q(`select started_at > now() - interval '7 days' as recent from job_runs`);
    assert.deepEqual(rows.map((r) => r.recent), [true]);
  });
});

describe('report', () => {
  test('shape: database, rows, jobs, email, storage, sessions, removal, server and app version', async () => {
    await q(`delete from job_runs`);
    await runJobs(env.app.ctx, quiet());
    const h = await health();
    assert.ok(!Number.isNaN(Date.parse(h.checkedAt)));
    assert.equal(h.database.kind, 'pglite');
    assert.equal(h.database.reachable, true);
    assert.ok(Number.isInteger(h.database.pingMs));
    assert.ok(h.database.sizeBytes > 0, 'PGlite reports pg_database_size');
    assert.equal(typeof h.database.serverVersion, 'string');
    assert.equal(h.database.rows.users, 5);
    assert.equal(h.database.rows.communities, 1);
    assert.equal(h.database.rows.memberships, 2);
    assert.ok(Object.values(h.database.rows).every((n) => Number.isInteger(n)), 'every main table counted');
    assert.deepEqual(h.jobs.map((j) => j.name), JOBS.map(([n]) => n));
    for (const j of h.jobs) {
      assert.equal(j.lastRun.ok, true);
      assert.ok(j.lastRun.durationMs >= 0);
      assert.equal(j.lastSuccessAt, j.lastRun.startedAt);
      assert.equal(j.failures24h, 0);
      assert.equal(j.lastError, null);
    }
    assert.deepEqual(Object.keys(h.email).sort(), ['failed24h', 'oldestQueuedAt', 'queued', 'retrying', 'sent24h']);
    assert.deepEqual(h.storage, { bytes: 0, count: 0, deletedBytes: 0, deletedCount: 0 });
    assert.ok(h.sessions.active >= 5);
    assert.deepEqual(h.deletedCommunities, { waiting: 0, due: 0, nextRemovalAt: null });
    assert.equal(h.server.node, process.version);
    assert.ok(h.server.uptimeSeconds >= 0);
    for (const k of ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers']) assert.ok(h.server.memory[k] >= 0, k);
    assert.equal(typeof h.app.version, 'string');
    assert.deepEqual(h.attention, []);
  });

  test('jobs: last run, last success, failures in 24 h and the last error; never-run jobs listed as null', async () => {
    await q(`delete from job_runs`);
    await q(`insert into job_runs (job, started_at, finished_at, ok, error) values
      ('emails', now() - interval '2 days', now() - interval '2 days', false, 'old failure'),
      ('emails', now() - interval '3 hours', now() - interval '3 hours', true, null),
      ('emails', now() - interval '2 hours', now() - interval '2 hours', false, 'mail provider timed out'),
      ('emails', now() - interval '1 minute', now() - interval '1 minute', false, 'mail provider refused')`);
    const h = await health();
    const emails = h.jobs.find((j) => j.name === 'emails');
    assert.equal(emails.lastRun.ok, false);
    assert.equal(emails.failures24h, 2, 'the one from two days ago is not counted');
    assert.equal(emails.lastError.message, 'mail provider refused');
    assert.ok(Date.parse(emails.lastSuccessAt) < Date.parse(emails.lastRun.startedAt));
    assert.equal(h.jobs.find((j) => j.name === 'posts').lastRun, null);
    assert.ok(h.attention.includes('job_failing'));
    assert.ok(!h.attention.includes('jobs_not_running'));
    await q(`update job_runs set started_at = started_at - interval '10 minutes', finished_at = finished_at - interval '10 minutes'`);
    assert.ok((await health()).attention.includes('jobs_not_running'), 'no run for 5 minutes');
  });

  test('email outbox counts by status, storage used, communities waiting for removal', async () => {
    await q(`insert into email_outbox (to_email, template, subject, body, status, attempts, created_at, sent_at) values
      ('a@example.com', 't', 's', 'b', 'queued', 0, now() - interval '2 hours', null),
      ('b@example.com', 't', 's', 'b', 'queued', 0, now() - interval '5 minutes', null),
      ('c@example.com', 't', 's', 'b', 'sent', 1, now() - interval '1 hour', now() - interval '1 hour'),
      ('d@example.com', 't', 's', 'b', 'sent', 1, now() - interval '3 days', now() - interval '3 days'),
      ('e@example.com', 't', 's', 'b', 'failed', 1, now() - interval '1 hour', null),
      ('f@example.com', 't', 's', 'b', 'failed', 3, now() - interval '2 hours', null),
      ('g@example.com', 't', 's', 'b', 'failed', 3, now() - interval '4 days', null)`);
    await q(`insert into files (id, community_id, uploaded_by, name, mime, kind, size, sha256, data, deleted_at) values
      ('f1', 'club', 'own', 'a.pdf', 'application/pdf', 'pdf', 1000, 'x', '\\x00'::bytea, null),
      ('f2', 'club', 'own', 'b.pdf', 'application/pdf', 'pdf', 500, 'y', '\\x00'::bytea, now())`);
    await q(`insert into communities (id, slug, name, visibility, created_by, status, deleted_at, purge_after) values
      ('gone', 'gone', 'Gone Club', 'public', 'own', 'deleted', now() - interval '31 days', now() - interval '1 day'),
      ('soon', 'soon', 'Soon Club', 'public', 'own', 'deleted', now(), now() + interval '29 days')`);
    const h = await health();
    const before = await q(`select count(*)::int as n from email_outbox where status = 'queued'`);
    assert.equal(h.email.queued, before.rows[0].n);
    assert.equal(h.email.failed24h, 2);
    assert.equal(h.email.retrying, 1, 'failed, fewer than 3 attempts, within a day: the retry job still tries it');
    assert.ok(h.email.sent24h >= 1);
    const { rows: [oldest] } = await q(`select min(created_at) as at from email_outbox where status = 'queued'`);
    assert.equal(h.email.oldestQueuedAt, new Date(oldest.at).toISOString());
    assert.deepEqual(h.storage, { bytes: 1500, count: 2, deletedBytes: 500, deletedCount: 1 });
    assert.equal(h.deletedCommunities.waiting, 2);
    assert.equal(h.deletedCommunities.due, 1);
    assert.ok(Date.parse(h.deletedCommunities.nextRemovalAt) < Date.now());
    for (const code of ['emails_failed', 'emails_stuck', 'removal_overdue']) assert.ok(h.attention.includes(code), code);
  });

  test('no email addresses, names, password hashes or session tokens anywhere in the output', async () => {
    await runJobs(env.app.ctx, quiet(), { jobs: [['boom', () => { throw new Error('rejected for own@example.com'); }]] });
    const h = await health('sup');
    const text = JSON.stringify(h);
    assert.doesNotMatch(text, EMAIL);
    assert.doesNotMatch(text, /Olu Owner|Mei Member|Chess Club|Gone Club/);
    const { rows: secrets } = await q(`select id_hash as v from sessions union all select password_hash from users`);
    for (const s of secrets) assert.ok(!text.includes(s.v));
    assert.doesNotMatch(text, /password|token|secret|DATABASE_URL/i);
  });
});
