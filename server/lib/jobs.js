// Background jobs, run once a minute by server/index.js (and directly by tests). Each one is
// safe to run twice: everything it does is deduplicated or conditional.
//   - event reminders: once per person, occurrence and reminder time, and only to people who
//     are still going and still members when it's sent (NTF-04)
//   - failed emails: retried up to 3 attempts in total within a day, then left recorded (NTF-03)
//   - waitlists: places freed because someone left or was removed go to the next in line
//   - restrictions: time-limited restrictions lift on their own when they end (Stage 6)
//   - deleted communities: removed for good after 30 days, in steps that resume (Stage 7, DEL-13)
//   - stale reports: Owners reminded on day 3 before a report goes to the platform (MOD-09)
// Every run is recorded in job_runs for system health in Platform Admin (routes/health.js).
import { nextOccurrence } from '../../shared/recurrence.js';
import { COUNTED, promoteWaitlist, timing } from '../routes/events.js';
import { publishDuePosts } from '../routes/posts.js';
import { notify } from './notify.js';
import { liftExpiredRestrictions } from '../routes/moderation.js';
import { purgeDeletedCommunities, remindStaleReports } from '../routes/platform.js';

const MIN = 60e3;
const LATE = 15 * MIN; // a reminder that's more than 15 minutes overdue (server was down) is skipped

export async function sendReminders(ctx, now = Date.now()) {
  const { db } = ctx;
  const { rows } = await db.query(`select * from events where status = 'scheduled' and deleted_at is null and cardinality(reminders) > 0`);
  let sent = 0;
  for (const e of rows) {
    const next = nextOccurrence(timing(e), now);
    if (!Number.isFinite(next) || next <= now) continue;
    for (const m of e.reminders) {
      const due = next - m * MIN;
      if (due > now || now - due > LATE) continue;
      const { rows: going } = await db.query(`select r.user_id from event_rsvps r join events e on e.id = r.event_id
        where r.event_id = $1 and r.status = 'going' and ${COUNTED}`, [e.id]);
      const to = await notify(ctx, null, { to: going.map((g) => g.user_id), type: 'event_reminder', communityId: e.community_id,
        targetType: 'event', targetId: e.id, dedupe: `reminder:${e.id}:${next}:${m}` });
      sent += to.length;
    }
  }
  return sent;
}

export async function retryEmails(ctx) {
  const { db, mailer } = ctx;
  if (!mailer?.retry) return 0;
  const { rows } = await db.query(`select * from email_outbox where status = 'failed' and attempts < 3 and created_at > now() - interval '1 day' order by id limit 20`);
  let ok = 0;
  for (const r of rows) if (await mailer.retry(r)) ok += 1;
  return ok;
}

export async function sweepWaitlists(ctx) {
  const { db } = ctx;
  const { rows } = await db.query(`select distinct e.id, e.community_id from events e join event_rsvps r on r.event_id = e.id
    where r.status = 'waitlist' and e.status = 'scheduled' and e.deleted_at is null`);
  let promoted = 0;
  for (const e of rows) {
    const moved = await db.tx(async (t) => { await t.query(`select id from events where id = $1 for update`, [e.id]); return promoteWaitlist(t, e.id); });
    for (const r of moved) {
      await notify(ctx, null, { to: [r.user_id], type: 'waitlist_promoted', communityId: e.community_id, targetType: 'event', targetId: e.id,
        dedupe: `waitlist:${e.id}:${r.user_id}:${new Date(r.waitlisted_at).getTime()}` });
    }
    promoted += moved.length;
  }
  return promoted;
}

// The jobs in the order they run. Each takes ctx and may return a count (or rows) of what it did.
export const JOBS = [
  ['posts', (ctx) => publishDuePosts(ctx.db)], ['reminders', (ctx) => sendReminders(ctx)], ['emails', (ctx) => retryEmails(ctx)],
  ['waitlists', (ctx) => sweepWaitlists(ctx)], ['restrictions', (ctx) => liftExpiredRestrictions(ctx.db)],
  ['purge', (ctx) => purgeDeletedCommunities(ctx.db)], ['stale-reports', (ctx) => remindStaleReports(ctx)],
];
export const JOB_RUN_DAYS = 7;

// Error text kept for system health: the message only, email addresses masked, 500 characters.
const runError = (err) => String(err?.message || err || 'failed').replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[email]').slice(0, 500);
const runCount = (out) => (Number.isInteger(out) ? out : Array.isArray(out) ? out.length : null);

// Each job is independent: one failing doesn't stop the others. Every run is recorded in job_runs
// (system health) and runs older than 7 days are pruned. Nothing here throws: a failure to record
// is logged and the jobs carry on.
export async function runJobs(ctx, log = console, { jobs = JOBS } = {}) {
  for (const [name, job] of jobs) {
    const started = new Date();
    let ok = true; let error = null; let count = null;
    try { count = runCount(await job(ctx)); } catch (err) {
      ok = false; error = runError(err);
      log.error?.({ err: error }, `job ${name} failed`);
    }
    try {
      await ctx.db.query(`insert into job_runs (job, started_at, finished_at, ok, error, count) values ($1, $2, $3, $4, $5, $6)`, [name, started, new Date(), ok, error, count]);
    } catch (err) { log.error?.({ err: runError(err) }, `job ${name}: run not recorded`); }
  }
  try { await ctx.db.query(`delete from job_runs where started_at < now() - make_interval(days => $1)`, [JOB_RUN_DAYS]); } catch (err) { log.error?.({ err: runError(err) }, 'job runs not pruned'); }
}
