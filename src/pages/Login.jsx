// Sign in (v2 workstream C, board V2CAuth frames 1–3): email, password with Show, and one notice
// per account state with one way forward each. Also home to the small helpers sign-up and the
// email-link pages share (where to go next, details kept until the email is confirmed).
import { useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { AuthField, AuthShell, AuthTitle, EMAIL_RE, Notice, PasswordField, useRegistration } from '../components/auth/AuthParts.jsx';

export { AuthShell, EMAIL_RE };

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
export const internal = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\');
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
  return internal(next) ? next : '/home';
}

// The account states the server reports after the password is proven: a short name, and the
// follow-up each one offers.
const STATES = {
  EMAIL_NOT_VERIFIED: ['Email not confirmed.', 'resend'],
  PENDING_APPROVAL: ['Waiting for approval.', null],
  ACCOUNT_DEACTIVATED: ['Deactivated.', 'reactivate'],
  ACCOUNT_SUSPENDED: ['Suspended.', 'suspended'],
  LOCKED: ['Locked.', 'locked'],
};

export default function Login() {
  const { dispatch } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const reg = useRegistration();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState(loc.state?.email ?? '');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState(null); // { code, message }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state updates are async, so a fast double submit needs a ref

  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setProblem(null); setNote('');
    try { await fn(); } finally { busyRef.current = false; setBusy(false); }
  };
  const fail = (err) => setProblem({ code: err.code, message: err.message });
  const signedIn = ({ user }) => {
    dispatch({ type: 'session/adopt', user, profile: takeProfile(user.email) });
    nav(nextPath(loc.search), { replace: true });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setProblem({ code: 'MISSING', message: 'Enter your email and password.' }); return; }
    run(async () => { try { signedIn(await api('/auth/login', { method: 'POST', body: { email, password } })); } catch (err) { fail(err); } });
  };
  const resend = () => run(async () => {
    try { setNote((await api('/auth/verify/resend', { method: 'POST', body: { email } })).message); } catch (err) { fail(err); }
  });
  const reactivate = () => run(async () => {
    try { signedIn(await api('/auth/reactivate', { method: 'POST', body: { email, password } })); } catch (err) { fail(err); }
  });
  const edit = (set) => (e) => { set(e.target.value); setProblem(null); };
  const forgot = { pathname: '/forgot', state: { email } };

  const [stateName, follow] = STATES[problem?.code] ?? [];
  const notice = !problem ? null
    : follow === 'locked' ? <Notice title={stateName}>Too many sign-in attempts. Try again in a few minutes, or <Link className="link" to={forgot.pathname} state={forgot.state}>reset your password</Link>.</Notice>
      : follow === 'suspended' ? <Notice title={stateName}>This account is suspended. <Link className="link" to="/contact">Contact support</Link> if you think this is a mistake.</Notice>
        : (
          <Notice tone={stateName ? 'warn' : 'bad'} title={stateName}>
            {problem.message}
            {follow === 'resend' && <button type="button" className="btn btn-secondary mt-3 w-full" disabled={busy} onClick={resend}>Send the confirmation link again</button>}
            {follow === 'reactivate' && <button type="button" className="btn btn-secondary mt-3 w-full" disabled={busy} onClick={reactivate}>Reactivate my account</button>}
          </Notice>
        );

  return (
    <AuthShell title="Sign in" mode="login">
      <form onSubmit={submit} noValidate>
        <AuthTitle lede="Sign in to CommunityOne.">Welcome back</AuthTitle>
        <div className="mt-6">
          {notice}
          {note && <Notice tone="ok">{note}</Notice>}
          <div className="flex flex-col gap-4">
            <AuthField label="Email" id={emailId}>
              <input id={emailId} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={edit(setEmail)} />
            </AuthField>
            <PasswordField id={passwordId} value={password} onChange={edit(setPassword)} autoComplete="current-password"
              extra={<Link to={forgot.pathname} state={forgot.state} className="link text-sm"><span className="sm:hidden">Forgot?</span><span className="max-sm:hidden">Forgot your password?</span></Link>} />
          </div>
        </div>
        <button className="btn btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="mt-5 text-center text-sm text-[var(--az-text-2)]">
          <span className="max-sm:hidden">New to CommunityOne?</span><span className="sm:hidden">New here?</span>{' '}
          <Link to={`/signup${loc.search}`} className="link">Create an account</Link>
          <span className="max-sm:hidden"> · <Link to="/explore" className="link">Look around first</Link></span>
        </p>
        {reg?.devMailbox && <p className="t-small mt-4 text-center">Development: demo accounts and their passwords are in DEMO_ACCOUNTS.md.</p>}
      </form>
    </AuthShell>
  );
}
