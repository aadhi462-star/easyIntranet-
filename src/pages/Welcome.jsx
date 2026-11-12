// Welcome steps after sign-up (redesign Stage 3): profile basics, then choosing communities.
// Both steps are optional; finishing or skipping is recorded on the server (POST
// /account/onboarded) so they don't come back on another device. Then the member carries on
// to where they were heading (?next=), or Home.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { fetchCommunityList, onCommunityChange, visibilityOf } from '../lib/communities.js';
import { Field, Logo, ThemeToggle } from '../components/ui.jsx';
import { CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import JoinButton from '../components/groups/JoinButton.jsx';
import { nextPath } from './Login.jsx';

const FIELDS = [['headline', 'Headline', 'e.g. Product designer, mentor, 2016 batch', 120], ['jobTitle', 'Job title', '', 120], ['company', 'Company or organisation', '', 120], ['city', 'City', '', 80]];

export default function Welcome() {
  const { me, dispatch } = useStore();
  const nav = useNavigate();
  const { search } = useLocation();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = (() => { const p = nextPath(search); return p.startsWith('/welcome') ? '/dashboard' : p; })();
  useEffect(() => { document.title = 'Welcome · CommunityOne'; }, []);

  const finish = async () => {
    setBusy(true); setError('');
    try {
      await api('/account/onboarded', { method: 'POST', body: {} });
      dispatch({ type: 'session/onboarded' });
      nav(next, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full bg-[var(--color-ink-950)]">
      <div className="mx-auto flex max-w-2xl flex-col px-4 pb-16 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-5">
          <Logo size={34} />
          <ThemeToggle />
        </header>
        <main className="glass p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">Step {step} of 2</p>
          {step === 1 ? <ProfileStep me={me} onDone={() => setStep(2)} /> : <CommunitiesStep me={me} />}
          {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--az-hairline)] pt-5">
            {step === 2 ? <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>Back</button> : <span />}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost" onClick={finish} disabled={busy}>Skip for now</button>
              {step === 2 && <button type="button" className="btn btn-primary" onClick={finish} disabled={busy}>Finish</button>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ProfileStep({ me, onDone }) {
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
      <h1 className="mt-2 text-2xl font-semibold">Welcome, {me.name.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-slate-300">A few details help people recognise you. Everything is optional, and you can change it later on your profile.</p>
      {state.status === 'loading' ? <div className="mt-6 h-48 animate-pulse rounded-xl bg-white/5" aria-busy="true" />
        : state.status === 'error' ? (
          <div role="alert" className="mt-6 text-sm"><p className="text-rose-300">{state.message}</p><button type="button" className="btn btn-ghost mt-3" onClick={load}>Try again</button></div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([k, label, placeholder, max]) => (
                <div key={k} className={k === 'headline' ? 'sm:col-span-2' : ''}>
                  <Field label={label}><input className="input" value={form[k]} maxLength={max} placeholder={placeholder}
                    autoComplete={k === 'city' ? 'address-level2' : k === 'company' ? 'organization' : k === 'jobTitle' ? 'organization-title' : 'off'}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">You can add education and work history on your profile later.</p>
            {state.message && <p role="alert" className="mt-3 text-sm text-rose-300">{state.message}</p>}
            <button className="btn btn-primary mt-5" disabled={state.status === 'saving'}>{state.status === 'saving' ? 'Saving…' : 'Save and continue'}</button>
          </>
        )}
    </form>
  );
}

function CommunitiesStep({ me }) {
  const [s, setS] = useState({ status: 'loading', list: [] });
  // The order is fixed on first load, so rows don't move under the pointer when a join changes
  // a member count.
  const [order, setOrder] = useState(null);
  const load = () => fetchCommunityList(me.id).then((list) => setS({ status: 'ready', list }), (err) => setS({ status: 'error', list: [], message: err.message }));
  useEffect(() => { load(); return onCommunityChange(load); }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = (g) => ['active', 'restricted'].includes(g.myMembership?.state);
  const candidates = s.list.filter((g) => g.status === 'active');
  useEffect(() => {
    if (!order && s.status === 'ready') setOrder([...candidates].sort((a, b) => b.memberCount - a.memberCount).slice(0, 8).map((g) => g.id));
  }, [s.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = (order ?? []).map((id) => candidates.find((g) => g.id === id)).filter(Boolean);

  return (
    <section aria-labelledby="pick">
      <h1 id="pick" className="mt-2 text-2xl font-semibold">Choose your communities</h1>
      <p className="mt-2 text-sm text-slate-300">
        Join the ones that fit you: your school or workplace, your city, your interests. Private ones send a request to their admins.
      </p>
      {s.status === 'loading' ? <div className="mt-6 h-48 animate-pulse rounded-xl bg-white/5" aria-busy="true" />
        : s.status === 'error' ? <div role="alert" className="mt-6 text-sm"><p className="text-rose-300">{s.message}</p><button type="button" className="btn btn-ghost mt-3" onClick={load}>Try again</button></div>
          : options.length === 0 && order ? <p className="mt-6 text-sm text-slate-400">There are no other communities to join yet.</p>
            : (
              <ul className="mt-6 divide-y divide-[var(--az-hairline)]">
                {options.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 py-3">
                    <CommunityTile c={g} size={40} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-semibold text-white">{g.name}</p>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">{g.type && <span>{g.type}</span>}<span>{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}</span><VisibilityBadge visibility={visibilityOf(g.accessType)} /></p>
                    </div>
                    {mine(g) ? <span className="text-sm font-semibold text-brand-300">Joined</span> : <JoinButton g={g} className="min-h-10 !px-4 text-sm" />}
                  </li>
                ))}
              </ul>
            )}
    </section>
  );
}
