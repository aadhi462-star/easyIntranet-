// Pages opened from email links: confirm email (/verify), choose a new password (/reset) and
// confirm a changed email (/confirm-email). Each token works once; the server says if it's spent.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useStore } from '../../lib/store.jsx';
import { Field } from '../ui.jsx';
import { AuthShell, takeNext, takeProfile } from '../../pages/Login.jsx';

const tokenFrom = (search) => new URLSearchParams(search).get('token') || '';

function Panel({ title, children }) {
  return (
    <AuthShell>
      <div className="p-8">
        <h2 className="text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { dispatch } = useStore();
  const nav = useNavigate();
  const token = tokenFrom(useLocation().search);
  const [state, setState] = useState({ phase: 'working' });
  const ran = useRef(false); // StrictMode runs effects twice; the token is single-use

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setState({ phase: 'error', message: 'This confirmation link is incomplete. Open the link from your email again.' }); return; }
    api('/auth/verify', { method: 'POST', body: { token } })
      .then(({ user, message }) => {
        if (user.status === 'active') {
          dispatch({ type: 'session/adopt', user, profile: takeProfile(user.email) });
          nav(takeNext(user.email) ?? '/dashboard', { replace: true });
        } else setState({ phase: 'pending', message });
      })
      .catch((err) => setState({ phase: 'error', message: err.message }));
  }, [token, dispatch, nav]);

  if (state.phase === 'working') return <Panel title="Confirming your email…"><p className="mt-2 text-sm text-slate-300" role="status">One moment.</p></Panel>;
  if (state.phase === 'pending') return <Panel title="Email confirmed"><p className="mt-2 text-sm text-slate-300" role="status">{state.message}</p><Link to="/explore" className="btn btn-primary mt-6 w-full">Look around while you wait</Link></Panel>;
  return (
    <Panel title="That link didn’t work">
      <p role="alert" className="mt-2 text-sm text-slate-300">{state.message}</p>
      <p className="mt-2 text-sm text-slate-400">Sign in with your email and password and we’ll offer to send a fresh link.</p>
      <Link to="/login" className="btn btn-primary mt-6 w-full">Go to sign in</Link>
    </Panel>
  );
}

export function ResetPassword() {
  const token = tokenFrom(useLocation().search);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setError('Use a password of at least 8 characters.'); return; }
    if (pw !== pw2) { setError('The two passwords don’t match.'); return; }
    setBusy(true); setError('');
    try { setDone((await api('/auth/password/reset', { method: 'POST', body: { token, password: pw } })).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) return <Panel title="Password updated"><p className="mt-2 text-sm text-slate-300" role="status">{done} You’ve been signed out everywhere else for safety.</p><Link to="/login" className="btn btn-primary mt-6 w-full">Sign in</Link></Panel>;
  return (
    <AuthShell>
      <form className="p-8" onSubmit={submit} noValidate>
        <h2 className="text-2xl font-bold">Choose a new password</h2>
        <div className="mt-5 space-y-4">
          <Field label="New password" hint="At least 8 characters"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }} /></Field>
          <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setError(''); }} /></Field>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        <button className="btn btn-primary mt-5 h-11 w-full" disabled={busy || !token}>{busy ? 'Saving…' : 'Save new password'}</button>
        {!token && <p role="alert" className="mt-3 text-sm text-rose-300">This reset link is incomplete. Request a new one from the sign-in page.</p>}
      </form>
    </AuthShell>
  );
}

export function ConfirmEmail() {
  const { dispatch } = useStore();
  const token = tokenFrom(useLocation().search);
  const [state, setState] = useState({ phase: 'working' });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api('/auth/email/confirm', { method: 'POST', body: { token } })
      .then(({ user }) => { dispatch({ type: 'profile/sync-email', id: user.id, email: user.email }); setState({ phase: 'done', email: user.email }); })
      .catch((err) => setState({ phase: 'error', message: err.message }));
  }, [token, dispatch]);
  if (state.phase === 'working') return <Panel title="Confirming your new email…"><p className="mt-2 text-sm text-slate-300" role="status">One moment.</p></Panel>;
  if (state.phase === 'done') return <Panel title="Email changed"><p className="mt-2 text-sm text-slate-300" role="status">You’ll sign in with <b className="text-white">{state.email}</b> from now on.</p><Link to="/feed" className="btn btn-primary mt-6 w-full">Continue</Link></Panel>;
  return <Panel title="That link didn’t work"><p role="alert" className="mt-2 text-sm text-slate-300">{state.message}</p><Link to="/feed" className="btn btn-primary mt-6 w-full">Continue</Link></Panel>;
}
