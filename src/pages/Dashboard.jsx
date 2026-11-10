import { Glyph } from '../components/icons.jsx';
import { useCallback, useEffect, useState } from 'react';
import { communityPath } from '../lib/communities.js';
import { Link } from 'react-router-dom';
import { fmtDate, timeAgo, uid, useStore } from '../lib/store.jsx';
import { leaderboard } from '../lib/gamify.js';
import { useTheme } from '../lib/theme.js';
import { isUrl, whenText } from '../components/events/eventUtils.js';
import { fetchDashboard } from '../lib/events.js';
import { acknowledge, errorText } from '../lib/feed.js';
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

// Tasks and the leaderboard are parked behind feature flags (decision D2): their widgets stay in
// the code but aren't shown or offered until those modules come back.
const PARKED = new Set(['tasks', 'leaderboard']);
const DEFAULTS = ['welcome', 'mandatory', 'events', 'tasks', 'leaderboard', 'members', 'links'].filter((k) => !PARKED.has(k));
// Widgets that show the server's dashboard summary (GET /api/dashboard).
const SERVER_KINDS = new Set(['welcome', 'mandatory', 'events', 'members']);

const makeWidget = (ownerId, kind, order, config = {}) => ({ id: uid('dw'), ownerId, kind, order, title: KINDS[kind].title, config });
const defaultConfig = (kind) => (kind === 'links'
  ? { links: [{ label: 'Alumni Handbook', url: '/manuals/man1' }, { label: 'Mentorship request', url: '/apps/app1' }, { label: 'Ideas board', url: '/ideas' }] }
  : kind === 'html' ? { html: '<h3>Hello alumni 👋</h3><p>Edit this widget to add your own HTML.</p>' }
  : kind === 'notes' ? { text: '' } : {});

/**
 * The dashboard summary from the server: one request on mount, refreshed when the window regains
 * focus and when a different person signs in. The server decides what this member may see.
 */
function useDashboard() {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fetchDashboard()
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState((s) => ({ data: s.data, error, loading: false })));
  }, []);
  useEffect(() => {
    load();
    const onFocus = () => load();
    const onSession = () => { setState({ data: null, error: null, loading: true }); load(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('c1-session-changed', onSession);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('c1-session-changed', onSession); };
  }, [load]);
  // Acknowledged reads leave the list straight away; the next refresh confirms it.
  const dropRead = (id) => setState((s) => ({ ...s, data: s.data && { ...s.data, mandatoryReads: s.data.mandatoryReads.filter((p) => p.id !== id) } }));
  return { ...state, reload: load, dropRead };
}

export default function Dashboard() {
  const { state, me, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const dash = useDashboard();
  const mine = (state.dashboardWidgets || []).filter((w) => w.ownerId === me.id && !PARKED.has(w.kind)).sort((a, b) => a.order - b.order);

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
      <PageHeader title={`Good to see you, ${me.name.split(' ')[0]}`} subtitle="Here’s what’s happening across your communities."
        actions={<>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add widget</button>
          <button className="btn btn-ghost" onClick={() => confirm('Reset your dashboard to the default widgets?') && seedDefaults()}>Reset</button>
        </>} />
      {dash.error && (
        <div role="alert" className="glass mb-4 flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="flex-1 text-rose-200">{dash.data ? 'Couldn’t refresh your dashboard. ' : 'Couldn’t load your dashboard. '}{errorText(dash.error)}</span>
          <button className="btn btn-ghost" onClick={dash.reload} disabled={dash.loading}>{dash.loading ? 'Retrying…' : 'Try again'}</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {mine.map((w, i) => (
          <section key={w.id} className={`glass flex min-w-0 flex-col p-5 ${w.kind === 'welcome' || w.kind === 'html' ? 'md:col-span-2' : ''}`} aria-label={w.title}>
            <header className="mb-3 flex items-center gap-2">
              <h2 className="flex flex-1 items-center gap-2.5 font-bold"><Glyph value={KINDS[w.kind]?.icon} size={30} />{w.title}</h2>
              <button className="btn btn-ghost h-9 w-9 !p-0" disabled={i === 0} onClick={() => move(w, -1)} aria-label={`Move ${w.title} up`}>↑</button>
              <button className="btn btn-ghost h-9 w-9 !p-0" disabled={i === mine.length - 1} onClick={() => move(w, 1)} aria-label={`Move ${w.title} down`}>↓</button>
              {['links', 'html', 'notes'].includes(w.kind) && <button className="btn btn-ghost h-9 w-9 !p-0" onClick={() => setEditing(w)} aria-label={`Edit ${w.title}`}><Glyph value="✎" tile={false} size={16} /></button>}
              <button className="btn btn-ghost h-9 w-9 !p-0" onClick={() => remove(w)} aria-label={`Remove ${w.title}`}>✕</button>
            </header>
            {SERVER_KINDS.has(w.kind) && !dash.data
              ? (dash.loading ? <div className="h-24 animate-pulse rounded-lg bg-white/5" aria-label="Loading" /> : <p className="text-sm text-slate-400">Not available right now.</p>)
              : <WidgetBody w={w} d={dash.data} onAcked={dash.dropRead} />}
          </section>
        ))}
      </div>
      {adding && (
        <Modal title="Add a widget" onClose={() => setAdding(false)}>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(KINDS).filter(([k]) => !PARKED.has(k)).map(([k, v]) => (
              <button key={k} className="btn btn-ghost min-h-12 justify-start" onClick={() => add(k)}><Glyph value={v.icon} size={28} />{v.title}</button>
            ))}
          </div>
        </Modal>
      )}
      {editing && <EditWidget w={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function WidgetBody({ w, d, onAcked }) {
  const { state, me, user, dispatch } = useStore();
  const [, mode] = useTheme();
  const [taskError, setTaskError] = useState('');
  const [acking, setAcking] = useState(null);
  const [ackError, setAckError] = useState('');
  const person = (u) => user(u.id) ?? u;
  const scrollBox = 'space-y-2 text-sm';
  switch (w.kind) {
    case 'welcome': {
      const shown = d.communities.slice(0, 6);
      return (
        <div className="grid gap-3 *:min-w-0 sm:grid-cols-[1fr_2fr]">
          <div className="brand-gradient rounded-xl p-4">
            <div className="text-sm text-white/80">Welcome to</div>
            <div className="text-xl font-extrabold">CommunityOne</div>
            <div className="mt-2 text-xs text-white/80">You’re in {d.communities.length} {d.communities.length === 1 ? 'community' : 'communities'}</div>
            {d.connectionRequests > 0 && (
              <Link to="/people" className="mt-3 inline-block rounded-lg bg-black/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black/30">
                {d.connectionRequests} connection {d.connectionRequests === 1 ? 'request' : 'requests'} →
              </Link>
            )}
            {shown.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs">{shown.map((c) => (
                <li key={c.id}><Link to={communityPath(c.id)} className="flex items-center gap-1.5 text-white/90 hover:underline">
                  <span aria-hidden="true">{c.emoji || '👥'}</span><span className="flex-1 truncate">{c.name}</span>
                  <span className="text-white/70">{c.memberCount}{['owner', 'admin'].includes(c.role) ? ` · ${c.role}` : ''}{c.status === 'archived' ? ' · archived' : ''}</span>
                </Link></li>
              ))}
              {d.communities.length > shown.length && <li><Link to="/groups" className="text-white/80 hover:underline">All {d.communities.length} →</Link></li>}
              </ul>
            )}
          </div>
          <ul className={scrollBox}>
            {d.announcements.length === 0 && <li className="text-slate-400">No announcements yet.</li>}
            {d.announcements.slice(0, 3).map((p) => (
              <li key={p.id}><Link to={`/post/${p.id}`} className="block rounded-lg bg-white/5 p-3 hover:bg-white/10">
                <span className="chip mr-2"><Glyph value="📣" tile={false} size={16} /> Announcement</span>
                <span className="text-xs text-slate-500">{p.community.name} · {p.author} · {timeAgo(Date.parse(p.publishedAt))}</span>
                <p className="mt-1 line-clamp-2 text-slate-200">{p.excerpt}</p>
              </Link></li>
            ))}
          </ul>
        </div>
      );
    }
    case 'mandatory': {
      const ack = async (p) => {
        setAcking(p.id); setAckError('');
        try { await acknowledge(p.id); onAcked(p.id); } catch (e) { setAckError(errorText(e)); } finally { setAcking(null); }
      };
      return d.mandatoryReads.length === 0 ? <p className="text-sm text-slate-400">Nothing to acknowledge. ✅</p> : (
        <>
          <ul className={scrollBox}>{d.mandatoryReads.map((p) => (
            <li key={p.id} className="rounded-lg bg-amber-400/10 p-3">
              <Link to={`/post/${p.id}`} className="block hover:underline">
                <span className="text-xs text-slate-400">{p.community.name} · {p.author}</span>
                <p className="line-clamp-2 text-slate-200">{p.excerpt}</p>
              </Link>
              <div className="mt-2 flex items-center gap-2">
                {p.deadline && <span className="flex-1 text-xs text-amber-200">Due {fmtDate(Date.parse(p.deadline), { day: 'numeric', month: 'short' })}</span>}
                <button className="btn btn-primary ml-auto !py-1 text-xs" disabled={acking === p.id} onClick={() => ack(p)}>{acking === p.id ? 'Saving…' : p.button || 'Acknowledge'}</button>
              </div>
            </li>
          ))}</ul>
          {ackError && <p role="alert" className="mt-2 text-xs text-rose-300">{ackError}</p>}
        </>
      );
    }
    case 'events': {
      // The server lists the next occurrence of each event this member may see.
      const up = d.upcomingEvents.slice(0, 4);
      return up.length === 0 ? <p className="text-sm text-slate-400">No upcoming events.</p> : (
        <ul className={scrollBox}>{up.map((e) => {
          const start = e.nextStart ?? e.start;
          return (
            <li key={e.id}><Link to={`/events/${e.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-500/20 text-center text-[10px] font-bold uppercase leading-tight text-brand-400">
                {new Date(start).toLocaleString(undefined, { month: 'short' })}<br /><span className="text-base text-white">{new Date(start).getDate()}</span>
              </span>
              <span className="min-w-0 flex-1"><span className="block font-semibold text-white">{e.title}</span>
                <span className="block truncate text-xs text-slate-400">{whenText(e, start, start + (e.end - e.start))}{e.community ? ` · ${e.community.name}` : ''}{e.location ? ` · ${isUrl(e.location) ? 'Map link' : e.location}` : ''}</span></span>
              {e.myRsvp && <span className="chip">{e.myRsvp}</span>}
            </Link></li>
          );
        })}</ul>
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
    case 'members':
      return d.newMembers.length === 0 ? <p className="text-sm text-slate-400">No new members yet.</p> : (
        <ul className={scrollBox}>{d.newMembers.map((u) => {
          const p = person(u);
          return (
            <li key={u.id}><Link to={`/people/${u.id}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-white/5">
              <Avatar user={p} size={32} /><span className="flex-1"><span className="block font-medium text-white">{u.name}</span>
                {(p.batch || p.city) && <span className="text-xs text-slate-400">{[p.batch && `Class of ${p.batch}`, p.city].filter(Boolean).join(' · ')}</span>}</span>
            </Link></li>
          );
        })}</ul>
      );
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
