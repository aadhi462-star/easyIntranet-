import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { Field, Logo, Modal, ThemeToggle } from '../components/ui.jsx';

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
  ['megaphone', 'Join discussions and share updates'],
  ['people', 'Communities for alumni, interests and teams'],
  ['calendar', 'Find and host events and meet-ups'],
  ['cap', 'Learn together inside your communities'],
];

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

// Where a visitor was heading when they chose to sign up (e.g. a community's Join button). The
// confirmation email usually opens in a new tab, so it waits in localStorage (this browser,
// one day) and is used once, after the email is confirmed.
const AFTER_SIGNUP = 'c1:after-signup';
const internal = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\');
export function stashNext(email, next) {
  if (!internal(next)) return;
  try { localStorage.setItem(AFTER_SIGNUP, JSON.stringify({ email: email.toLowerCase(), next, at: Date.now() })); } catch { /* optional */ }
}
export function takeNext(email) {
  try {
    const v = JSON.parse(localStorage.getItem(AFTER_SIGNUP) || 'null');
    localStorage.removeItem(AFTER_SIGNUP);
    if (v && v.email === String(email).toLowerCase() && Date.now() - v.at < 864e5 && internal(v.next)) return v.next;
  } catch { /* optional */ }
  return null;
}

/** Where to go after signing in: the page the visitor was trying to reach, if it's internal. */
export function nextPath(search) {
  const next = new URLSearchParams(search).get('next');
  return internal(next) ? next : '/dashboard';
}

/** Sign in / Join switch shown at the top of the auth card. */
function AuthTabs({ mode }) {
  const { search } = useLocation();
  const tab = (to, id, label) => (
    <Link to={`${to}${search}`} aria-current={mode === id ? 'page' : undefined}
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

/** Sign-in and sign-up layout: CommunityOne's pitch on the left, the form card on the right. */
export function AuthShell({ children, mode }) {
  useEffect(() => { document.title = mode === 'signup' ? 'Join · CommunityOne' : 'Sign in · CommunityOne'; }, [mode]);
  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--color-ink-950)]">
      <div aria-hidden="true" className="auth-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-5">
          <Link to="/" aria-label="CommunityOne home"><Logo size={34} /></Link>
          <div className="flex gap-2">
            <ThemeToggle />
            <Link to="/explore" className="btn btn-ghost">Explore Communities</Link>
          </div>
        </header>

        <main className="grid flex-1 items-center gap-10 pb-12 pt-4 lg:grid-cols-[1fr_440px] lg:gap-16">
          <section>
            <span className="chip">One platform. Every community.</span>
            <h1 className="mt-5 text-[40px] font-bold leading-[1.08] tracking-tight text-white sm:text-[56px]">
              Find your people. Build your community.
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-dim">
              Discover communities, connect with people, share knowledge, join conversations and learn together. One account for every community you belong to.
            </p>
            <ul className="mt-8 hidden max-w-xl gap-3 sm:grid sm:grid-cols-2">
              {perks.map(([icon, text]) => (
                <li key={text} className="flex items-center gap-3 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-3 text-sm font-medium text-slate-200">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-400/10 text-brand-300"><Icon name={icon} /></span>
                  {text}
                </li>
              ))}
            </ul>
          </section>

          <div className="w-full rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-surface)]">
            {mode && <AuthTabs mode={mode} />}
            {children}
          </div>
        </main>
      </div>
    </div>
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
        <p className="mt-2 text-sm text-slate-300">Sign in to CommunityOne.</p>
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
