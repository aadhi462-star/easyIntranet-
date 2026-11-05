import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { timeAgo, useStore } from '../lib/store.jsx';
import { Empty, PageHeader } from '../components/ui.jsx';

const TYPES = [
  ['people', 'People', '🧑'], ['posts', 'Posts', '📰'], ['groups', 'Groups', '👥'], ['events', 'Events', '📅'],
  ['forums', 'Forums', '🗂️'], ['articles', 'Manuals', '📖'], ['files', 'Files', '📁'], ['ideas', 'Ideas', '💡'],
  ['messages', 'Messages', '💬'], ['tasks', 'Tasks', '✅'], ['surveys', 'Surveys', '📋'], ['townhalls', 'Town halls', '🎤'],
];

/** Flattens every searchable collection into {type, id, title, body, link, at}. */
function buildIndex(s, user) {
  const out = [];
  const push = (type, id, title, body, link, at) => out.push({ type, id: `${type}:${id}`, title: title || '', body: body || '', link, at });
  for (const u of s.users) push('people', u.id, u.name, [u.role, u.company, u.city, u.dept, u.batch, ...(u.skills || [])].join(' · '), `/people/${u.id}`);
  for (const p of s.posts) if (p.status !== 'pending') push('posts', p.id, `${user(p.authorId)?.name ?? 'Someone'}`, [p.text, ...p.comments.map((c) => c.text)].join(' — '), `/post/${p.id}`, p.createdAt);
  for (const g of s.groups) push('groups', g.id, g.name, g.description, `/groups/${g.id}`);
  for (const e of s.events) push('events', e.id, e.title, [e.location, e.description].join(' — '), `/events/${e.id}`, e.start);
  for (const f of s.forumPosts) if (f.status !== 'draft') push('forums', f.id, f.title, [f.body, ...f.replies.map((r) => r.text)].join(' — '), `/forums/${f.id}`, f.createdAt);
  for (const m of s.manuals) for (const c of m.chapters) for (const a of c.articles) push('articles', a.id, a.title, `${m.title} › ${c.title} — ${a.body}`, `/manuals/${m.id}/${a.id}`, a.updatedAt);
  for (const f of s.files || []) push('files', f.id, f.name, [f.description, f.folder, f.type].filter(Boolean).join(' · '), `/files/${f.id}`, f.createdAt);
  for (const i of s.ideas || []) push('ideas', i.id, i.title, i.description || i.body, `/ideas/${i.id}`, i.createdAt);
  for (const c of s.channels) for (const m of c.messages) push('messages', `${c.id}-${m.id}`, `#${c.name} · ${user(m.authorId)?.name ?? ''}`, m.text, `/channels/${c.id}`, m.createdAt);
  for (const d of s.dms || []) for (const m of d.messages || []) push('messages', `${d.id}-${m.id}`, `Chat · ${user(m.authorId)?.name ?? ''}`, m.text, `/messages/${d.id}`, m.createdAt);
  for (const t of s.tasks || []) push('tasks', t.id, t.title, t.description, `/tasks/${t.id}`, t.createdAt);
  for (const sv of s.surveys || []) push('surveys', sv.id, sv.title, sv.description, `/surveys/${sv.id}`, sv.createdAt);
  for (const th of s.townhalls || []) push('townhalls', th.id, th.title, th.description, `/townhalls/${th.id}`, th.start ?? th.createdAt);
  return out;
}

function Highlight({ text, terms, max = 180 }) {
  if (!terms.length) return text.slice(0, max);
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = first > 60 ? first - 40 : 0;
  const snippet = (start ? '…' : '') + text.slice(start, start + max) + (text.length > start + max ? '…' : '');
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return snippet.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-leaf-500/30 px-0.5 text-white">{part}</mark> : part));
}

export default function Search() {
  const { state, user } = useStore();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [type, setType] = useState('all');
  const [draft, setDraft] = useState(q);
  const index = useMemo(() => buildIndex(state, user), [state, user]);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  const results = useMemo(() => {
    if (!terms.length) return [];
    return index
      .map((r) => {
        const hay = `${r.title} ${r.body}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return null;
        const score = terms.reduce((n, t) => n + (r.title.toLowerCase().includes(t) ? 3 : 1), 0);
        return { ...r, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (b.at || 0) - (a.at || 0));
  }, [index, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = Object.fromEntries(TYPES.map(([id]) => [id, results.filter((r) => r.type === id).length]));
  const shown = TYPES.filter(([id]) => (type === 'all' || type === id) && counts[id]);

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `${results.length} result${results.length === 1 ? '' : 's'} for “${q}”` : 'Search across the whole network'} />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setParams(draft.trim() ? { q: draft.trim() } : {}); }}>
        <input className="input" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Try “mentorship”, “Bengaluru” or a name" aria-label="Search query" />
        <button className="btn btn-primary">Search</button>
      </form>
      {q && (
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <button onClick={() => setType('all')} className={`chip min-h-9 !px-3 ${type === 'all' ? '!bg-brand-500 !text-white' : ''}`}>All · {results.length}</button>
          {TYPES.filter(([id]) => counts[id]).map(([id, label, icon]) => (
            <button key={id} onClick={() => setType(id)} className={`chip min-h-9 !px-3 ${type === id ? '!bg-brand-500 !text-white' : ''}`}>{icon} {label} · {counts[id]}</button>
          ))}
        </div>
      )}
      {!q ? <Empty icon="🔎" title="What are you looking for?">People, posts, groups, events, forums, manuals, files, ideas, messages, tasks, surveys and town halls.</Empty>
        : results.length === 0 ? <Empty icon="🫥" title="No matches">Try fewer or different words.</Empty>
        : shown.map(([id, label, icon]) => (
          <section key={id} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{icon} {label}</h2>
            <ul className="glass divide-y divide-white/5">
              {results.filter((r) => r.type === id).slice(0, type === 'all' ? 5 : 100).map((r) => (
                <li key={r.id}>
                  <Link to={r.link} className="block p-4 hover:bg-white/5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white"><Highlight text={r.title} terms={terms} /></span>
                      <span className="chip">{label}</span>
                      {r.at && <span className="ml-auto text-xs text-slate-500">{timeAgo(r.at)}</span>}
                    </div>
                    {r.body && <p className="mt-1 text-sm text-slate-400"><Highlight text={r.body} terms={terms} /></p>}
                  </Link>
                </li>
              ))}
            </ul>
            {type === 'all' && counts[id] > 5 && <button className="mt-2 text-sm text-brand-400 hover:underline" onClick={() => setType(id)}>See all {counts[id]} {label.toLowerCase()}</button>}
          </section>
        ))}
    </>
  );
}
