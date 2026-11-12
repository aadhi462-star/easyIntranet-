// An assignment lesson (Stage 5b): the learner sends text and/or files from the Stage 4 store,
// then sees the grade and feedback once an instructor returns it. Work can be sent again until
// it's graded as passed, but not while an instructor is grading it (ASM-06).
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { lessonPath } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Field } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Pill } from './bits.jsx';
import { whenText } from './Quiz.jsx';

const MB = 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.pptx,.txt,.csv,.md';
export const sizeText = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Assignment({ lesson, assignment, communityId, learner, nextId, onChanged }) {
  const mine = assignment.mine;
  const [editing, setEditing] = useState(!mine);
  const [body, setBody] = useState(mine?.body ?? '');
  const [files, setFiles] = useState(mine?.files ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const picker = useRef(null);

  const pick = async (e) => {
    const list = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const file of list) {
      if (file.size > 10 * MB) { setError(`${file.name} is over 10 MB.`); continue; }
      setUploading(true); setError('');
      try { const f = await uploadFile(communityId, file); setFiles((p) => [...p, f]); } catch (err) { setError(errorText(err)); } finally { setUploading(false); }
    }
  };
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api(`/lessons/${lesson.id}/submission`, { method: 'PUT', body: { body: body || null, fileIds: files.map((f) => f.id) } });
      toast(mine ? 'Your work was sent again' : 'Your work was sent');
      setEditing(false); onChanged();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="as-h" className="raised flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="as-h" className="t-h2 text-[var(--az-text)]">Your work</h2>
        {mine?.status === 'returned' && <Pill tone={mine.passed ? 'done' : 'warn'}>{mine.passed ? 'Passed' : 'Not passed yet'}</Pill>}
        {mine?.status === 'submitted' && <Pill>{mine.beingGraded ? 'Being graded' : 'Waiting for grading'}</Pill>}
      </div>
      <p className="t-small">Out of {assignment.points} points · pass mark {assignment.passPoints}{assignment.dueAt ? ` · due ${whenText(assignment.dueAt)}` : ''}{assignment.closed ? ' · late work is marked late' : ''}</p>

      {mine?.status === 'returned' && (
        <div className="band flex flex-col gap-2 p-4">
          <span className="text-lg font-semibold text-[var(--az-text)]">{mine.grade} of {mine.points}</span>
          {mine.feedback ? <p className="whitespace-pre-line text-sm text-[var(--az-text)]">{mine.feedback}</p> : <p className="t-small">No feedback was added.</p>}
          <span className="t-small">Returned {whenText(mine.returnedAt)}</span>
        </div>
      )}

      {mine && !editing && (
        <div className="flex flex-col gap-2">
          <span className="t-label">What you sent · {whenText(mine.submittedAt)}{mine.late ? ' · late' : ''}</span>
          {mine.body && <p className="whitespace-pre-line text-sm text-[var(--az-text)]">{mine.body}</p>}
          {mine.files.map((f) => <a key={f.id} href={`/api/files/${f.id}`} download className="flex items-center gap-2 text-sm text-brand-300 hover:underline"><Icon name="paperclip" size={16} />{f.name} · {sizeText(f.size)}</a>)}
          <div className="flex flex-wrap gap-2 pt-2">
            {learner && !mine.passed && !mine.beingGraded && <button className="btn btn-ghost" onClick={() => setEditing(true)}>{mine.status === 'returned' ? 'Send it again' : 'Change and send again'}</button>}
            {mine.passed && nextId && <Link to={lessonPath(nextId)} className="btn btn-primary">Continue course</Link>}
          </div>
          {mine.beingGraded && <p className="t-small">An instructor is grading it now. You can change it once it’s returned.</p>}
        </div>
      )}

      {editing && learner && (
        <form className="flex flex-col gap-4" onSubmit={send}>
          <Field label="Your answer" hint="Write your answer, attach files, or both."><textarea className="input min-h-36" maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <div className="flex flex-col gap-2">
            {files.length > 0 && (
              <ul className="sunken flex flex-col divide-y divide-[var(--az-divider)] text-sm">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-[var(--az-text)]">{f.name}</span><span className="t-small">{sizeText(f.size)}</span>
                    <button type="button" className="btn btn-ghost h-10 w-10 !p-0" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><Icon name="x" size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={picker} type="file" multiple accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick} />
            <button type="button" className="btn btn-ghost self-start" disabled={uploading || files.length >= 5} onClick={() => picker.current?.click()}><Icon name="paperclip" size={16} />{uploading ? 'Uploading…' : 'Attach a file'}</button>
            <span className="t-small">Up to 5 files, 10 MB each. Your instructors see your work; other learners don’t.</span>
          </div>
          {error && <p role="alert" className="text-sm text-[var(--az-danger)]">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy || uploading}>{busy ? 'Sending…' : 'Send your work'}</button>
            {mine && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
      {!learner && <p className="t-small">You manage this course. Learners’ work arrives in Grading.</p>}
    </section>
  );
}
