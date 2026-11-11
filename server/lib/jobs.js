// Background jobs, run once a minute by server/index.js (and directly by tests). Each one is
// safe to run twice: everything it does is deduplicated or conditional.
//   - event reminders: once per person, occurrence and reminder time, and only to people who
//     are still going and still members when it's sent (NTF-04)
//   - failed emails: retried up to 3 attempts in total within a day, then left recorded (NTF-03)
//   - waitlists: places freed because someone left or was removed go to the next in line
import { nextOccurrence } from '../../shared/recurrence.js';
import { COUNTED, promoteWaitlist, timing } from '../routes/events.js';
import { publishDuePosts } from '../routes/posts.js';
import { notify } from './notify.js';

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

export async function runJobs(ctx, log = console) {
  for (const [name, job] of [['posts', () => publishDuePosts(ctx.db)], ['reminders', () => sendReminders(ctx)], ['emails', () => retryEmails(ctx)], ['waitlists', () => sweepWaitlists(ctx)]]) {
    try { await job(); } catch (err) { log.error?.({ err: String(err.message || err) }, `job ${name} failed`); }
  }
}
