import { useEffect, useRef, useState } from 'react';
import { useStore, uid, timeAgo } from '../../lib/store.jsx';
import { Avatar } from '../ui.jsx';

export function Video({ stream, muted = true, mirror = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''} ${className}`} />;
}

export function ControlButton({ on = true, onClick, label, icon, offIcon, danger = false, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={on}
      className={`grid h-12 w-12 place-items-center rounded-full text-lg transition disabled:opacity-40 ${danger ? 'bg-rose-600 text-white hover:bg-rose-500' : on ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-500/80 text-white hover:bg-rose-500'}`}>
      {on ? icon : offIcon ?? icon}
    </button>
  );
}

export function Elapsed({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <span className="tabular-nums">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

/** Chat panel stored on a broadcast or meeting record (`col` + `id`, messages in `chat`). */
export function ChatPanel({ col, id, chat = [], disabled = false, title = 'Live chat' }) {
  const { state, dispatch } = useStore();
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length]);
  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    dispatch({ type: 'update', col, id, meta: 'chat', patch: (x, me) => ({ ...x, chat: [...(x.chat || []), { id: uid('cm'), authorId: me, text: t, createdAt: Date.now() }] }) });
    setText('');
  };
  return (
    <section className="glass flex h-full min-h-80 flex-col" aria-label={title}>
      <h2 className="border-b border-white/5 px-4 py-3 font-bold">{title}</h2>
      <ul className="flex-1 space-y-3 overflow-y-auto p-4 scroll-thin" aria-live="polite">
        {chat.map((m) => {
          const u = state.users.find((x) => x.id === m.authorId);
          return (
            <li key={m.id} className="flex gap-2 text-sm">
              {u ? <Avatar user={u} size={26} /> : <span className="h-[26px] w-[26px] rounded-full bg-white/10" />}
              <div><span className="font-semibold">{u?.name ?? m.name ?? 'Guest'}</span> <span className="text-[11px] text-slate-500">{timeAgo(m.createdAt)}</span>
                <p className="text-slate-200">{m.text}</p></div>
            </li>
          );
        })}
        {chat.length === 0 && <li className="text-sm text-slate-500">No messages yet.</li>}
        <li ref={end} />
      </ul>
      <form onSubmit={send} className="flex gap-2 border-t border-white/5 p-3">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={disabled ? 'Chat is closed' : 'Say something…'} disabled={disabled} aria-label="Chat message" />
        <button className="btn btn-primary" disabled={disabled || !text.trim()}>Send</button>
      </form>
    </section>
  );
}
