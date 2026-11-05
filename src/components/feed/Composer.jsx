import { Glyph } from '../icons.jsx';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uid, useStore } from '../../lib/store.jsx';
import { write } from '../../lib/assist.js';
import { Avatar } from '../ui.jsx';
import { MandatoryConfig } from './Mandatory.jsx';
import { needsApproval, publishNotifications, SHARE_TARGETS } from './utils.js';

const MAX_FILE = 1024 * 1024;
const MAX_TOTAL = 1.5 * 1024 * 1024; // all attachments on one post (they're stored in localStorage)
const MAX_TEXT = 5000;
const blankOption = () => ({ id: uid('o'), text: '' });
const scopeKey = (s) => (s.type === 'network' ? 'network' : `${s.type}:${s.id}`);
const parseKey = (k) => (k === 'network' ? { type: 'network' } : { type: k.split(':')[0], id: k.split(':')[1] });
const toLocal = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '');

/**
 * Post editor. `scope` fixes where the post goes (group / profile walls); without it the
 * author picks network wall, their own wall or one of their groups. `initial` edits a post.
 */
export default function Composer({ scope: fixedScope, initial, onDone, compact = false }) {
  const { state, dispatch, me, user, can } = useStore();
  const [open, setOpen] = useState(!compact || !!initial);
  const [type, setType] = useState(initial?.type ?? 'post');
  const [text, setText] = useState(initial?.text ?? '');
  const [mentions, setMentions] = useState(initial?.mentions ?? []);
  const [options, setOptions] = useState(initial?.poll?.options.map((o) => ({ id: o.id, text: o.text })) ?? [blankOption(), blankOption()]);
  const [attachments, setAttachments] = useState(initial?.attachments ?? []);
  const [mandatory, setMandatory] = useState(initial?.mandatory ?? null);
  // Set when the author removes the mark in this editor: re-adding it is then a new marking.
  const remarked = useRef(false);
  const removeMandatory = () => { remarked.current = true; setMandatory(null); };
  const [adv, setAdv] = useState(initial?.advocacy ?? { title: '', url: '', platforms: ['linkedin', 'x', 'facebook'], tweet: '' });
  const [scopeSel, setScopeSel] = useState(scopeKey(initial?.scope ?? fixedScope ?? { type: 'network' }));
  const [scheduleAt, setScheduleAt] = useState(initial?.publishAt ?? null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [mandatoryOpen, setMandatoryOpen] = useState(false);
  const [mq, setMq] = useState(null); // active @mention query
  const [tone, setTone] = useState('neutral');
  const [assist, setAssist] = useState(null);
  const [error, setError] = useState('');
  const ta = useRef(null);
  const fileRef = useRef(null);

  const scope = parseKey(scopeSel);
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));
  const group = scope.type === 'group' ? state.groups.find((g) => g.id === scope.id) : null;
  const canMandatory = scope.type === 'network' ? me.admin || (state.roles?.length && can('mandatory.mark')) : !!group && (group.admins.includes(me.id) || me.admin);
  const canAnnounce = me.admin || (state.roles?.length ? can('post.announce') : false);

  const TYPES = [
    { id: 'post', label: 'Status', icon: '✏️' },
    canAnnounce && { id: 'announcement', label: 'Announcement', icon: '📢' },
    { id: 'poll', label: 'Poll', icon: '📊' },
    { id: 'question', label: 'Question', icon: '❓' },
    me.admin && { id: 'advocacy', label: 'Social Advocacy', icon: '📣' },
  ].filter(Boolean);

  const onText = (e) => {
    setText(e.target.value);
    const before = e.target.value.slice(0, e.target.selectionStart);
    const m = before.match(/(?:^|\s)@(\w{0,20})$/);
    setMq(m ? m[1].toLowerCase() : null);
  };
  const suggestions = mq == null ? [] : state.users.filter((u) => u.id !== me.id && u.name.toLowerCase().split(' ').some((p) => p.startsWith(mq))).slice(0, 5);
  const pickMention = (u) => {
    const pos = ta.current.selectionStart;
    const before = text.slice(0, pos).replace(/@(\w{0,20})$/, `@${u.name} `);
    setText(before + text.slice(pos));
    setMentions((m) => [...new Set([...m, u.id])]);
    setMq(null);
    requestAnimationFrame(() => { ta.current.focus(); ta.current.selectionStart = ta.current.selectionEnd = before.length; });
  };

  const onFiles = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let total = attachments.reduce((n, a) => n + (a.size || 0), 0);
    const problems = [];
    for (const f of files) {
      if (f.size > MAX_FILE) { problems.push(`${f.name} is over 1 MB and wasn't attached.`); continue; }
      if (total + f.size > MAX_TOTAL) { problems.push(`${f.name} wasn't attached: a post can carry at most 1.5 MB of files in total.`); continue; }
      total += f.size;
      const r = new FileReader();
      r.onload = () => setAttachments((a) => [...a, { id: uid('at'), name: f.name, type: f.type, size: f.size, dataUrl: r.result }]);
      r.readAsDataURL(f);
    }
    setError(problems.join(' '));
  };

  const reset = () => {
    setText(''); setMentions([]); setOptions([blankOption(), blankOption()]); setAttachments([]); setMandatory(null); remarked.current = false; setType('post');
    setAdv({ title: '', url: '', platforms: ['linkedin', 'x', 'facebook'], tweet: '' }); setScheduleAt(null); setShowSchedule(false); setAssist(null); setError('');
    if (compact) setOpen(false);
  };

  const submit = (mode) => {
    const body = text.trim();
    // A repost can be edited down to no comment: the embedded original is its content.
    if (type === 'advocacy' ? !adv.title.trim() || !/^https?:\/\//.test(adv.url) : !body && !attachments.length && !initial?.repostOf) {
      setError(type === 'advocacy' ? 'Add a title and a website URL starting with http(s)://.' : 'Write something or attach a file.'); return;
    }
    if (body.length > MAX_TEXT) { setError(`Posts can be up to ${MAX_TEXT} characters. This one has ${body.length}.`); return; }
    if (attachments.reduce((n, a) => n + (a.size || 0), 0) > MAX_TOTAL) { setError('Attachments are limited to 1.5 MB per post. Remove a file to continue.'); return; }
    const opts = options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    if (type === 'poll' && opts.length < 2) { setError('A poll needs at least two options.'); return; }
    if (type === 'poll' && new Set(opts.map((o) => o.text.toLowerCase())).size < opts.length) { setError('Each poll option must be different.'); return; }
    if (mode === 'schedule' && (!scheduleAt || scheduleAt <= Date.now())) { setError('Pick a time in the future to schedule.'); return; }

    const status = mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : needsApproval(state, me, body) ? 'pending' : 'published';
    const id = initial?.id ?? uid('p');
    // The same marking (same markedAt) keeps the post's *current* acks and reminder state —
    // others may have acknowledged while this editor was open. A removed-and-re-added marking
    // has no markedAt yet, so it starts fresh and is announced as new.
    const current = initial ? state.posts.find((x) => x.id === initial.id)?.mandatory : undefined;
    const sameMarking = !!current && !remarked.current;
    const markedAt = sameMarking ? current.markedAt ?? mandatory?.markedAt ?? Date.now() : Date.now();
    const fields = {
      type, text: body, scope, attachments, status,
      mentions: mentions.filter((m) => body.includes(`@${user(m)?.name}`)),
      publishAt: mode === 'schedule' ? scheduleAt : undefined,
      // Votes follow the option id, so rewording an option while editing keeps its votes.
      poll: type === 'poll' ? { options: opts.map((o) => ({ id: o.id, text: o.text, votes: initial?.poll?.options.find((x) => x.id === o.id)?.votes ?? [] })) } : undefined,
      advocacy: type === 'advocacy' ? { shares: {}, ...adv } : undefined,
      mandatory: mandatory && scope.type !== 'user'
        ? { acks: [], ...mandatory, markedAt, ...(sameMarking ? { acks: current.acks, remindedAt: current.remindedAt } : {}) }
        : undefined,
    };
    const wasLive = initial?.status === 'published';
    if (initial && !wasLive && status === 'published') {
      // Draft / scheduled / pending → live goes through post/publish so the points are credited.
      dispatch({ type: 'update', col: 'posts', id, patch: { ...fields, status: initial.status, editedAt: Date.now() } });
      dispatch({ type: 'post/publish', id, creditTo: me.id });
    } else if (initial) {
      dispatch({ type: 'update', col: 'posts', id, patch: { ...fields, editedAt: Date.now(), createdAt: wasLive ? initial.createdAt : Date.now() } });
    } else {
      dispatch({ type: 'post/create', post: { id, ...fields } });
    }
    if (status === 'published') {
      // Edits of a live post only notify newly added mentions, and a newly added Mandatory Read.
      publishNotifications(state, dispatch, { ...fields, id, authorId: me.id },
        { skipMentions: wasLive ? initial.mentions ?? [] : [], mandatory: !(wasLive && sameMarking) });
    }
    reset();
    onDone?.(status);
  };

  const helpWrite = async () => {
    if (!text.trim()) { setError('Type a few words about what you want to say, then ask Smart Assist.'); return; }
    setAssist({ loading: true });
    const r = await write(text, tone);
    setText(r.text);
    setAssist({ source: r.source });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="glass flex w-full items-center gap-3 p-4 text-left text-slate-400 hover:text-slate-200">
        <Avatar user={me} size={40} /> What’s on your mind right now?
      </button>
    );
  }

  return (
    <div className={initial ? '' : 'glass p-4'}>
      <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Post type">
        {TYPES.map((t) => (
          <button key={t.id} role="tab" aria-selected={type === t.id} onClick={() => setType(t.id)}
            className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${type === t.id ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
            <Glyph value={t.icon} tile={false} size={16} /> {t.label}
          </button>
        ))}
        {!initial && <Link to="/events?new=1" className="min-h-9 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"><Glyph value="📅" tile={false} size={16} /> Event</Link>}
      </div>

      {type === 'advocacy' && (
        <div className="mb-3 grid gap-2">
          <input className="input" placeholder="Post title" value={adv.title} onChange={(e) => setAdv({ ...adv, title: e.target.value })} />
          <input className="input" placeholder="Website URL members will share (https://…)" value={adv.url} onChange={(e) => setAdv({ ...adv, url: e.target.value })} />
          <div className="flex flex-wrap gap-4 text-sm">
            {Object.entries(SHARE_TARGETS).map(([k, t]) => (
              <label key={k} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={adv.platforms.includes(k)}
                  onChange={() => setAdv({ ...adv, platforms: adv.platforms.includes(k) ? adv.platforms.filter((p) => p !== k) : [...adv.platforms, k] })} />{t.label}
              </label>
            ))}
          </div>
          {adv.platforms.includes('x') && <input className="input" maxLength={280} placeholder="Tweet content" value={adv.tweet} onChange={(e) => setAdv({ ...adv, tweet: e.target.value })} />}
        </div>
      )}

      <div className="relative flex gap-3">
        {!initial && <Avatar user={me} size={40} />}
        <div className="flex-1">
          <textarea ref={ta} className="input min-h-24 resize-y" value={text} onChange={onText} aria-label="Post text" maxLength={MAX_TEXT}
            onKeyDown={(e) => { if (e.key === 'Escape') setMq(null); }}
            placeholder={type === 'question' ? 'Ask the community a question…' : type === 'advocacy' ? 'Description for members (not shared outside the network)' : 'What’s on your mind right now? Use @ to mention and # to tag.'} />
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

      {type === 'poll' && (
        <div className="mt-3 space-y-2">
          {options.map((o, i) => (
            <div key={o.id} className="flex gap-2">
              <input className="input" placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              {options.length > 2 && <button className="btn btn-ghost w-11 !p-0" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
          {options.length < 6 && <button className="btn btn-ghost text-xs" onClick={() => setOptions([...options, blankOption()])}>+ Add option</button>}
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="chip !py-1">
              {a.type.startsWith('image/') ? <img src={a.dataUrl} alt="" className="h-8 w-8 rounded object-cover" /> : '📎'}
              <span className="max-w-40 truncate">{a.name}</span>
              <button aria-label={`Remove ${a.name}`} onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}

      {mandatory && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          ✅ Mandatory Read{mandatory.deadline ? ` · due ${new Date(mandatory.deadline).toLocaleDateString()}` : ''}
          <button className="ml-auto underline" onClick={() => setMandatoryOpen(true)}>Edit</button>
          <button className="underline" onClick={removeMandatory}>Remove</button>
        </div>
      )}

      {showSchedule && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-300" htmlFor="sched">Publish at</label>
          <input id="sched" type="datetime-local" className="input !w-auto" value={toLocal(scheduleAt)}
            onChange={(e) => setScheduleAt(e.target.value ? new Date(e.target.value).getTime() : null)} />
          <button className="btn btn-primary" onClick={() => submit('schedule')}>Schedule</button>
          <button className="btn btn-ghost" onClick={() => setShowSchedule(false)}>Cancel</button>
        </div>
      )}

      {assist && <p className="mt-2 text-xs text-slate-400">{assist.loading ? 'Smart Assist is writing…' : `✨ Written by Smart Assist (${assist.source}). Review before posting.`}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        <button className="btn btn-ghost h-11 w-11 !p-0" title="Attach files (max 1 MB each, 1.5 MB per post)" aria-label="Attach files" onClick={() => fileRef.current.click()}><Glyph value="📎" tile={false} size={16} /></button>
        {canMandatory && scope.type !== 'user' && (
          <button className={`btn btn-ghost h-11 w-11 !p-0 ${mandatory ? 'ring-1 ring-amber-300' : ''}`} title="Mandatory read" aria-label="Mark as mandatory read" onClick={() => setMandatoryOpen(true)}><Glyph value="✅" tile={false} size={16} /></button>
        )}
        <span className="flex items-center gap-1">
          <button className="btn btn-ghost h-11" onClick={helpWrite} title="Smart Assist: help me write"><Glyph value="✨" tile={false} size={16} /> Help me write</button>
          <select className="input !w-auto !py-2 text-xs" value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone">
            <option value="neutral">Neutral</option><option value="casual">Casual</option><option value="formal">Formal</option>
          </select>
        </span>
        <span className="flex-1" />
        {!fixedScope && (
          <select className="input !w-auto !py-2 text-sm" value={scopeSel} onChange={(e) => setScopeSel(e.target.value)} aria-label="Post to">
            <option value="network">🏛️ Company wall</option>
            <option value={`user:${me.id}`}>🙋 My wall</option>
            {myGroups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.emoji} {g.name}</option>)}
          </select>
        )}
        {(onDone && initial) && <button className="btn btn-ghost" onClick={() => onDone()}>Cancel</button>}
        {compact && !initial && <button className="btn btn-ghost" onClick={reset}>Cancel</button>}
        {/* A live post can't be pulled back into a draft or schedule from Edit: that silently hid
            it (pins, reads and all) from everyone. Delete it from the post menu instead. */}
        {initial?.status !== 'published' && <>
          <button className="btn btn-ghost" onClick={() => submit('draft')}>Save draft</button>
          <button className="btn btn-ghost" onClick={() => setShowSchedule(true)} aria-label="Schedule post"><Glyph value="⏰" tile={false} size={16} /></button>
        </>}
        <button className="btn btn-primary h-11 px-5" onClick={() => submit('publish')}>{initial?.status === 'published' ? 'Save' : type === 'advocacy' ? 'Share' : 'Post'}</button>
      </div>

      {mandatoryOpen && (
        <MandatoryConfig initial={mandatory} onClose={() => setMandatoryOpen(false)}
          onSave={(cfg) => { setMandatory(cfg); setMandatoryOpen(false); }}
          onRemove={mandatory ? () => { removeMandatory(); setMandatoryOpen(false); } : null} />
      )}
    </div>
  );
}
