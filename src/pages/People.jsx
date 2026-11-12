// People: the member directory (/people) and profiles (/people/:id, and /profile for your own).
// v2 D10 (board V2DProfile): someone else's profile shows only what they allow, the communities
// you can both see and the posts you can read; your own adds Privacy, Connections, Download my
// data and Preview as a member or a connection. The server builds every one of those answers,
// previews included (GET /profiles/me?as=…), so this page never works out what to hide. Follow
// is dropped: it lived only in this browser and did nothing for anyone else.
import UserLabels from '../components/UserLabels.jsx';
import { Glyph, Icon } from '../components/icons.jsx';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { toLocal } from '../lib/people.js';
import { toast } from '../lib/toast.js';
import { Avatar, Empty, PageHeader } from '../components/ui.jsx';
import { completeness } from '../components/people/Completeness.jsx';
import { ConnectButton, useBlocks } from '../components/people/shared.jsx';
import { formatMonthDay, isValidBirthday } from '../lib/celebrations.js';
import { Button, Skeleton } from '../components/ui/Controls.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';
import EditProfile from '../components/profile/EditProfile.jsx';
import { Communities, Connections, MoreMenu, Panel, Posts, Privacy, Unavailable, useLoad, YourData } from '../components/profile/ProfileParts.jsx';

export default function People() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const { me } = useStore();
  // /profile is your own profile; /people/<your id> is the same page.
  if (pathname === '/profile' || pathname.startsWith('/profile/')) return me ? <Profile key={me.id} id={me.id} /> : null;
  return id ? <Profile key={id} id={id} /> : <Directory />;
}

const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();

const PAGE_SIZE = 24;

function Directory() {
  const { state, me, dispatch } = useStore();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ batch: '', dept: '', city: '', company: '', skill: '', label: '' });
  const [view, setView] = useState('grid');

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

  const [requests, setRequests] = useState([]);
  useEffect(() => { api('/connections').then((r) => setRequests(r.incoming)).catch(() => {}); }, []);

  const { blocked } = useBlocks();
  // Blocks and user labels still live in the app; they're applied to the server's results.
  const list = result.people.filter((u) => !blocked.has(u.id)
    && (!f.label || (state.userLabels || []).find((l) => l.id === f.label)?.members.includes(u.id)));
  const people = { length: result.total };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = Object.values(f).some(Boolean) || q;

  return (
    <div>
      <PageHeader title="People" subtitle={`${people.length} members in the community`}
        actions={<>
          {!(state.settings?.hiddenModules || ['orgchart']).includes('orgchart') && <Link to="/orgchart" className="btn btn-ghost min-h-11"><Glyph value="structure" tile={false} size={16} /> Community structure</Link>}
          <div className="inline-flex rounded-lg border border-[var(--az-hairline)] p-1" role="group" aria-label="View">
            {['grid', 'list'].map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${view === v ? 'bg-[var(--az-text)] text-[var(--color-ink-950)]' : 'text-2'}`}>{v === 'grid' ? 'Grid' : 'List'}</button>
            ))}
          </div>
        </>} />

      <div className="band mb-6 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <div className="flex gap-2 sm:col-span-3 lg:col-span-1">
          <input className="input" type="search" placeholder="Search name, role, skill…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          {/* Phones: the filters fold away behind one button so the directory starts on screen one. */}
          <button type="button" className="btn btn-ghost min-h-11 shrink-0 sm:hidden" aria-expanded={filtersOpen} aria-controls="people-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button>
        </div>
        <div id="people-filters" className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 sm:col-span-3 sm:grid sm:grid-cols-3 lg:col-span-6 lg:grid-cols-6`}>
        {[['batch', 'Batch', 'All batches'], ['dept', 'Department', 'All departments'], ['city', 'City', 'All cities'], ['company', 'Company', 'All companies'], ['skill', 'Skill', 'All skills']].map(([k, label, all]) => (
          <select key={k} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label}>
            <option value="">{all}</option>
            {opts[k].map((o) => (typeof o === 'object' ? <option key={o.id} value={o.id}>{o.name}</option> : <option key={o} value={o}>{o}</option>))}
          </select>
        ))}
        <select className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="Label">
          <option value="">Label</option>
          {(state.userLabels || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.members.length})</option>)}
        </select>
        </div>
        {active && <button className="btn btn-ghost min-h-11 sm:col-span-3 lg:col-span-6" onClick={() => { setQ(''); setF({ batch: '', dept: '', city: '', company: '', label: '', skill: '' }); }}>Clear filters · {list.length} result{list.length === 1 ? '' : 's'}</button>}
      </div>

      {requests.length > 0 && (
        <section className="glass mb-5 p-4" aria-label="Connection requests">
          <h2 className="mb-3 text-sm font-semibold">Connection requests · {requests.length}</h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <Avatar user={state.users.find((x) => x.id === r.id) ?? { id: r.id, name: r.name }} size={36} />
                <Link to={`/people/${r.id}`} className="min-w-0 flex-1 truncate font-semibold hit hover:underline">{r.name}</Link>
                <ConnectButton userId={r.id} initial="incoming" onChange={(next) => { if (next !== 'incoming') setRequests((list) => list.filter((x) => x.id !== r.id)); }} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.error && <p role="alert" className="notice notice-bad mb-4">Couldn’t load the directory: {result.error}</p>}
      {result.loading && !list.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="glass h-40 animate-pulse" />)}</div>
        : !list.length ? <Empty icon="search" title="No one matches those filters">Try removing a filter.</Empty> : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((u) => (
            <article key={u.id} className="glass flex flex-col p-5">
              <Link to={`/people/${u.id}`} className="flex items-center gap-3">
                <Avatar user={u} size={52} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{u.name}{u.admin && <span className="chip ml-2">Admin</span>}</div>
                  <UserLabels userId={u.id} max={2} small className="my-1" />
                  <div className="truncate text-sm text-3">{u.role}{u.company && ` · ${u.company}`}</div>
                  <div className="text-xs text-3">{[u.batch && `Class of ${u.batch}`, u.city].filter(Boolean).join(' · ')}</div>
                </div>
              </Link>
              <div className="mt-3 flex flex-wrap gap-1.5">{(u.skills || []).slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel divide-y divide-[var(--az-hairline)]">
          {list.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link to={`/people/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={40} />
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{u.name}</span><UserLabels userId={u.id} max={2} small /></div><div className="truncate text-xs text-3">{[u.role, u.company, u.city, u.batch].filter(Boolean).join(' · ')}</div></div>
              </Link>
            </div>
          ))}
        </div>
      )}
      {result.total > result.people.length && (
        <button className="btn btn-ghost mt-5 w-full" disabled={result.loading} onClick={() => setLimit(limit + PAGE_SIZE)}>
          {result.loading ? 'Loading…' : `Show more · ${result.people.length} of ${result.total}`}
        </button>
      )}
    </div>
  );
}

const enc = encodeURIComponent;
const NEXT_STEP = { name: 'Add your name', role: 'Add your role', company: 'Add your company', city: 'Add your city', bio: 'Write your About', skills: 'Add skills', career: 'Add a role', 'cf-linkedin': 'Add LinkedIn' };
const years = (x) => (x.fromYear ? `${x.fromYear} to ${x.toYear ?? 'present'}` : x.toYear ? `until ${x.toYear}` : null);
const monthYear = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

function Profile({ id }) {
  const { state, me, dispatch } = useStore();
  const isMe = id === me.id || id === 'me';
  // Preview as a member or as a connection: your own profile, built by the server for that viewer.
  const [preview, setPreview] = useState(null);
  const as = isMe && preview ? preview : null;
  const asQ = as ? `?as=${as}` : '';
  const [s, setS] = useState({ status: 'loading', profile: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setS((x) => ({ ...x, status: 'loading' }));
    api(`/profiles/${enc(id)}${asQ}`).then(({ profile }) => {
      if (!live) return;
      // A deleted member gets the same answer as any profile you can't see.
      if (profile.deleted) { setS({ status: 'missing', profile: null }); return; }
      // Only your real profile goes into the app's copy; a preview never does.
      if (!asQ) dispatch({ type: 'users/merge', users: [toLocal(profile)] });
      setS({ status: 'ready', profile });
    }).catch((err) => live && setS({ status: err.status === 404 ? 'missing' : 'error', profile: null, message: err.message }));
    return () => { live = false; };
  }, [id, asQ, tick, dispatch]);
  const communities = useLoad(`/profiles/${enc(id)}/communities${asQ}`);

  const [tab, setTab] = useState('about');
  useEffect(() => { if (as && tab === 'connections') setTab('about'); }, [as, tab]);
  // false, or the Edit profile field to focus ('1' = none in particular).
  const [editing, setEditing] = useState(false);
  // ?edit=<field> (from the profile-completeness card) opens Edit profile on your own profile.
  const [params, setParams] = useSearchParams();
  const editParam = params.get('edit');
  useEffect(() => {
    if (!editParam) return;
    if (isMe) setEditing(editParam);
    const next = new URLSearchParams(params);
    next.delete('edit');
    setParams(next, { replace: true });
  }, [editParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = s.profile;
  useEffect(() => { document.title = p?.name ? `${p.name} · CommunityOne` : 'Profile · CommunityOne'; }, [p?.name]);

  if (s.status === 'missing') return <Unavailable />;
  if (s.status === 'error' && !p) {
    return (
      <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
        <span className="flex-1"><strong>This profile didn’t load. </strong>{s.message}</span>
        <Button size="sm" onClick={() => setTick((n) => n + 1)}>Try again</Button>
      </div>
    );
  }
  if (!p) return <div className="panel p-6"><Skeleton lines={4} label="Loading profile" /></div>;

  const own = isMe && !as;
  const first = p.name.split(/\s+/)[0];
  const saved = (prof) => { dispatch({ type: 'users/merge', users: [toLocal(prof)] }); setS({ status: 'ready', profile: prof }); };
  const work = [p.jobTitle, p.company].filter(Boolean).join(' · ');
  const place = [p.city, p.country].filter(Boolean).join(', ');

  const toggleBlock = async () => {
    const blocking = !p.blockedByMe;
    if (blocking && !(await confirmAction({ title: `Block ${p.name}?`, confirm: 'Block', danger: true,
      body: 'You won’t see each other’s posts, and any connection or request between you ends. They aren’t told.' }))) return;
    try {
      await api(`/blocks/${enc(p.id)}`, { method: blocking ? 'POST' : 'DELETE' });
      // Screens that still read the app's copy of blocks (chats) follow the server.
      const rec = (state.blocks || []).find((b) => b.authorId === me.id && b.targetId === p.id);
      if (blocking && !rec) dispatch({ type: 'add', col: 'blocks', item: { targetId: p.id } });
      if (!blocking && rec) dispatch({ type: 'remove', col: 'blocks', id: rec.id });
      toast(blocking ? `${p.name} is blocked` : `${p.name} is unblocked`);
      setTick((n) => n + 1);
      communities.reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  // Profile completeness, without batch or department: nobody is assumed to be an alumnus.
  const score = own ? completeness(toLocal(p), state.customFields || []) : null;
  const items = score ? score.items.filter((i) => i.id !== 'batch' && i.id !== 'dept') : [];
  const pct = items.length ? Math.round((items.filter((i) => i.done).length / items.length) * 100) : 100;
  const nextItem = items.find((i) => !i.done);
  const dismiss = async () => {
    try { saved((await api('/profiles/me', { method: 'PATCH', body: { version: p.version, completenessDismissed: true } })).profile); } catch (err) { toast(err.message, 'error'); }
  };

  const tabs = [['about', 'About'], ['posts', 'Posts'], ['communities', 'Communities'], ...(own ? [['connections', 'Connections']] : [])];
  const onTabKey = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + tabs.length) % tabs.length;
    setTab(tabs[j][0]);
    document.getElementById(`profile-tab-${tabs[j][0]}`)?.focus();
  };

  const showAbout = own || p.bio;
  const showExperience = own || p.experience?.length;
  const showSkills = own || p.skills?.length;

  return (
    <div className="mx-auto max-w-[1080px] space-y-5" aria-busy={s.status === 'loading' || undefined}>
      {as && (
        <div role="status" className="notice notice-info flex flex-wrap items-center gap-3">
          <Icon name="eye" size={18} />
          <span className="min-w-0 flex-1">{as === 'member' ? 'Previewing as a signed-in member who isn’t your connection.' : 'Previewing as one of your connections.'}</span>
          <Button size="sm" onClick={() => setPreview(as === 'member' ? 'connection' : 'member')}>{as === 'member' ? 'Preview as a connection' : 'Preview as a member'}</Button>
          <Button size="sm" onClick={() => setPreview(null)}>Exit preview</Button>
        </div>
      )}

      <section className="panel flex flex-wrap items-start gap-5 p-5 sm:p-6" aria-label={own ? 'Your profile' : `${p.name}’s profile`}>
        <Avatar user={{ name: p.name, hue: p.avatarHue ?? 200 }} size={80} />
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="t-h1 break-words text-[var(--az-text)]">{p.name}</h1>
          {p.headline && <p className="mt-1 text-[15px] text-[var(--az-text)]">{p.headline}</p>}
          {work && <p className="mt-0.5 text-sm text-[var(--az-text-2)]">{work}</p>}
          {place && <p className="t-small mt-1 flex items-center gap-1"><Icon name="place" size={14} />{place}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {own ? (
            <>
              <Button variant="primary" size="sm" icon="pen" onClick={() => setEditing('1')}>Edit profile</Button>
              <Button size="sm" icon="eye" onClick={() => setPreview('member')}>Preview as a member</Button>
            </>
          ) : !isMe ? (
            <>
              {!p.blockedByMe && <ConnectButton userId={p.id} initial={p.connection} onChange={() => setTick((n) => n + 1)} />}
              <MoreMenu label={`More actions for ${p.name}`} items={[{ label: p.blockedByMe ? 'Unblock member' : 'Block member', danger: !p.blockedByMe, onSelect: toggleBlock }]} />
            </>
          ) : null}
        </div>
      </section>

      {p.blockedByMe && (
        <div role="status" className="notice notice-warn flex flex-wrap items-center gap-3">
          <span className="flex-1">You blocked {p.name}. You won’t see each other’s posts.</span>
          <Button size="sm" onClick={toggleBlock}>Unblock</Button>
        </div>
      )}

      {own && !p.completenessDismissed && pct < 100 && nextItem && (
        <div className="notice notice-ok flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-[1_1_300px]"><strong>Your profile is {pct}% complete. </strong>{nextItem.label}{nextItem.hint ? ` (you have ${nextItem.hint.replace('/', ' of ')})` : ''} so members of your communities can find common ground.</span>
          <Button size="sm" onClick={() => setEditing(nextItem.id)}>{NEXT_STEP[nextItem.id] ?? 'Edit profile'}</Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
        </div>
      )}

      <div role="tablist" aria-label="Profile sections" className="no-scrollbar flex overflow-x-auto border-b border-[var(--az-hairline)]">
        {tabs.map(([t, label], i) => (
          <button key={t} id={`profile-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls="profile-panel" tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)} onKeyDown={(e) => onTabKey(e, i)}
            className={`min-h-11 shrink-0 border-b-2 px-3.5 text-sm ${tab === t ? 'border-[var(--az-text)] font-semibold text-[var(--az-text)]' : 'border-transparent font-medium text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>{label}</button>
        ))}
      </div>

      <div id="profile-panel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
        {tab === 'about' && (
          <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))' }}>
            {showAbout && (
              <Panel title="About" id="about-h">
                {p.bio ? <p className="whitespace-pre-line text-sm leading-6 text-[var(--az-text-2)]">{p.bio}</p>
                  : <p className="t-small">Add a short About so people know what you do and how you can help. <button type="button" className="link" onClick={() => setEditing('bio')}>Write your About</button></p>}
              </Panel>
            )}
            {showExperience && (
              <Panel title="Experience" id="exp-h">
                {p.experience?.length ? (
                  <ol className="space-y-3">
                    {p.experience.map((x, i) => (
                      <li key={i}><div className="text-sm font-semibold text-[var(--az-text)]">{x.title}</div><div className="t-small">{[x.org, years(x)].filter(Boolean).join(' · ')}</div></li>
                    ))}
                  </ol>
                ) : <p className="t-small">No roles listed. <button type="button" className="link" onClick={() => setEditing('career')}>Add a role</button></p>}
              </Panel>
            )}
            {p.education?.length > 0 && (
              <Panel title="Education" id="edu-h">
                <ol className="space-y-3">
                  {p.education.map((e, i) => (
                    <li key={e.id ?? i}><div className="text-sm font-semibold text-[var(--az-text)]">{e.institution}</div>
                      <div className="t-small">{[e.department, e.programme, e.gradYear && `Class of ${e.gradYear}`].filter(Boolean).join(' · ')}</div></li>
                  ))}
                </ol>
              </Panel>
            )}
            {showSkills && (
              <Panel title="Skills" id="skills-h">
                {p.skills?.length ? <div className="flex flex-wrap gap-1.5">{p.skills.map((k) => <span key={k} className="badge badge-neutral">{k}</span>)}</div>
                  : <p className="t-small">None listed. <button type="button" className="link" onClick={() => setEditing('skills')}>Add skills</button></p>}
              </Panel>
            )}
            {!own && (
              <Panel title="Contact" id="contact-h">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-[var(--az-text-3)]">Email</dt>
                    <dd className="min-w-0 truncate text-[var(--az-text)]">{p.email ? <a className="link" href={`mailto:${p.email}`}>{p.email}</a>
                      : <span className="inline-flex items-center gap-1 text-[var(--az-text-3)]"><Icon name="lock" size={14} />Not shared with you</span>}</dd></div>
                  {p.birthday && isValidBirthday(p.birthday) && <div className="flex justify-between gap-3"><dt className="text-[var(--az-text-3)]">Birthday</dt><dd className="text-[var(--az-text)]">{formatMonthDay(p.birthday)}</dd></div>}
                  {p.linkedin && <div className="flex justify-between gap-3"><dt className="text-[var(--az-text-3)]">LinkedIn</dt><dd className="min-w-0 truncate text-[var(--az-text)]">{p.linkedin}</dd></div>}
                  {p.joinedAt && <div className="flex justify-between gap-3"><dt className="text-[var(--az-text-3)]">Joined</dt><dd className="text-[var(--az-text)]">{monthYear(p.joinedAt)}</dd></div>}
                </dl>
              </Panel>
            )}
            {own && <Privacy profile={p} onSaved={saved} />}
            <Panel title="Communities" count={communities.data?.communities?.length} id="comm-h">
              <Communities state={communities} own={own} firstName={first} limit={5} onAll={() => setTab('communities')} />
            </Panel>
            {own && <YourData />}
          </div>
        )}
        {tab === 'posts' && <Posts id={id} as={as} own={isMe} firstName={isMe ? null : first} />}
        {tab === 'communities' && <div className="panel p-5"><Communities state={communities} own={own} firstName={first} /></div>}
        {tab === 'connections' && own && <Connections />}
      </div>

      {editing && own && <EditProfile focus={editing} onClose={() => setEditing(false)} onSaved={saved} />}
    </div>
  );
}
