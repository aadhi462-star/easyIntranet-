import { Icon } from '../icons.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uid, useStore } from '../../lib/store.jsx';
import { api, newKey, uploadFile } from '../../lib/api.js';
import { toast } from '../../lib/toast.js';
import { createPost, editPost, errorText, fetchMyCommunities, isCommunityAdmin, publishPost } from '../../lib/feed.js';
import { Avatar } from '../ui.jsx';
import { IconButton } from '../ui/Controls.jsx';
import { MandatoryConfig } from './Mandatory.jsx';

const MAX_TEXT = 5000;
const MAX_OPTION = 120;
const MAX_OPTIONS = 10;
const blankOption = () => ({ id: uid('o'), text: '' });
const toLocal = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

/**
 * Post editor, backed by the API. `communityId` fixes where the post goes (a group wall, the
 * Company Wall); without it the author picks one of the communities they're an active member of.
 * `initial` (a server post) edits it: the server lets authors change the text and mentions only.
 * `compact` starts it folded to one button (`prompt` is its text) and may change while mounted:
 * Discussions folds it on phones only (board V2EDiscussions).
 */
export default function Composer({ communityId: fixedId, initial, onDone, compact = false, defaultType, prompt = 'What’s on your mind right now?' }) {
  const { state, me, user } = useStore();
  const editing = !!initial;
  const [open, setOpen] = useState(!compact || editing);
  const [type, setType] = useState(initial?.type ?? defaultType ?? 'post');
  const [text, setText] = useState(initial?.body ?? '');
  const [mentions, setMentions] = useState(initial?.mentions ?? []);
  const [options, setOptions] = useState([blankOption(), blankOption()]);
  const [mandatory, setMandatory] = useState(null);
  const [pinned, setPinned] = useState(false);
  const [communities, setCommunities] = useState(null); // null while loading
  const [communityId, setCommunityId] = useState(fixedId ?? initial?.communityId ?? '');
  const [scheduleAt, setScheduleAt] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [mandatoryOpen, setMandatoryOpen] = useState(false);
  const [mq, setMq] = useState(null); // active @mention query
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Attachments (Stage 4, S4-3): images and PDFs, up to 4, uploaded as they're picked.
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const picker = useRef(null);
  // Topics (S4-2) of the community being posted to, when it has any.
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(initial?.topic?.id ?? '');
  // One idempotency key per composed post: a double click or network retry can't post twice.
  const submitKey = useRef(newKey());
  const ta = useRef(null);
  const uidBase = useId().replace(/:/g, '');
  // Unfolds when the caller stops asking for the folded form (a phone turned to a wide screen).
  useEffect(() => { if (!compact) setOpen(true); }, [compact]);

  useEffect(() => {
    if (editing) return;
    let live = true;
    fetchMyCommunities().then((cs) => {
      if (!live) return;
      setCommunities(cs);
      setCommunityId((cur) => cur || cs[0]?.id || '');
    }, (e) => live && (setCommunities([]), setError(errorText(e))));
    return () => { live = false; };
  }, [editing]);

  const community = communities?.find((c) => c.id === communityId);
  const notMember = !editing && communities && fixedId && !community;
  // Announcements, pins and Mandatory Read are for community admins (the server enforces it too).
  const canAdmin = !!community && isCommunityAdmin(community);

  const TYPES = [
    { id: 'post', label: 'Post', icon: 'pen' },
    canAdmin && { id: 'announcement', label: 'Announcement', icon: 'announce' },
    { id: 'poll', label: 'Poll', icon: 'poll' },
    { id: 'question', label: 'Question', icon: 'questions' },
  ].filter(Boolean);
  // Switching to a community where you aren't an admin drops the admin-only choices.
  useEffect(() => {
    if (editing || !communities) return;
    if (!canAdmin) { if (type === 'announcement') setType('post'); setMandatory(null); setPinned(false); }
  }, [canAdmin, communities, editing, type]);

  const onText = (e) => {
    setText(e.target.value);
    const before = e.target.value.slice(0, e.target.selectionStart);
    const m = before.match(/(?:^|\s)@(\w{0,20})$/);
    setMq(m ? m[1].toLowerCase() : null);
  };
  const suggestions = mq == null ? [] : state.users.filter((u) => u.id !== me.id && !u.deactivated && u.name.toLowerCase().split(' ').some((p) => p.startsWith(mq))).slice(0, 5);
  const pickMention = (u) => {
    const pos = ta.current.selectionStart;
    const before = text.slice(0, pos).replace(/@(\w{0,20})$/, `@${u.name} `);
    setText(before + text.slice(pos));
    setMentions((m) => [...new Set([...m, u.id])]);
    setMq(null);
    requestAnimationFrame(() => { ta.current.focus(); ta.current.selectionStart = ta.current.selectionEnd = before.length; });
  };

  const reset = () => {
    setText(''); setMentions([]); setOptions([blankOption(), blankOption()]); setMandatory(null); setPinned(false); setType(defaultType ?? 'post');
    setScheduleAt(null); setShowSchedule(false); setError(''); setFiles([]); setTopicId('');
    submitKey.current = newKey();
    if (compact) setOpen(false);
  };

  // Only keep mentions whose @Name is still in the text.
  const liveMentions = (body) => mentions.filter((m) => body.includes(`@${user(m)?.name}`));

  const validate = (mode) => {
    const body = text.trim();
    if (!body) return 'Write something first.';
    if (body.length > MAX_TEXT) return `Posts can be up to ${MAX_TEXT} characters. This one has ${body.length}.`;
    if (editing) return '';
    if (!communityId) return 'Pick a community to post in.';
    if (type === 'poll') {
      const opts = options.map((o) => o.text.trim()).filter(Boolean);
      if (opts.length < 2) return 'A poll needs at least two options.';
      if (opts.length > MAX_OPTIONS) return `A poll can have at most ${MAX_OPTIONS} options.`;
      if (opts.some((o) => o.length > MAX_OPTION)) return `Poll options can be at most ${MAX_OPTION} characters.`;
      if (new Set(opts.map((o) => o.toLowerCase())).size < opts.length) return 'Each poll option must be different.';
    }
    if (mode === 'schedule' && (!scheduleAt || scheduleAt <= Date.now())) return 'Pick a time in the future to schedule.';
    return '';
  };

  useEffect(() => {
    setTopics([]); setTopicId(initial?.topic?.id ?? '');
    if (!communityId || !open) return undefined;
    let live = true;
    api(`/communities/${encodeURIComponent(communityId)}/topics`).then((r) => live && setTopics(r.topics), () => {});
    return () => { live = false; };
  }, [communityId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const attach = async (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length || !communityId) return;
    if (files.length + picked.length > 4) { setError('A post can have up to 4 attachments.'); return; }
    const bad = picked.find((f) => !/^image\/(png|jpeg|gif|webp)$|^application\/pdf$/.test(f.type) || f.size > 10 * 1024 * 1024);
    if (bad) { setError(bad.size > 10 * 1024 * 1024 ? `“${bad.name}” is over 10 MB.` : `“${bad.name}” isn’t an image or a PDF. Share other files in Resources.`); return; }
    setUploading(true); setError('');
    try {
      for (const f of picked) {
        const stored = await uploadFile(communityId, f);
        setFiles((list) => [...list, stored]);
      }
    } catch (err) { setError(errorText(err)); } finally { setUploading(false); }
  };

  const submit = async (mode) => {
    if (busy) return;
    const problem = validate(mode);
    if (problem) { setError(problem); return; }
    const body = text.trim();
    setBusy(true); setError('');
    try {
      if (editing) {
        let post = await editPost(initial, { body, mentions: liveMentions(body) });
        if (mode === 'publish' && ['draft', 'scheduled'].includes(initial.status)) post = await publishPost(post.id);
        if (post.status === 'pending') toast('Your post is awaiting moderator approval');
        onDone?.(post.status);
        return;
      }
      const payload = {
        type, body, mentions: liveMentions(body),
        status: mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published',
        ...(mode === 'schedule' ? { publishAt: new Date(scheduleAt).toISOString() } : {}),
        ...(type === 'poll' ? { poll: { options: options.map((o) => o.text.trim()).filter(Boolean) } } : {}),
        ...(canAdmin && pinned && mode !== 'draft' ? { pinned: true } : {}),
        ...(topicId ? { topicId } : {}),
        ...(files.length ? { attachments: files.map((f) => f.id) } : {}),
        ...(canAdmin && mandatory ? { mandatory: { message: mandatory.message, button: mandatory.button, deadline: mandatory.deadline ? new Date(mandatory.deadline).toISOString() : null } } : {}),
      };
      const post = await createPost(communityId, payload, submitKey.current);
      if (post.status === 'pending') toast('Your post is awaiting moderator approval');
      else if (post.status === 'draft') toast('Draft saved');
      else if (post.status === 'scheduled') toast('Post scheduled');
      reset();
      onDone?.(post.status);
    } catch (e) {
      // The server's message (e.g. "Only community admins can post announcements…") is shown as is.
      setError(errorText(e));
    } finally { setBusy(false); }
  };


  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const where = community?.name;
  const placeholder = type === 'question'
    ? `Ask ${where ?? 'the community'} a question. Type @ to mention someone.`
    : `Share something${where ? ` with ${where}` : ''}. Type @ to mention someone.`;
  const check = 'h-[18px] w-[18px] shrink-0 accent-[var(--az-focus)]';

  if (!open) {
    return (
      <section aria-label="Write a post" className="panel flex items-center gap-2.5 p-3">
        <Avatar user={me} size={28} />
        <button type="button" onClick={() => setOpen(true)} className="input min-h-11 min-w-0 flex-1 cursor-text truncate text-left text-[var(--az-text-3)]">{prompt}</button>
      </section>
    );
  }

  if (notMember) {
    return <p className="notice notice-info">Join this community to post in it.</p>;
  }

  return (
    <section aria-labelledby={editing ? undefined : `${uidBase}-h`} className={editing ? 'flex flex-col gap-3.5' : 'panel flex min-w-0 flex-col gap-3.5 p-4 sm:p-5'}>
      {!editing && <h2 id={`${uidBase}-h`} className="sr-only">Write a post</h2>}
      {!editing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="Kind of post" className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-lg border border-[var(--az-control)]">
            {TYPES.map((t, i) => (
              <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)}
                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 text-sm ${i ? 'border-l border-[var(--az-control)]' : ''} ${type === t.id ? 'bg-[color-mix(in_srgb,var(--az-focus)_14%,transparent)] font-semibold text-[var(--az-on-tint)]' : 'bg-[var(--az-surface)] font-medium text-[var(--az-text)] hover:bg-[var(--az-sunken)]'}`}>
                <Icon name={t.icon} size={16} className="hidden sm:block" />{t.label}
              </button>
            ))}
          </div>
          {!fixedId && <Link to="/events?new=1" className="link inline-flex min-h-9 items-center gap-1.5 text-sm"><Icon name="events" size={16} /> Event</Link>}
        </div>
      )}

      <div className="relative">
        <textarea ref={ta} className="input min-h-24 resize-y leading-6" rows={3} value={text} onChange={onText} aria-label="Post text" maxLength={MAX_TEXT}
          onKeyDown={(e) => { if (e.key === 'Escape') setMq(null); }} placeholder={placeholder} />
        {suggestions.length > 0 && (
          <ul className="absolute left-0 z-20 mt-1 w-64 max-w-full rounded-[10px] border border-[var(--az-hairline)] bg-[var(--az-raised)] p-1 shadow-[var(--az-shadow)]" aria-label="Mention suggestions">
            {suggestions.map((u) => (
              <li key={u.id}><button type="button" onClick={() => pickMention(u)} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)]">
                <Avatar user={u} size={26} />{u.name}<span className="t-small ml-auto">{u.batch}</span></button></li>
            ))}
          </ul>
        )}
      </div>

      {editing && initial.poll && <p className="t-small">Poll options can’t be changed after posting.</p>}

      {!editing && type === 'poll' && (
        <div className="flex flex-col gap-2">
          {options.map((o, i) => (
            <div key={o.id} className="flex gap-2">
              <input className="input min-w-0" placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} maxLength={MAX_OPTION} value={o.text}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {options.length > 2 && <IconButton icon="x" variant="secondary" label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))} />}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setOptions([...options, blankOption()])}><Icon name="plus" size={16} /> Add option</button>
          )}
        </div>
      )}

      {mandatory && (
        <div className="notice notice-warn flex flex-wrap items-center gap-x-3 gap-y-1">
          <Icon name="mandatory" size={16} className="text-[var(--az-warning)]" />
          <span className="min-w-0 flex-1">Mandatory Read{mandatory.deadline ? ` · due ${new Date(mandatory.deadline).toLocaleDateString()}` : ''}</span>
          <button type="button" className="link min-h-8 text-sm" onClick={() => setMandatoryOpen(true)}>Edit</button>
          <button type="button" className="link min-h-8 text-sm" onClick={() => setMandatory(null)}>Remove</button>
        </div>
      )}

      {showSchedule && (
        <div className="sunken flex flex-wrap items-center gap-2 p-3">
          <label className="text-sm font-medium text-[var(--az-text)]" htmlFor={`${uidBase}-at`}>Publish at</label>
          <input id={`${uidBase}-at`} type="datetime-local" className="input min-w-0 !w-auto" value={toLocal(scheduleAt)}
            onChange={(e) => setScheduleAt(e.target.value ? new Date(e.target.value).getTime() : null)} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => submit('schedule')}>Schedule</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSchedule(false)}>Cancel</button>
        </div>
      )}

      {(files.length > 0 || uploading) && (
        <ul className="flex flex-wrap gap-2.5" aria-label="Attachments">
          {files.map((f) => (
            <li key={f.id} className="flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5">
              {f.kind === 'pdf'
                ? <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--az-hairline)] text-xs font-bold text-[var(--az-text)]">PDF</span>
                : <img src={`/api/files/${f.id}?inline=1`} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-[var(--az-sunken)] object-cover" />}
              <span className="t-small min-w-0 truncate !text-[var(--az-text)]">{f.name}{f.size ? ` · ${kb(f.size)}` : ''}</span>
              <IconButton icon="x" size="sm" label={`Remove ${f.name}`} className="!border-0 !bg-transparent hover:!bg-[var(--az-sunken)]" onClick={() => setFiles(files.filter((x) => x.id !== f.id))} />
            </li>
          ))}
          {uploading && <li className="t-small self-center" role="status">Uploading…</li>}
        </ul>
      )}
      {error && <p role="alert" className="notice notice-bad">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {!editing && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={!communityId || uploading || files.length >= 4} onClick={() => picker.current?.click()}>
              <Icon name="paperclip" size={16} /> Attach
            </button>
            <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={attach} />
            {topics.length > 0 && (
              <select className="input !min-h-9 !w-auto !py-1.5 text-sm" value={topicId} onChange={(e) => setTopicId(e.target.value)} aria-label="Topic">
                <option value="">Topic: none</option>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {canAdmin && (
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-[var(--az-text)]">
                <input type="checkbox" className={check} checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top
              </label>
            )}
            {canAdmin && (
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-[var(--az-text)]">
                <input type="checkbox" className={check} checked={!!mandatory} onChange={(e) => (e.target.checked ? setMandatoryOpen(true) : setMandatory(null))} /> Mandatory read
              </label>
            )}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className={`t-small tabular-nums ${text.length > MAX_TEXT * 0.9 ? '!text-[var(--az-warning)]' : ''}`}>{text.length.toLocaleString('en')} / {MAX_TEXT.toLocaleString('en')}</span>
          {!editing && !fixedId && (
            <select className="input !min-h-9 !w-auto !py-1.5 text-sm" value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-label="Post to" disabled={!communities}>
              {!communities && <option value="">Loading communities…</option>}
              {communities?.length === 0 && <option value="">Join a community to post</option>}
              {communities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {(onDone && editing) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDone()}>Cancel</button>}
          {compact && !editing && <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Cancel</button>}
          {!editing && <>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
            <button type="button" className="btn btn-secondary btn-sm" aria-expanded={showSchedule} onClick={() => setShowSchedule(!showSchedule)}><Icon name="clock" size={16} /> Schedule</button>
          </>}
          {editing && ['draft', 'scheduled'].includes(initial.status) && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => submit('save')}>Save</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || uploading || (!editing && !communityId)} onClick={() => submit('publish')}>
            {busy ? 'Saving…' : editing ? (['draft', 'scheduled'].includes(initial.status) ? 'Save & publish' : 'Save') : 'Post'}
          </button>
        </div>
      </div>
      {!editing && <p className="t-small">Images and PDFs, up to 4 per post, 10 MB each.</p>}

      {mandatoryOpen && (
        <MandatoryConfig initial={mandatory} onClose={() => setMandatoryOpen(false)}
          onSave={(cfg) => { setMandatory(cfg); setMandatoryOpen(false); }}
          onRemove={mandatory ? () => { setMandatory(null); setMandatoryOpen(false); } : null} />
      )}
    </section>
  );
}
