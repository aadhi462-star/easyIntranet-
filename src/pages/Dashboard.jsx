import { Glyph } from '../components/icons.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtDate, timeAgo, uid, useStore } from '../lib/store.jsx';
import { leaderboard } from '../lib/gamify.js';
import { useTheme } from '../lib/theme.js';
import { audienceOf, canSee as canSeePost, isLive } from '../components/feed/utils.js';
import { canSee as canSeeEvent, isUrl, nextOccurrence } from '../components/events/eventUtils.js';
import { Avatar, Field, Modal, PageHeader } from '../components/ui.jsx';

const KINDS = {
  welcome: { title: 'Welcome & announcements', icon: '👋' },
  mandatory: { title: 'Pending mandatory reads', icon: '📌' },
  events: { title: 'Upcoming events', icon: '📅' },
  tasks: { title: 'My tasks', icon: '✅' },
  leaderboard: { title: 'Leaderboard', icon: '🏆' },
  members: { title: 'New members', icon: '🆕' },
  links: { title: 'Quick links', icon: '🔗' },
  html: { title: 'Custom HTML', icon: '🧱' },
  notes: { title: 'Notes', icon: '📝' },
};

const DEFAULTS = ['welcome', 'mandatory', 'events', 'tasks', 'leaderboard', 'members', 'links'];

const makeWidget = (ownerId, kind, order, config = {}) => ({ id: uid('dw'), ownerId, kind, order, title: KINDS[kind].title, config });
const defaultConfig = (kind) => (kind === 'links'
  ? { links: [{ label: 'Alumni Handbook', url: '/manuals/man1' }, { label: 'Mentorship request', url: '/apps/app1' }, { label: 'Ideas board', url: '/ideas' }] }
  : kind === 'html' ? { html: '<h3>Hello alumni 👋</h3><p>Edit this widget to add your own HTML.</p>' }
  : kind === 'notes' ? { text: '' } : {});

// Members who can actually be seen: not awaiting approval and not deactivated.
const isActive = (u) => !u.deactivated && (u.status ?? 'active') === 'active';

export default function Dashboard() {
  const { state, me, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const mine = (state.dashboardWidgets || []).filter((w) => w.ownerId === me.id).sort((a, b) => a.order - b.order);

  const seedDefaults = () => dispatch({ type: 'set', key: 'dashboardWidgets', silent: true,
    value: (list = []) => [...list.filter((w) => w.ownerId !== me.id), ...DEFAULTS.map((k, i) => makeWidget(me.id, k, i, defaultConfig(k)))] });

  useEffect(() => { if (!mine.length) seedDefaults(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (w, dir) => {
    const i = mine.indexOf(w);
    const other = mine[i + dir];
    if (!other) return;
    dispatch({ type: 'set', key: 'dashboardWidgets', silent: true,
      value: (list) => list.map((x) => (x.id === w.id ? { ...x, order: other.order } : x.id === other.id ? { ...x, order: w.order } : x)) });
  };
  const remove = (w) => dispatch({ type: 'remove', col: 'dashboardWidgets', id: w.id, silent: true });
  const add = (kind) => {
    dispatch({ type: 'set', key: 'dashboardWidgets', silent: true,
      value: (list = []) => [...list, makeWidget(me.id, kind, (mine.at(-1)?.order ?? 0) + 1, defaultConfig(kind))] });
    setAdding(false);
  };

  return (
    <>
      <PageHeader title={`Good to see you, ${me.name.split(' ')[0]}`} subtitle={state.settings.tagline}
        actions={<>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add widget</button>
          <button className="btn btn-ghost" onClick={() => confirm('Reset your dashboard to the default widgets?') && seedDefaults()}>Reset</button>
        </>} />
      <div className="grid gap-4 md:grid-cols-2">
        {mine.map((w, i) => (
          <section key={w.id} className={`glass flex flex-col p-5 ${w.kind === 'welcome' || w.kind === 'html' ? 'md:col-span-2' : ''}`} aria-label={w.title}>
            <header className="mb-3 flex items-center gap-2">
              <h2 className="flex flex-1 items-center gap-2.5 font-bold"><Glyph value={KINDS[w.kind]?.icon} size={30} />{w.title}</h2>
              <button className="btn btn-ghost h-9 w-9 !p-0" disabled={i === 0} onClick={() => move(w, -1)} aria-label={`Move ${w.title} up`}>↑</button>
              <button className="btn btn-ghost h-9 w-9 !p-0" disabled={i === mine.length - 1} onClick={() => move(w, 1)} aria-label={`Move ${w.title} down`}>↓</button>
              {['links', 'html', 'notes'].includes(w.kind) && <button className="btn btn-ghost h-9 w-9 !p-0" onClick={() => setEditing(w)} aria-label={`Edit ${w.title}`}><Glyph value="✎" tile={false} size={16} /></button>}
              <button className="btn btn-ghost h-9 w-9 !p-0" onClick={() => remove(w)} aria-label={`Remove ${w.title}`}>✕</button>
            </header>
            <WidgetBody w={w} />
          </section>
        ))}
      </div>
      {adding && (
        <Modal title="Add a widget" onClose={() => setAdding(false)}>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} className="btn btn-ghost min-h-12 justify-start" onClick={() => add(k)}><Glyph value={v.icon} size={28} />{v.title}</button>
            ))}
          </div>
        </Modal>
      )}
      {editing && <EditWidget w={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WidgetBody({ w }) {
  const { state, me, user, dispatch } = useStore();
  const [, mode] = useTheme();
  const [taskError, setTaskError] = useState('');
  const scrollBox = 'space-y-2 text-sm';
  switch (w.kind) {
    case 'welcome': {
      const anns = state.posts.filter((p) => p.type === 'announcement' && isLive(p) && canSeePost(state, me, p))
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div className="brand-gradient rounded-xl p-4">
            <div className="text-sm text-white/80">Welcome to</div>
            <div className="text-xl font-extrabold">{state.settings.networkName}</div>
            <div className="mt-2 text-xs text-white/80">{state.users.filter(isActive).length} members · {state.groups.length} groups</div>
          </div>
          <ul className={scrollBox}>
            {anns.length === 0 && <li className="text-slate-400">No announcements yet.</li>}
            {anns.map((p) => (
              <li key={p.id}><Link to={`/post/${p.id}`} className="block rounded-lg bg-white/5 p-3 hover:bg-white/10">
                <span className="chip mr-2"><Glyph value="📣" tile={false} size={16} /> Announcement</span><span className="text-xs text-slate-500">{timeAgo(p.createdAt)}</span>
                <p className="mt-1 line-clamp-2 text-slate-200">{p.text}</p>
              </Link></li>
            ))}
          </ul>
        </div>
      );
    }
    case 'mandatory': {
      const pending = state.posts.filter((p) => p.mandatory && isLive(p) && p.authorId !== me.id
        && !(p.mandatory.acks || []).includes(me.id) && audienceOf(state, p).includes(me.id) && canSeePost(state, me, p));
      return pending.length === 0 ? <p className="text-sm text-slate-400">Nothing to acknowledge. ✅</p> : (
        <ul className={scrollBox}>{pending.map((p) => (
          <li key={p.id}><Link to={`/post/${p.id}`} className="block rounded-lg bg-amber-400/10 p-3 hover:bg-amber-400/15">
            <p className="line-clamp-2 text-slate-200">{p.text}</p>
            {p.mandatory.deadline && <span className="text-xs text-amber-200">Due {fmtDate(p.mandatory.deadline, { day: 'numeric', month: 'short' })}</span>}
          </Link></li>
        ))}</ul>
      );
    }
    case 'events': {
      // Recurring events count by their next occurrence, and only events this member can see.
      const now = Date.now();
      const up = state.events.filter((e) => canSeeEvent(e, me, state.groups))
        .map((e) => ({ ...e, start: nextOccurrence(e, now) })).filter((e) => e.start > now)
        .sort((a, b) => a.start - b.start).slice(0, 4);
      return up.length === 0 ? <p className="text-sm text-slate-400">No upcoming events.</p> : (
        <ul className={scrollBox}>{up.map((e) => (
          <li key={e.id}><Link to={`/events/${e.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-500/20 text-center text-[10px] font-bold uppercase leading-tight text-brand-400">
              {new Date(e.start).toLocaleString(undefined, { month: 'short' })}<br /><span className="text-base text-white">{new Date(e.start).getDate()}</span>
            </span>
            <span className="flex-1"><span className="block font-semibold text-white">{e.title}</span><span className="text-xs text-slate-400">{isUrl(e.location) ? "Map link" : e.location}</span></span>
            {e.rsvps?.[me.id] && <span className="chip">{e.rsvps[me.id]}</span>}
          </Link></li>
        ))}</ul>
      );
    }
    case 'tasks': {
      // A task's status is a section id on its board; "done" means a section flagged done.
      const boardOf = (t) => (state.boards || []).find((b) => b.id === t.boardId);
      const doneSection = (b) => b?.sections.find((sec) => sec.done);
      const isDone = (t) => !!boardOf(t)?.sections.find((sec) => sec.id === t.status)?.done;
      const tasks = state.tasks || [];
      const blockers = (t) => (t.blockedBy || []).map((id) => tasks.find((x) => x.id === id)).filter((b) => b && !isDone(b));
      const mineT = tasks.filter((t) => t.assigneeId === me.id && boardOf(t) && !isDone(t))
        .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)).slice(0, 6);
      const complete = (t) => {
        const bl = blockers(t);
        if (bl.length) return setTaskError(`“${t.title}” is blocked by ${bl.map((b) => `“${b.title}”`).join(', ')}.`);
        const target = doneSection(boardOf(t));
        if (!target) return setTaskError(`“${boardOf(t).name}” has no Done section yet.`);
        setTaskError('');
        dispatch({ type: 'update', col: 'tasks', id: t.id, patch: { status: target.id, completedAt: Date.now() } });
      };
      return mineT.length === 0 ? <p className="text-sm text-slate-400">No open tasks assigned to you.</p> : (
        <>
          <ul className={scrollBox}>{mineT.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-white/5">
              <input type="checkbox" className="h-5 w-5 accent-brand-400" checked={false} aria-label={`Mark ${t.title} done`} onChange={() => complete(t)} />
              <Link to={`/tasks/${t.boardId}`} className="flex-1 text-slate-200 hover:underline">{t.title}</Link>
              {blockers(t).length > 0 && <span className="chip !bg-rose-500/15 !text-rose-200">Blocked</span>}
              {t.dueAt && <span className={`text-xs ${t.dueAt < Date.now() ? 'font-semibold text-rose-300' : 'text-slate-500'}`}>{fmtDate(t.dueAt, { day: 'numeric', month: 'short' })}</span>}
            </li>
          ))}</ul>
          {taskError && <p role="alert" className="mt-2 text-xs text-rose-300">{taskError}</p>}
        </>
      );
    }
    case 'leaderboard':
      return (
        <ol className={scrollBox}>{leaderboard(state).slice(0, 5).map((r, i) => (
          <li key={r.user.id} className="flex items-center gap-3">
            <span className="w-5 text-center font-bold text-slate-400">{i + 1}</span>
            <Avatar user={r.user} size={32} />
            <Link to={`/people/${r.user.id}`} className="flex-1 font-medium text-white hover:underline">{r.user.name}</Link>
            <span className="text-xs text-amber-200"><Glyph value="🏅" tile={false} size={16} /> {r.points}</span>
          </li>
        ))}</ol>
      );
    case 'members': {
      const recent = state.users.filter(isActive).sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0)).slice(0, 5);
      return (
        <ul className={scrollBox}>{recent.map((u) => (
          <li key={u.id}><Link to={`/people/${u.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-white/5">
            <Avatar user={u} size={32} /><span className="flex-1"><span className="block font-medium text-white">{u.name}</span>
              <span className="text-xs text-slate-400">Class of {u.batch} · {u.city}</span></span>
          </Link></li>
        ))}</ul>
      );
    }
    case 'links':
      return (
        <ul className="grid gap-2 sm:grid-cols-2">{(w.config.links || []).map((l, i) => (
          <li key={i}>{/^https?:/.test(l.url)
            ? <a href={l.url} target="_blank" rel="noreferrer" className="btn btn-ghost w-full justify-start">↗ {l.label}</a>
            : <Link to={l.url} className="btn btn-ghost w-full justify-start">→ {l.label}</Link>}</li>
        ))}</ul>
      );
    case 'html':
      // sandbox without allow-scripts: markup and inline CSS only.
      return <iframe title={w.title} sandbox="" srcDoc={`<meta name="color-scheme" content="${mode}"><body style="margin:0;background:transparent;font-family:Inter,system-ui,sans-serif;color:${mode === 'light' ? '#141614' : '#e9ebe9'}">${w.config.html || ''}</body>`} className="h-48 w-full rounded-lg bg-white/[.03]" />;
    case 'notes':
      return (
        <textarea className="input min-h-32" placeholder="Jot something down… (saved automatically)" value={w.config.text || ''} aria-label="Notes"
          onChange={(e) => dispatch({ type: 'update', col: 'dashboardWidgets', id: w.id, silent: true, patch: { config: { ...w.config, text: e.target.value } } })} />
      );
    default:
      return <p className="text-sm text-slate-400">Unknown widget. {user(w.ownerId)?.name}</p>;
  }
}

function EditWidget({ w, onClose }) {
  const { dispatch } = useStore();
  const [title, setTitle] = useState(w.title);
  const [html, setHtml] = useState(w.config.html || '');
  const [links, setLinks] = useState((w.config.links || []).map((l) => `${l.label} | ${l.url}`).join('\n'));
  const save = () => {
    const config = w.kind === 'links'
      ? { links: links.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([a, b]) => a && b).map(([label, url]) => ({ label, url })) }
      : w.kind === 'html' ? { html } : w.config;
    dispatch({ type: 'update', col: 'dashboardWidgets', id: w.id, silent: true, patch: { title, config } });
    onClose();
  };
  return (
    <Modal title="Edit widget" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        {w.kind === 'links' && <Field label="Links" hint="One per line: Label | /path or https://url"><textarea className="input min-h-32 font-mono text-xs" value={links} onChange={(e) => setLinks(e.target.value)} /></Field>}
        {w.kind === 'html' && <Field label="HTML" hint="Rendered in a sandboxed frame. Scripts are disabled."><textarea className="input min-h-40 font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} /></Field>}
        <button className="btn btn-primary w-full" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
