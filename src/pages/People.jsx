import UserLabels from '../components/UserLabels.jsx';
import { Glyph, Icon } from '../components/icons.jsx';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useStore, timeAgo } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { loadProfile, toLocal, useInstitutions } from '../lib/people.js';
import { toast } from '../lib/toast.js';
import { Avatar, Empty, Field, Modal, PageHeader } from '../components/ui.jsx';
import { CompletenessMeter, completeness } from '../components/people/Completeness.jsx';
import { MONTHS, daysInMonth, formatMonthDay, isValidBirthday } from '../lib/celebrations.js';
import { ConnectButton, FollowButton, canSeeContact, useBlocks, CONTACT_PRIVACY } from '../components/people/shared.jsx';

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
          {!(state.settings?.hiddenModules || ['orgchart']).includes('orgchart') && <Link to="/orgchart" className="btn btn-ghost min-h-11"><Glyph value="🌳" tile={false} size={16} /> Community structure</Link>}
          <div className="inline-flex rounded-lg border border-[var(--az-hairline)] p-1" role="group" aria-label="View">
            {['grid', 'list'].map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${view === v ? 'bg-[var(--az-text)] text-[var(--color-ink-950)]' : 'text-2'}`}>{v === 'grid' ? '▦ Grid' : '☰ List'}</button>
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
                <Link to={`/people/${r.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{r.name}</Link>
                <ConnectButton userId={r.id} initial="incoming" onChange={(next) => { if (next !== 'incoming') setRequests((list) => list.filter((x) => x.id !== r.id)); }} />
              </li>
            ))}
          </ul>
        </section>
      )}
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
                  <div className="truncate text-sm text-3">{u.role}{u.company && ` · ${u.company}`}</div>
                  <div className="text-xs text-3">{[u.batch && `Class of ${u.batch}`, u.city].filter(Boolean).join(' · ')}</div>
                </div>
              </Link>
              <div className="mt-3 flex flex-wrap gap-1.5">{(u.skills || []).slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}</div>
              {u.id !== me.id && (
                <div className="mt-auto flex gap-2 pt-4">
                  <FollowButton userId={u.id} className="flex-1" />
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
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{u.name}</span><UserLabels userId={u.id} max={2} small /></div><div className="truncate text-xs text-3">{[u.role, u.company, u.city, u.batch].filter(Boolean).join(' · ')}</div></div>
              </Link>
              {u.id !== me.id && <div className="flex gap-2">
                <FollowButton userId={u.id} />
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
    </div>
  );
}

function Profile({ id }) {
  const { state, me, user, dispatch } = useStore();
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
  const [more, setMore] = useState(false);
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
  useEffect(() => { if (u?.name) document.title = `${u.name} · CommunityOne`; }, [u?.name]);
  if (!u) return <Empty icon="search" title="Person not found"><Link className="text-brand-400 underline" to="/people">Back to People</Link></Empty>;

  const isMe = u.id === me.id;
  const isBlocked = blocked.has(u.id);
  const showContact = canSeeContact(state, me.id, u);
  // Contact-style custom fields follow the owner's contact privacy setting.
  const CONTACT_FIELDS = ['linkedin', 'phone', 'website'];
  const fields = (state.customFields || []).filter((cf) => u.customFields?.[cf.id] && (showContact || !CONTACT_FIELDS.includes(cf.id)));
  const profileScore = isMe ? completeness(u, state.customFields || []) : null;
  const work = [u.role, u.company].filter(Boolean).join(' · ');
  const study = [u.batch && `Class of ${u.batch}`, u.dept, u.institution].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <section className="glass">
        <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
          <Avatar user={u} size={80} />
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">{u.name}
              {u.admin && <span className="rounded-full bg-brand-400/15 px-2.5 py-0.5 text-xs font-semibold text-brand-300">Platform Admin</span>}
            </h1>
            {u.title && <p className="mt-1 text-sm text-[var(--az-text)]">{u.title}</p>}
            {work && <p className="mt-1 text-sm text-2">{work}</p>}
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-3">
              {study && <span>{study}</span>}
              {u.city && <span className="inline-flex items-center gap-1"><Icon name="globe" size={12} />{u.city}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isMe ? <button className="btn btn-primary min-h-10" onClick={() => setEditing('1')}><Icon name="pen" size={16} /> Edit profile</button> : <>
              {!isBlocked && <>
                <ConnectButton userId={u.id} initial={u.connection} onChange={() => loadProfile(u.id, dispatch).catch(() => {})} />
                <FollowButton userId={u.id} />
              </>}
              <div className="relative">
                <button className="btn btn-ghost h-10 w-10 !p-0" aria-label="More actions" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore(!more)}><Icon name="more" size={18} /></button>
                {more && (
                  <div role="menu" className="glass absolute right-0 z-20 mt-2 w-48 p-1.5 text-sm shadow-xl">
                    <button role="menuitem" className="block min-h-10 w-full rounded-lg px-3 text-left hover:bg-white/5" onClick={() => { setMore(false); toggleBlock(u.id); }}>{isBlocked ? 'Unblock member' : 'Block member'}</button>
                  </div>
                )}
              </div>
            </>}
          </div>
        </div>
        {isBlocked && <p role="status" className="border-t border-[var(--az-hairline)] bg-rose-500/10 px-5 py-2 text-sm text-rose-200">You blocked this member. You won’t see each other’s posts or profiles.</p>}
      </section>

      {isMe && profileScore.pct < 100 && <CompletenessMeter user={u} onEdit={setEditing} />}

      <nav aria-label="Profile sections" className="flex gap-1 border-b border-[var(--az-hairline)]">
        {[['about', 'About'], ['posts', 'Posts']].map(([t, label]) => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}
            className={`border-b-2 px-3.5 py-3 text-sm transition ${tab === t ? 'border-brand-400 font-semibold text-white' : 'border-transparent font-medium text-3 hover:text-white'}`}>{label}</button>
        ))}
      </nav>

      {tab === 'about' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <section className="glass p-5"><h2 className="font-semibold">About</h2><p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-2">{u.bio || (isMe ? 'Add a short bio so people know what you do and how to help.' : 'No bio yet.')}</p></section>
            <section className="glass p-5">
              <h2 className="font-semibold">Experience</h2>
              {(u.career || []).length ? (
                <ol className="mt-3 space-y-3">
                  {u.career.map((c, i) => <li key={i}><div className="text-sm font-semibold">{c.title}</div><div className="text-xs text-3">{[c.org, [c.from, c.to ?? (c.from ? 'Present' : null)].filter(Boolean).join('–')].filter(Boolean).join(' · ')}</div></li>)}
                </ol>
              ) : <p className="mt-2 text-sm text-3">No experience listed.</p>}
            </section>
            <section className="glass p-5">
              <h2 className="font-semibold">Education</h2>
              {(u.education || []).length ? (
                <ol className="mt-3 space-y-3">
                  {u.education.map((e, i) => <li key={e.id ?? i}><div className="text-sm font-semibold">{e.institution}</div><div className="text-xs text-3">{[e.programme, e.department, e.gradYear && `Class of ${e.gradYear}`].filter(Boolean).join(' · ')}</div></li>)}
                </ol>
              ) : <p className="mt-2 text-sm text-3">No education listed.</p>}
            </section>
          </div>
          <div className="min-w-0 space-y-5">
            <section className="glass p-5">
              <h2 className="font-semibold">Skills</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">{(u.skills || []).length ? u.skills.map((s) => <span key={s} className="chip">{s}</span>) : <span className="text-sm text-3">None listed</span>}</div>
            </section>
            <section className="glass p-5">
              <h2 className="font-semibold">Details</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-3">Email</dt><dd className="truncate">{showContact && u.email ? u.email : <span className="inline-flex items-center gap-1 text-3"><Icon name="lock" size={13} /> Hidden</span>}</dd></div>
                {u.birthday && showContact && isValidBirthday(u.birthday) && <div className="flex justify-between gap-3"><dt className="text-3">Birthday</dt><dd>{formatMonthDay(u.birthday)}</dd></div>}
                {u.joinedAt && <div className="flex justify-between gap-3"><dt className="text-3">Joined</dt><dd>{new Date(u.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</dd></div>}
                {fields.map((cf) => <div key={cf.id} className="flex justify-between gap-3"><dt className="text-3">{cf.label}</dt><dd className="truncate">{u.customFields[cf.id]}</dd></div>)}
              </dl>
            </section>
          </div>
        </div>
      )}

      {tab === 'posts' && (FeedList
        ? <Suspense fallback={<div className="glass h-40 animate-pulse" />}><FeedList scope={{ type: 'user', id: u.id }} /></Suspense>
        : <UserPosts userId={u.id} />)}

      {editing && <EditProfile focus={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

function UserPosts({ userId }) {
  const { state } = useStore();
  const posts = state.posts.filter((p) => p.authorId === userId && p.status !== 'draft' && p.status !== 'scheduled');
  if (!posts.length) return <Empty icon="📝" title="No posts yet" />;
  return <div className="space-y-3">{posts.map((p) => <Link key={p.id} to={`/post/${p.id}`} className="glass block p-4 text-sm hover:bg-white/5"><p className="text-[var(--az-text)]">{p.text}</p><p className="mt-2 text-xs text-3">{timeAgo(p.createdAt)} · ❤️ {p.likes.length} · 💬 {p.comments.length}</p></Link>)}</div>;
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
    if (changed('privacy')) body.contactVisibility = ({ following: 'connections', me: 'nobody' })[d.privacy.contact] ?? d.privacy.contact;
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
          <legend className="mb-1.5 text-xs font-semibold text-2">Birthday (optional)</legend>
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
          <span id="ep-birthday-hint" className="mt-1 block text-xs text-3">Month and day only, never the year. Classmates who can see your contact details can send you wishes.</span>
          {errText('birthday')}
        </fieldset>
        <Field label="Skills">
          <div className="mb-2 flex flex-wrap gap-1.5">{d.skills.map((s) => <span key={s} className="chip !py-1">{s}<button type="button" className="ml-1" aria-label={`Remove ${s}`} onClick={() => setD({ ...d, skills: d.skills.filter((x) => x !== s) })}>✕</button></span>)}</div>
          <div className="flex gap-2"><input id="ep-skills" className="input" aria-label="Add a skill" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder="Add a skill and press Enter" /><button type="button" className="btn btn-ghost min-h-11" onClick={addSkill}>Add</button></div>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-2">Career history</legend>
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
