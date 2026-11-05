import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { fmtDate, useStore } from '../../lib/store.jsx';
import { Avatar, Field, Modal } from '../ui.jsx';
import { audienceOf } from './utils.js';

export const MANDATORY_DEFAULTS = {
  deadline: null, reminder: 'none', message: 'I have read and understood this post.', button: 'Acknowledge', color: '#84cc16',
};

const toLocal = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

/** Deadline, reminders and acknowledgement copy, with a live preview. */
export function MandatoryConfig({ initial, onSave, onRemove, onClose }) {
  const [cfg, setCfg] = useState({ ...MANDATORY_DEFAULTS, ...initial });
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  return (
    <Modal title={initial ? 'Manage Mandatory Read' : 'Mark as Mandatory Read'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deadline">
            <input type="datetime-local" className="input" value={toLocal(cfg.deadline)}
              onChange={(e) => setCfg({ ...cfg, deadline: e.target.value ? new Date(e.target.value).getTime() : null })} />
          </Field>
          <Field label="Reminders">
            <select className="input" value={cfg.reminder} onChange={set('reminder')}>
              <option value="none">No reminders</option>
              <option value="daily">Daily until read</option>
              <option value="before">One day before deadline</option>
            </select>
          </Field>
        </div>
        <Field label="Acknowledgement message"><textarea className="input" rows={2} value={cfg.message} onChange={set('message')} /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Button text"><input className="input" value={cfg.button} onChange={set('button')} /></Field>
          <Field label="Colour"><input type="color" className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent" value={cfg.color} onChange={set('color')} aria-label="Button colour" /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-semibold text-slate-300">Live preview</div>
          <AckBox cfg={cfg} preview />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {onRemove && <button className="btn btn-ghost text-rose-300" onClick={onRemove}>Remove Mandatory Read</button>}
          <span className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(cfg)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

/** Acknowledgement section at the bottom of a mandatory post. */
export function AckBox({ cfg, preview = false, onSubmit }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-brand-500" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{cfg.message}</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn text-white" style={{ background: cfg.color }} disabled={!checked && !preview}
          onClick={() => !preview && onSubmit?.()}>{cfg.button || 'Submit'}</button>
        {cfg.deadline && <span className="text-xs text-slate-400">Due {fmtDate(cfg.deadline)}</span>}
      </div>
    </div>
  );
}

/** Who has / hasn't acknowledged, with reminders. */
export function MandatoryReport({ post, onClose }) {
  const { state, dispatch, user, me } = useStore();
  const audience = audienceOf(state, post);
  const acks = post.mandatory.acks;
  const pending = audience.filter((id) => !acks.includes(id));
  const [sent, setSent] = useState([]);
  const remind = (ids) => {
    ids.forEach((id) => dispatch({ type: 'notify', notification: { userId: id, kind: 'mandatory', link: `/post/${post.id}`,
      text: `${me.name} reminded you to read a Mandatory Read post` } }));
    setSent((s) => [...s, ...ids]);
  };
  const Row = ({ id, action }) => (
    <li className="flex min-h-11 items-center gap-3 py-1.5">
      <Avatar user={user(id)} size={30} /><span className="flex-1 text-sm">{user(id)?.name}</span>{action}
    </li>
  );
  return (
    <Modal title="Mandatory Read report" onClose={onClose} wide>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-emerald-400" style={{ width: `${audience.length ? (acks.length / audience.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-semibold">{acks.length}/{audience.length} read</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Not read ({pending.length})</h3>
            {pending.length > 0 && <button className="btn btn-ghost !py-1 text-xs" onClick={() => remind(pending.filter((id) => !sent.includes(id)))}>Remind all</button>}
          </div>
          <ul className="divide-y divide-white/5">
            {pending.map((id) => <Row key={id} id={id} action={sent.includes(id)
              ? <span className="text-xs text-emerald-300">Reminder sent</span>
              : <button className="btn btn-ghost !py-1 text-xs" onClick={() => remind([id])}>Send a reminder</button>} />)}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 font-semibold">Read ({acks.length})</h3>
          <ul className="divide-y divide-white/5">{acks.map((id) => <Row key={id} id={id} action={<span aria-label="Acknowledged"><Glyph value="mandatory" tile={false} size={16} /></span>} />)}</ul>
        </section>
      </div>
    </Modal>
  );
}
