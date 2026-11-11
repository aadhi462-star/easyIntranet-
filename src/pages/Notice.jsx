// A moderation notice for the person it's about (Stage 6, D3–D4): what was decided, why, and
// the item as it was reported. One appeal, within 14 days, goes to someone who didn't take the
// action. Reports and reporters are never shown here.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { communityPath, errorText } from '../lib/communities.js';
import { ACTION_LABEL, TARGET_LABEL } from '../lib/manage.js';
import { fmtDate } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { Empty } from '../components/ui.jsx';

const SAYS = {
  remove: (t) => `Your ${t} was removed.`, warn: () => 'You received a warning.', restrict: () => 'You were restricted: you can read but not take part for now.',
  remove_member: () => 'You were removed from the community.', block: () => 'You were blocked from the community.',
};

export default function Notice() {
  const { id } = useParams();
  const [s, setS] = useState({ state: 'loading' });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/cases/${encodeURIComponent(id)}`).then((d) => setS({ state: 'ready', c: d.case })).catch((e) => setS({ state: 'error', message: errorText(e) }));
  }, [id]);
  useEffect(() => { document.title = 'Moderation notice · CommunityOne'; }, []);
  if (s.state === 'loading') return <div aria-busy="true" aria-label="Loading notice" className="glass mx-auto h-64 max-w-2xl animate-pulse" />;
  if (s.state === 'error') return <Empty icon="search" title="Notice not found">{s.message}</Empty>;
  const c = s.c;
  const noun = TARGET_LABEL[c.targetType].toLowerCase();
  const appeal = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const d = await api(`/cases/${c.id}/appeal`, { method: 'POST', body: { body } }); setS({ state: 'ready', c: d.case }); toast('Appeal sent'); } catch (err) { toast(errorText(err), 'error'); setBusy(false); }
  };
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <span className="t-label">Moderation notice · {c.community?.name}</span>
        <h1 className="t-h1 mt-1 text-white">{(SAYS[c.decision] ?? (() => ACTION_LABEL[c.decision]))(noun)}</h1>
        <p className="t-small mt-1">{fmtDate(Date.parse(c.resolvedAt))}{c.restoredAt ? ' · since undone' : ''}</p>
      </div>
      <section aria-labelledby="why-h" className="raised flex flex-col gap-2 p-5">
        <h2 id="why-h" className="t-label">The reason given</h2>
        <p className="t-body whitespace-pre-line text-white">{c.decisionReason}</p>
      </section>
      {c.targetType !== 'member' && (
        <section aria-labelledby="what-h" className="band flex flex-col gap-2 p-5">
          <h2 id="what-h" className="t-label">Your {noun}, as it was reported</h2>
          {c.snapshot.title && <p className="font-semibold text-white">{c.snapshot.title}</p>}
          <p className="whitespace-pre-line text-sm text-slate-200">{c.snapshot.body}</p>
        </section>
      )}
      {c.appeal ? (
        <section aria-labelledby="ap-h" className="glass flex flex-col gap-2 p-5">
          <h2 id="ap-h" className="t-h3 text-white">Your appeal</h2>
          <p className="text-2 text-sm">“{c.appeal.body}”</p>
          <p className="text-sm text-slate-200">{c.appeal.status === 'open' ? 'Waiting for someone who didn’t take the action to decide.'
            : c.appeal.status === 'overturned' ? 'Decided: the decision was undone.' : 'Decided: the decision stands.'}{c.appeal.note ? ` “${c.appeal.note}”` : ''}</p>
        </section>
      ) : c.canAppeal ? (
        <form onSubmit={appeal} aria-labelledby="new-ap-h" className="glass flex flex-col gap-3 p-5">
          <h2 id="new-ap-h" className="t-h3 text-white">Appeal this decision</h2>
          <p className="text-2 text-sm">You can appeal once, until {fmtDate(Date.parse(c.appealBy), { day: 'numeric', month: 'long' })}. Someone who didn’t take the action will decide.</p>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-300">Why should it change?</span>
            <textarea className="input min-h-28" required maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <button className="btn btn-primary self-end" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Send appeal'}</button>
        </form>
      ) : <p className="t-small">This decision can’t be appealed any more.</p>}
      {c.community && <Link to={communityPath(c.community)} className="text-sm text-brand-300 hover:underline">Go to {c.community.name}</Link>}
    </div>
  );
}
