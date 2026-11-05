import { Glyph } from '../components/icons.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore, uid, timeAgo, fmtDate } from '../lib/store.jsx';
import { Avatar, AvatarStack, Empty, Field, Modal } from '../components/ui.jsx';
import { PeoplePicker, useBlocks } from '../components/people/shared.jsx';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏', '👀'];
const MAX_BYTES = 30 * 1024 * 1024;

export default function Channels() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { state, me, user, can } = useStore();
  const nav = useNavigate();
  const isDm = pathname.startsWith('/messages');
  const [creating, setCreating] = useState(false);
  const [newChat, setNewChat] = useState(false);
  const [filter, setFilter] = useState('');

  const channels = state.channels.filter((c) => c.members.includes(me.id));
  const { blocked } = useBlocks();
  // Chats with anyone you've blocked (or who blocked you) are hidden.
  const blockedBy = new Set((state.blocks || []).filter((b) => b.targetId === me.id).map((b) => b.authorId));
  const dms = (state.dms || []).filter((d) => d.members.includes(me.id) && !d.members.some((m) => blocked.has(m) || blockedBy.has(m)))
    .sort((a, b) => (b.messages.at(-1)?.createdAt || 0) - (a.messages.at(-1)?.createdAt || 0));
  const dmName = (d) => d.name || d.members.filter((m) => m !== me.id).map((m) => user(m)?.name).join(', ') || 'Just you';
  const current = id ? (isDm ? dms.find((d) => d.id === id) : state.channels.find((c) => c.id === id)) : null;
  const f = filter.toLowerCase();

  const list = (
    <aside className="ext-menu glass flex flex-col overflow-hidden lg:h-[calc(100vh-8.5rem)]" aria-label="Conversations">
      <div className="border-b border-white/5 p-3"><input className="input" type="search" placeholder="Filter conversations" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter conversations" /></div>
      <div className="flex-1 overflow-y-auto p-2 scroll-thin">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Channels</h2>
          {can('channel.create') && <button className="btn btn-ghost h-9 w-9 !p-0" aria-label="Create channel" onClick={() => setCreating(true)}>+</button>}
        </div>
        {channels.filter((c) => c.name.toLowerCase().includes(f)).map((c) => (
          <Link key={c.id} to={`/channels/${c.id}`} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm ${!isDm && id === c.id ? 'bg-brand-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
            <span className="text-slate-500">#</span><span className="truncate">{c.name}</span>{c.groupId && <span className="ml-auto text-[10px] text-slate-500">group</span>}
          </Link>
        ))}
        <div className="mt-3 flex items-center justify-between px-2 py-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Direct messages</h2>
          <button className="btn btn-ghost h-9 w-9 !p-0" aria-label="New message" onClick={() => setNewChat(true)}><Glyph value="✎" tile={false} size={16} /></button>
        </div>
        {dms.filter((d) => dmName(d).toLowerCase().includes(f)).map((d) => {
          const others = d.members.filter((m) => m !== me.id);
          return (
            <Link key={d.id} to={`/messages/${d.id}`} className={`flex min-h-12 items-center gap-2 rounded-xl px-3 py-1.5 text-sm ${isDm && id === d.id ? 'bg-brand-500/20 text-white' : 'text-slate-300 hover:bg-white/5'}`}>
              {others.length === 1 ? <Avatar user={user(others[0])} size={28} /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-700 text-xs">{others.length}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate">{dmName(d)}</span><span className="block truncate text-xs text-slate-500">{d.messages.at(-1)?.text || 'No messages yet'}</span></span>
            </Link>
          );
        })}
      </div>
    </aside>
  );

  return (
    <div className="ext-grid grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className={id ? 'hidden lg:block' : ''}>{list}</div>
      {id ? (current
        ? <Conversation key={current.id} kind={isDm ? 'dm' : 'channel'} convo={current} title={isDm ? dmName(current) : `# ${current.name}`} onBack={() => nav('/channels')} />
        : <Empty icon="🔒" title="Conversation not found">You may have left it, or it was deleted.</Empty>)
        : <div className="hidden lg:block"><Empty icon="💬" title="Pick a channel or chat">Channels are real-time rooms for groups. Direct messages are private.</Empty></div>}
      {creating && <CreateChannel onClose={(newId) => { setCreating(false); if (newId) nav(`/channels/${newId}`); }} />}
      {newChat && <NewChat onClose={(newId) => { setNewChat(false); if (newId) nav(`/messages/${newId}`); }} />}
    </div>
  );
}

function Conversation({ kind, convo, title, onBack }) {
  const { state, me, user, dispatch } = useStore();
  const col = kind === 'dm' ? 'dms' : 'channels';
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [threadId, setThreadId] = useState(null);
  const [search, setSearch] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [settings, setSettings] = useState(false);
  const endRef = useRef(null);
  const fileRef = useRef(null);

  const top = convo.messages.filter((m) => !m.parentId);
  const replies = (pid) => convo.messages.filter((m) => m.parentId === pid);
  const pinned = convo.messages.filter((m) => m.pinned);
  const visible = search ? top.filter((m) => m.text.toLowerCase().includes(search.toLowerCase())) : top;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [top.length]);

  const patchMsg = (mid, fn) => dispatch({ type: 'update', col, id: convo.id, patch: (c) => ({ ...c, messages: c.messages.map((m) => (m.id === mid ? fn(m) : m)) }) });
  const react = (mid, emoji) => patchMsg(mid, (m) => {
    const r = { ...(m.reactions || {}) };
    const who = r[emoji] || [];
    r[emoji] = who.includes(me.id) ? who.filter((x) => x !== me.id) : [...who, me.id];
    if (!r[emoji].length) delete r[emoji];
    return { ...m, reactions: r };
  });

  const send = (body, parentId) => {
    const t = body.trim();
    if (!t && !file) return false;
    const extra = { ...(parentId && { parentId }), ...(file && { attachment: file }) };
    if (kind === 'channel') dispatch({ type: 'channel/send', id: convo.id, text: t, extra });
    else dispatch({ type: 'update', col: 'dms', id: convo.id, patch: (c) => ({ ...c, messages: [...c.messages, { id: uid('m'), authorId: me.id, text: t, createdAt: Date.now(), ...extra }] }) });
    // @mentions: match "@Full Name" or "@First" against members.
    const link = kind === 'channel' ? `/channels/${convo.id}` : `/messages/${convo.id}`;
    state.users.filter((u) => u.id !== me.id && convo.members.includes(u.id) && (t.includes(`@${u.name}`) || new RegExp(`@${u.name.split(' ')[0]}\\b`).test(t)))
      .forEach((u) => dispatch({ type: 'notify', notification: { userId: u.id, kind: 'mention', text: `${me.name} mentioned you in ${title}`, link } }));
    setFile(null);
    return true;
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(`${f.name} is larger than 30 MB.`); return; }
    setError('');
    setFile({ name: f.name, size: f.size, type: f.type });
  };

  const thread = threadId && convo.messages.find((m) => m.id === threadId);
  const isAdmin = kind === 'channel' && (convo.admins.includes(me.id) || me.admin);

  return (
    <section className="glass flex min-h-[70vh] flex-col overflow-hidden lg:h-[calc(100vh-8.5rem)]" aria-label={title}>
      <header className="flex flex-wrap items-center gap-2 border-b border-white/5 p-3">
        <button className="btn btn-ghost h-11 w-11 !p-0 lg:hidden" onClick={onBack} aria-label="Back to conversations">←</button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold">{title}</h1>
          <p className="truncate text-xs text-slate-400">{kind === 'channel' ? (convo.description || `${convo.members.length} members`) : `${convo.members.length} people`}
            {convo.groupId && <> · linked to <Link className="underline" to={`/groups/${convo.groupId}`}>{state.groups.find((g) => g.id === convo.groupId)?.name}</Link></>}</p>
        </div>
        <AvatarStack ids={convo.members} max={3} />
        <input className="input !w-40 !py-2" type="search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search messages" />
        <button className={`btn min-h-11 ${showPins ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowPins(!showPins)} aria-pressed={showPins} aria-label="Pinned messages"><Glyph value="📌" tile={false} size={16} /> {pinned.length}</button>
        <Link to={`/live/meet-${convo.id}`} className="btn btn-ghost min-h-11" aria-label="Start call">📹</Link>
        {kind === 'channel' && <button className="btn btn-ghost min-h-11" onClick={() => setSettings(true)} aria-label="Channel settings"><Glyph value="⚙️" tile={false} size={16} /></button>}
      </header>

      {showPins && (
        <div className="border-b border-white/5 bg-amber-400/5 p-3 text-sm">
          {pinned.length ? pinned.map((m) => <p key={m.id} className="truncate"><Glyph value="📌" tile={false} size={16} /> <b>{user(m.authorId)?.name}:</b> {m.text}</p>) : <p className="text-slate-400">No pinned messages.</p>}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ol className="flex-1 space-y-1 overflow-y-auto p-3 scroll-thin" aria-live="polite">
            {!visible.length && <li className="p-8 text-center text-sm text-slate-500">{search ? 'No messages match your search.' : 'No messages yet. Say hello 👋'}</li>}
            {visible.map((m) => <Message key={m.id} m={m} replies={replies(m.id).length} onReact={react} onPin={() => patchMsg(m.id, (x) => ({ ...x, pinned: !x.pinned }))} onThread={() => setThreadId(m.id)} />)}
            <li ref={endRef} />
          </ol>
          <Composer value={text} onChange={setText} onSend={() => { if (send(text)) setText(''); }} file={file} clearFile={() => setFile(null)}
            onAttach={() => fileRef.current?.click()} error={error} placeholder={`Message ${title}`} members={convo.members} />
          <input ref={fileRef} type="file" className="hidden" onChange={pickFile} />
        </div>
        {thread && <Thread parent={thread} replies={replies(thread.id)} onClose={() => setThreadId(null)} onSend={(t) => send(t, thread.id)} onReact={react} members={convo.members} />}
      </div>

      {settings && kind === 'channel' && <ChannelSettings channel={convo} isAdmin={isAdmin} onClose={() => setSettings(false)} onGone={onBack} />}
    </section>
  );
}

function Message({ m, replies, onReact, onPin, onThread, compact }) {
  const { user, me } = useStore();
  const [picker, setPicker] = useState(false);
  const a = user(m.authorId);
  return (
    <li className="group relative flex gap-3 rounded-xl p-2 hover:bg-white/[0.03]">
      <Avatar user={a} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-sm"><Link to={`/people/${m.authorId}`} className="font-semibold hover:underline">{a?.name}</Link><time className="text-xs text-slate-500" title={fmtDate(m.createdAt)}>{timeAgo(m.createdAt)}</time>{m.pinned && <span className="text-xs" title="Pinned"><Glyph value="📌" tile={false} size={16} /></span>}</div>
        {m.text && <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{highlight(m.text)}</p>}
        {m.attachment && <span className="chip mt-1 !rounded-lg !py-1"><Glyph value="📎" tile={false} size={16} /> {m.attachment.name} <span className="opacity-60">{(m.attachment.size / 1024).toFixed(0)} KB</span></span>}
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(m.reactions || {}).map(([e, who]) => (
            <button key={e} onClick={() => onReact(m.id, e)} aria-pressed={who.includes(me.id)} aria-label={`${e} ${who.length}`}
              className={`rounded-full border px-2 py-0.5 text-xs ${who.includes(me.id) ? 'border-brand-500 bg-brand-500/20' : 'border-white/10'}`}>{e} {who.length}</button>
          ))}
          {!compact && replies > 0 && <button onClick={onThread} className="text-xs font-semibold text-brand-400 hover:underline">{replies} repl{replies > 1 ? 'ies' : 'y'}</button>}
        </div>
      </div>
      <div className="absolute right-2 top-1 hidden gap-1 rounded-lg bg-ink-800 p-1 shadow group-focus-within:flex group-hover:flex">
        <button className="h-8 w-8 rounded hover:bg-white/10" aria-label="Add reaction" onClick={() => setPicker(!picker)}>😊</button>
        {!compact && <button className="h-8 w-8 rounded hover:bg-white/10" aria-label="Reply in thread" onClick={onThread}>↩</button>}
        {onPin && <button className="h-8 w-8 rounded hover:bg-white/10" aria-label={m.pinned ? 'Unpin' : 'Pin'} onClick={onPin}><Glyph value="📌" tile={false} size={16} /></button>}
      </div>
      {picker && (
        <div className="absolute right-2 top-10 z-10 flex gap-1 rounded-xl bg-ink-800 p-1 shadow-lg ring-1 ring-white/10">
          {REACTIONS.map((e) => <button key={e} className="h-9 w-9 rounded hover:bg-white/10" onClick={() => { onReact(m.id, e); setPicker(false); }} aria-label={`React ${e}`}>{e}</button>)}
        </div>
      )}
    </li>
  );
}

const highlight = (text) => text.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g).map((part, i) => (part.startsWith('@') ? <span key={i} className="rounded bg-brand-500/25 px-1 text-brand-400">{part}</span> : part));

function Composer({ value, onChange, onSend, file, clearFile, onAttach, error, placeholder, members }) {
  const { user } = useStore();
  const mention = value.match(/@(\w*)$/);
  const suggestions = mention ? members.map(user).filter((u) => u && u.name.toLowerCase().startsWith(mention[1].toLowerCase())).slice(0, 5) : [];
  return (
    <div className="relative border-t border-white/5 p-3">
      {suggestions.length > 0 && (
        <ul className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-xl bg-ink-800 shadow-lg ring-1 ring-white/10">
          {suggestions.map((u) => <li key={u.id}><button className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-white/5" onClick={() => onChange(value.replace(/@\w*$/, `@${u.name} `))}><Avatar user={u} size={22} />{u.name}</button></li>)}
        </ul>
      )}
      {file && <div className="mb-2"><span className="chip !rounded-lg !py-1"><Glyph value="📎" tile={false} size={16} /> {file.name}<button className="ml-2" aria-label="Remove attachment" onClick={clearFile}>✕</button></span></div>}
      {error && <p role="alert" className="mb-2 text-xs text-rose-300">{error}</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 !p-0" onClick={onAttach} aria-label="Attach a file (max 30 MB)"><Glyph value="📎" tile={false} size={16} /></button>
        <textarea rows={1} className="input min-h-11 resize-none" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
        <button className="btn btn-primary min-h-11 shrink-0" disabled={!value.trim() && !file}>Send</button>
      </form>
    </div>
  );
}

function Thread({ parent, replies, onClose, onSend, onReact, members }) {
  const [text, setText] = useState('');
  return (
    <aside className="fixed inset-0 z-40 flex flex-col bg-ink-900 md:static md:z-auto md:w-80 md:border-l md:border-white/5 md:bg-transparent" aria-label="Thread">
      <div className="flex items-center justify-between border-b border-white/5 p-3"><h2 className="font-bold">Thread</h2><button className="btn btn-ghost h-10 w-10 !p-0" onClick={onClose} aria-label="Close thread">✕</button></div>
      <ol className="flex-1 overflow-y-auto p-2 scroll-thin">
        <Message m={parent} compact onReact={onReact} />
        <li className="px-3 py-1 text-xs text-slate-500">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</li>
        {replies.map((r) => <Message key={r.id} m={r} compact onReact={onReact} />)}
      </ol>
      <Composer value={text} onChange={setText} onSend={() => { if (onSend(text)) setText(''); }} placeholder="Reply…" members={members} onAttach={() => {}} clearFile={() => {}} />
    </aside>
  );
}

function CreateChannel({ onClose }) {
  const { state, me, dispatch } = useStore();
  const [d, setD] = useState({ name: '', description: '', members: [], groupId: '' });
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));
  const slug = d.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const submit = (e) => {
    e.preventDefault();
    if (!slug) return;
    // channel/create spreads `channel` over its generated fields, so our own id wins.
    const id = uid('ch');
    dispatch({ type: 'channel/create', channel: { id, name: slug, description: d.description, members: d.members, groupId: d.groupId || null } });
    onClose(id);
  };
  return (
    <Modal title="Create a channel" onClose={() => onClose(null)}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Channel name" hint={slug && `#${slug}`}><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. reunion-planning" /></Field>
        <Field label="Description"><input className="input" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <Field label="Associate with a group" hint="All group members join the channel, and new group members are added automatically.">
          <select className="input" value={d.groupId} onChange={(e) => setD({ ...d, groupId: e.target.value })}><option value="">No group</option>{myGroups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}</select>
        </Field>
        <Field label="Add members"><PeoplePicker value={d.members} onChange={(members) => setD({ ...d, members })} exclude={[me.id]} /></Field>
        <button className="btn btn-primary min-h-11 w-full" disabled={!slug}>Create</button>
      </form>
    </Modal>
  );
}

function NewChat({ onClose }) {
  const { state, me, dispatch } = useStore();
  const [people, setPeople] = useState([]);
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!people.length) return;
    const members = [me.id, ...people];
    const existing = people.length === 1 && (state.dms || []).find((d) => d.members.length === 2 && members.every((m) => d.members.includes(m)));
    if (existing) return onClose(existing.id);
    const id = uid('dm');
    dispatch({ type: 'add', col: 'dms', item: { id, members, name: people.length > 1 ? name.trim() || undefined : undefined, messages: [] } });
    onClose(id);
  };
  return (
    <Modal title="New message" onClose={() => onClose(null)}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="To"><PeoplePicker value={people} onChange={setPeople} exclude={[me.id, ...(state.blocks || []).filter((b) => b.authorId === me.id || b.targetId === me.id).map((b) => (b.authorId === me.id ? b.targetId : b.authorId))]} /></Field>
        {people.length > 1 && <Field label="Group chat name (optional)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <button className="btn btn-primary min-h-11 w-full" disabled={!people.length}>Start chat</button>
      </form>
    </Modal>
  );
}

function ChannelSettings({ channel, isAdmin, onClose, onGone }) {
  const { me, user, dispatch } = useStore();
  const [add, setAdd] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const members = useMemo(() => channel.members.map(user).filter(Boolean), [channel.members, user]);
  const addMembers = () => {
    dispatch({ type: 'update', col: 'channels', id: channel.id, patch: (c) => ({ ...c, members: [...new Set([...c.members, ...add])] }) });
    add.forEach((id) => dispatch({ type: 'notify', notification: { userId: id, kind: 'channel', text: `${me.name} added you to #${channel.name}`, link: `/channels/${channel.id}` } }));
    setAdd([]);
  };
  return (
    <Modal title={`#${channel.name} settings`} onClose={onClose}>
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Members ({members.length})</h3>
          <ul className="max-h-56 space-y-1 overflow-y-auto scroll-thin">
            {members.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-sm"><Avatar user={u} size={28} /><span className="flex-1">{u.name}</span>
                {channel.admins.includes(u.id) && <span className="chip">Admin</span>}
                {isAdmin && u.id !== me.id && !channel.admins.includes(u.id) && (
                  <button className="text-xs text-slate-400 hover:text-rose-300" onClick={() => dispatch({ type: 'update', col: 'channels', id: channel.id, patch: (c) => ({ ...c, members: c.members.filter((m) => m !== u.id) }) })}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        </section>
        {isAdmin && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Add to channel</h3>
            <PeoplePicker value={add} onChange={setAdd} exclude={channel.members} />
            <button className="btn btn-primary mt-2 min-h-11" disabled={!add.length} onClick={addMembers}>Add to Channel</button>
          </section>
        )}
        <section className="border-t border-white/5 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Advanced</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost min-h-11" onClick={() => { dispatch({ type: 'channel/leave', id: channel.id }); onClose(); onGone(); }}>Leave channel</button>
            {isAdmin && !confirmDelete && <button className="btn min-h-11 bg-rose-500/20 text-rose-200" onClick={() => setConfirmDelete(true)}>Delete channel</button>}
          </div>
          {confirmDelete && (
            <div role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm">
              <p>Delete <b>#{channel.name}</b>? Conversations can’t be recovered.</p>
              <div className="mt-2 flex gap-2"><button className="btn btn-ghost min-h-11" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="btn min-h-11 bg-rose-600 text-white" onClick={() => { dispatch({ type: 'channel/delete', id: channel.id }); onClose(); onGone(); }}>Delete</button></div>
            </div>
          )}
          {channel.groupId && <p className="mt-3 text-xs text-slate-500">Leaving this channel doesn’t remove you from its group. Only admins can add you back.</p>}
        </section>
      </div>
    </Modal>
  );
}
