import UserLabels from '../components/UserLabels.jsx';
import { Glyph } from '../components/icons.jsx';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore, timeAgo } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { loadProfile, toLocal, useInstitutions } from '../lib/people.js';
import { toast } from '../lib/toast.js';
import { statsFor, BADGES } from '../lib/gamify.js';
import { Avatar, Empty, Field, Modal, PageHeader, Tabs } from '../components/ui.jsx';
import { CompletenessMeter, completeness } from '../components/people/Completeness.jsx';
import { MONTHS, daysInMonth, formatMonthDay, isValidBirthday } from '../lib/celebrations.js';
import { FollowButton, PraiseModal, useOpenDm, praiseBadge, isActiveUser, canSeeContact, useBlocks, CONTACT_PRIVACY } from '../components/people/shared.jsx';

// Optional embed from the Feed module (built separately).
const feedLoader = Object.values(import.meta.glob('../components/feed/FeedList.jsx'))[0];
const FeedList = feedLoader ? lazy(feedLoader) : null;

export default function People() {
  const { id } = useParams();
  return id ? <Profile id={id} /> : <Directory />;
}

const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();

const PAGE_SIZE = 24;

function Directory() {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const openDm = useOpenDm();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ batch: '', dept: '', city: '', company: '', skill: '', label: '' });
  const [view, setView] = useState('grid');
  const [praiseFor, setPraiseFor] = useState(null);

  // Search, filters and paging run on the server (only active, listed members come back).
  const [opts, setOpts] = useState({ batch: [], dept: [], city: [], company: [], skill: [] });
  const [result, setResult] = useState({ people: [], total: 0, loading: true, error: '' });
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    api('/directory/facets').then((r) => setOpts({ batch: r.batches.map(String), dept: r.departments, city: r.cities, company: r.companies, skill: r.skills })).catch(() => {});
  }, []);
  useEffect(() => { setLimit(PAGE_SIZE); }, [q, f.batch, f.dept, f.city, f.company, f.skill]);
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ limit: String(limit) });
    if (q.trim()) params.set('q', q.trim());
    if (f.batch) params.set('batch', f.batch);
    if (f.dept) params.set('department', f.dept);
    if (f.city) params.set('city', f.city);
    if (f.company) params.set('company', f.company);
    if (f.skill) params.set('skill', f.skill);
    setResult((r) => ({ ...r, loading: true, error: '' }));
    const t = setTimeout(() => {
      api(`/directory?${params}`)
        .then((r) => { if (live) { setResult({ people: r.people.map(toLocal), total: r.total, loading: false, error: '' }); dispatch({ type: 'users/merge', users: r.people.map(toLocal) }); } })
        .catch((err) => { if (live) setResult((r) => ({ ...r, loading: false, error: err.message })); });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, f.batch, f.dept, f.city, f.company, f.skill, limit, dispatch]);

  const { blocked } = useBlocks();
  // Blocks and user labels still live in the app; they're applied to the server's results.
  const list = result.people.filter((u) => !blocked.has(u.id)
    && (!f.label || (state.userLabels || []).find((l) => l.id === f.label)?.members.includes(u.id)));
  const people = { length: result.total };
  const active = Object.values(f).some(Boolean) || q;

  return (
    <div>
      <PageHeader title="People" subtitle={`${people.length} members in the community`}
        actions={<>
          {!(state.settings?.hiddenModules || ['orgchart']).includes('orgchart') && <Link to="/orgchart" className="btn btn-ghost min-h-11"><Glyph value="🌳" tile={false} size={16} /> Community structure</Link>}
          <div className="glass inline-flex !rounded-xl p-1" role="group" aria-label="View">
            {['grid', 'list'].map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${view === v ? 'bg-brand-500 text-white' : 'text-slate-300'}`}>{v === 'grid' ? '▦ Grid' : '☰ List'}</button>
            ))}
          </div>
        </>} />

      <div className="glass mb-5 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <input className="input sm:col-span-3 lg:col-span-1" type="search" placeholder="Search name, role, skill…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        {[['batch', 'Batch'], ['dept', 'Department'], ['city', 'City'], ['company', 'Company'], ['skill', 'Skill']].map(([k, label]) => (
          <select key={k} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label}>
            <option value="">All {label.toLowerCase()}s</option>
            {opts[k].map((o) => (typeof o === 'object' ? <option key={o.id} value={o.id}>{o.name}</option> : <option key={o} value={o}>{o}</option>))}
          </select>
        ))}
        <select className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="Label">
          <option value="">Label</option>
          {(state.userLabels || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.members.length})</option>)}
        </select>
        {active && <button className="btn btn-ghost min-h-11 sm:col-span-3 lg:col-span-7" onClick={() => { setQ(''); setF({ batch: '', dept: '', city: '', company: '', label: '', skill: '' }); }}>Clear filters · {list.length} result{list.length === 1 ? '' : 's'}</button>}
      </div>

      {result.error && <p role="alert" className="mb-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200">Couldn’t load the directory: {result.error}</p>}
      {result.loading && !list.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-40 animate-pulse" />)}</div>
        : !list.length ? <Empty icon="🔍" title="No one matches those filters">Try removing a filter.</Empty> : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((u) => (
            <article key={u.id} className="glass flex flex-col p-5">
              <Link to={`/people/${u.id}`} className="flex items-center gap-3">
                <Avatar user={u} size={52} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{u.name}{u.admin && <span className="chip ml-2">Admin</span>}</div>
                  <UserLabels userId={u.id} max={2} small className="my-1" />
                  <div className="truncate text-sm text-slate-400">{u.role}{u.company && ` · ${u.company}`}</div>
                  <div className="text-xs text-slate-500">Class of {u.batch} · {u.city}</div>
                </div>
              </Link>
              <div className="mt-3 flex flex-wrap gap-1.5">{(u.skills || []).slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}</div>
              {u.id !== me.id && (
                <div className="mt-auto flex gap-2 pt-4">
                  <FollowButton userId={u.id} className="flex-1" />
                  <button className="btn btn-ghost min-h-11" onClick={() => nav(openDm(u.id))} aria-label={`Message ${u.name}`}><Glyph value="💬" tile={false} size={16} /></button>
                  <button className="btn btn-ghost min-h-11" onClick={() => setPraiseFor(u.id)} aria-label={`Give praise to ${u.name}`}>🙌</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="glass divide-y divide-white/5">
          {list.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link to={`/people/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={40} />
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{u.name}</span><UserLabels userId={u.id} max={2} small /></div><div className="truncate text-xs text-slate-400">{u.role} · {u.company} · {u.city} · {u.batch}</div></div>
              </Link>
              {u.id !== me.id && <div className="flex gap-2">
                <FollowButton userId={u.id} />
                <button className="btn btn-ghost min-h-11" onClick={() => nav(openDm(u.id))} aria-label={`Message ${u.name}`}><Glyph value="💬" tile={false} size={16} /></button>
                <button className="btn btn-ghost min-h-11" onClick={() => setPraiseFor(u.id)} aria-label={`Give praise to ${u.name}`}>🙌</button>
              </div>}
            </div>
          ))}
        </div>
      )}
      {result.total > result.people.length && (
        <button className="btn btn-ghost mt-5 w-full" disabled={result.loading} onClick={() => setLimit(limit + PAGE_SIZE)}>
          {result.loading ? 'Loading…' : `Show more · ${result.people.length} of ${result.total}`}
        </button>
      )}
      {praiseFor && <PraiseModal toId={praiseFor} onClose={() => setPraiseFor(null)} />}
    </div>
  );
}

const ACTIVITY_LABEL = {
  'post/create': 'Shared a post', 'post/comment': 'Commented on a post', 'post/like': 'Liked a post', 'forum/save': 'Posted in Forums',
  'forum/reply': 'Replied in Forums', 'event/rsvp': 'RSVPed to an event', 'event/create': 'Created an event', 'group/join': 'Joined a group',
  'add:praise': 'Gave praise', 'add:ideas': 'Shared an idea', 'manual/article': 'Edited a manual article', 'add:surveyResponses': 'Answered a survey',
};

function Profile({ id }) {
  const { state, me, user, dispatch } = useStore();
  const nav = useNavigate();
  const openDm = useOpenDm();
  // The server decides who can be seen (suspended or hidden accounts come back as not found).
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    setMissing(false);
    loadProfile(id, dispatch).catch((err) => { if (err.status === 404) setMissing(true); });
  }, [id, dispatch]);
  const u = missing ? null : user(id);
  const [tab, setTab] = useState('about');
  // false, or the Edit profile field to focus ('1' = none in particular).
  const [editing, setEditing] = useState(false);
  const [praise, setPraise] = useState(false);
  const [report, setReport] = useState(false);
  const { blocked, toggle: toggleBlock } = useBlocks();
  // ?edit=<field> (from the profile-completeness card) opens Edit profile on your own profile.
  const [params, setParams] = useSearchParams();
  const editParam = params.get('edit');
  useEffect(() => {
    if (!editParam) return;
    if (u && me && u.id === me.id) setEditing(editParam);
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [editParam]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!u) return <Empty icon="🙈" title="Person not found"><Link className="text-brand-400 underline" to="/people">Back to People</Link></Empty>;

  const isMe = u.id === me.id;
  const isBlocked = blocked.has(u.id);
  const showContact = canSeeContact(state, me.id, u);
  // Contact-style custom fields follow the owner's contact privacy setting.
  const CONTACT_FIELDS = ['linkedin', 'phone', 'website'];
  const stats = statsFor(state, u.id);
  const followers = (state.follows || []).filter((f) => f.targetId === u.id);
  const following = (state.follows || []).filter((f) => f.authorId === u.id);
  const received = (state.praise || []).filter((p) => p.toId === u.id);
  const manager = u.managerId && user(u.managerId);
  const reports = state.users.filter((x) => x.managerId === u.id && isActiveUser(x));
  const activity = (state.activity || []).filter((a) => a.userId === u.id && ACTIVITY_LABEL[a.type]).slice(0, 12);
  const fields = (state.customFields || []).filter((cf) => u.customFields?.[cf.id] && (showContact || !CONTACT_FIELDS.includes(cf.id)));
  const profileScore = isMe ? completeness(u, state.customFields || []) : null;
  const pct = stats.nextLevel ? Math.round(((stats.points - stats.level.min) / (stats.nextLevel.min - stats.level.min)) * 100) : 100;

  return (
    <div>
      <section className="glass overflow-hidden !p-0">
        <div className="h-32 sm:h-40" style={{ background: `linear-gradient(120deg, hsl(${u.hue} 70% 45%), #3a3f3c 60%, #a3e635)` }} />
        <div className="-mt-12 flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
          <span className="rounded-full ring-4 ring-ink-900"><Avatar user={u} size={96} /></span>
          <div className="min-w-0 flex-1 pt-12 sm:pt-0">
            <h1 className="text-2xl font-extrabold">{u.name}{u.admin && <span className="chip ml-2 align-middle">Network admin</span>}</h1>
            <UserLabels userId={u.id} max={6} className="mt-1.5" />
            <p className="text-sm text-slate-300">{u.title || u.role}{u.company && ` · ${u.company}`}</p>
            <p className="text-xs text-slate-400">Class of {u.batch} · {u.dept} · 📍 {u.city}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isMe ? <button className="btn btn-primary min-h-11" onClick={() => setEditing('1')}><Glyph value="✏️" tile={false} size={16} /> Edit profile</button> : <>
              {!isBlocked && <>
                <FollowButton userId={u.id} />
                <button className="btn btn-ghost min-h-11" onClick={() => nav(openDm(u.id))}><Glyph value="💬" tile={false} size={16} /> Message</button>
                <button className="btn btn-ghost min-h-11" onClick={() => setPraise(true)}>🙌 Praise</button>
              </>}
              <details className="relative">
                <summary className="btn btn-ghost min-h-11 list-none" aria-label="More actions">⋯</summary>
                <div className="glass glass-strong absolute right-0 z-20 mt-2 w-48 p-1 text-sm">
                  <button className="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-white/5" onClick={() => toggleBlock(u.id)}>{isBlocked ? 'Unblock member' : '🚫 Block member'}</button>
                  <button className="block min-h-11 w-full rounded-lg px-3 text-left text-rose-300 hover:bg-white/5" onClick={() => setReport(true)}>⚑ Report member</button>
                </div>
              </details>
            </>}
          </div>
        </div>
        {isBlocked && <p role="status" className="border-t border-white/5 bg-rose-500/10 px-5 py-2 text-sm text-rose-200">You blocked this member. They can’t message you and their chats are hidden.</p>}
        <div className="grid grid-cols-2 border-t border-white/5 text-center sm:grid-cols-4">
          {[[stats.points, 'Points'], [stats.level.name, 'Level'], [followers.length, 'Followers'], [following.length, 'Following']].map(([v, l]) => (
            <div key={l} className="border-white/5 p-3 odd:border-r sm:border-r sm:last:border-r-0"><div className="text-lg font-bold">{v}</div><div className="text-xs text-slate-400">{l}</div></div>
          ))}
        </div>
      </section>

      {isMe && profileScore.pct < 100 && <div className="mt-5"><CompletenessMeter user={u} onEdit={setEditing} /></div>}

      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'about', label: 'About' }, { id: 'posts', label: 'Posts' }, { id: 'badges', label: 'Badges', count: stats.badges.length + received.length }, { id: 'activity', label: 'Activity' }]} />
      </div>

      {tab === 'about' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className="glass p-5"><h2 className="font-bold">About</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">{u.bio || 'No bio yet.'}</p></section>
            <section className="glass p-5">
              <h2 className="font-bold">Career</h2>
              {(u.career || []).length ? (
                <ol className="mt-3 space-y-4 border-l border-white/10 pl-5">
                  {u.career.map((c, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-ink-900" />
                      <div className="font-semibold">{c.title}</div><div className="text-sm text-slate-400">{c.org} · {c.from}–{c.to ?? 'Present'}</div>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-slate-500">No career history yet.</p>}
            </section>
          </div>
          <div className="space-y-4">
            <section className="glass p-5">
              <h2 className="font-bold">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">{(u.skills || []).length ? u.skills.map((s) => <span key={s} className="chip">{s}</span>) : <span className="text-sm text-slate-500">None listed</span>}</div>
            </section>
            {(fields.length > 0 || u.email) && (
              <section className="glass p-5">
                <h2 className="font-bold">Details</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-400">Email</dt><dd className="truncate">{showContact ? u.email : <span className="text-slate-500"><Glyph value="🔒" tile={false} size={16} /> Hidden</span>}</dd></div>
                  {u.birthday && showContact && isValidBirthday(u.birthday) && <div className="flex justify-between gap-3"><dt className="text-slate-400">Birthday</dt><dd>🎂 {formatMonthDay(u.birthday)}</dd></div>}
                  {u.joinedAt && <div className="flex justify-between gap-3"><dt className="text-slate-400">Joined</dt><dd>{new Date(u.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</dd></div>}
                  {fields.map((cf) => <div key={cf.id} className="flex justify-between gap-3"><dt className="text-slate-400">{cf.label}</dt><dd className="truncate">{u.customFields[cf.id]}</dd></div>)}
                </dl>
              </section>
            )}
            <section className="glass p-5">
              <h2 className="font-bold">In the community</h2>
              {manager && <Link to={`/people/${manager.id}`} className="mt-3 flex items-center gap-2 text-sm"><Avatar user={manager} size={28} /> <span>Part of <b>{manager.name}</b>’s circle</span></Link>}
              {reports.length > 0 && <p className="mt-3 text-sm text-slate-300">Leads a circle of {reports.length} member{reports.length > 1 ? 's' : ''}</p>}
              {!manager && !reports.length && <p className="mt-3 text-sm text-slate-500">Not part of a chapter circle yet.</p>}
              {!(state.settings?.hiddenModules || ['orgchart']).includes('orgchart') && <Link to={`/orgchart?focus=${u.id}`} className="mt-3 inline-block text-sm text-brand-400 hover:underline">View community structure →</Link>}
            </section>
          </div>
        </div>
      )}

      {tab === 'posts' && (FeedList
        ? <Suspense fallback={<div className="glass h-40 animate-pulse" />}><FeedList scope={{ type: 'user', id: u.id }} /></Suspense>
        : <UserPosts userId={u.id} />)}

      {tab === 'badges' && (
        <div className="space-y-4">
          <section className="glass p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold">Level: {stats.level.name}</h2><span className="text-sm text-slate-400">{stats.points} pts</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="brand-gradient h-full" style={{ width: `${pct}%` }} /></div>
            {stats.nextLevel && <p className="mt-2 text-xs text-slate-400">{stats.nextLevel.min - stats.points} points to {stats.nextLevel.name}</p>}
          </section>
          <section className="glass p-5">
            <h2 className="font-bold">Achievement badges</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {BADGES.map((b) => { const got = stats.badges.includes(b.id); return (
                <div key={b.id} className={`rounded-xl border border-white/10 p-3 text-center ${got ? '' : 'opacity-40 grayscale'}`}>
                  <div className="text-2xl">{b.icon}</div><div className="mt-1 text-sm font-semibold">{b.name}</div><div className="text-[11px] text-slate-400">{got ? b.desc : 'Locked'}</div>
                </div>); })}
            </div>
          </section>
          <section className="glass p-5">
            <h2 className="font-bold">Praise received</h2>
            {received.length ? <ul className="mt-3 space-y-3">{received.map((p) => { const b = praiseBadge(p.badge); return (
              <li key={p.id} className="flex gap-3 text-sm"><span className="text-xl">{b.icon}</span><div><b>{b.name}</b> from <Link className="underline" to={`/people/${p.fromId}`}>{user(p.fromId)?.name}</Link> · <span className="text-slate-500">{timeAgo(p.createdAt)}</span><p className="text-slate-300">{p.message}</p></div></li>); })}</ul>
              : <p className="mt-2 text-sm text-slate-500">No praise yet.</p>}
          </section>
        </div>
      )}

      {tab === 'activity' && (activity.length ? (
        <ul className="glass divide-y divide-white/5">{activity.map((a) => <li key={a.id} className="flex justify-between gap-3 p-4 text-sm"><span>{ACTIVITY_LABEL[a.type]}</span><span className="text-slate-500">{timeAgo(a.at)}{a.points ? ` · +${a.points}` : ''}</span></li>)}</ul>
      ) : <Empty icon="🌱" title="No recent activity" />)}

      {editing && <EditProfile focus={editing} onClose={() => setEditing(false)} />}
      {praise && <PraiseModal toId={u.id} onClose={() => setPraise(false)} />}
      {report && <ReportMember user={u} onClose={() => setReport(false)} />}
    </div>
  );
}

const REPORT_REASONS = ['Spam or scam', 'Harassment or bullying', 'Fake profile / impersonation', 'Inappropriate content', 'Other'];

function ReportMember({ user: target, onClose }) {
  const { dispatch } = useStore();
  const { blocked, toggle } = useBlocks();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    dispatch({ type: 'add', col: 'flags', item: { kind: 'user', refId: target.id, reason: details.trim() ? `${reason}: ${details.trim()}` : reason, status: 'open' } });
    if (alsoBlock && !blocked.has(target.id)) toggle(target.id);
    setDone(true);
  };
  return (
    <Modal title={`Report ${target.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-sm"><p>Thanks. Community moderators will review your report. The member isn’t told who reported them.</p><button className="btn btn-primary min-h-11 w-full" onClick={onClose}>Done</button></div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="mb-1.5 text-xs font-semibold text-slate-300">Reason</legend>
            {REPORT_REASONS.map((r) => <label key={r} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-white/5"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}</label>)}
          </fieldset>
          <Field label="Details (optional)"><textarea className="input min-h-20" value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} /> Also block this member</label>
          <button className="btn min-h-11 w-full bg-rose-600 text-white">Submit report</button>
        </form>
      )}
    </Modal>
  );
}

function UserPosts({ userId }) {
  const { state } = useStore();
  const posts = state.posts.filter((p) => p.authorId === userId && p.status !== 'draft' && p.status !== 'scheduled');
  if (!posts.length) return <Empty icon="📝" title="No posts yet" />;
  return <div className="space-y-3">{posts.map((p) => <Link key={p.id} to={`/post/${p.id}`} className="glass block p-4 text-sm hover:bg-white/5"><p className="text-slate-200">{p.text}</p><p className="mt-2 text-xs text-slate-500">{timeAgo(p.createdAt)} · ❤️ {p.likes.length} · 💬 {p.comments.length}</p></Link>)}</div>;
}

function EditProfile({ onClose, focus }) {
  const { state, me, dispatch } = useStore();
  const institutions = useInstitutions();
  const primaryEdu = (me.education || []).find((e) => e.isPrimary) ?? me.education?.[0];
  const [edu, setEdu] = useState({ institutionId: primaryEdu?.institutionId ?? '', departmentId: primaryEdu?.departmentId ?? '' });
  const baseEdu = useRef(edu);
  useEffect(() => { if (institutions?.length && !edu.institutionId) setEdu((x) => ({ ...x, institutionId: institutions[0].id })); }, [institutions]); // eslint-disable-line react-hooks/exhaustive-deps
  const departments = institutions?.find((i) => i.id === edu.institutionId)?.departments ?? [];
  const [busy, setBusy] = useState(false);
  const hasCareer = (me.career || []).some((c) => c.title?.trim() && c.org?.trim());
  const formOf = (u, extraCareer = []) => ({ name: u.name, title: u.title || '', role: u.role || '', company: u.company || '', city: u.city || '', batch: u.batch, dept: u.dept || '', bio: u.bio || '',
    privacy: { contact: u.privacy?.contact ?? 'everyone' }, skills: [...(u.skills || [])], career: [...extraCareer, ...(u.career || []).map((c) => ({ ...c }))],
    customFields: { ...(u.customFields || {}) } });
  const bdayOf = (u) => { const [m = '', dd = ''] = isValidBirthday(u.birthday) ? u.birthday.split('-') : []; return { m, d: dd }; };
  const [d, setD] = useState(() => formOf(me, focus === 'career' && !hasCareer ? [{ title: '', org: '', from: new Date().getFullYear(), to: null }] : []));
  const [bday, setBday] = useState(() => bdayOf(me));
  // What the form started from. Only fields that differ from it are sent, so saving can't
  // overwrite changes made elsewhere to fields this edit didn't touch (USR-10).
  const base = useRef(null);
  if (!base.current) base.current = { d, bday, edu: null };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Runs after the Modal's own autofocus, so the field the member asked to fill wins.
  useEffect(() => {
    const id = focus === 'career' ? 'ep-career-0-title' : `ep-${focus}`;
    const el = focus && focus !== '1' ? document.getElementById(id) : null;
    if (el) { el.focus(); el.scrollIntoView?.({ block: 'center' }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [skill, setSkill] = useState('');
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const setCareer = (i, k, v) => setD({ ...d, career: d.career.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const addSkill = () => { const s = skill.trim(); if (s && !d.skills.includes(s)) setD({ ...d, skills: [...d.skills, s] }); setSkill(''); };
  const [errors, setErrors] = useState({});
  const maxYear = new Date().getFullYear() + 6;
  const isYear = (v) => /^\d{4}$/.test(String(v).trim()) && Number(v) >= 1950 && Number(v) <= maxYear;
  const blank = (v) => v == null || String(v).trim() === '';
  const save = (e) => {
    e.preventDefault();
    const err = {};
    const name = d.name.trim();
    if (!name) err.name = 'Enter your name.';
    // Members without a batch (e.g. external guests) may leave it blank.
    const batchOptional = me.batch == null || me.external;
    if (blank(d.batch) ? !batchOptional : !isYear(d.batch)) err.batch = `Enter a 4-digit year between 1950 and ${maxYear}.`;
    const career = d.career.filter((c) => c.title?.trim() && c.org?.trim());
    career.forEach((c) => {
      const i = d.career.indexOf(c);
      if (!blank(c.from) && !isYear(c.from)) err[`career${i}`] = `“From” must be a year between 1950 and ${maxYear}.`;
      else if (!blank(c.to) && !isYear(c.to)) err[`career${i}`] = `“To” must be a year between 1950 and ${maxYear}.`;
      else if (!blank(c.from) && !blank(c.to) && Number(c.to) < Number(c.from)) err[`career${i}`] = '“To” can’t be earlier than “From”.';
    });
    let birthday = null;
    if (bday.m || bday.d) {
      if (!bday.m || !bday.d) err.birthday = 'Choose both a month and a day, or clear your birthday.';
      else if (Number(bday.d) > daysInMonth(Number(bday.m))) err.birthday = `${MONTHS[Number(bday.m) - 1]} has only ${daysInMonth(Number(bday.m))} days.`;
      else birthday = `${bday.m}-${bday.d}`;
      if (birthday && !isValidBirthday(birthday)) err.birthday = 'Enter a valid date.';
    }
    setErrors(err);
    if (Object.keys(err).length) {
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const { linkedin, mentor, ...otherFields } = d.customFields;
    const b0 = base.current.d;
    const changed = (k) => !same(d[k], b0[k]);
    const body = { version: me.profileVersion };
    if (changed('name')) body.name = name;
    if (changed('title')) body.headline = d.title;
    if (changed('role')) body.jobTitle = d.role;
    if (changed('company')) body.company = d.company;
    if (changed('city')) body.city = d.city;
    if (changed('bio')) body.bio = d.bio;
    if (changed('skills')) body.skills = d.skills;
    if (!same(bday, base.current.bday)) body.birthday = birthday;
    if (changed('customFields')) {
      body.linkedin = linkedin || null;
      body.mentorOpen = mentor === 'Yes';
      body.customFields = Object.fromEntries(Object.entries(otherFields).filter(([, v]) => v != null && v !== ''));
    }
    if (changed('privacy')) body.contactVisibility = d.privacy.contact === 'following' ? 'connections' : d.privacy.contact;
    if (changed('batch') || !same(edu, baseEdu.current)) {
      body.education = edu.institutionId && (!blank(d.batch) || edu.departmentId)
        ? [{ institutionId: edu.institutionId, departmentId: edu.departmentId || null, gradYear: blank(d.batch) ? null : Number(d.batch), isPrimary: true }] : [];
    }
    if (changed('career')) body.experience = career.map((c) => ({ title: c.title.trim(), org: c.org.trim(), fromYear: blank(c.from) ? null : Number(c.from), toYear: blank(c.to) ? null : Number(c.to) }));
    if (Object.keys(body).length === 1) { onClose(); return; } // nothing changed
    setBusy(true);
    api('/profiles/me', { method: 'PATCH', body })
      .then(({ profile }) => { dispatch({ type: 'users/merge', users: [toLocal(profile)] }); toast('Profile saved'); onClose(); })
      .catch((err) => {
        if (err.code === 'STALE_VERSION') {
          // Pull in the newer copy: fields this edit didn't touch take the fresh values, the
          // member's own changes are kept, and the next save sends only those changes.
          loadProfile(me.id, dispatch).then((fresh) => {
            const f = toLocal(fresh);
            const fd = formOf(f); const fb = bdayOf(f);
            const fe = { institutionId: (f.education.find((x) => x.isPrimary) ?? f.education[0])?.institutionId ?? edu.institutionId, departmentId: (f.education.find((x) => x.isPrimary) ?? f.education[0])?.departmentId ?? '' };
            // Capture the old baseline first: the updaters below run at the next render, after
            // base.current has already been replaced with the fresh copy.
            const old = base.current; const oldEdu = baseEdu.current;
            setD((cur) => Object.fromEntries(Object.keys(cur).map((k) => [k, same(cur[k], old.d[k]) ? fd[k] : cur[k]])));
            setBday((cur) => (same(cur, old.bday) ? fb : cur));
            setEdu((cur) => (same(cur, oldEdu) ? fe : cur));
            base.current = { d: fd, bday: fb };
            baseEdu.current = fe;
          }).catch(() => {});
        }
        const field = err.extra?.field;
        const key = field === 'jobTitle' ? 'role' : field === 'headline' ? 'title' : field?.startsWith('experience') ? 'career0' : field === 'education' ? 'batch' : field;
        setErrors({ ...(key ? { [key]: err.message } : {}), form: err.code === 'STALE_VERSION' ? 'Your profile was changed somewhere else. We’ve loaded the latest version and kept your edits — check them and save again.' : err.message });
        setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      })
      .finally(() => setBusy(false));
  };
  const errText = (k) => errors[k] && <span role="alert" className="mt-1 block text-xs text-rose-300">{errors[k]}</span>;
  return (
    <Modal title="Edit profile" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input id="ep-name" className="input" value={d.name} onChange={set('name')} aria-invalid={!!errors.name} />{errText('name')}</Field>
          <Field label="Headline"><input className="input" value={d.title} onChange={set('title')} /></Field>
          <Field label="Current role"><input id="ep-role" className="input" value={d.role} onChange={set('role')} /></Field>
          <Field label="Company"><input id="ep-company" className="input" value={d.company} onChange={set('company')} /></Field>
          <Field label="City"><input id="ep-city" className="input" value={d.city} onChange={set('city')} /></Field>
          <Field label="Batch"><input id="ep-batch" className="input" type="number" min="1950" max={maxYear} value={d.batch ?? ''} onChange={set('batch')} aria-invalid={!!errors.batch} />{errText('batch')}</Field>
          {(institutions?.length ?? 0) > 1 && (
            <div className="sm:col-span-2"><Field label="Institution">
              <select id="ep-institution" className="input" value={edu.institutionId} onChange={(e) => setEdu({ institutionId: e.target.value, departmentId: '' })}>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field></div>
          )}
          <div className="sm:col-span-2"><Field label="Department">
            <select id="ep-dept" className="input" value={edu.departmentId} onChange={(e) => setEdu({ ...edu, departmentId: e.target.value })} disabled={!institutions}>
              <option value="">{institutions ? 'Not set' : 'Loading…'}</option>
              {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
            </select>
          </Field></div>
        </div>
        <Field label="About" hint={`${d.bio.trim().length} characters${d.bio.trim().length < 40 ? ' · 40+ makes your profile complete' : ''}`}><textarea id="ep-bio" className="input min-h-24" value={d.bio} onChange={set('bio')} /></Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Birthday (optional)</legend>
          <div className="flex flex-wrap gap-2">
            <select id="ep-birthday" className="input min-w-0 flex-1 sm:max-w-48" aria-label="Birthday month" value={bday.m} aria-invalid={!!errors.birthday} aria-describedby="ep-birthday-hint"
              onChange={(e) => { const m = e.target.value; setBday({ m, d: m && Number(bday.d) > daysInMonth(Number(m)) ? '' : bday.d }); setErrors({ ...errors, birthday: undefined }); }}>
              <option value="">Month</option>
              {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
            </select>
            <select className="input w-28" aria-label="Birthday day" value={bday.d} aria-invalid={!!errors.birthday} aria-describedby="ep-birthday-hint"
              onChange={(e) => { setBday({ ...bday, d: e.target.value }); setErrors({ ...errors, birthday: undefined }); }}>
              <option value="">Day</option>
              {Array.from({ length: bday.m ? daysInMonth(Number(bday.m)) : 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((v) => <option key={v} value={v}>{Number(v)}</option>)}
            </select>
            {(bday.m || bday.d) && <button type="button" className="btn btn-ghost min-h-11" onClick={() => { setBday({ m: '', d: '' }); setErrors({ ...errors, birthday: undefined }); }}>Clear</button>}
          </div>
          <span id="ep-birthday-hint" className="mt-1 block text-xs text-slate-500">Month and day only, never the year. Classmates who can see your contact details can send you wishes.</span>
          {errText('birthday')}
        </fieldset>
        <Field label="Skills">
          <div className="mb-2 flex flex-wrap gap-1.5">{d.skills.map((s) => <span key={s} className="chip !py-1">{s}<button type="button" className="ml-1" aria-label={`Remove ${s}`} onClick={() => setD({ ...d, skills: d.skills.filter((x) => x !== s) })}>✕</button></span>)}</div>
          <div className="flex gap-2"><input id="ep-skills" className="input" aria-label="Add a skill" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder="Add a skill and press Enter" /><button type="button" className="btn btn-ghost min-h-11" onClick={addSkill}>Add</button></div>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-300">Career history</legend>
          <div className="space-y-2">
            {d.career.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 p-2 sm:grid-cols-[1fr_1fr_80px_80px_auto]">
                <input id={`ep-career-${i}-title`} className="input" aria-label="Title" placeholder="Title" value={c.title} onChange={(e) => setCareer(i, 'title', e.target.value)} />
                <input className="input" aria-label="Organisation" placeholder="Organisation" value={c.org} onChange={(e) => setCareer(i, 'org', e.target.value)} />
                <input className="input" aria-label="From year" placeholder="From" value={c.from ?? ''} onChange={(e) => setCareer(i, 'from', e.target.value)} />
                <input className="input" aria-label="To year" placeholder="To" value={c.to ?? ''} onChange={(e) => setCareer(i, 'to', e.target.value)} />
                <button type="button" className="btn btn-ghost min-h-11" aria-label="Remove role" onClick={() => { setErrors({}); setD({ ...d, career: d.career.filter((_, j) => j !== i) }); }}>✕</button>
                {errors[`career${i}`] && <span role="alert" className="col-span-full text-xs text-rose-300">{errors[`career${i}`]}</span>}
              </div>
            ))}
            <button type="button" className="btn btn-ghost min-h-11" onClick={() => { setErrors({}); setD({ ...d, career: [{ title: '', org: '', from: new Date().getFullYear(), to: null }, ...d.career] }); }}>+ Add role</button>
          </div>
        </fieldset>
        <Field label="Who can see my email and contact details" hint="Your name, batch and city stay visible to signed-in members.">
          <select className="input" value={d.privacy.contact} onChange={(e) => setD({ ...d, privacy: { ...d.privacy, contact: e.target.value } })}>
            {CONTACT_PRIVACY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {(state.customFields || []).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {state.customFields.map((cf) => (
              <Field key={cf.id} label={cf.label}>
                {cf.type === 'select'
                  ? <select id={`ep-cf-${cf.id}`} className="input" value={d.customFields[cf.id] || ''} onChange={(e) => setD({ ...d, customFields: { ...d.customFields, [cf.id]: e.target.value } })}><option value="">—</option>{(cf.options || []).map((o) => <option key={o}>{o}</option>)}</select>
                  : <input id={`ep-cf-${cf.id}`} className="input" type={cf.type === 'number' ? 'number' : cf.type === 'date' ? 'date' : 'text'} value={d.customFields[cf.id] || ''} onChange={(e) => setD({ ...d, customFields: { ...d.customFields, [cf.id]: e.target.value } })} />}
              </Field>
            ))}
          </div>
        )}
        {errors.form && <p role="alert" className="text-sm text-rose-300">{errors.form}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn btn-ghost min-h-11" onClick={onClose}>Cancel</button><button className="btn btn-primary min-h-11" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </Modal>
  );
}
