import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { fmtDate, timeAgo, useStore } from '../../lib/store.jsx';
import { BADGES } from '../../lib/gamify.js';
import { runJob, INTERVALS } from '../../lib/runners/schedulers.jsx';
import { Field, Modal } from '../ui.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

export const TRIGGERS = [
  ['signup', 'A new member signs up'], ['post/create', 'A post is published'], ['post/comment', 'Someone comments on a post'],
  ['forum/save', 'A forum post is saved'], ['forum/reply', 'Someone replies in a forum'], ['event/create', 'An event is created'],
  ['event/rsvp', 'Someone RSVPs to an event'], ['group/create', 'A group is created'], ['group/join', 'Someone joins or leaves a group'],
  ['channel/send', 'A channel message is sent'], ['manual/article', 'A manual article is saved'], ['add:ideas', 'An idea is submitted'],
  ['add:praise', 'Someone gives praise'], ['add:files', 'A file is uploaded'], ['add:appRecords', 'A custom app record is submitted'],
  ['add:surveyResponses', 'A survey response is submitted'], ['add:townhallQuestions', 'A town hall question is asked'],
];
const ACTIONS = [['notifyUser', 'Notify a member'], ['notifyAdmins', 'Notify all admins'], ['announce', 'Post an announcement'], ['createTask', 'Create a task'], ['awardBadge', 'Award a badge']];
const triggerLabel = (t) => TRIGGERS.find(([v]) => v === t)?.[1] ?? t;

export function Workflows() {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState(null);
  const list = state.workflows || [];
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        <p className="text-sm text-slate-400">When something happens, do something automatically. Use <code>{'{user}'}</code> in text for the member who triggered it.</p>
        <button className="btn btn-primary shrink-0" onClick={() => setEditing('new')}>+ New workflow</button>
      </div>
      {list.map((wf) => (
        <article key={wf.id} className="glass p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 font-bold"><Glyph value="bolt" tile={false} size={16} /> {wf.name}</h3>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={wf.enabled}
              onChange={(e) => dispatch({ type: 'update', col: 'workflows', id: wf.id, patch: { enabled: e.target.checked } })} />Enabled</label>
            <button className="btn btn-ghost h-10" onClick={() => setEditing(wf)}>Edit</button>
            <button className="btn btn-ghost h-10" onClick={async () => (await confirmAction(`Delete “${wf.name}”?`)) && dispatch({ type: 'remove', col: 'workflows', id: wf.id })}>Delete</button>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            <b>When</b> {triggerLabel(wf.trigger).toLowerCase()}
            {wf.condition?.groupId && <> in <b>{state.groups.find((g) => g.id === wf.condition.groupId)?.name}</b></>}
            {wf.condition?.keyword && <> containing “<b>{wf.condition.keyword}</b>”</>}
            {' → '}{wf.actions.map((a) => ACTIONS.find(([v]) => v === a.kind)?.[1]).join(', ')}
          </p>
          <details className="mt-2 text-xs text-slate-400">
            <summary className="cursor-pointer py-1">Run log · {wf.runs?.length ?? 0}</summary>
            {(wf.runs || []).length === 0 ? <p className="py-1">Hasn’t run yet.</p> : (
              <ul className="mt-1 space-y-1">{wf.runs.map((r, i) => <li key={i}>{timeAgo(r.at)} · {r.entryType} · {state.users.find((u) => u.id === r.userId)?.name ?? '—'}</li>)}</ul>
            )}
          </details>
        </article>
      ))}
      {editing && <WorkflowEditor wf={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function WorkflowEditor({ wf, onClose }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState(wf?.name ?? '');
  const [trigger, setTrigger] = useState(wf?.trigger ?? 'post/create');
  const [condition, setCondition] = useState(wf?.condition ?? { groupId: '', keyword: '' });
  const [actions, setActions] = useState(wf?.actions ?? [{ kind: 'notifyAdmins', text: '' }]);
  const setAct = (i, patch) => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const save = () => {
    if (!name.trim() || !actions.length) return alert('Give the workflow a name and at least one action.');
    const data = { name: name.trim(), trigger, condition, actions };
    if (wf) dispatch({ type: 'update', col: 'workflows', id: wf.id, patch: data });
    else dispatch({ type: 'add', col: 'workflows', item: { ...data, enabled: true, runs: [] } });
    onClose();
  };
  return (
    <Modal title={wf ? 'Edit workflow' : 'New workflow'} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Trigger"><select className="input" value={trigger} onChange={(e) => setTrigger(e.target.value)}>{TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Only in group (optional)"><select className="input" value={condition.groupId} onChange={(e) => setCondition({ ...condition, groupId: e.target.value })}>
            <option value="">Anywhere</option>{state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Only if content contains (optional)"><input className="input" value={condition.keyword} onChange={(e) => setCondition({ ...condition, keyword: e.target.value })} placeholder="e.g. hiring" /></Field>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Actions</div>
          <ul className="space-y-2">
            {actions.map((a, i) => (
              <li key={i} className="flex flex-wrap gap-2 rounded-xl bg-white/5 p-3">
                <select className="input !w-48" value={a.kind} onChange={(e) => setAct(i, { kind: e.target.value })} aria-label="Action">{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {a.kind === 'awardBadge' ? (
                  <select className="input min-w-40 flex-1" value={a.badgeId || ''} onChange={(e) => setAct(i, { badgeId: e.target.value })} aria-label="Badge">
                    <option value="">Choose badge…</option>{BADGES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                ) : (
                  <input className="input min-w-40 flex-1" value={a.text || ''} onChange={(e) => setAct(i, { text: e.target.value })} placeholder="Message / title" aria-label="Action text" />
                )}
                {(a.kind === 'notifyUser' || a.kind === 'createTask') && (
                  <select className="input !w-44" value={a.userId || ''} onChange={(e) => setAct(i, { userId: e.target.value })} aria-label="Member">
                    <option value="">{a.kind === 'notifyUser' ? 'The triggering member' : 'First admin'}</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                )}
                {a.kind === 'announce' && (
                  <select className="input !w-44" value={a.groupId || ''} onChange={(e) => setAct(i, { groupId: e.target.value })} aria-label="Where">
                    <option value="">Network wall</option>{state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                )}
                <button className="btn btn-ghost h-11 w-11 !p-0" onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label="Remove action">✕</button>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost mt-2" onClick={() => setActions([...actions, { kind: 'notifyAdmins', text: '' }])}>+ Add action</button>
        </div>
        <button className="btn btn-primary w-full" onClick={save}>Save workflow</button>
      </div>
    </Modal>
  );
}

const KINDS = [['digest', 'Digest post (recent activity summary)'], ['inactive', 'Remind inactive members'], ['announcement', 'Custom announcement']];

export function Schedulers() {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState({ name: '', kind: 'announcement', interval: 'weekly', target: 'network', text: '' });
  const list = state.schedulers || [];
  const upd = (id, patch) => dispatch({ type: 'update', col: 'schedulers', id, patch });
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Recurring jobs run automatically while the app is open (checked every 30 seconds).</p>
      {list.map((j) => (
        <article key={j.id} className="glass flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-56 flex-1">
            <h3 className="font-bold"><Glyph value="clock" tile={false} size={16} /> {j.name}</h3>
            <p className="text-xs text-slate-400">{KINDS.find(([v]) => v === j.kind)?.[1]} · {j.interval}
              · last run {j.lastRun ? timeAgo(j.lastRun) : 'never'} · next {j.enabled && j.nextRun ? fmtDate(j.nextRun) : '—'}</p>
          </div>
          <select className="input !w-32" value={j.interval} onChange={(e) => upd(j.id, { interval: e.target.value, nextRun: (j.lastRun || Date.now()) + INTERVALS[e.target.value] })} aria-label="Interval">
            {Object.keys(INTERVALS).map((k) => <option key={k}>{k}</option>)}</select>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={j.enabled} onChange={(e) => upd(j.id, { enabled: e.target.checked })} />On</label>
          <button className="btn btn-ghost h-10" onClick={() => runJob(j, state, dispatch)}>Run now</button>
          <button className="btn btn-ghost h-10" onClick={async () => (await confirmAction(`Delete “${j.name}”?`)) && dispatch({ type: 'remove', col: 'schedulers', id: j.id })} aria-label={`Delete ${j.name}`}>✕</button>
        </article>
      ))}
      <form className="glass grid gap-3 p-4 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        dispatch({ type: 'add', col: 'schedulers', item: { ...draft, name: draft.name.trim(), enabled: true, lastRun: null, nextRun: Date.now() + INTERVALS[draft.interval] } });
        setDraft({ name: '', kind: 'announcement', interval: 'weekly', target: 'network', text: '' });
      }}>
        <Field label="New scheduled job"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Monday motivation" /></Field>
        <Field label="Type"><select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Every"><select className="input" value={draft.interval} onChange={(e) => setDraft({ ...draft, interval: e.target.value })}>{Object.keys(INTERVALS).map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Post to"><select className="input" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })}>
          <option value="network">Network wall</option>{state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        {draft.kind === 'announcement' && <div className="sm:col-span-2"><Field label="Announcement text"><textarea className="input" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></Field></div>}
        <button className="btn btn-primary sm:col-span-2">Add job</button>
      </form>
    </div>
  );
}
