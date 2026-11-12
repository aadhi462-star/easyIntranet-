// System health for Platform Admin (v2 brief Part 11, PROPOSAL_V2 §3.5): the database, the
// background jobs, the email outbox, file storage, sessions, communities waiting for removal and
// the server process. Counts and timings only: no emails, names, tokens or settings values.
// Every part is read on its own and reports null if it can't be read (PGlite lacks some of what
// PostgreSQL has), so the page never fails because one number is missing.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOBS } from '../lib/jobs.js';
import { authorize } from '../lib/permissions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STARTED_AT = new Date(Date.now() - process.uptime() * 1000);
// Table names are fixed here (never from the request), so they can go into the SQL as text.
const TABLES = ['users', 'sessions', 'communities', 'memberships', 'posts', 'comments', 'reactions', 'events', 'event_rsvps', 'files', 'resources',
  'notifications', 'courses', 'enrollments', 'certificates', 'moderation_cases', 'email_outbox', 'audit_log', 'job_runs'];
// The runner goes every minute; no run for 5 minutes means it has stopped.
const STALE_MINUTES = 5;

const num = (v) => (v == null ? null : Number(v));
const at = (d) => (d ? new Date(d).toISOString() : null);

// version.json (written at build time, when present) or package.json. Only these fields are shown.
async function appVersion() {
  for (const file of ['version.json', 'package.json']) {
    try {
      const v = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
      return { version: typeof v.version === 'string' ? v.version.slice(0, 40) : null, commit: typeof v.commit === 'string' ? v.commit.slice(0, 40) : null,
        builtAt: typeof v.builtAt === 'string' ? v.builtAt.slice(0, 40) : null, source: file };
    } catch { /* try the next one */ }
  }
  return { version: null, commit: null, builtAt: null, source: null };
}

export default async function healthRoutes(app, { ctx }) {
  const { db } = ctx;
  const version = await appVersion();
  // One part of the report: its value, or null when it can't be read here.
  const read = async (fn) => { try { return await fn(); } catch { return null; } };
  const one = async (sql) => (await db.query(sql)).rows[0];

  app.get('/health', async (req) => {
    authorize(req.user, 'health.view');
    const t0 = Date.now();
    const reachable = await read(async () => { await db.query('select 1'); return true; });
    const pingMs = Date.now() - t0;

    const [size, serverVersion, rows, jobs, email, storage, sessions, removal] = await Promise.all([
      read(async () => num((await one(`select pg_database_size(current_database()) as n`)).n)),
      read(async () => (await one(`select current_setting('server_version') as v`)).v),
      read(async () => {
        const out = {};
        for (const table of TABLES) out[table] = await read(async () => (await one(`select count(*)::int as n from ${table}`)).n);
        return out;
      }),
      read(async () => {
        const [{ rows: last }, { rows: stats }, { rows: errors }] = await Promise.all([
          db.query(`select distinct on (job) job, started_at, finished_at, ok, count from job_runs order by job, started_at desc, id desc`),
          db.query(`select job, max(started_at) filter (where ok) as last_ok, count(*) filter (where not ok and started_at > now() - interval '24 hours')::int as failures
            from job_runs group by job`),
          db.query(`select distinct on (job) job, started_at, error from job_runs where not ok order by job, started_at desc, id desc`),
        ]);
        const by = (list) => Object.fromEntries(list.map((r) => [r.job, r]));
        const l = by(last); const s = by(stats); const e = by(errors);
        // Jobs the runner knows first, in run order, then any older names still in the table.
        const names = [...new Set([...JOBS.map(([n]) => n), ...last.map((r) => r.job)])];
        return names.map((name) => ({
          name,
          lastRun: l[name] ? { startedAt: at(l[name].started_at), finishedAt: at(l[name].finished_at), ok: l[name].ok,
            durationMs: new Date(l[name].finished_at) - new Date(l[name].started_at), count: l[name].count } : null,
          lastSuccessAt: at(s[name]?.last_ok),
          failures24h: s[name]?.failures ?? 0,
          lastError: e[name] ? { at: at(e[name].started_at), message: e[name].error } : null,
        }));
      }),
      read(async () => {
        const r = await one(`select count(*) filter (where status = 'queued')::int as queued,
            count(*) filter (where status = 'sent' and coalesce(sent_at, created_at) > now() - interval '24 hours')::int as sent,
            count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours')::int as failed,
            count(*) filter (where status = 'failed' and attempts < 3 and created_at > now() - interval '1 day')::int as retrying,
            min(created_at) filter (where status = 'queued') as oldest_queued
          from email_outbox`);
        return { queued: r.queued, sent24h: r.sent, failed24h: r.failed, retrying: r.retrying, oldestQueuedAt: at(r.oldest_queued) };
      }),
      read(async () => {
        const r = await one(`select coalesce(sum(size), 0)::bigint as bytes, count(*)::int as n,
            coalesce(sum(size) filter (where deleted_at is not null), 0)::bigint as deleted_bytes, count(*) filter (where deleted_at is not null)::int as deleted
          from files`);
        return { bytes: num(r.bytes), count: r.n, deletedBytes: num(r.deleted_bytes), deletedCount: r.deleted };
      }),
      read(async () => (await one(`select count(*)::int as n from sessions where revoked_at is null and expires_at > now()`)).n),
      read(async () => {
        const r = await one(`select count(*)::int as n, count(*) filter (where purge_after <= now())::int as due, min(purge_after) as next
          from communities where status = 'deleted'`);
        return { waiting: r.n, due: r.due, nextRemovalAt: at(r.next) };
      }),
    ]);

    // What needs a look, as codes the page turns into sentences.
    const attention = [];
    if (!reachable) attention.push('database_unreachable');
    if (jobs) {
      const lastAny = Math.max(0, ...jobs.map((j) => (j.lastRun ? new Date(j.lastRun.startedAt).getTime() : 0)));
      if (Date.now() - lastAny > STALE_MINUTES * 60e3) attention.push('jobs_not_running');
      if (jobs.some((j) => j.lastRun && !j.lastRun.ok)) attention.push('job_failing');
    }
    if (email?.failed24h) attention.push('emails_failed');
    if (email?.oldestQueuedAt && Date.now() - new Date(email.oldestQueuedAt) > 60 * 60e3) attention.push('emails_stuck');
    if (removal?.due) attention.push('removal_overdue');

    const mem = process.memoryUsage();
    return {
      checkedAt: new Date().toISOString(),
      attention,
      database: { kind: db.kind, reachable: !!reachable, pingMs, sizeBytes: size, serverVersion, rows },
      jobs,
      email,
      storage,
      sessions: { active: sessions },
      deletedCommunities: removal,
      server: {
        startedAt: STARTED_AT.toISOString(), uptimeSeconds: Math.round(process.uptime()), node: process.version,
        memory: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external, arrayBuffers: mem.arrayBuffers },
      },
      app: version,
    };
  });
}
