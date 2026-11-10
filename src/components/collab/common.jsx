import { Glyph } from '../icons.jsx';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Avatar } from '../ui.jsx';

/** Small "..." dropdown. items: [{ label, onClick, danger, hidden }] */
export function Menu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-ghost h-10 w-10 !p-0" aria-label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>⋯</button>
      {open && (
        <div className="glass glass-strong absolute right-0 z-30 mt-1 w-52 p-1.5 text-sm" role="menu">
          {visible.map((i) => (
            <button key={i.label} role="menuitem" onClick={(e) => { e.stopPropagation(); setOpen(false); i.onClick(); }}
              className={`block min-h-10 w-full rounded-lg px-3 text-left hover:bg-white/5 ${i.danger ? 'text-rose-300' : ''}`}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Multi-select of network members as toggle chips. */
export function UserPicker({ value, onChange, exclude = [] }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const list = state.users.filter((u) => !exclude.includes(u.id) && u.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input className="input mb-2" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto scroll-thin">
        {list.map((u) => {
          const on = value.includes(u.id);
          return (
            <button type="button" key={u.id} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
              className={`flex min-h-10 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm ring-1 transition ${on ? 'bg-brand-500/25 ring-brand-500' : 'ring-white/10 hover:bg-white/5'}`}>
              <Avatar user={u} size={28} />{u.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, label, className = '' }) {
  return (
    <select aria-label={label} className={`input ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v} className="bg-ink-900">{l}</option>)}
    </select>
  );
}

const inGroupRole = (g, uid) => !!g && [g.members, g.admins, g.moderators].some((l) => l?.includes(uid));

/**
 * Can `me` read a group-scoped item (forum post, idea, manual, file…)? Same rule as the server's
 * community access: Public communities are readable by everyone; Private ("restricted") and
 * Closed ("private") ones only by their members. Platform admins follow it too — they reach
 * other communities through administrative mode on the server. Authors always see their own.
 */
export function canSeeGroupItem(state, me, x) {
  if (!x?.groupId || (x.authorId && x.authorId === me?.id)) return true;
  const g = (state.groups ?? []).find((y) => y.id === x.groupId);
  return !!g && (g.accessType === 'public' || inGroupRole(g, me?.id));
}

/** Groups `me` may create group-scoped items in: ones they belong to. `keep` is an already-chosen id to keep listed. */
export const myGroups = (state, me, keep) => (state.groups ?? []).filter((g) => g.id === keep || inGroupRole(g, me?.id));

const parseOptions = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Comma-separated options input. The raw text lives here so typing ", " isn't swallowed by a
 * join/split round trip; the parsed list is reported on every change (so Enter-to-submit saves
 * it) and the text is tidied on blur.
 */
export function OptionsInput({ value, onChange, className = 'input', ...rest }) {
  const [raw, setRaw] = useState(() => (value ?? []).join(', '));
  return (
    <input {...rest} className={className} value={raw}
      onChange={(e) => { setRaw(e.target.value); onChange(parseOptions(e.target.value)); }}
      onBlur={(e) => { const list = parseOptions(e.target.value); setRaw(list.join(', ')); onChange(list); }} />
  );
}

export const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const toDateInput = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
export const fromDateInput = (v) => (v ? new Date(`${v}T12:00`).getTime() : null);
export const toDateTimeInput = (t) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** Tiny markdown-ish renderer: ## headings, - bullets, 1. lists, **bold**. Escapes HTML. */
export function Prose({ text = '' }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code class="rounded bg-white/10 px-1">$1</code>');
  const html = text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (/^#{1,3} /.test(block)) {
      const [h, ...rest] = lines;
      return `<h3 class="mt-5 text-lg font-bold">${inline(h.replace(/^#+ /, ''))}</h3>${rest.length ? `<p>${rest.map(inline).join('<br/>')}</p>` : ''}`;
    }
    if (lines.every((l) => /^[-*] /.test(l))) return `<ul class="list-disc pl-5">${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+\. /.test(l))) return `<ol class="list-decimal pl-5">${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`;
    return `<p>${lines.map(inline).join('<br/>')}</p>`;
  }).join('');
  return <div className="space-y-3 text-[15px] leading-relaxed text-slate-200" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ScopeBadge({ scope, groupId }) {
  const { state } = useStore();
  if (groupId) {
    const g = state.groups.find((x) => x.id === groupId);
    return <span className="chip">{g?.emoji} {g?.name ?? 'Group'}</span>;
  }
  if (scope === 'private') return <span className="chip !bg-white/10 !text-slate-300"><Glyph value="🔒" tile={false} size={16} /> Private</span>;
  return <span className="chip !bg-emerald-500/15 !text-emerald-200"><Glyph value="🌐" tile={false} size={16} /> Network</span>;
}
