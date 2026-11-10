import { Glyph } from '../icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uid, useStore } from '../../lib/store.jsx';
import { newKey } from '../../lib/api.js';
import { toast } from '../../lib/toast.js';
import { createPost, editPost, errorText, fetchMyCommunities, isCommunityAdmin, NETWORK_ID, publishPost } from '../../lib/feed.js';
import { Avatar } from '../ui.jsx';
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
 */
export default function Composer({ communityId: fixedId, initial, onDone, compact = false, defaultType }) {
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
  const [attachNote, setAttachNote] = useState(false);
  // One idempotency key per composed post: a double click or network retry can't post twice.
  const submitKey = useRef(newKey());
  const ta = useRef(null);

  useEffect(() => {
    if (editing) return;
    let live = true;
    fetchMyCommunities().then((cs) => {
      if (!live) return;
      setCommunities(cs);
      setCommunityId((cur) => cur || (cs.some((c) => c.id === NETWORK_ID) ? NETWORK_ID : cs[0]?.id) || '');
    }, (e) => live && (setCommunities([]), setError(errorText(e))));
    return () => { live = false; };
  }, [editing]);

  const community = communities?.find((c) => c.id === communityId);
  const notMember = !editing && communities && fixedId && !community;
  // Announcements, pins and Mandatory Read are for community admins (the server enforces it too).
  const canAdmin = !!community && isCommunityAdmin(community);

  const TYPES = [
    { id: 'post', label: 'Status', icon: '✏️' },
    canAdmin && { id: 'announcement', label: 'Announcement', icon: '📢' },
    { id: 'poll', label: 'Poll', icon: '📊' },
    { id: 'question', label: 'Question', icon: '❓' },
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
    setScheduleAt(null); setShowSchedule(false); setError(''); setAttachNote(false);
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

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="glass flex w-full items-center gap-3 p-4 text-left text-slate-400 hover:text-slate-200">
        <Avatar user={me} size={40} /> What’s on your mind right now?
      </button>
    );
  }

  if (notMember) {
    return <p className="glass p-4 text-sm text-slate-400">Join this community to post in it.</p>;
  }

  return (
    <div className={editing ? '' : 'glass p-4'}>
      {!editing && (
        <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Post type">
          {TYPES.map((t) => (
            <button key={t.id} role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${type === t.id ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
              <Glyph value={t.icon} tile={false} size={16} /> {t.label}
            </button>
          ))}
          <Link to="/events?new=1" className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"><Glyph value="📅" tile={false} size={16} /> Event</Link>
        </div>
      )}

      <div className="relative flex gap-3">
        {!editing && <Avatar user={me} size={40} />}
        <div className="flex-1">
          <textarea ref={ta} className="input min-h-24 resize-y" value={text} onChange={onText} aria-label="Post text" maxLength={MAX_TEXT}
            onKeyDown={(e) => { if (e.key === 'Escape') setMq(null); }}
            placeholder={type === 'question' ? 'Ask the community a question…' : 'What’s on your mind right now? Use @ to mention and # to tag.'} />
          {text.length > MAX_TEXT * 0.8 && (
            <p className={`mt-1 text-right text-xs ${text.length > MAX_TEXT ? 'text-rose-300' : 'text-slate-400'}`} aria-live="polite">{text.length}/{MAX_TEXT}</p>
          )}
          {suggestions.length > 0 && (
            <ul className="glass glass-strong absolute z-20 mt-1 w-64 p-1" role="listbox" aria-label="Mention suggestions">
              {suggestions.map((u) => (
                <li key={u.id}><button type="button" onClick={() => pickMention(u)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-white/10">
                  <Avatar user={u} size={26} />{u.name}<span className="ml-auto text-xs text-slate-500">{u.batch}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && initial.poll && <p className="mt-2 text-xs text-slate-400">Poll options can’t be changed after posting.</p>}

      {!editing && type === 'poll' && (
        <div className="mt-3 space-y-2">
          {options.map((o, i) => (
            <div key={o.id} className="flex gap-2">
              <input className="input" placeholder={`Option ${i + 1}`} maxLength={MAX_OPTION} value={o.text} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {options.length > 2 && <button className="btn btn-ghost w-11 !p-0" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
          {options.length < MAX_OPTIONS && <button className="btn btn-ghost text-xs" onClick={() => setOptions([...options, blankOption()])}>+ Add option</button>}
        </div>
      )}

      {mandatory && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          ✅ Mandatory Read{mandatory.deadline ? ` · due ${new Date(mandatory.deadline).toLocaleDateString()}` : ''}
          <button className="ml-auto underline" onClick={() => setMandatoryOpen(true)}>Edit</button>
          <button className="underline" onClick={() => setMandatory(null)}>Remove</button>
        </div>
      )}

      {showSchedule && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-300" htmlFor="sched">Publish at</label>
          <input id="sched" type="datetime-local" className="input !w-auto" value={toLocal(scheduleAt)}
            onChange={(e) => setScheduleAt(e.target.value ? new Date(e.target.value).getTime() : null)} />
          <button className="btn btn-primary" disabled={busy} onClick={() => submit('schedule')}>Schedule</button>
          <button className="btn btn-ghost" onClick={() => setShowSchedule(false)}>Cancel</button>
        </div>
      )}

      {attachNote && <p className="mt-2 text-xs text-slate-400" role="status">Attachments arrive with secure file storage.</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        {!editing && <>
          <button className="btn btn-ghost h-11 w-11 !p-0" title="Attachments arrive with secure file storage." aria-label="Attach files (not available yet)" onClick={() => setAttachNote(true)}><Glyph value="📎" tile={false} size={16} /></button>
          {canAdmin && (
            <button className={`btn btn-ghost h-11 w-11 !p-0 ${mandatory ? 'ring-1 ring-amber-300' : ''}`} title="Mandatory read" aria-label="Mark as mandatory read" onClick={() => setMandatoryOpen(true)}><Glyph value="✅" tile={false} size={16} /></button>
          )}
          {canAdmin && (
            <button className={`btn btn-ghost h-11 w-11 !p-0 ${pinned ? 'ring-1 ring-brand-400' : ''}`} title={pinned ? 'Will be pinned' : 'Pin to top'} aria-label="Pin to top" aria-pressed={pinned} onClick={() => setPinned(!pinned)}><Glyph value="📌" tile={false} size={16} /></button>
          )}
        </>}
        <span className="flex-1" />
        {!editing && !fixedId && (
          <select className="input !w-auto !py-2 text-sm" value={communityId} onChange={(e) => setCommunityId(e.target.value)} aria-label="Post to" disabled={!communities}>
            {!communities && <option value="">Loading communities…</option>}
            {communities?.length === 0 && <option value="">Join a community to post</option>}
            {communities?.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.id === NETWORK_ID ? 'Company wall' : c.name}</option>)}
          </select>
        )}
        {(onDone && editing) && <button className="btn btn-ghost" onClick={() => onDone()}>Cancel</button>}
        {compact && !editing && <button className="btn btn-ghost" onClick={reset}>Cancel</button>}
        {!editing && <>
          <button className="btn btn-ghost" disabled={busy} onClick={() => submit('draft')}>Save draft</button>
          <button className="btn btn-ghost" onClick={() => setShowSchedule(true)} aria-label="Schedule post"><Glyph value="⏰" tile={false} size={16} /></button>
        </>}
        {editing && ['draft', 'scheduled'].includes(initial.status) && <button className="btn btn-ghost" disabled={busy} onClick={() => submit('save')}>Save</button>}
        <button className="btn btn-primary h-11 px-5" disabled={busy || (!editing && !communityId)} onClick={() => submit('publish')}>
          {busy ? 'Saving…' : editing ? (['draft', 'scheduled'].includes(initial.status) ? 'Save & publish' : 'Save') : 'Post'}
        </button>
      </div>

      {mandatoryOpen && (
        <MandatoryConfig initial={mandatory} onClose={() => setMandatoryOpen(false)}
          onSave={(cfg) => { setMandatory(cfg); setMandatoryOpen(false); }}
          onRemove={mandatory ? () => { setMandatory(null); setMandatoryOpen(false); } : null} />
      )}
    </div>
  );
}
