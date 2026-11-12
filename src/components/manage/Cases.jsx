// The moderator queue's reports (Stage 6 board S6Moderation, restyled to v2 boards V2GDashboards,
// V2GPhoneQueue and V2GPhoneCase): reported items in a split view, one at a time; on a phone the
// list, then the item full-width with Apply pinned. Opening a case takes it for 30 minutes so two
// reviewers don't decide it at once (MOD-04). The server decides who may see which case (D1) and
// applies the decision once.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { ACTION_LABEL, REASON_LABEL, TARGET_LABEL } from '../../lib/manage.js';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { roleOf } from '../groups/helpers.js';
import { toast } from '../../lib/toast.js';
import { confirmAction } from '../ui/Confirm.jsx';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { Icon } from '../icons.jsx';
import Split, { ActionBar } from '../queue/Split.jsx';

const when = (at) => timeAgo(Date.parse(at));
const reasonsText = (r) => Object.entries(r ?? {}).map(([k, n]) => `${REASON_LABEL[k] ?? k} · ${n}`).join(', ');
const reportsText = (n) => `${n} ${n === 1 ? 'report' : 'reports'}`;
const subjectName = (c) => c.subject?.name ?? 'a deleted member';
export const caseTitle = (c) => (c.targetType === 'member' ? `Member: ${subjectName(c)}` : `${TARGET_LABEL[c.targetType] ?? 'Item'} by ${subjectName(c)}`);

export function QueueEmpty({ title, children }) {
  return (
    <section className="panel flex flex-col items-center gap-2 p-8 text-center">
      <span className="text-[var(--az-text-3)]"><Icon name="inbox" size={28} /></span>
      <h3 className="t-h3">{title}</h3>
      <p className="text-2 max-w-md text-sm">{children}</p>
    </section>
  );
}

export function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
      <span><strong>Couldn’t load this.</strong> {message}</span>
      {onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export default function Cases({ g, resolved = false, initial = null, onChange }) {
  const [s, setS] = useState({ state: 'loading', cases: [] });
  const [sel, setSel] = useState(initial);
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/cases${resolved ? '?status=resolved' : ''}`)
    .then((d) => setS({ state: 'ready', cases: d.cases }))
    .catch((e) => setS({ state: 'error', cases: [], message: errorText(e) })), [g.id, resolved]);
  useEffect(() => { load(); }, [load]);

  if (s.state === 'loading') return <div className="panel p-5"><Skeleton lines={4} label="Loading reports" /></div>;
  if (s.state === 'error') return <LoadError message={s.message} onRetry={load} />;
  // A case opened from a notification may have left the open list (decided meanwhile): still show it.
  const extra = initial && sel === initial && !s.cases.some((c) => c.id === initial) ? { id: initial, targetType: null, subject: null, extra: true } : null;
  if (!s.cases.length && !extra) {
    return resolved
      ? <QueueEmpty title="Nothing decided yet">Decided reports show here with what was done.</QueueEmpty>
      : <QueueEmpty title="Nothing reported">Reports from members show here and in your notifications.</QueueEmpty>;
  }
  return (
    <Split
      label={resolved ? 'Decided reports' : 'Reported items'}
      items={s.cases} extra={extra} selected={sel} onSelect={setSel}
      rowTitle={(c) => (c.extra ? 'Report' : caseTitle(c))}
      rowMeta={(c) => (c.extra ? '' : resolved ? `${ACTION_LABEL[c.decision]} · ${when(c.resolvedAt)}` : `${reportsText(c.reportCount)} · ${when(c.lastReportAt)}`)}
      rowNote={(c) => (!resolved && c.lockedBy && !c.lockedBy.me ? `${c.lockedBy.name} is reviewing` : null)}
      note={resolved ? null : 'More reports first, then the oldest.'}
      itemMeta={`${g.name} · Queue`}
      detail={(c, { wide }) => <CaseView key={c.id} id={c.id} g={g} wide={wide} onListChanged={() => { load(); onChange?.(); }}
        onDecided={() => { setSel(null); load(); onChange?.(); }} />}
    />
  );
}

function CaseView({ id, g, wide, onDecided, onListChanged }) {
  const { me } = useStore();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [held, setHeld] = useState('');
  const reread = useCallback(async () => {
    try { setC((await api(`/cases/${id}`)).case); } catch (err) { setError(errorText(err)); }
  }, [id]);
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
  if (error) return <p role="alert" className="notice notice-bad">{error}</p>;
  if (!c) return <Skeleton lines={5} label="Opening the report" />;
  const subject = subjectName(c);
  const counts = c.reports ? reasonsText(c.reports.reduce((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + 1 }), {})) : '';
  const record = c.subjectRecord;
  return (
    <article aria-label={caseTitle(c)} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {c.status === 'open' ? <Badge tone="warn">{reportsText(c.reportCount)}</Badge> : <Badge>{ACTION_LABEL[c.decision]}</Badge>}
        {counts && <span className="t-small min-w-0 flex-1">{counts}</span>}
        {!counts && <span className="flex-1" />}
        {c.now.link && !c.now.gone && <Link to={c.now.link} className="link text-sm">{wide ? 'Open it' : 'Read it'}</Link>}
      </div>
      {held && <p role="status" className="notice notice-warn">{held} You can read it but not decide it.</p>}

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
        <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] bg-[var(--az-sunken)] p-4">
          <span className="t-label">As reported · {when(c.snapshot.at)}</span>
          {c.snapshot.title && <p className="font-semibold break-words">{c.snapshot.title}</p>}
          <p className="t-body whitespace-pre-line break-words">{c.snapshot.body || <span className="text-3">No text</span>}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-[var(--az-hairline)] bg-[var(--az-surface)] p-4">
          <span className="t-label !text-[var(--az-link)]">Now</span>
          {c.now.gone ? <p className="t-body">Deleted by its author. The report stays open for a decision.</p>
            : c.now.removed ? <p className="t-body">Removed{c.restoredAt ? '' : ' by a moderator'}.</p>
              : <>{c.now.title && <p className="font-semibold break-words">{c.now.title}</p>}<p className="t-body whitespace-pre-line break-words">{c.now.body || <span className="text-3">No text</span>}</p></>}
        </div>
      </div>

      {c.reports && (
        <section aria-labelledby={`rp-${c.id}`} className="flex flex-col gap-2">
          <h3 id={`rp-${c.id}`} className="t-label">What reporters said</h3>
          <ol className="flex flex-col gap-2">
            {c.reports.map((r) => (
              <li key={r.n} className="flex gap-2.5 text-sm">
                <span aria-hidden="true" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[var(--az-sunken)] text-xs font-bold">{r.n}</span>
                <span className="min-w-0"><span className="sr-only">Reporter {r.n}: </span><b className="font-semibold">{REASON_LABEL[r.reason] ?? r.reason}</b> <span className="t-small">· {when(r.at)}</span>{r.note && <span className="t-small block break-words">“{r.note}”</span>}</span>
              </li>
            ))}
          </ol>
          <p className="t-small">Reporters are numbered, never named.</p>
        </section>
      )}

      {c.subject && record && (
        <p className="m-0 rounded-[10px] bg-[var(--az-sunken)] px-3.5 py-2.5 text-sm">
          <Link to={`/people/${c.subject.id}`} className="link">{subject}</Link>{' '}
          <span className="t-small">· {[record.role, record.state !== 'active' && record.state,
            record.earlier.warn && `${record.earlier.warn} earlier ${record.earlier.warn === 1 ? 'warning' : 'warnings'}`,
            record.earlier.restrict && `${record.earlier.restrict} earlier restriction${record.earlier.restrict === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'No earlier actions'}</span>
        </p>
      )}

      {c.escalatedAt && c.status === 'open' && <p role="status" className="notice notice-info">Sent to CommunityOne {when(c.escalatedAt)}{c.escalationNote ? `: “${c.escalationNote}”` : ''}. A Platform Admin will decide; you can still decide it here first.</p>}
      {c.status === 'open' && !held && !c.escalatedAt && ['owner', 'admin'].includes(roleOf(g, me?.id)) && <Escalate c={c} onDone={(d) => setC(d)} />}
      {c.status === 'open' && !held ? (
        <Decide c={c} pinned={!wide} onDone={onDecided}
          onLocked={(m) => setHeld(m)}
          onDecidedMeanwhile={() => { reread(); onListChanged(); }} />
      ) : c.status !== 'open' && (
        <div className="flex flex-col gap-3">
          {c.decisionReason && <p className="text-2 text-sm">Reason given: “{c.decisionReason}”</p>}
          {c.canRestore && <Restore c={c} onDone={(d) => setC(d)} />}
          {c.appeal && <p className="text-2 text-sm">Appeal: <b className="font-semibold text-[var(--az-text)]">{c.appeal.status === 'open' ? 'waiting for a decision' : c.appeal.status === 'upheld' ? 'decision kept' : 'decision undone'}</b>{c.appeal.note ? ` · “${c.appeal.note}”` : ''}</p>}
        </div>
      )}

      {c.history?.length > 0 && (
        <details className="text-sm">
          <summary className="t-small min-h-11 cursor-pointer py-3">Case history ({c.history.length})</summary>
          <ol className="flex flex-col gap-1 border-l border-[var(--az-hairline)] pl-4">
            {c.history.map((h, i) => <li key={i} className="text-2">{ACTION_LABEL[h.action] ?? h.action}{h.actor ? ` by ${h.actor}` : ''} <span className="t-small">· {when(h.at)}</span>{h.detail?.reason && <span className="text-3"> · “{h.detail.reason}”</span>}</li>)}
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
  if (!open) return <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>Send to CommunityOne…</Button>;
  const send = async (e) => {
    e.preventDefault();
    if (!note.trim()) { setError('Say why the platform should decide this.'); return; }
    setBusy(true); setError('');
    try { const d = await api(`/cases/${c.id}/escalate`, { method: 'POST', body: { note: note.trim() } }); toast('Sent to CommunityOne'); onDone(d.case); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const hint = `esc-hint-${c.id}`; const err = `esc-err-${c.id}`;
  return (
    <form noValidate onSubmit={send} aria-labelledby={`esc-h-${c.id}`} className="flex flex-col gap-2.5 rounded-[10px] border border-[var(--az-hairline)] bg-[var(--az-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2"><h3 id={`esc-h-${c.id}`} className="text-[15px] font-semibold leading-snug">Send to CommunityOne</h3><Badge>Owners and Admins only</Badge></div>
      <label htmlFor={`esc-${c.id}`} className="text-sm font-medium">Why should the platform decide this?</label>
      <span id={hint} className="t-small -mt-1.5">Platform Admins see your note in their moderation centre. Required, up to 1000 characters.</span>
      <textarea id={`esc-${c.id}`} className="input min-h-20" required maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
        aria-invalid={!!error || undefined} aria-describedby={error ? `${hint} ${err}` : hint} />
      {error && <p id={err} role="alert" className="field-error !mt-0">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button><button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button></div>
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

function Decide({ c, pinned, onDone, onLocked, onDecidedMeanwhile }) {
  const member = c.targetType === 'member';
  const [action, setAction] = useState(member ? 'warn' : 'remove');
  const [days, setDays] = useState('7');
  const [alsoWarn, setAlsoWarn] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [meanwhile, setMeanwhile] = useState(false);
  const options = DECISIONS.filter(([id]) => !(member && id === 'remove'));
  const name = c.subject?.name ?? 'the person';
  const formId = `decide-${c.id}`;
  const ids = { hint: `rs-hint-${c.id}`, err: `rs-err-${c.id}`, gen: `dc-err-${c.id}` };
  const submit = async (e) => {
    e.preventDefault();
    if (action !== 'dismiss' && !reason.trim()) { setReasonError('Give a reason; the person sees it.'); document.getElementById(`rs-${c.id}`)?.focus(); return; }
    setBusy(true); setError(''); setReasonError('');
    try {
      await api(`/cases/${c.id}/decide`, { method: 'POST', body: { action, reason: reason.trim() || null, days: action === 'restrict' ? (days === 'lifted' ? null : Number(days)) : null, alsoWarn: action === 'remove' && alsoWarn } });
      toast(action === 'dismiss' ? 'Report dismissed' : 'Done. The person and the reporters have been told.');
      onDone();
    } catch (err) {
      setBusy(false);
      if (err.code === 'REASON_REQUIRED' || err.extra?.field === 'reason') setReasonError(errorText(err));
      else if (err.code === 'ALREADY_DECIDED') setMeanwhile(true);
      else if (err.code === 'LOCKED') onLocked(err.message);
      else setError(errorText(err));
    }
  };
  if (meanwhile) {
    return (
      <div role="alert" className="notice notice-warn flex flex-wrap items-center justify-between gap-3">
        <span>Someone else decided this while you had it open.</span>
        <Button size="sm" onClick={onDecidedMeanwhile}>Show their decision</Button>
      </div>
    );
  }
  return (
    <>
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4" aria-describedby={error ? ids.gen : undefined}>
        <fieldset className={pinned ? 'm-0 border-0 p-0' : 'm-0 grid gap-2 border-0 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]'}>
          <legend className="t-label pb-2">Decision</legend>
          <div className={pinned ? 'panel overflow-hidden !rounded-xl' : 'contents'}>
            {options.map(([id, label, hint]) => {
              const on = action === id;
              const cls = pinned
                ? `flex cursor-pointer items-start gap-3 border-b border-[var(--az-divider)] px-3.5 py-2 last:border-b-0 ${on ? 'bg-[var(--az-ok-soft)] shadow-[inset_3px_0_0_var(--az-focus)]' : ''}`
                : `flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3.5 ${on ? 'border-[var(--az-focus)] bg-[var(--az-ok-soft)]' : 'border-[var(--az-hairline)] bg-[var(--az-surface)]'}`;
              return (
                <label key={id} className={`${cls} text-[15px] leading-[22px]`}>
                  <input type="radio" name={`act-${c.id}`} value={id} checked={on} onChange={() => setAction(id)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--az-focus)]" />
                  <span className="flex flex-col"><b className="font-semibold">{label}</b><span className="t-small">{hint}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {action === 'restrict' && (
          <div className="flex items-center gap-3">
            <label htmlFor={`for-${c.id}`} className="text-sm font-medium">For</label>
            <select id={`for-${c.id}`} className={`input ${pinned ? 'flex-1' : '!w-44'}`} value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="lifted">Until lifted</option>
            </select>
          </div>
        )}
        {action === 'remove' && (
          <label className="flex min-h-11 items-center gap-2.5 text-[15px]">
            <input type="checkbox" checked={alsoWarn} onChange={(e) => setAlsoWarn(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--az-focus)]" />Also warn {c.subject?.name ?? 'the author'}
          </label>
        )}
        {action !== 'dismiss' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`rs-${c.id}`} className="text-sm font-medium">Reason</label>
            <span id={ids.hint} className="t-small -mt-1">Sent to {name}; the reporters hear that action was taken. Up to 500 characters.</span>
            <textarea id={`rs-${c.id}`} className={`input ${pinned ? 'min-h-16' : 'min-h-[88px]'}`} required maxLength={500} placeholder="Which guideline, in a sentence"
              value={reason} onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(''); }}
              aria-invalid={!!reasonError || undefined} aria-describedby={reasonError ? `${ids.hint} ${ids.err}` : ids.hint} />
            {reasonError && <p id={ids.err} className="field-error !mt-0">{reasonError}</p>}
          </div>
        )}
        {error && <p id={ids.gen} role="alert" className="notice notice-bad">{error}</p>}
      </form>
      <ActionBar pinned={pinned}>
        <span className="t-small min-w-0 flex-[1_1_120px]">{pinned ? 'Yours to decide for 30 minutes; others see you’re reviewing it' : 'You have this for 30 minutes; others see you’re reviewing it.'}</span>
        <button form={formId} className={`btn ${action === 'dismiss' ? 'btn-secondary' : 'btn-primary'} ${pinned ? 'flex-[1_1_160px]' : ''}`} disabled={busy}>
          {busy ? 'Saving…' : action === 'dismiss' ? 'Dismiss report' : 'Apply decision'}
        </button>
      </ActionBar>
    </>
  );
}

function Restore({ c, onDone }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    if (!(await confirmAction('Restore it as it was? The person isn’t notified.'))) return;
    setBusy(true);
    try { onDone((await api(`/cases/${c.id}/restore`, { method: 'POST', body: {} })).case); toast('Restored'); } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  return <Button variant="secondary" className="self-start" busy={busy} onClick={restore}>Restore it</Button>;
}

/** Appeals waiting for this person (an Owner or Admin who didn't take the action, D4). */
export function Appeals({ g, onChange }) {
  const [s, setS] = useState({ state: 'loading', list: [] });
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/appeals`).then((d) => setS({ state: 'ready', list: d.appeals }))
    .catch((e) => setS({ state: 'error', list: [], message: errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load]);
  if (s.state === 'loading') return <div className="panel p-5"><Skeleton lines={3} label="Loading appeals" /></div>;
  if (s.state === 'error') return <LoadError message={s.message} onRetry={load} />;
  if (!s.list.length) return <QueueEmpty title="No appeals for you">An appeal comes to an Owner or Admin who didn’t take the action.</QueueEmpty>;
  return <ul className="flex flex-col gap-4">{s.list.map((a) => <li key={a.id}><AppealCard a={a} onDone={() => { load(); onChange?.(); }} /></li>)}</ul>;
}

function AppealCard({ a, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [error, setError] = useState('');
  const decide = async (outcome) => {
    if (!note.trim()) { setNoteError('Add a note for both people first.'); document.getElementById(`ap-${a.id}`)?.focus(); return; }
    setBusy(true); setNoteError(''); setError('');
    try { await api(`/appeals/${a.id}/decide`, { method: 'POST', body: { outcome, note: note.trim() } }); toast(outcome === 'overturned' ? 'Decision undone' : 'Decision kept'); onDone(); } catch (err) {
      setBusy(false);
      if (err.code === 'ALREADY_DECIDED') { toast(errorText(err), 'error'); onDone(); } else if (err.extra?.field === 'note') setNoteError(errorText(err)); else setError(errorText(err));
    }
  };
  return (
    <article aria-label={`Appeal from ${a.appellant.name}`} className="panel flex flex-col gap-3 p-5">
      <p className="text-sm"><b className="font-semibold">{a.appellant.name}</b> <span className="t-small">appealed “{ACTION_LABEL[a.decision]}” on a {(TARGET_LABEL[a.targetType] ?? 'item').toLowerCase()}, decided by {a.decidedBy ?? 'a moderator'} · {when(a.createdAt)}</span></p>
      <p className="t-body whitespace-pre-line break-words rounded-[10px] bg-[var(--az-sunken)] p-4">“{a.body}”</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`ap-${a.id}`} className="text-sm font-medium">Note to both people</label>
        <span id={`ap-hint-${a.id}`} className="t-small -mt-1">Required. Both of them see it.</span>
        <textarea id={`ap-${a.id}`} className="input min-h-16" maxLength={1000} value={note} onChange={(e) => { setNote(e.target.value); if (noteError) setNoteError(''); }}
          aria-invalid={!!noteError || undefined} aria-describedby={noteError ? `ap-hint-${a.id} ap-err-${a.id}` : `ap-hint-${a.id}`} />
        {noteError && <p id={`ap-err-${a.id}`} className="field-error !mt-0">{noteError}</p>}
      </div>
      {error && <p role="alert" className="notice notice-bad">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => decide('upheld')}>Keep the decision</Button>
        <Button variant="primary" disabled={busy} onClick={() => decide('overturned')}>Undo the decision</Button>
      </div>
    </article>
  );
}
