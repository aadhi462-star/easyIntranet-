// The one confirm dialog (v2 board "Components"): replaces the browser's confirm(), which can't
// be styled, ignores the theme and reads "OK / Cancel". `await confirmAction({...})` resolves
// true or false; <ConfirmHost /> (mounted once, in App) draws it. The button names the action,
// Escape and Cancel answer false, and focus returns to what was focused before.
import { useEffect, useState } from 'react';
import { Modal } from '../ui.jsx';

let open = null; // the host's setter, while mounted

/**
 * confirmAction('Withdraw the deletion request?') or
 * confirmAction({ title, body, confirm: 'Leave', danger: true }). Resolves true when confirmed.
 */
// When the caller gives only a sentence, its first verb names the button ("Delete this
// comment?" → Delete), and destructive verbs make it the danger button.
const VERB = /^(Delete|Remove|Leave|Archive|Withdraw|Restore|Make|Sign|Publish|Submit|Reset|Erase|Permanently erase|End|Close)\b/;
const DESTRUCTIVE = /^(Delete|Remove|Leave|Erase|Permanently erase|Reset|End)\b/;

export function confirmAction(opts) {
  const o = typeof opts === 'string' ? { title: opts } : { ...opts };
  const verb = o.title?.match(VERB)?.[1];
  if (!o.confirm && verb) o.confirm = verb === 'Permanently erase' ? 'Erase' : verb === 'Sign' ? 'Sign out' : verb;
  if (o.danger === undefined) o.danger = DESTRUCTIVE.test(o.title ?? '');
  if (!open) return Promise.resolve(window.confirm(o.title)); // no host (tests, early boot)
  return new Promise((resolve) => open({ ...o, resolve }));
}

export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  useEffect(() => { open = setAsk; return () => { open = null; }; }, []);
  if (!ask) return null;
  const answer = (v) => { ask.resolve(v); setAsk(null); };
  return (
    <Modal title={ask.title} onClose={() => answer(false)}>
      {ask.body && <div className="text-2 text-sm">{ask.body}</div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => answer(false)}>{ask.cancel ?? 'Cancel'}</button>
        <button type="button" className={`btn ${ask.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => answer(true)}>{ask.confirm ?? 'Continue'}</button>
      </div>
    </Modal>
  );
}
