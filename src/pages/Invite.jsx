import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Field } from '../components/ui.jsx';
import { AuthShell } from './Login.jsx';

// Built-in demo code. Admins create more under Admin → Members (stored in state.invites).
const DEMO_INVITES = { WELCOME2026: { invitedBy: 'u7', batch: 2020 } };

export default function Invite() {
  const { code } = useParams();
  const { state, dispatch, user } = useStore();
  const nav = useNavigate();
  const upper = code?.toUpperCase();
  const stored = (state.invites || []).find((i) => i.code === upper && i.status === 'pending');
  const invite = stored ?? DEMO_INVITES[upper];
  const approval = !!state.settings.registration?.requireApproval;
  const [form, setForm] = useState({ name: '', email: stored?.email ?? '', password: '', batch: invite?.batch ?? 2020, dept: 'Computer Science', city: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email || form.password.length < 8) { setError('Enter your name, email and a password of at least 8 characters.'); return; }
    if (state.users.some((u) => u.email.toLowerCase() === form.email.toLowerCase())) { setError('That email already has an account. Sign in instead.'); return; }
    const { password: _ignored, ...profile } = form;
    // An invitation counts as pre-approval, so invited people skip the approval queue.
    dispatch({ type: 'signup', user: { ...profile, batch: Number(form.batch), status: 'active', invitedBy: invite.invitedBy, external: !!stored?.external } });
    if (stored) dispatch({ type: 'update', col: 'invites', id: stored.id, silent: true, patch: { status: 'accepted', acceptedAt: Date.now() } });
    // When approval is on, core signup doesn't start a session, so send them to sign in.
    nav(approval ? '/login' : '/feed');
  };

  return (
    <AuthShell>
      {!invite ? (
        <div className="p-8">
          <h2 className="text-2xl font-bold">Invitation not found</h2>
          <p className="mt-2 text-sm text-slate-300">This invitation link is invalid, already used or expired. You can still join: sign-up is open to everyone.</p>
          <Link to="/signup" className="btn btn-primary mt-6 w-full">Sign up</Link>
          <Link to="/login" className="btn btn-ghost mt-2 w-full">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="p-7 sm:p-8" noValidate>
          <h2 className="text-2xl font-bold">You’re invited</h2>
          <p className="mt-2 text-sm text-slate-300">
            {user(invite.invitedBy)?.name ?? 'A member'} invited you to join {state.settings.networkName}. An invitation is a quick way in: your account is ready as soon as you sign up.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Full name"><input className="input" value={form.name} onChange={set('name')} autoComplete="name" /></Field></div>
            <div className="col-span-2"><Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field></div>
            <div className="col-span-2"><Field label="Password" hint="At least 8 characters"><input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></Field></div>
            <Field label="Batch"><input className="input" type="number" value={form.batch} onChange={set('batch')} /></Field>
            <Field label="City"><input className="input" value={form.city} onChange={set('city')} /></Field>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
          <button className="btn btn-primary mt-5 h-11 w-full">Create my account</button>
          <p className="mt-4 text-center text-sm text-slate-400">Already a member? <Link to="/login" className="text-brand-400 hover:underline">Sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
