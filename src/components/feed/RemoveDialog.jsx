// Removing (or rejecting) a post asks for the reason in a dialog (v2 decision E10). The server
// requires the reason (up to 300 characters), tells the author and keeps it in the audit log.
import { useState } from 'react';
import { timeAgo } from '../../lib/store.jsx';
import { errorText, removePost } from '../../lib/feed.js';
import { toast } from '../../lib/toast.js';
import { Modal } from '../ui.jsx';

const MAX = 300;

/** The post's first line, cut to a readable length. */
export const firstLine = (body = '') => {
  const line = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return line.length > 140 ? `${line.slice(0, 140).trimEnd()}…` : line;
};

export default function RemoveDialog({ post, reject = false, onClose }) {
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const name = post.author?.deleted ? 'The author' : post.author?.name || 'The author';
  const preview = firstLine(post.body) || (post.attachments?.length ? 'Post with attachments' : 'Post');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const r = reason.trim();
    if (!r) { setInvalid(true); return; }
    setBusy(true); setError('');
    try {
      await removePost(post.id, r.slice(0, MAX));
      toast(reject ? 'Post rejected' : 'Post removed');
      onClose(true);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };

  return (
    <Modal title={reject ? 'Reject this post?' : 'Remove this post?'} onClose={() => onClose(false)}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <blockquote className="sunken m-0 px-3.5 py-3 text-sm leading-[22px] text-[var(--az-text)]">
          {preview} <span className="t-small">· {name}, {timeAgo(new Date(post.createdAt).getTime())}</span>
        </blockquote>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--az-text)]">
          Reason (required)
          <textarea className="input min-h-24 resize-y" rows={3} maxLength={MAX} value={reason}
            aria-invalid={invalid || undefined} aria-describedby={`rm-${post.id}-e rm-${post.id}-h`}
            onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setInvalid(false); }} />
          <span id={`rm-${post.id}-e`} className="field-error !mt-0" aria-live="polite">{invalid ? `Give a reason for ${reject ? 'rejecting' : 'removing'} this post.` : ''}</span>
          <span className="flex items-start justify-between gap-3">
            <span id={`rm-${post.id}-h`} className="t-small font-normal">Up to {MAX} characters. {name} is told the reason, and it is kept in the moderation log.</span>
            <span className="t-small shrink-0 tabular-nums" aria-hidden="true">{reason.length} / {MAX}</span>
          </span>
        </label>
        {error && <p role="alert" className="notice notice-bad">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => onClose(false)}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={busy} aria-busy={busy || undefined}>{reject ? 'Reject post' : 'Remove post'}</button>
        </div>
      </form>
    </Modal>
  );
}
