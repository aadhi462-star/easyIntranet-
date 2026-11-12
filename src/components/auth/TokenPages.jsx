// Pages opened from email links (v2 workstream C, board V2CAuth frames 8–11 and 14–16): confirm
// email (/verify), choose a new password (/reset) and confirm a changed email (/confirm-email).
// Each token works once; when the server says one is spent, the page offers "Send a new link"
// on the spot (C8) instead of sending the person to sign in first.
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { AuthShell, AuthTitle, Notice, PasswordField, SendLinkForm } from './AuthParts.jsx';
import { takeNext, takeProfile } from '../../pages/Login.jsx';

const tokenFrom = (search) => new URLSearchParams(search).get('token') || '';
const spent = (err) => err?.code === 'INVALID_TOKEN';

function Working({ title }) {
  return <AuthShell title={title}><div role="status"><AuthTitle lede="One moment.">{title}</AuthTitle></div></AuthShell>;
}

/** A confirmation link that expired, was used or arrived incomplete. */
function NewConfirmationLink() {
  return (
    <AuthShell title="Send a new link">
      <SendLinkForm route="/auth/verify/resend" title="This link has expired or was already used"
        lede="Confirmation links work once and expire after 24 hours. Enter your email and we’ll send a new one."
        sentNote="The new link expires in 24 hours. Earlier links no longer work."
        footer={<>Already confirmed? <Link to="/login" className="link">Sign in</Link></>} />
    </AuthShell>
  );
}

/** A reset link that expired, was used or arrived incomplete. */
function NewResetLink() {
  return (
    <AuthShell title="Send a new link">
      <SendLinkForm route="/auth/password/forgot" title="This reset link has expired or was already used"
        lede="Reset links work once and expire after an hour. Enter your email and we’ll send a new one."
        sentNote="The link works once and expires in an hour."
        footer={<>Remembered it? <Link to="/login" className="link">Sign in</Link></>} />
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { dispatch } = useStore();
  const nav = useNavigate();
  const token = tokenFrom(useLocation().search);
  const [state, setState] = useState({ phase: 'working' });
  // Once per token: StrictMode runs effects twice and a token is single-use, but a new link
  // opened in the same tab (only the token changes) must still be confirmed.
  const ran = useRef(null);

  const confirmLink = () => {
    setState({ phase: 'working' });
    api('/auth/verify', { method: 'POST', body: { token } })
      .then(({ user }) => {
        if (user.status === 'active') {
          // Signed in; the welcome steps come next (nothing is joined for them, C9).
          dispatch({ type: 'session/adopt', user, profile: takeProfile(user.email) });
          nav(takeNext(user.email) ?? '/home', { replace: true });
        } else setState({ phase: 'pending' });
      })
      .catch((err) => setState({ phase: spent(err) ? 'spent' : 'error', message: err.message }));
  };
  useEffect(() => {
    if (ran.current === token) return;
    ran.current = token;
    if (!token) setState({ phase: 'spent' });
    else confirmLink();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.phase === 'working') return <Working title="Confirming your email…" />;
  if (state.phase === 'spent') return <NewConfirmationLink />;
  if (state.phase === 'pending') {
    return (
      <AuthShell title="Email confirmed">
        <div role="status"><AuthTitle lede="A CommunityOne administrator will review your account. You can sign in once it’s approved.">Email confirmed</AuthTitle></div>
        <Link to="/explore" className="btn btn-primary mt-6 w-full">Explore communities while you wait</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Couldn’t confirm your email">
      <AuthTitle>Couldn’t confirm your email</AuthTitle>
      <div className="mt-5"><Notice>{state.message}</Notice></div>
      <button type="button" className="btn btn-primary w-full" onClick={confirmLink}>Try again</button>
    </AuthShell>
  );
}

export function ResetPassword() {
  const token = tokenFrom(useLocation().search);
  const id = useId();
  const inputRef = useRef(null);
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState(token ? 'form' : 'spent');
  useEffect(() => { setPhase(token ? 'form' : 'spent'); setPw(''); setError(''); }, [token]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    if (pw.length < 8) { setError('Use a password of at least 8 characters.'); inputRef.current?.focus(); return; }
    busyRef.current = true; setBusy(true); setError('');
    try { await api('/auth/password/reset', { method: 'POST', body: { token, password: pw } }); setPhase('done'); } catch (err) { if (spent(err)) setPhase('spent'); else { setError(err.message); inputRef.current?.focus(); } } finally { busyRef.current = false; setBusy(false); }
  };

  if (phase === 'spent') return <NewResetLink />;
  if (phase === 'done') {
    return (
      <AuthShell title="Password updated">
        <div role="status"><AuthTitle lede="Sign in with your new password. You’ve been signed out everywhere else for safety.">Password updated</AuthTitle></div>
        <Link to="/login" className="btn btn-primary mt-6 w-full">Sign in</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} noValidate>
        <AuthTitle lede="Saving signs you out on your other devices.">Choose a new password</AuthTitle>
        <div className="mt-6">
          <PasswordField id={id} inputRef={inputRef} label="New password" value={pw} autoComplete="new-password" hint="At least 8 characters." error={error}
            onChange={(e) => { setPw(e.target.value); setError(''); }} />
        </div>
        <button className="btn btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
      </form>
    </AuthShell>
  );
}

export function ConfirmEmail() {
  const { dispatch } = useStore();
  const token = tokenFrom(useLocation().search);
  const [state, setState] = useState({ phase: 'working' });
  const ran = useRef(null);
  useEffect(() => {
    if (ran.current === token) return;
    ran.current = token;
    setState({ phase: 'working' });
    api('/auth/email/confirm', { method: 'POST', body: { token } })
      .then(({ user }) => { dispatch({ type: 'profile/sync-email', id: user.id, email: user.email }); setState({ phase: 'done', email: user.email }); })
      .catch((err) => setState({ phase: 'error', message: err.message }));
  }, [token, dispatch]);
  if (state.phase === 'working') return <Working title="Confirming your new email…" />;
  if (state.phase === 'done') {
    return (
      <AuthShell title="Email changed">
        <div role="status"><AuthTitle>Email changed</AuthTitle><p className="mt-2 text-[15px] leading-6 text-[var(--az-text-2)]">You’ll sign in with <b className="text-[var(--az-text)]">{state.email}</b> from now on.</p></div>
        <Link to="/home" className="btn btn-primary mt-6 w-full">Continue</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="That link didn’t work">
      <AuthTitle>That link didn’t work</AuthTitle>
      <div className="mt-5"><Notice>{state.message}</Notice></div>
      <p className="t-small">Change your email again from your account settings to get a new link.</p>
      <Link to="/home" className="btn btn-primary mt-6 w-full">Continue</Link>
    </AuthShell>
  );
}
