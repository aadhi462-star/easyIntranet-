import { useState } from 'react';
import { uid, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { insightsOf, MOODS, needsApproval, SHARE_TARGETS, shareLockOf } from './utils.js';

export function SentimentMeter({ counts, label = 'Sentiment' }) {
  const total = counts.happy + counts.neutral + counts.unhappy;
  const pct = (k) => (total ? Math.round((counts[k] / total) * 100) : 0);
  const colors = { happy: 'bg-emerald-400', neutral: 'bg-slate-400', unhappy: 'bg-rose-400' };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400"><span>{label}</span><span>{total} signals</span></div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img"
        aria-label={`Happy ${pct('happy')}%, neutral ${pct('neutral')}%, unhappy ${pct('unhappy')}%`}>
        {Object.keys(colors).map((k) => <div key={k} className={colors[k]} style={{ width: `${pct(k)}%` }} />)}
      </div>
      <div className="mt-1.5 flex gap-3 text-xs text-slate-300">
        {Object.keys(colors).map((k) => <span key={k}>{MOODS[k]} {pct(k)}%</span>)}
      </div>
    </div>
  );
}

export function InsightsModal({ post, onClose }) {
  const i = insightsOf(post);
  const tiles = [['Total views', i.total], ['Unique viewers', i.unique], ['Reactions', i.reactions], ['Comments', i.comments], ['Shares', i.shares], ['Engagement score', `${i.score}`]];
  return (
    <Modal title="Post insights" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-white/5 p-3"><div className="text-2xl font-extrabold">{v}</div><div className="text-xs text-slate-400">{l}</div></div>
        ))}
      </div>
      <div className="mt-5"><SentimentMeter counts={i.sentiment} label="Sentiment of reactions and comments" /></div>
      <p className="mt-4 text-xs text-slate-500">Engagement score blends the share of viewers who reacted or commented with comment and share volume (0–100).</p>
    </Modal>
  );
}

export function AdvocacyReport({ post, onClose }) {
  const { user } = useStore();
  const shares = post.advocacy.shares || {};
  const total = Object.values(shares).reduce((n, l) => n + l.length, 0);
  return (
    <Modal title="Social Advocacy report" onClose={onClose}>
      <div className="rounded-xl bg-white/5 p-4"><div className="text-3xl font-extrabold">{total}</div><div className="text-xs text-slate-400">Total shares</div></div>
      <ul className="mt-4 space-y-3">
        {post.advocacy.platforms.map((k) => (
          <li key={k}>
            <div className="flex justify-between text-sm"><span className="font-semibold">{SHARE_TARGETS[k].label}</span><span>{shares[k]?.length || 0}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-brand-500" style={{ width: `${total ? ((shares[k]?.length || 0) / total) * 100 : 0}%` }} /></div>
            {shares[k]?.length > 0 && <p className="mt-1 text-xs text-slate-400">{shares[k].map((id) => user(id)?.name).join(', ')}</p>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function RepostModal({ post, onClose }) {
  const { state, dispatch, me } = useStore();
  // Posts from private / hidden groups can only be shared back into the same group.
  const locked = shareLockOf(state, post);
  const [text, setText] = useState('');
  const [where, setWhere] = useState(locked ? locked.id : 'network');
  const groups = state.groups.filter((g) => g.members.includes(me.id));
  const share = () => {
    const scope = locked ? { type: 'group', id: locked.id } : where === 'network' ? { type: 'network' } : where === 'me' ? { type: 'user', id: me.id } : { type: 'group', id: where };
    // Shares go through moderation like any other post.
    const status = needsApproval(state, me, text) ? 'pending' : 'published';
    dispatch({ type: 'post/create', post: { id: uid('p'), type: 'post', text: text.trim(), scope, repostOf: post.id, status } });
    if (status === 'pending') toast('Your share is awaiting moderator approval');
    dispatch({ type: 'update', col: 'posts', id: post.id, patch: (p) => ({ ...p, reposts: (p.reposts || 0) + 1 }), silent: true });
    if (post.authorId !== me.id) dispatch({ type: 'notify', notification: { userId: post.authorId, kind: 'share', link: `/post/${post.id}`, text: `${me.name} shared your post` } });
    onClose();
  };
  return (
    <Modal title="Share post" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Share to">
          <select className="input" value={where} onChange={(e) => setWhere(e.target.value)} disabled={!!locked}>
            {locked ? <option value={locked.id}>{locked.emoji} {locked.name}</option> : <>
              <option value="network">🏛️ Company wall</option>
              <option value="me">🙋 My wall</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
            </>}
          </select>
          {locked && <p className="mt-1 text-xs text-slate-400">Posts from {locked.name} can only be shared within the group.</p>}
        </Field>
        <Field label="Add a comment (optional)"><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={share}>Share</button></div>
      </div>
    </Modal>
  );
}

const REASONS = ['Spam or advertising', 'Harassment or hate', 'Inappropriate content', 'Misinformation', 'Something else'];

export function ReportModal({ post, onClose }) {
  const { dispatch } = useStore();
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const submit = () => {
    dispatch({ type: 'add', col: 'flags', item: { kind: 'post', refId: post.id, reason: note ? `${reason}: ${note}` : reason, status: 'open' } });
    setDone(true);
  };
  return (
    <Modal title="Report post" onClose={onClose}>
      {done ? (
        <><p className="text-sm text-slate-300">Thanks. The moderators will review this post.</p><button className="btn btn-primary mt-4 w-full" onClick={onClose}>Done</button></>
      ) : (
        <div className="space-y-3">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs font-semibold text-slate-300">Why are you reporting this post?</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex min-h-10 items-center gap-2 text-sm"><input type="radio" name="reason" className="accent-brand-500" checked={reason === r} onChange={() => setReason(r)} />{r}</label>
            ))}
          </fieldset>
          <Field label="Details (optional)"><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Report</button></div>
        </div>
      )}
    </Modal>
  );
}
