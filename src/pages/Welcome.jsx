// Welcome steps after the first sign-in (v2 workstream C, board V2CAuth frames 17–21): profile
// basics, then choosing communities. Both steps are optional; finishing or skipping is recorded
// on the server (POST /account/onboarded) so they don't come back on another device. Then the
// person carries on to where they were heading (?next=), or Home.
//
// Nothing is joined for anyone (C9): every Join or Request to join is the person's own press,
// through the same JoinButton as everywhere else. Only Public and Private communities are listed.
import { useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { fetchCommunityList, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { Logo } from '../components/ui.jsx';
import { Badge } from '../components/ui/Controls.jsx';
import { AuthField, Notice } from '../components/auth/AuthParts.jsx';
import { CommunityTile, members, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import JoinButton from '../components/groups/JoinButton.jsx';
import { nextPath } from './Login.jsx';

const FIELDS = [['headline', 'Headline', 'For example: Product designer and mentor', 120], ['jobTitle', 'Job title', '', 120], ['company', 'Company or organisation', '', 120], ['city', 'City', '', 80]];
const AUTOCOMPLETE = { city: 'address-level2', company: 'organization', jobTitle: 'organization-title' };
const PAGE = 8;

export default function Welcome() {
  const { me, dispatch } = useStore();
  const nav = useNavigate();
  const { search } = useLocation();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = (() => { const p = nextPath(search); return p.startsWith('/welcome') ? '/home' : p; })();
  useEffect(() => { document.title = 'Welcome · CommunityOne'; }, []);

  const finish = async (to = next) => {
    setBusy(true); setError('');
    try {
      await api('/account/onboarded', { method: 'POST', body: {} });
      dispatch({ type: 'session/onboarded' });
      nav(to, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--az-page)] text-[var(--az-text)]">
      <header className="border-b border-[var(--az-hairline)] bg-[var(--az-surface)]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
          <Logo size={32} />
          <span className="t-small max-sm:hidden">Signed in as {me.name}</span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
        <div className="panel p-6 sm:p-8">
          <p className="t-label">Step {step} of 2</p>
          {error && <div className="mt-4"><Notice>{error}</Notice></div>}
          {step === 1
            ? <ProfileStep me={me} busy={busy} onDone={() => setStep(2)} onSkip={() => finish()} />
            : <CommunitiesStep me={me} next={next} busy={busy} onBack={() => setStep(1)} onFinish={finish} />}
        </div>
      </main>
    </div>
  );
}

function ProfileStep({ me, busy, onDone, onSkip }) {
  const base = useId();
  const [form, setForm] = useState(null);
  const [version, setVersion] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const load = () => {
    setState({ status: 'loading' });
    api(`/profiles/${encodeURIComponent(me.id)}`).then(({ profile }) => {
      setForm(Object.fromEntries(FIELDS.map(([k]) => [k, profile[k] ?? ''])));
      setVersion(profile.version);
      setState({ status: 'ready' });
    }, (err) => setState({ status: 'error', message: err.message }));
  };
  useEffect(load, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'saving' });
    try {
      const body = Object.fromEntries(FIELDS.map(([k]) => [k, form[k].trim() || null]));
      await api('/profiles/me', { method: 'PATCH', body: { version, ...body } });
      onDone();
    } catch (err) {
      setState({ status: 'ready', message: err instanceof ApiError ? err.message : 'Couldn’t save. Try again.' });
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <h1 className="t-h2 mt-2">Welcome, {me.name.split(' ')[0]}</h1>
      <p className="mt-2 text-[15px] leading-6 text-[var(--az-text-2)]">A few details help people recognise you. Everything is optional, and you can change it later on your profile.</p>
      {state.status === 'loading' ? <div className="mt-6 flex flex-col gap-4" aria-busy="true" aria-label="Loading your profile">{FIELDS.map(([k]) => <span key={k} className="skeleton h-11" />)}</div>
        : state.status === 'error' ? (
          <div className="mt-6"><Notice>{state.message}</Notice><button type="button" className="btn btn-secondary" onClick={load}>Try again</button></div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([k, label, placeholder, max]) => (
                <div key={k} className={k === 'headline' ? 'sm:col-span-2' : ''}>
                  <AuthField label={label} id={`${base}-${k}`}>
                    <input id={`${base}-${k}`} className="input" value={form[k]} maxLength={max} placeholder={placeholder}
                      autoComplete={AUTOCOMPLETE[k] ?? 'off'} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </AuthField>
                </div>
              ))}
            </div>
            <p className="t-small mt-3">You can add education and work history on your profile later.</p>
            {state.message && <div className="mt-4"><Notice>{state.message}</Notice></div>}
          </>
        )}
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--az-hairline)] pt-5">
        <button type="button" className="btn btn-ghost" onClick={onSkip} disabled={busy}>Skip for now</button>
        <button className="btn btn-primary" disabled={busy || state.status !== 'ready'}>{state.status === 'saving' ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </form>
  );
}

/** Whether the platform lets this person start a community (communities.whoCanCreate). */
function useCanCreate() {
  const [can, setCan] = useState(false);
  useEffect(() => { api('/templates').then(() => setCan(true), () => setCan(false)); }, []);
  return can;
}

function CommunitiesStep({ me, next, busy, onBack, onFinish }) {
  const searchId = useId();
  const [s, setS] = useState({ status: 'loading', list: [] });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [shown, setShown] = useState(PAGE);
  const canCreate = useCanCreate();
  // The order is fixed on first load, so rows don't move under the pointer when a join changes
  // a member count.
  const [order, setOrder] = useState(null);
  const load = () => fetchCommunityList(me.id).then((list) => setS({ status: 'ready', list }), (err) => setS({ status: 'error', list: [], message: err.message }));
  useEffect(() => { load(); return onCommunityChange(load); }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Public and Private communities that are open for joining. Closed ones never appear here.
  const candidates = s.list.filter((g) => g.status === 'active' && visibilityOf(g.accessType) !== 'closed');
  useEffect(() => {
    if (!order && s.status === 'ready') setOrder([...candidates].sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name)).map((g) => g.id));
  }, [s.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordered = (order ?? []).map((id) => candidates.find((g) => g.id === id)).filter(Boolean);

  // Signed up from a community's Join: show it first, still not joined for them.
  const ref = next.match(/^\/c\/([^/?#]+)/)?.[1];
  const lookingAt = ref ? ordered.find((g) => g.slug === decodeURIComponent(ref) || g.id === decodeURIComponent(ref)) : null;
  const rest = ordered.filter((g) => g !== lookingAt);
  const categories = useMemo(() => [...new Set(rest.map((g) => g.type).filter(Boolean))].sort(), [rest.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const filtered = rest.filter((g) => (!category || g.type === category)
    && (!needle || [g.name, g.description, g.type].some((v) => v?.toLowerCase().includes(needle))));

  const isIn = (g) => ['active', 'restricted'].includes(g.myMembership?.state);
  const isRequested = (g) => g.myMembership?.state === 'pending';
  const joined = ordered.filter(isIn).length;
  const requested = ordered.filter(isRequested).length;

  return (
    <section aria-labelledby="pick">
      <h1 id="pick" className="t-h2 mt-2">Choose your communities</h1>
      <p className="mt-2 text-[15px] leading-6 text-[var(--az-text-2)]">
        Join the ones that fit you: your school or workplace, your city, your interests. Nothing is joined until you press Join. Private communities send your request to their admins.
      </p>

      {s.status === 'loading' && <div className="mt-6 flex flex-col gap-3" aria-busy="true" aria-label="Loading communities">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-14" />)}</div>}
      {s.status === 'error' && (
        <div className="mt-6">
          <Notice>Couldn’t load communities. Check your connection, then try again.</Notice>
          <button type="button" className="btn btn-secondary" onClick={load}>Try again</button>
          <p className="t-small mt-3">Finish still works; you can join communities later from Explore.</p>
        </div>
      )}
      {s.status === 'ready' && order && ordered.length === 0 && (
        <div className="sunken mt-6 flex flex-col items-start gap-3 p-5">
          <h2 className="t-h3">No communities to join yet</h2>
          <p className="text-sm text-[var(--az-text-2)]">{canCreate ? 'You can start one, or look again later from Explore.' : 'You can look again later from Explore.'}</p>
          {canCreate && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onFinish('/communities?new=1')}>Start a community</button>}
        </div>
      )}
      {s.status === 'ready' && ordered.length > 0 && (
        <>
          {lookingAt && (
            <div className="mt-6">
              <h2 className="t-label">You were looking at</h2>
              <ul className="mt-2"><Row g={lookingAt} me={me} isIn={isIn} isRequested={isRequested} highlight /></ul>
            </div>
          )}
          {rest.length > 0 && (
            <>
              <div className="mt-6">
                <label htmlFor={searchId} className="text-sm font-semibold">Search communities</label>
                <input id={searchId} type="search" className="input mt-1.5" placeholder="Search by name, topic or category" value={q}
                  onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
              </div>
              {categories.length > 1 && (
                <div role="group" aria-label="Filter by category" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
                  {['', ...categories].map((cat) => (
                    <button key={cat || 'all'} type="button" className="filter-chip" aria-pressed={category === cat} onClick={() => { setCategory(cat); setShown(PAGE); }}>{cat || 'All'}</button>
                  ))}
                </div>
              )}
              {filtered.length === 0
                ? <p className="t-small mt-5">No communities match. Try another search or category.</p>
                : (
                  <ul className="mt-4 divide-y divide-[var(--az-hairline)]">
                    {filtered.slice(0, shown).map((g) => <Row key={g.id} g={g} me={me} isIn={isIn} isRequested={isRequested} />)}
                  </ul>
                )}
              {filtered.length > shown && <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => setShown(shown + PAGE)}>Show more communities</button>}
            </>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--az-hairline)] pt-5">
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back</button>
        <p className="t-small" role="status" aria-live="polite">Joined {joined} · Requested {requested}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => onFinish()} disabled={busy}>Skip for now</button>
          <button type="button" className="btn btn-primary" onClick={() => onFinish()} disabled={busy}>Finish</button>
        </div>
      </div>
    </section>
  );
}

function Row({ g, me, isIn, isRequested, highlight = false }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 py-3 ${highlight ? 'rounded-xl border border-[var(--az-hairline)] px-3' : ''}`}>
      <CommunityTile c={g} size={40} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-semibold">{g.name}</p>
        <p className="t-small flex flex-wrap items-center gap-2">
          <span>{[g.type, members(g.memberCount)].filter(Boolean).join(' · ')}</span>
          <VisibilityBadge visibility={visibilityOf(g.accessType)} />
        </p>
      </div>
      {isIn(g) && <Badge tone="ok" icon="check">Joined</Badge>}
      {isRequested(g) && <Badge tone="info">Requested</Badge>}
      <JoinButton g={g} className="btn-sm" />
    </li>
  );
}
