import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { uid, useStore, fmtDate } from '../../lib/store.jsx';
import { Avatar, Field, Modal } from '../ui.jsx';
import { occurrences } from '../events/eventUtils.js';
import { useEvents } from '../../lib/events.js';
import { isLive } from '../feed/utils.js';
import { useCommunityWrite } from './useCommunity.js';

const KINDS = {
  about: 'About', rules: 'Guidelines', events: 'Upcoming events', members: 'Recent members',
  links: 'Pinned links', html: 'Custom HTML', stats: 'Stats',
};

/** Configurable home page for a group. Admins add, remove and reorder widgets. */
export default function SpaceDashboard({ group, isAdmin }) {
  const { patch } = useCommunityWrite();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const widgets = group.dashboard ?? [];
  // Stored in the community's settings on the server; errors (e.g. a stale version) are toasted.
  const save = async (dashboard) => {
    setBusy(true);
    try { return await patch(group, { settings: { dashboard } }); } finally { setBusy(false); }
  };
  const move = (i, d) => {
    const next = [...widgets];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div>
      {isAdmin && (
        <div className="mb-4 flex justify-end">
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>＋ Add widget</button>
        </div>
      )}
      {widgets.length === 0 && <div className="glass p-8 text-center text-sm text-slate-400">No widgets yet.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {widgets.map((w, i) => (
          <section key={w.id} className={`glass p-5 ${w.kind === 'about' || w.kind === 'html' ? 'md:col-span-2' : ''}`} aria-label={KINDS[w.kind]}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">{w.title || KINDS[w.kind]}</h3>
              {isAdmin && (
                <div className="flex gap-1">
                  <button className="btn btn-ghost h-8 w-8 !p-0" onClick={() => move(i, -1)} aria-label="Move widget up" disabled={busy || i === 0}>↑</button>
                  <button className="btn btn-ghost h-8 w-8 !p-0" onClick={() => move(i, 1)} aria-label="Move widget down" disabled={busy || i === widgets.length - 1}>↓</button>
                  <button className="btn btn-ghost h-8 w-8 !p-0" onClick={() => save(widgets.filter((x) => x.id !== w.id))} aria-label="Remove widget" disabled={busy}>✕</button>
                </div>
              )}
            </div>
            <Widget w={w} group={group} />
          </section>
        ))}
      </div>
      {adding && <AddWidget onClose={() => setAdding(false)} onAdd={async (w) => { if (await save([...widgets, { id: uid('w'), ...w }])) setAdding(false); }} />}
    </div>
  );
}

function Widget({ w, group }) {
  const { state, user, me } = useStore();
  switch (w.kind) {
    case 'about':
      return <p className="text-sm leading-relaxed text-slate-200">{group.description || 'No description yet.'}</p>;
    case 'rules':
      return <p className="whitespace-pre-wrap text-sm text-slate-300">{group.guidelines || 'No guidelines set.'}</p>;
    case 'events':
      return <EventsWidget group={group} />;
    case 'members':
      return (
        <div className="flex flex-wrap gap-3">
          {group.members.slice(-8).reverse().map((id) => user(id) && (
            <Link key={id} to={`/people/${id}`} className="flex items-center gap-2 rounded-lg p-1 pr-2 text-sm hover:bg-white/5">
              <Avatar user={user(id)} size={28} />{user(id).name.split(' ')[0]}
            </Link>
          ))}
        </div>
      );
    case 'links':
      return (w.links?.length ? (
        <ul className="space-y-1">
          {w.links.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-400 hover:underline"><Glyph value="link" tile={false} size={16} /> {l.label}</a></li>)}
        </ul>
      ) : <p className="text-sm text-slate-400">No links.</p>);
    case 'html':
      // Sandboxed with no permissions: scripts and same-origin access are blocked.
      return <iframe title={w.title || 'Custom content'} sandbox="" className="h-40 w-full rounded-lg bg-white"
        srcDoc={`<!doctype html><body style="font-family:system-ui;padding:12px;color:#111">${w.html || ''}</body>`} />;
    case 'stats': {
      // Only what this viewer could open: live posts, published forum posts, visible events.
      const posts = state.posts.filter((p) => p.scope?.type === 'group' && p.scope.id === group.id && isLive(p)).length;
      const forums = state.forumPosts.filter((f) => f.groupId === group.id && f.status !== 'draft').length;
      return (
        <dl className="grid grid-cols-2 gap-3 text-center">
          {[['Members', group.memberCount ?? group.members.length], ['Posts', posts], ['Events', <EventCount key="e" group={group} />], ['Discussions', forums]].map(([k, n]) => (
            <div key={k} className="rounded-xl bg-white/5 p-3"><dd className="text-2xl font-extrabold text-brand-gradient">{n}</dd><dt className="text-xs text-slate-400">{k}</dt></div>
          ))}
        </dl>
      );
    }
    default: return null;
  }
}

const DAY = 864e5;

// Next occurrence of each upcoming group event the viewer may see (recurring series included).
function EventsWidget({ group }) {
  const [now] = useState(Date.now);
  const { events, loading, error } = useEvents({ community: group.id, from: now, to: now + 400 * DAY });
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (loading && !events.length) return <p className="text-sm text-slate-400">Loading…</p>;
  const list = events.filter((e) => e.status !== 'cancelled')
    .flatMap((e) => occurrences(e, now, now + 400 * DAY).slice(0, 1)).sort((a, b) => a.occStart - b.occStart).slice(0, 3);
  if (!list.length) return <p className="text-sm text-slate-400">No upcoming events.</p>;
  return (
    <ul className="space-y-2">
      {list.map((e) => (
        <li key={`${e.id}-${e.occStart}`}><Link to={`/events/${e.id}`} className="block rounded-lg p-2 hover:bg-white/5">
          <div className="text-sm font-semibold">{e.title}</div>
          <div className="text-xs text-slate-400">{fmtDate(e.occStart)}{e.location ? ` · ${e.location}` : ''}</div>
        </Link></li>
      ))}
    </ul>
  );
}

/** Events in this group from the past year and the year ahead that the viewer can open. */
function EventCount({ group }) {
  const [now] = useState(Date.now);
  const { events, loading } = useEvents({ community: group.id, from: now - 365 * DAY, to: now + 365 * DAY });
  return loading && !events.length ? '…' : events.length;
}

function AddWidget({ onAdd, onClose }) {
  const [kind, setKind] = useState('about');
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [links, setLinks] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const w = { kind, title: title.trim() || undefined };
    if (kind === 'html') w.html = html;
    if (kind === 'links') {
      w.links = links.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [label, url] = l.includes('|') ? l.split('|').map((x) => x.trim()) : [l, l];
        return { label, url: /^https?:\/\//.test(url) ? url : `https://${url}` };
      });
    }
    onAdd(w);
  };
  return (
    <Modal title="Add a widget" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Widget"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Title (optional)"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {kind === 'html' && <Field label="HTML" hint="Rendered in a sandbox. Scripts don’t run."><textarea className="input min-h-28 font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} /></Field>}
        {kind === 'links' && <Field label="Links" hint="One per line: Label | https://url"><textarea className="input min-h-24" value={links} onChange={(e) => setLinks(e.target.value)} /></Field>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Add</button></div>
      </form>
    </Modal>
  );
}
