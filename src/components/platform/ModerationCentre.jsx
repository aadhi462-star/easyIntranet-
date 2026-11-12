// Administration → Moderation centre (board S7Moderation, D5): only what communities can't settle
// themselves. Reports about Owners, cases a community escalated, reports open 7 days with no
// active moderator, and appeals nobody in the community can decide. Opening one is an
// Administrative Mode visit: the request carries the header and the server logs it.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { ACTION_LABEL, REASON_LABEL, TARGET_LABEL } from '../../lib/manage.js';
import { dateTimeText } from '../../lib/platform.js';
import { timeAgo } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Field } from '../ui.jsx';
import { Chips, Failed, Loading } from './bits.jsx';

const WHY = {
  owner: 'Report about an Owner: the community’s own staff can’t review it.',
  escalated: 'Escalated by the community’s Owner or an Admin.',
  no_moderator: 'Open 7 days with no active Owner, Admin or Moderator.',
};
const KIND = { owner: 'Report about an Owner', escalated: 'Escalated', no_moderator: 'No active moderator' };

export default function ModerationCentre({ onCount }) {
  const [s, setS] = useState({ state: 'loading' });
  const [show, setShow] = useState('appeals');
  const [sel, setSel] = useState(null);
  const load = useCallback(() => {
    api('/admin/moderation').then((d) => { setS({ state: 'ready', d }); onCount?.(d.cases.length + d.appeals.length); }).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [onCount]);
  useEffect(() => { load(); }, [load]);
  if (s.state === 'loading') return <Loading label="Loading the moderation centre" />;
  if (s.state === 'error') return <Failed message={s.message} onRetry={load} />;
  const { cases, appeals, decided } = s.d;
  const by = (w) => cases.filter((c) => c.why === w);
  const items = show === 'appeals' ? appeals.map((a) => ({ key: `a:${a.id}`, kind: 'appeal', a }))
    : show === 'decided' ? [] : by(show).map((c) => ({ key: `c:${c.id}`, kind: 'case', c }));
  const current = items.find((i) => i.key === sel) ?? items[0];
  const chips = [
    { id: 'appeals', label: 'Appeals', count: appeals.length }, { id: 'owner', label: 'Reports about Owners', count: by('owner').length },
    { id: 'escalated', label: 'Escalated', count: by('escalated').length }, { id: 'no_moderator', label: 'No active moderator', count: by('no_moderator').length },
    { id: 'decided', label: 'Decided' },
  ];
  const decidedNow = () => { setSel(null); load(); };

  return (
    <div className="flex flex-col gap-5">
      <p className="t-small -mt-2">Only what communities can’t settle themselves. Everything else stays in each community’s own queue.</p>
      <Chips label="Show" options={chips} value={show} onChange={(v) => { setShow(v); setSel(null); }} />
      {show === 'decided' ? (
        decided.length ? (
          <ul className="list-rows glass px-4">{decided.map((d) => (
            <li key={d.caseId} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-white">{ACTION_LABEL[d.action] ?? d.action} · {d.community}</span><span className="t-small">{d.actor ?? 'Someone'} · {dateTimeText(d.at)}</span></li>
          ))}</ul>
        ) : <p className="band text-3 p-4 text-sm">Nothing has been decided here yet.</p>
      ) : !items.length ? <p className="band text-2 p-4 text-sm">Nothing is waiting here.</p> : (
        <div className="glass flex flex-wrap overflow-hidden">
          <nav aria-label="Waiting" className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 border-b border-[var(--az-hairline)] p-3 md:border-b-0 md:border-r">
            {items.map((i) => (
              <button key={i.key} aria-current={current?.key === i.key} onClick={() => setSel(i.key)}
                className={`rounded-lg px-3 py-2.5 text-left text-sm ${current?.key === i.key ? 'bg-[var(--az-surface)] text-white' : 'text-2 hover:text-white'}`}>
                <b className="block">{i.kind === 'appeal' ? 'Appeal' : KIND[i.c.why]} · {(i.a ?? i.c).community.name}</b>
                <span className="t-small">{i.kind === 'appeal' ? `${ACTION_LABEL[i.a.decision] ?? i.a.decision} · ${timeAgo(Date.parse(i.a.createdAt))}` : `${Object.keys(i.c.reasons).map((r) => REASON_LABEL[r]).join(', ')} · open since ${timeAgo(Date.parse(i.c.openedAt))}`}</span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-[3_1_480px] p-5">
            {current.kind === 'appeal' ? <AppealDecision key={current.key} a={current.a} onDone={decidedNow} /> : <CaseDecision key={current.key} c={current.c} onDone={decidedNow} />}
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Note title="No active moderator">A report open 7 days in a community with no Owner, Admin or Moderator who has signed in lately lands here. The Owners get a reminder on day 3.</Note>
        <Note title="Conflicts">A Platform Admin who holds a role in the community, or who took part, can see the case but another Platform Admin decides it.</Note>
        <Note title="Moderation log">Every action in every community is in the Activity log, filterable by community and person. Exporting it needs your password and is itself logged.</Note>
      </div>
    </div>
  );
}

function Note({ title, children }) {
  return <section className="band flex flex-col gap-2 p-4"><h3 className="t-h3 text-white">{title}</h3><p className="text-2 text-sm">{children}</p></section>;
}

function AdminBanner({ community }) {
  return (
    <p role="status" className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      <b>Administrative Mode.</b> {community.name}{community.visibility !== 'public' ? ` is ${community.visibility === 'closed' ? 'Closed' : 'Private'}` : ''}. Opening and deciding this is recorded in the activity log.
    </p>
  );
}

/** A case, read in Administrative Mode, decided through the Stage 6 route. */
function CaseDecision({ c, onDone }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('dismiss');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/cases/${c.id}`, { adminMode: true }).then((x) => setD(x.case)).catch((e) => setError(errorText(e))); }, [c.id]);
  const decide = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api(`/cases/${c.id}/decide`, { method: 'POST', adminMode: true, body: { action, reason: reason.trim() || null } }); toast('Decided'); onDone(); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const actions = [['dismiss', 'Dismiss', 'Nothing breaks the rules; the case closes'], ...(c.targetType !== 'member' ? [['remove', 'Remove it', 'Hidden from everyone; can be restored for 30 days']] : []), ['warn', 'Warn the person', 'Kept on their record in this community']];
  return (
    <form onSubmit={decide} className="flex flex-col gap-4">
      <AdminBanner community={c.community} />
      <p className="t-small"><span className="mr-2 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">{KIND[c.why]}</span>{WHY[c.why]}</p>
      {c.escalationNote && <p className="band p-3 text-sm"><span className="t-small block">The community’s note</span>“{c.escalationNote}”</p>}
      {!d && !error && <Loading label="Loading case" h="h-24" />}
      {d && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="band p-4 text-sm"><span className="t-label">As reported</span><p className="mt-1 whitespace-pre-wrap text-white">{d.snapshot?.title ? `${d.snapshot.title}\n` : ''}{d.snapshot?.body || '—'}</p>
            <p className="t-small mt-2">{TARGET_LABEL[d.targetType]} by {d.subject?.name ?? 'a deleted member'}</p></div>
          <div className="band p-4 text-sm"><span className="t-label">Reports</span>
            <ul className="mt-1 flex flex-col gap-1">{d.reports.map((r) => <li key={r.n} className="text-2">{r.n}. {REASON_LABEL[r.reason]}{r.note ? ` · “${r.note}”` : ''}</li>)}</ul></div>
        </div>
      )}
      {c.conflicted ? <p role="status" className="text-sm text-amber-200">You hold a role in this community or took part, so another Platform Admin decides this.</p> : (
        <>
          <fieldset className="flex flex-col gap-2"><legend className="t-label mb-2">Decision</legend>
            {actions.map(([id, label, hint]) => (
              <label key={id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${action === id ? 'border-brand-400 bg-brand-400/5' : 'border-[var(--az-hairline)]'}`}>
                <input type="radio" name="decision" checked={action === id} onChange={() => setAction(id)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand-400)]" />
                <span><b className="text-white">{label}</b><span className="t-small block">{hint}</span></span>
              </label>
            ))}
          </fieldset>
          <Field label="Reason" hint={action === 'dismiss' ? 'Optional' : 'Required; the person sees it'}><textarea className="input min-h-20" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </>
      )}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {!c.conflicted && <div className="flex justify-end"><button className="btn btn-primary" disabled={busy || (action !== 'dismiss' && !reason.trim())}>{busy ? 'Deciding…' : 'Decide'}</button></div>}
    </form>
  );
}

function AppealDecision({ a, onDone }) {
  const [outcome, setOutcome] = useState('upheld');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decide = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api(`/appeals/${a.id}/decide`, { method: 'POST', adminMode: true, body: { outcome, note: note.trim() } }); toast('Appeal decided'); onDone(); } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <form onSubmit={decide} className="flex flex-col gap-4">
      <AdminBanner community={a.community} />
      <p className="t-small"><span className="mr-2 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-semibold text-amber-200">Appeal</span>Nobody in the community who didn’t take the action can decide it.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="band p-4 text-sm"><span className="t-label">The action</span>
          <p className="mt-1 text-white">{a.decidedBy ?? 'Someone'}: {(ACTION_LABEL[a.decision] ?? a.decision).toLowerCase()} ({TARGET_LABEL[a.targetType]?.toLowerCase()})</p>
          {a.decisionReason && <p className="text-2 mt-1">Reason given: “{a.decisionReason}”</p>}</div>
        <div className="band p-4 text-sm"><span className="t-label">The appeal</span><p className="mt-1 text-white">“{a.body}”</p><p className="t-small mt-1">{a.appellant} · {dateTimeText(a.createdAt)}</p></div>
      </div>
      <fieldset className="flex flex-col gap-2"><legend className="t-label mb-2">Decision</legend>
        {[['upheld', 'Keep the decision', 'The appeal is closed; nothing changes'], ['overturned', 'Undo it', 'Content comes back and sanctions from it are lifted']].map(([id, label, hint]) => (
          <label key={id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${outcome === id ? 'border-brand-400 bg-brand-400/5' : 'border-[var(--az-hairline)]'}`}>
            <input type="radio" name="outcome" checked={outcome === id} onChange={() => setOutcome(id)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand-400)]" />
            <span><b className="text-white">{label}</b><span className="t-small block">{hint}</span></span>
          </label>
        ))}
      </fieldset>
      <Field label={`Note to ${a.appellant} and ${a.decidedBy ?? 'the moderator'}`} hint="Required"><textarea className="input min-h-20" required maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex justify-end"><button className="btn btn-primary" disabled={busy || !note.trim()}>{busy ? 'Deciding…' : 'Decide appeal'}</button></div>
    </form>
  );
}
