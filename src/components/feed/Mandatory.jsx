import { useState } from 'react';
import { fmtDate } from '../../lib/store.jsx';
import { Modal } from '../ui.jsx';

// Only what the server stores (message, button, deadline). Reminders and a custom button colour
// have no server support yet, so they aren't offered.
export const MANDATORY_DEFAULTS = {
  deadline: null, message: 'I have read and understood this post.', button: 'Acknowledge',
};

const toLocal = (t) => (t ? new Date(new Date(t).getTime() - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

function Row({ label, children }) {
  return <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--az-text)]">{label}{children}</label>;
}

/** Deadline and acknowledgement copy, with a live preview. */
export function MandatoryConfig({ initial, onSave, onRemove, onClose }) {
  const [cfg, setCfg] = useState({ ...MANDATORY_DEFAULTS, ...initial });
  const [error, setError] = useState('');
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value });
  const save = () => {
    if (cfg.message.trim().length > 200) { setError('The acknowledgement message can be at most 200 characters.'); return; }
    if (cfg.button.trim().length > 40) { setError('The button text can be at most 40 characters.'); return; }
    onSave({ ...cfg, message: cfg.message.trim(), button: cfg.button.trim() });
  };
  return (
    <Modal title={initial ? 'Manage Mandatory Read' : 'Mark as Mandatory Read'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Row label="Deadline">
          <input type="datetime-local" className="input" value={toLocal(cfg.deadline)}
            onChange={(e) => setCfg({ ...cfg, deadline: e.target.value ? new Date(e.target.value).getTime() : null })} />
        </Row>
        <Row label="Acknowledgement message"><textarea className="input" rows={2} maxLength={200} value={cfg.message} onChange={set('message')} /></Row>
        <Row label="Button text"><input className="input" maxLength={40} value={cfg.button} onChange={set('button')} /></Row>
        <div>
          <div className="t-label mb-1.5">Preview</div>
          <AckBox cfg={cfg} preview />
        </div>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {onRemove && <button type="button" className="btn btn-secondary text-[var(--az-danger)]" onClick={onRemove}>Remove Mandatory Read</button>}
          <span className="flex-1" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

/** Acknowledgement section at the bottom of a mandatory post. */
export function AckBox({ cfg, preview = false, onSubmit, busy = false }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="notice notice-warn flex flex-col gap-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--az-focus)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{cfg.message}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={(!checked && !preview) || busy}
          onClick={() => !preview && onSubmit?.()}>{cfg.button || 'Acknowledge'}</button>
        {cfg.deadline && <span className="t-small">Due {fmtDate(cfg.deadline)}</span>}
      </div>
    </div>
  );
}
