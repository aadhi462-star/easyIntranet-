import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Field, Logo, Modal, ThemeToggle } from '../components/ui.jsx';
import { useTheme } from '../lib/theme.js';
import LiquidGlassStage from '../components/LiquidGlassStage.jsx';

// Line icons (24px grid, stroke) instead of emoji so they render the same everywhere.
const ICONS = {
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3a5 5 0 0 1 0 8m2.5-10.5a8.5 8.5 0 0 1 0 13',
  people: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm13 9v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74',
  calendar: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 8h2m4 0h2m-8 4h2',
  cap: 'M22 9 12 4 2 9l10 5 10-5Zm-16 2.5V16c0 1.66 2.69 3 6 3s6-1.34 6-3v-4.5M22 9v5',
};
function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

const perks = [
  ['megaphone', 'Share updates and celebrate wins'],
  ['people', 'Groups for your batch, city or interests'],
  ['calendar', 'Find and host reunions and meet-ups'],
  ['cap', 'A profile that grows with your career'],
];
const stats = [['8,400+', 'Alumni'], ['120', 'Groups'], ['340', 'Events a year']];

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Profile details collected at sign-up wait here until the account is confirmed, so the
// directory entry is complete when the person first signs in (same browser).
const STASH = 'c1:signup-profile';
export function stashProfile(email, profile) {
  try { sessionStorage.setItem(STASH, JSON.stringify({ email: email.toLowerCase(), profile })); } catch { /* optional */ }
}
export function takeProfile(email) {
  try {
    const v = JSON.parse(sessionStorage.getItem(STASH) || 'null');
    if (v && v.email === String(email).toLowerCase()) { sessionStorage.removeItem(STASH); return v.profile; }
  } catch { /* optional */ }
  return undefined;
}

/** Where to go after signing in: the page the visitor was trying to reach, if it's internal. */
export function nextPath(search) {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/feed';
}

const GLASS = { cornerRadius: 24, refraction: 0.8, chromAberration: 0.08, edgeHighlight: 0.45, specular: 0.6, fresnel: 1, blurAmount: 0.7, tintStrength: 0.25, brightness: -0.12, shadowOpacity: 0.55, zRadius: 34 };

/** Sign in / Join switch shown at the top of the auth card. */
function AuthTabs({ mode }) {
  const tab = (to, id, label) => (
    <Link to={to} aria-current={mode === id ? 'page' : undefined}
      className={`grid min-h-10 flex-1 place-items-center rounded-xl text-sm font-semibold transition ${mode === id ? 'bg-accent-fill shadow' : 'text-slate-300 hover:text-white'}`}>
      {label}
    </Link>
  );
  return (
    <div className="mx-7 mt-7 flex gap-1 rounded-2xl bg-ink-950/60 p-1 ring-1 ring-white/10 sm:mx-8">
      {tab('/login', 'login', 'Sign in')}
      {tab('/signup', 'signup', 'Join free')}
    </div>
  );
}

/**
 * Auth layout after the HooBank hero (gradient display type, stats row) set inside a
 * LiquidGlass-style full-bleed scene, with the card floating on real WebGL glass.
 */
export function AuthShell({ children, mode }) {
  const [, theme] = useTheme();
  // LiquidGlass captures the backdrop once at init, so remount the stage when the theme changes.
  return (
    <LiquidGlassStage key={theme} className="min-h-full" config={GLASS}
      background={<img src={theme === 'light' ? '/scene-light.svg' : '/scene.svg'} alt="" className="absolute inset-0 h-full w-full object-cover" />}>
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-5">
          <Link to="/" aria-label="AlumniZone home"><Logo size={40} /></Link>
          <div className="flex gap-2">
            <ThemeToggle />
            <Link to="/explore" className="btn btn-ghost">Explore</Link>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 pb-12 pt-4 lg:grid-cols-[1fr_440px] lg:gap-16">
          <section>
            <span className="chip">Open alumni community · free to join</span>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.12] tracking-tight text-white sm:text-[56px]">
              Your alumni community, <span className="text-brand-gradient">in one place.</span>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-dim">
              Catch up on the wall, join groups, go to events and keep your story up to date. Open to every alumnus, so join in a minute and find your people.
            </p>
            <ul className="mt-8 hidden max-w-xl gap-3 sm:grid sm:grid-cols-2">
              {perks.map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 text-sm font-medium text-slate-200 ring-1 ring-white/10">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/10 text-brand-300"><Icon name={icon} /></span>
                  {text}
                </li>
              ))}
            </ul>
            <dl className="mt-10 hidden max-w-xl grid-cols-3 gap-6 sm:grid">
              {stats.map(([n, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-3xl font-semibold text-white">{n}</dd>
                  <dd className="mt-1 text-xs uppercase tracking-[0.18em] text-brand-300/80">{label}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div data-glass-target className="w-full rounded-[24px] bg-ink-950/45 ring-1 ring-white/15">
            {mode && <AuthTabs mode={mode} />}
            {children}
          </div>
        </main>
      </div>
    </LiquidGlassStage>
  );
}

export default function Login() {
  const { dispatch } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [next, setNext] = useState(null); // follow-up offered for an account state: resend / reactivate
  const [note, setNote] = useState('');
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state updates are async, so a fast double submit needs a ref

  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNote('');
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  };

  const signedIn = ({ user }) => {
    dispatch({ type: 'session/adopt', user, profile: takeProfile(user.email) });
    nav(nextPath(loc.search), { replace: true });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    run(async () => {
      try {
        signedIn(await api('/auth/login', { method: 'POST', body: { email, password } }));
      } catch (err) {
        setError(err.message);
        setNext(err.code === 'EMAIL_NOT_VERIFIED' ? 'resend' : err.code === 'ACCOUNT_DEACTIVATED' ? 'reactivate' : null);
      }
    });
  };

  const resend = () => run(async () => {
    try { setNote((await api('/auth/verify/resend', { method: 'POST', body: { email } })).message); setNext(null); setError(''); } catch (err) { setError(err.message); }
  });
  const reactivate = () => run(async () => {
    try { signedIn(await api('/auth/reactivate', { method: 'POST', body: { email, password } })); } catch (err) { setError(err.message); }
  });

  return (
    <AuthShell mode="login">
      <form onSubmit={submit} className="p-7 sm:p-8" noValidate>
        <h2 className="text-2xl font-semibold">Welcome back</h2>
        <p className="mt-2 text-sm text-slate-300">Sign in to your alumni community.</p>
        <div className="mt-6 space-y-4">
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
          </Field>
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          </Field>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        {note && <p role="status" className="mt-3 text-sm text-brand-300">{note}</p>}
        {next === 'resend' && <button type="button" className="btn btn-ghost mt-3 w-full" disabled={busy} onClick={resend}>Send the confirmation link again</button>}
        {next === 'reactivate' && <button type="button" className="btn btn-ghost mt-3 w-full" disabled={busy} onClick={reactivate}>Reactivate my account</button>}
        <button className="btn btn-primary mt-5 h-11 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" onClick={() => setForgot(true)} className="mx-auto mt-4 block min-h-11 text-sm text-brand-300 hover:underline">Forgot your password?</button>
        <p className="mt-5 rounded-xl bg-white/5 px-4 py-3 text-center text-sm text-slate-300">
          New here? <Link to="/signup" className="font-semibold text-brand-300 hover:underline">Join the community</Link> · <Link to="/explore" className="text-brand-300 hover:underline">Look around first</Link>
        </p>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Development: demo accounts and their passwords are in DEMO_ACCOUNTS.md.
        </p>
      </form>
      {forgot && <ForgotPassword onClose={() => setForgot(false)} />}
    </AuthShell>
  );
}

function ForgotPassword({ onClose }) {
  const [sent, setSent] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError('Enter the email you signed up with.'); return; }
    setBusy(true); setError('');
    try { setSent((await api('/auth/password/forgot', { method: 'POST', body: { email } })).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Reset your password" onClose={onClose}>
      {sent ? (
        <p role="status" className="text-sm text-slate-300">{sent} The link works once and expires in an hour.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="you@example.com" /></Field>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </Modal>
  );
}
