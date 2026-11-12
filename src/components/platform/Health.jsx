// Administration → System health (v2 G10, G11; board V2GHealth). Read-only, for staff who hold
// health.view (Super Admins and Platform Admins): the database, the job runner's recent runs and
// failures, the email outbox with its failures (addresses masked by the server), file storage,
// sessions, and the version and environment. The only action is Retry on a failed email, which
// the server records in the activity log. Figures load when the page opens and on Refresh.
//
// Every part is optional: the server reports null for what it can't read, and fields it doesn't
// send yet are left out here rather than guessed.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { dateTimeText } from '../../lib/platform.js';
import { timeAgo } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { DataTable, Failed, KV, Stat } from './bits.jsx';

const JOB_TEXT = {
  posts: 'Publishes scheduled posts', reminders: 'Sends event reminders', emails: 'Retries failed emails, up to 3 attempts',
  waitlists: 'Gives freed places to the next person', restrictions: 'Lifts restrictions that have ended',
  purge: 'Removes communities 30 days after deletion', 'stale-reports': 'Reminds about reports nobody has reviewed',
};
const TEMPLATE_TEXT = {
  notification: 'Notification', verify_email: 'Confirm your email', reset_password: 'Reset your password', change_email: 'Confirm a new email address',
  password_changed: 'Password changed', account_suspended: 'Account suspended', account_reactivated: 'Account reactivated',
  event_changed: 'Event changed', event_cancelled: 'Event cancelled', community_invite: 'Community invitation',
};
const ENGINE = { 'pglite-app-folder': 'PGlite, files in the app folder', 'pglite-dir': 'PGlite, files in a data folder', postgres: 'PostgreSQL' };
const KIND = { pglite: 'PGlite', postgres: 'PostgreSQL' };
// Attention codes the summary cards don't already say.
const ATTENTION = {
  database_unreachable: ['bad', 'The server can’t reach the database.', 'Pages that read or save anything are failing until it answers again.'],
  jobs_not_running: ['bad', 'The job runner has stopped.', 'Reminders, retries and removals are waiting. No job has finished in the last 5 minutes.'],
  emails_stuck: ['warn', 'Emails are waiting to send.', 'The oldest has been in the outbox for over an hour.'],
  removal_overdue: ['warn', 'A deleted community is past its removal date.', 'It hasn’t been removed for good yet; the purge job tries again on its next run.'],
};

const has = (v) => v !== null && v !== undefined;
const ago = (d) => (d ? timeAgo(Date.parse(d)) : null);
export function bytesText(n) {
  if (!has(n)) return null;
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} bytes`;
}
const count = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const label = (key) => String(key).replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** The failed runs a job reports for the last 14 days, when the server sends them. */
function failedRuns(j) {
  if (Array.isArray(j.failures)) return j.failures;
  if (Array.isArray(j.history)) return j.history.filter((r) => r && r.ok === false);
  if (Array.isArray(j.runs)) return j.runs.filter((r) => r && r.ok === false);
  return null;
}
const failures14 = (j) => (has(j.failures14d) ? j.failures14d : failedRuns(j)?.length ?? null);

/** What needs a look, for the Administration menu: true when anything is off. */
export function healthNeedsAttention(h) {
  return !!h && ((h.attention?.length ?? 0) > 0 || (h.warnings?.length ?? 0) > 0);
}

export default function Health({ onLoaded }) {
  const [s, setS] = useState({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    api('/admin/health')
      .then((d) => { setS({ state: 'ready', d }); onLoaded?.(d); })
      .catch((e) => setS((p) => (p.d ? { ...p, refreshError: errorText(e) } : { state: 'error', message: e?.status === 403 ? 'System health is for Platform Admins and Super Admins.' : errorText(e) })))
      .finally(() => setBusy(false));
  }, [onLoaded]);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { setS((p) => ({ ...p, refreshError: null })); load(); };

  const h = s.d;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="t-h2 hidden lg:block">System health</h2>
          <span className="t-small">{h ? `Checked ${dateTimeText(h.checkedAt)} · figures load when you open the page` : 'Figures load when you open the page'}</span>
        </div>
        <Button icon="repeat" busy={busy} onClick={refresh}>Refresh</Button>
      </div>
      {s.state === 'loading' ? <HealthSkeleton /> : s.state === 'error' ? <Failed title="System health didn’t load." message={s.message} onRetry={refresh} /> : (
        <Report h={h} onChanged={load} refreshError={s.refreshError} />
      )}
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="panel p-4"><Skeleton lines={2} label="Loading a summary" /></div>)}
      </div>
      <div className="panel p-5"><Skeleton lines={5} label="Loading the job runner" /></div>
      <div className="panel p-5"><Skeleton lines={3} label="Loading the email outbox" /></div>
    </div>
  );
}

function Report({ h, onChanged, refreshError }) {
  const db = h.database ?? {};
  const jobs = Array.isArray(h.jobs) ? h.jobs : null;
  // The outbox's counts (email) and its failures (outbox) arrive side by side.
  const outbox = h.email || h.outbox ? { ...(h.email ?? {}), ...(h.outbox ?? {}) } : null;
  const storage = h.storage ?? null;
  const notPersistent = h.warnings?.includes('data_not_persistent');
  const attention = (h.attention ?? []).filter((a) => ATTENTION[a]);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Summary cards: only the ones the server sent figures for.
  const failingJobs = jobs ? jobs.filter((j) => j.lastRun && !j.lastRun.ok).length : null;
  const lastJob = jobs ? jobs.map((j) => j.lastRun?.finishedAt).filter(Boolean).sort().pop() : null;
  const stopped = h.attention?.includes('jobs_not_running');
  const failedEmails = outbox ? (Array.isArray(outbox.failures) ? outbox.failures.length : outbox.failed24h ?? null) : null;
  const cards = [
    { id: 'db-h', label: 'Database', tone: db.reachable === false ? 'bad' : 'ok', value: db.reachable === false ? 'Not answering' : db.reachable ? 'Connected' : null, note: bytesText(db.sizeBytes) },
    jobs && { id: 'job-h', label: 'Jobs', tone: stopped ? 'bad' : failingJobs ? 'warn' : 'ok', value: stopped ? 'Stopped' : failingJobs ? `${failingJobs} failing` : 'No failures', note: lastJob ? `last run ${ago(lastJob)}` : 'no runs yet' },
    has(failedEmails) && { id: 'em-h', label: 'Email', tone: failedEmails ? 'bad' : 'ok', value: failedEmails ? `${failedEmails} failed` : 'None failed', note: 'after 3 attempts' },
    storage && { id: 'st-h', label: 'Storage', tone: 'ok', value: bytesText(storage.bytes), note: has(storage.count) ? count(storage.count, 'file') : null },
    has(h.sessions?.active) && { id: 'se-h', label: 'Sessions', tone: 'ok', value: `${h.sessions.active.toLocaleString()} active`, note: has(h.sessions.people) ? count(h.sessions.people, 'person', 'people') : null },
    h.app?.version && { id: 've-h', label: 'Version', tone: 'ok', value: h.app.version, note: h.app.environment ?? h.server?.environment ?? null },
  ].filter((c) => c && has(c.value));

  return (
    <div className="flex flex-col gap-5">
      {notPersistent && (
        <p role="status" className="notice notice-warn flex items-start gap-3">
          <Icon name="alert" size={18} className="mt-0.5 flex-none text-[var(--az-warning)]" />
          <span><b className="font-semibold">Data is stored with the app.</b> The database is PGlite in the app folder, which may be emptied when the app is redeployed, so data may be lost. Set <code className="break-all rounded bg-[var(--az-sunken)] px-1.5 py-px text-[13px]">DATABASE_URL</code> to a managed PostgreSQL before real members join.</span>
        </p>
      )}
      {attention.map((a) => {
        const [tone, title, body] = ATTENTION[a];
        return <p key={a} role="status" className={`notice notice-${tone}`}><strong>{title}</strong> {body}</p>;
      })}
      {refreshError && <Failed title="Refresh didn’t work." message={`${refreshError} The figures below are from the last check.`} />}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }} aria-label="Summary" role="group">
        {cards.map((c) => (
          <button key={c.id} type="button" onClick={() => scrollTo(c.id)}
            className={`panel flex flex-col gap-1 px-4 py-3.5 text-left hover:bg-[var(--az-sunken)] ${c.tone === 'bad' ? 'border-[var(--az-danger)]' : c.tone === 'warn' ? 'border-[var(--az-warning)]' : ''}`}>
            <span className={`flex items-center gap-2 ${c.tone === 'bad' ? 'text-[var(--az-danger)]' : c.tone === 'warn' ? 'text-[var(--az-warning)]' : 'text-[var(--az-ok)]'}`}>
              <Icon name={c.tone === 'ok' ? 'check' : 'alert'} size={16} />
              <span className="t-label text-current">{c.label}</span>
            </span>
            <span className="t-h3 break-words">{c.value}</span>
            {c.note && <span className="t-small">{c.note}</span>}
          </button>
        ))}
      </div>

      {jobs && <Jobs jobs={jobs} lastJob={lastJob} />}
      {outbox && <Outbox outbox={outbox} onChanged={onChanged} />}

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))' }}>
        <Database db={db} />
        {(storage || h.deletedCommunities) && <Storage storage={storage} removal={h.deletedCommunities} />}
        {h.sessions && <Sessions sessions={h.sessions} />}
        {(h.app || h.server) && <Version app={h.app ?? {}} server={h.server ?? {}} />}
      </div>
    </div>
  );
}

function Section({ id, title, aside, children }) {
  return (
    <section aria-labelledby={id} className="panel flex min-w-0 scroll-mt-24 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="t-h3">{title}</h3>
        {aside && <span className="t-small">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Jobs({ jobs, lastJob }) {
  const has14 = jobs.some((j) => has(failures14(j)));
  const columns = [
    { head: 'Job', place: 'title', cell: (j) => <b className="font-semibold">{j.name}</b> },
    { head: 'What it does', wrap: true, cell: (j) => <span className="text-2">{JOB_TEXT[j.name] ?? label(j.name)}</span> },
    { head: 'Last run', cell: (j) => <span className="text-2">{j.lastRun ? ago(j.lastRun.startedAt) : 'Not run yet'}</span> },
    { head: 'Took', num: true, cell: (j) => (j.lastRun && has(j.lastRun.durationMs) ? `${j.lastRun.durationMs} ms` : '') },
    { head: 'Handled', num: true, cell: (j) => (j.lastRun && has(j.lastRun.count) ? j.lastRun.count : '') },
    { head: has14 ? 'Last 14 days' : 'Last 24 hours', place: 'badge', cell: (j) => {
      const n = has14 ? failures14(j) : j.failures24h;
      if (!has(n)) return null;
      return n ? <Badge tone="bad">{n} failed</Badge> : <Badge tone="ok">No failures</Badge>;
    } },
  ];
  // Every failure the server sends for the 14 days, newest first.
  const history = jobs.flatMap((j) => (failedRuns(j) ?? []).map((r) => ({ job: j.name, at: r.at ?? r.startedAt, message: r.error ?? r.message ?? null })))
    .filter((r) => r.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return (
    <Section id="job-h" title="Job runner" aside={`Runs every minute${lastJob ? ` · last finished ${ago(lastJob)}` : ''}`}>
      <DataTable label="Jobs" columns={columns} rows={jobs} rowKey={(j) => j.name} cardLabel={(j) => j.name}
        extra={(j) => (j.lastError && j.lastRun && !j.lastRun.ok ? (
          <p className="notice notice-bad break-words">Last error, {ago(j.lastError.at)}: “{j.lastError.message}”. The next run tries again; it resumes where it stopped.</p>
        ) : null)} />
      {history.length > 0 && (
        <details className="sunken p-4">
          <summary className="cursor-pointer text-sm font-semibold">Failures in the last 14 days · {history.length}</summary>
          <ul className="list-rows mt-2">
            {history.slice(0, 50).map((r, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2 text-sm">
                <span><b className="font-semibold">{r.job}</b> <span className="text-2">· {dateTimeText(r.at)}</span></span>
                {r.message && <span className="t-small break-words">{r.message}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="t-small">Runs are kept for 14 days. A failed job only affects itself; the others carry on.</p>
    </Section>
  );
}

function Outbox({ outbox, onChanged }) {
  const [retrying, setRetrying] = useState(null);
  const failures = Array.isArray(outbox.failures) ? outbox.failures : null;
  const retry = async (f) => {
    const ok = await confirmAction({ title: 'Retry this email?', body: `“${TEMPLATE_TEXT[f.template] ?? label(f.template)}” to ${f.to} is sent once more. The retry is recorded in the activity log.`, confirm: 'Retry' });
    if (!ok) return;
    setRetrying(f.id);
    try {
      await api(`/admin/health/emails/${encodeURIComponent(f.id)}/retry`, { method: 'POST' });
      toast('Email queued to send again');
    } catch (e) {
      toast(e?.status === 409 ? 'That email isn’t failed any more, so it wasn’t retried.' : errorText(e), 'error');
    }
    setRetrying(null);
    onChanged();
  };
  const stats = [
    has(outbox.queued) && <Stat key="q" label="Waiting to send" value={outbox.queued.toLocaleString()} note={has(outbox.retrying) ? `queued, ${outbox.retrying} retrying` : 'queued or retrying'} />,
    has(outbox.sent24h) && <Stat key="s" label="Sent" value={outbox.sent24h.toLocaleString()} note="last 24 hours" />,
    has(outbox.failed24h) && <Stat key="f" label="Failed" value={outbox.failed24h.toLocaleString()} note="last 24 hours" />,
  ].filter(Boolean);
  const columns = [
    { head: 'To', place: 'title', cell: (f) => <span className="break-all">{f.to}</span> },
    { head: 'Email', cell: (f) => TEMPLATE_TEXT[f.template] ?? label(f.template ?? 'email') },
    { head: 'Attempts', num: true, cell: (f) => (has(f.attempts) ? `${f.attempts} of 3` : '') },
    { head: 'Last error', wrap: true, cell: (f) => <span className="text-2 break-words">{f.lastError ?? ''}</span> },
    { head: 'When', cell: (f) => <span className="text-2">{f.at ? dateTimeText(f.at) : ''}</span> },
    { head: 'Actions', sr: true, place: 'action', cell: (f) => <Button size="sm" busy={retrying === f.id} disabled={!!retrying && retrying !== f.id} onClick={() => retry(f)} aria-label={`Retry the email to ${f.to}`}>Retry</Button> },
  ];
  return (
    <Section id="em-h" title="Email outbox" aside={outbox.oldestQueuedAt ? `Oldest waiting since ${dateTimeText(outbox.oldestQueuedAt)}` : null}>
      {stats.length > 0 && (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-hairline)] min-[420px]:grid-cols-3" aria-label="Email in the last 24 hours" role="group">{stats}</div>
      )}
      {failures && (
        <>
          <h4 className="t-label pt-1">Failed emails</h4>
          <DataTable label="Failed emails" columns={columns} rows={failures} cardLabel={(f) => `Email to ${f.to}`} empty="No emails have failed." />
          <p className="t-small">Addresses are masked. The in-app notification was kept either way. Retry sends the email once more and is recorded in the activity log.</p>
        </>
      )}
    </Section>
  );
}

function Database({ db }) {
  const engine = ENGINE[db.storage] ?? KIND[db.kind] ?? null;
  const m = db.migrations;
  const migrations = !m ? null : Array.isArray(m) ? (m.length ? `${count(m.length, 'migration')} applied · latest ${m[m.length - 1]?.name ?? m[m.length - 1]}` : 'None applied')
    : [has(m.pending) ? (m.pending ? `${m.pending} waiting to apply` : 'All applied') : null, has(m.applied) ? count(m.applied, 'applied', 'applied') : null, m.latest ? `latest ${m.latest}` : null].filter(Boolean).join(' · ');
  const biggest = db.rows ? Object.entries(db.rows).filter(([, v]) => has(v)).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
  return (
    <Section id="db-h" title="Database">
      <div>
        {engine && <KV label="Engine">{engine}{db.serverVersion ? ` · ${db.serverVersion}` : ''}</KV>}
        <KV label="Status">{db.reachable ? <><Badge tone="ok">Connected</Badge>{has(db.pingMs) ? <span className="text-2"> answered in {db.pingMs} ms</span> : null}</> : <Badge tone="bad">Not answering</Badge>}</KV>
        {has(db.sizeBytes) && <KV label="Size">{bytesText(db.sizeBytes)}</KV>}
        {migrations && <KV label="Migrations">{migrations}</KV>}
        {biggest.length > 0 && <KV label="Most rows">{biggest.map(([t, v]) => `${t} ${v.toLocaleString()}`).join(' · ')}</KV>}
      </div>
    </Section>
  );
}

function Storage({ storage, removal }) {
  return (
    <Section id="st-h" title="File storage">
      {storage && (
        <p className="text-2 text-sm">Files live in the database. {bytesText(storage.bytes)} in {count(storage.count ?? 0, 'file')}{storage.deletedCount ? `; ${bytesText(storage.deletedBytes)} in ${count(storage.deletedCount, 'deleted file')} waiting for removal` : ''}.</p>
      )}
      {removal && (
        <div>
          <KV label="Deleted communities" width="sm:w-44">{removal.waiting ? `${removal.waiting} waiting for removal${removal.due ? ` · ${removal.due} due now` : ''}` : 'None waiting'}</KV>
          {removal.nextRemovalAt && <KV label="Next removal" width="sm:w-44">{dateTimeText(removal.nextRemovalAt)}</KV>}
        </div>
      )}
    </Section>
  );
}

function Sessions({ sessions }) {
  return (
    <Section id="se-h" title="Sessions">
      <div>
        {has(sessions.active) && <KV label="Active sessions" width="sm:w-44">{sessions.active.toLocaleString()}{has(sessions.people) ? `, for ${count(sessions.people, 'person', 'people')}` : ''}</KV>}
        {has(sessions.new24h) && <KV label="Signed in, 24 hours" width="sm:w-44">{count(sessions.new24h, 'new session')}</KV>}
        {has(sessions.failedSignIns24h) && <KV label="Failed sign-ins, 24 hours" width="sm:w-44">{sessions.failedSignIns24h.toLocaleString()}</KV>}
        {has(sessions.staff) && <KV label="Platform staff" width="sm:w-44">{count(sessions.staff, 'session')}</KV>}
      </div>
      <p className="t-small">To sign someone out, open them in Users.</p>
    </Section>
  );
}

function Version({ app, server }) {
  const env = app.environment ?? server.environment ?? null;
  const mem = server.memory?.rss;
  return (
    <Section id="ve-h" title="Version and environment">
      <div>
        {app.version && <KV label="App version">{app.version}{app.commit ? ` · build ${app.commit}` : ''}</KV>}
        {app.builtAt && <KV label="Built">{dateTimeText(app.builtAt)}</KV>}
        {server.startedAt && <KV label="Running since">{dateTimeText(server.startedAt)}</KV>}
        {(env || server.node) && <KV label="Environment">{[env, server.node ? `Node ${server.node.replace(/^v/, '')}` : null].filter(Boolean).join(' · ')}</KV>}
        {has(mem) && <KV label="Memory">{bytesText(mem)} in use</KV>}
      </div>
    </Section>
  );
}
