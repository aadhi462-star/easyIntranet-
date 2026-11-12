// The moderator queue (board S6Moderation): reported items in a split view, one at a time.
// Opening a case takes it for 30 minutes so two reviewers don't decide it at once (MOD-04). The
// server decides who may see which case (D1) and applies the decision once.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { ACTION_LABEL, REASON_LABEL, TARGET_LABEL } from '../../lib/manage.js';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { roleOf } from '../groups/helpers.js';
import { toast } from '../../lib/toast.js';
import { Pill } from '../learning/bits.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const when = (at) => timeAgo(Date.parse(at));
const reasonsText = (r) => Object.entries(r ?? {}).map(([k, n]) => `${REASON_LABEL[k] ?? k} · ${n}`).join(', ');

export default function Cases({ g, resolved = false, initial = null, onChange }) {
  const [s, setS] = useState({ state: 'loading', cases: [] });
  const [sel, setSel] = useState(initial);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/cases${resolved ? '?status=resolved' : ''}`)
    .then((d) => setS({ state: 'ready', cases: d.cases }))
    .catch((e) => setS({ state: 'error', cases: [], message: errorText(e) })), [g.id, resolved]);
  useEffect(() => { load(); }, [load]);
  const current = s.cases.find((c) => c.id === sel) ?? (initial && sel === initial ? { id: initial } : s.cases[0]);

  if (s.state === 'loading') return <div aria-busy="true" aria-label="Loading reports" className="glass h-64 animate-pulse" />;
  if (s.state === 'error') return <p role="alert" className="glass p-5 text-sm text-rose-300">{s.message}</p>;
  if (!s.cases.length && !initial) {
    return <section className="raised p-8 text-center"><h3 className="t-h2 text-white">{resolved ? 'Nothing decided yet' : 'Nothing reported'}</h3><p className="text-2 mt-1">{resolved ? 'Decided reports show here with what was done.' : 'Reports from members show here and in your notifications.'}</p></section>;
  }
  return (
    <div className="glass flex min-h-[520px] flex-col overflow-hidden md:flex-row">
      <nav aria-label="Reported items" className="flex shrink-0 flex-col gap-1 border-b border-[var(--az-hairline)] p-2 md:w-72 md:border-b-0 md:border-r">
        {s.cases.map((c) => (
          <button key={c.id} type="button" onClick={() => setSel(c.id)} aria-current={current?.id === c.id ? 'true' : undefined}
            className={`rounded-lg px-3 py-2.5 text-left text-sm ${current?.id === c.id ? 'bg-white/[.08] text-white' : 'text-slate-300 hover:bg-white/[.04]'}`}>
            <span className="block font-semibold">{TARGET_LABEL[c.targetType]} by {c.subject?.name ?? 'a deleted member'}</span>
            <span className="t-small block">{resolved ? `${ACTION_LABEL[c.decision]} · ${when(c.resolvedAt)}` : `${c.reportCount} ${c.reportCount === 1 ? 'report' : 'reports'} · ${when(c.lastReportAt)}`}</span>
            {!resolved && c.lockedBy && !c.lockedBy.me && <span className="mt-1 block text-xs text-amber-200">{c.lockedBy.name} is reviewing</span>}
          </button>
        ))}
        {!resolved && <p className="t-small mt-auto p-3">Items with more reports first, then the oldest.</p>}
      </nav>
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        {current && <CaseView key={current.id} id={current.id} g={g} onDecided={() => { setSel(null); load(); onChange?.(); }} />}
      </div>
    </div>
  );
}

function CaseView({ id, g, onDecided }) {
  const { me } = useStore();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [held, setHeld] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      // Take it to review if it's open; otherwise (or if someone else has it) just read it.
      try { const d = await api(`/cases/${id}/claim`, { method: 'POST' }); if (live) setC(d.case); return; } catch (err) {
        if (err.code === 'LOCKED' && live) setHeld(err.message);
      }
      try { const d = await api(`/cases/${id}`); if (live) setC(d.case); } catch (err) { if (live) setError(errorText(err)); }
    })();
    return () => { live = false; api(`/cases/${id}/claim`, { method: 'DELETE' }).catch(() => {}); };
  }, [id]);
  if (error) return <p role="alert" className="text-sm text-rose-300">{error}</p>;
  if (!c) return <div aria-busy="true" aria-label="Opening the report" className="h-64 animate-pulse rounded-xl bg-white/[.03]" />;
  const subject = c.subject?.name ?? 'a deleted member';
  return (
    <article aria-label={`${TARGET_LABEL[c.targetType]} by ${subject}`} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {c.status === 'open' ? <Pill tone="warn">{c.reportCount} {c.reportCount === 1 ? 'report' : 'reports'}</Pill> : <Pill>{ACTION_LABEL[c.decision]}</Pill>}
        {c.reports && <span className="t-small">{reasonsText(Object.fromEntries(Object.entries(c.reports.reduce((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + 1 }), {}))))}</span>}
        <span className="flex-1" />
        {c.now.link && !c.now.gone && <Link to={c.now.link} className="text-sm text-brand-300 hover:underline">Open it</Link>}
      </div>
      {held && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100">{held} You can read it but not decide it.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="band flex flex-col gap-2 p-4"><span className="t-label">As reported · {when(c.snapshot.at)}</span>
          {c.snapshot.title && <p className="font-semibold text-white">{c.snapshot.title}</p>}
          <p className="whitespace-pre-line text-sm text-slate-200">{c.snapshot.body || <span className="text-3">No text</span>}</p></div>
        <div className="band flex flex-col gap-2 border border-[var(--cm-line,var(--az-hairline))] p-4"><span className="t-label cm-ink">Now</span>
          {c.now.gone ? <p className="text-sm text-amber-200">Deleted by its author. The report stays open for a decision.</p>
            : c.now.removed ? <p className="text-sm text-rose-200">Removed{c.restoredAt ? '' : ' by a moderator'}.</p>
              : <>{c.now.title && <p className="font-semibold text-white">{c.now.title}</p>}<p className="whitespace-pre-line text-sm text-slate-200">{c.now.body || <span className="text-3">No text</span>}</p></>}</div>
      </div>

      {c.reports && (
        <section aria-labelledby={`rp-${c.id}`} className="flex flex-col gap-2">
          <h3 id={`rp-${c.id}`} className="t-label">What reporters said</h3>
          <ol className="flex flex-col gap-2">
            {c.reports.map((r) => (
              <li key={r.n} className="flex gap-3 text-sm">
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--az-sunken)] text-xs font-bold">{r.n}</span>
                <span><b className="text-white">{REASON_LABEL[r.reason]}</b> <span className="t-small">· {when(r.at)}</span>{r.note && <span className="text-2 block">“{r.note}”</span>}</span>
              </li>
            ))}
          </ol>
          <p className="t-small">Reporters are numbered, not named.</p>
        </section>
      )}

      {c.subject && c.subjectRecord && (
        <p className="sunken flex flex-wrap gap-x-3 gap-y-1 p-3 text-sm">
          <Link to={`/people/${c.subject.id}`} className="font-semibold text-white hover:underline">{subject}</Link>
          <span className="t-small">{[c.subjectRecord.role, c.subjectRecord.state !== 'active' && c.subjectRecord.state,
            c.subjectRecord.earlier.warn && `${c.subjectRecord.earlier.warn} earlier ${c.subjectRecord.earlier.warn === 1 ? 'warning' : 'warnings'}`,
            c.subjectRecord.earlier.restrict && `${c.subjectRecord.earlier.restrict} earlier restriction${c.subjectRecord.earlier.restrict === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'No earlier actions'}</span>
        </p>
      )}

      {c.escalatedAt && c.status === 'open' && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100">Sent to CommunityOne {when(c.escalatedAt)}{c.escalationNote ? `: “${c.escalationNote}”` : ''}. A Platform Admin will decide; you can still decide it here first.</p>}
      {c.status === 'open' && !held && !c.escalatedAt && ['owner', 'admin'].includes(roleOf(g, me?.id)) && <Escalate c={c} onDone={(d) => setC(d)} />}
      {c.status === 'open' && !held ? <Decide c={c} onDone={onDecided} /> : c.status !== 'open' && (
        <div className="flex flex-col gap-3">
          {c.decisionReason && <p className="text-2 text-sm">Reason given: “{c.decisionReason}”</p>}
          {c.canRestore && <Restore c={c} onDone={(d) => setC(d)} />}
          {c.appeal && <p className="text-sm text-slate-300">Appeal: <b className="text-white">{c.appeal.status === 'open' ? 'waiting for a decision' : c.appeal.status === 'upheld' ? 'decision kept' : 'decision undone'}</b>{c.appeal.note ? ` · “${c.appeal.note}”` : ''}</p>}
        </div>
      )}

      {c.history?.length > 0 && (
        <details className="text-sm">
          <summary className="t-small cursor-pointer">Case history ({c.history.length})</summary>
          <ol className="mt-2 flex flex-col gap-1 border-l border-[var(--az-hairline)] pl-4">
            {c.history.map((h, i) => <li key={i} className="text-slate-300">{ACTION_LABEL[h.action] ?? h.action}{h.actor ? ` by ${h.actor}` : ''} <span className="t-small">· {when(h.at)}</span>{h.detail?.reason && <span className="text-3"> · “{h.detail.reason}”</span>}</li>)}
          </ol>
        </details>
      )}
    </article>
  );
}

/** Stage 7 (D5): an Owner or Admin hands a hard case to the platform, with a note. */
function Escalate({ c, onDone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return <button type="button" className="btn btn-ghost self-start" onClick={() => setOpen(true)}>Send to CommunityOne…</button>;
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const d = await api(`/cases/${c.id}/escalate`, { method: 'POST', body: { note: note.trim() } }); toast('Sent to CommunityOne'); onDone(d.case); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={send} className="band flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1 text-sm"><b className="text-white">Why should the platform decide this?</b><span className="t-small">Platform Admins see your note in their moderation centre.</span>
        <textarea className="input min-h-20" required maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !note.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
    </form>
  );
}

const DECISIONS = [
  ['dismiss', 'Dismiss', 'Nothing breaks the guidelines'],
  ['remove', 'Remove it', 'Restorable for 30 days'],
  ['warn', 'Warn the author', 'A message only they see'],
  ['restrict', 'Restrict the author', 'Read-only for a while'],
  ['remove_member', 'Remove from community', 'They can ask again after 7 days'],
  ['block', 'Block', 'Can’t rejoin until unblocked'],
];

function Decide({ c, onDone }) {
  const member = c.targetType === 'member';
  const [action, setAction] = useState(member ? 'warn' : 'remove');
  const [days, setDays] = useState('7');
  const [alsoWarn, setAlsoWarn] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = DECISIONS.filter(([id]) => !(member && id === 'remove'));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/cases/${c.id}/decide`, { method: 'POST', body: { action, reason: reason.trim() || null, days: action === 'restrict' ? (days === 'lifted' ? null : Number(days)) : null, alsoWarn: action === 'remove' && alsoWarn } });
      toast(action === 'dismiss' ? 'Report dismissed' : 'Done. The person and the reporters have been told.');
      onDone();
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="t-label mb-2">Decision</legend>
        {options.map(([id, label, hint]) => (
          <label key={id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${action === id ? 'border-brand-400 bg-brand-400/10' : 'border-[var(--az-hairline)]'}`}>
            <input type="radio" name={`act-${c.id}`} value={id} checked={action === id} onChange={() => setAction(id)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-400)]" />
            <span><b className="text-white">{label}</b><span className="t-small block">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      {action === 'restrict' && (
        <label className="flex items-center gap-3 text-sm text-slate-200">For
          <select className="input !w-44" value={days} onChange={(e) => setDays(e.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="lifted">Until lifted</option></select>
        </label>
      )}
      {action === 'remove' && <label className="flex min-h-11 items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={alsoWarn} onChange={(e) => setAlsoWarn(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-400)]" />Also warn {c.subject?.name ?? 'the author'}</label>}
      {action !== 'dismiss' && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-300">Reason <span className="text-3 font-normal">(sent to {c.subject?.name ?? 'the person'}; reporters hear that action was taken)</span></span>
          <textarea className="input min-h-20" required maxLength={500} placeholder="Which guideline, in a sentence" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="t-small flex-1">You have this for 30 minutes; others see you’re reviewing it.</span>
        <button className={`btn ${action === 'dismiss' ? 'btn-ghost' : 'btn-primary'}`} disabled={busy}>{busy ? 'Saving…' : action === 'dismiss' ? 'Dismiss report' : 'Apply decision'}</button>
      </div>
    </form>
  );
}

function Restore({ c, onDone }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    if (!(await confirmAction('Restore it as it was? The person isn’t notified.'))) return;
    setBusy(true);
    try { onDone((await api(`/cases/${c.id}/restore`, { method: 'POST', body: {} })).case); toast('Restored'); } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  return <button className="btn btn-ghost self-start" disabled={busy} onClick={restore}>Restore it</button>;
}

/** Appeals waiting for this person (an Owner or Admin who didn't take the action, D4). */
export function Appeals({ g, onChange }) {
  const [s, setS] = useState({ state: 'loading', list: [] });
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/appeals`).then((d) => setS({ state: 'ready', list: d.appeals }))
    .catch((e) => setS({ state: 'error', list: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load]);
  if (s.state === 'loading') return <div aria-busy="true" aria-label="Loading appeals" className="glass h-40 animate-pulse" />;
  if (s.state === 'error') return <p role="alert" className="glass p-5 text-sm text-rose-300">{s.message}</p>;
  if (!s.list.length) return <section className="raised p-8 text-center"><h3 className="t-h2 text-white">No appeals for you</h3><p className="text-2 mt-1">An appeal comes to an Owner or Admin who didn’t take the action.</p></section>;
  return <ul className="flex flex-col gap-4">{s.list.map((a) => <li key={a.id}><AppealCard a={a} onDone={() => { load(); onChange?.(); }} /></li>)}</ul>;
}

function AppealCard({ a, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (outcome) => {
    if (!note.trim()) { toast('Add a note for both people first.', 'error'); return; }
    setBusy(true);
    try { await api(`/appeals/${a.id}/decide`, { method: 'POST', body: { outcome, note: note.trim() } }); toast(outcome === 'overturned' ? 'Decision undone' : 'Decision kept'); onDone(); } catch (err) { toast(errorText(err), 'error'); setBusy(false); }
  };
  return (
    <article className="glass flex flex-col gap-3 p-5">
      <p className="text-sm"><b className="text-white">{a.appellant.name}</b> <span className="t-small">appealed “{ACTION_LABEL[a.decision]}” on a {TARGET_LABEL[a.targetType].toLowerCase()}, decided by {a.decidedBy ?? 'a moderator'} · {when(a.createdAt)}</span></p>
      <p className="band whitespace-pre-line p-4 text-sm text-slate-200">“{a.body}”</p>
      <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-300">Note to both people <span className="text-3 font-normal">(required)</span></span>
        <textarea className="input min-h-16" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={() => decide('upheld')}>Keep the decision</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => decide('overturned')}>Undo the decision</button>
      </div>
    </article>
  );
}
