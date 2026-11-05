import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Field } from '../components/ui.jsx';
import { AuthShell, EMAIL_RE, passwordFields } from './Login.jsx';

// Built-in demo code. It follows the registration settings like normal sign-up (no
// pre-approval, domain limits apply, unusable while sign-ups are paused). Admins create
// real, single-use invitations under Admin → Members (stored in state.invites).
const DEMO_INVITES = { WELCOME2026: { invitedBy: 'u7', batch: 2020, demo: true } };

export default function Invite() {
  const { code } = useParams();
  const { state, dispatch, user } = useStore();
  const nav = useNavigate();
  const upper = code?.toUpperCase();
  const reg = state.settings.registration ?? { open: true };
  const now = Date.now();
  const stored = (state.invites || []).find((i) => i.code?.toUpperCase() === upper && i.status === 'pending' && !i.usedAt && !(i.expiresAt && i.expiresAt < now));
  const demo = reg.open !== false ? DEMO_INVITES[upper] : undefined;
  const invite = stored ?? demo;
  const approval = !stored && !!reg.requireApproval;
  const inviteEmail = stored?.email?.trim().toLowerCase() || '';
  const [form, setForm] = useState({ name: '', email: inviteEmail, password: '', batch: invite?.batch ?? 2020, dept: 'Computer Science', city: '' });
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim() || !EMAIL_RE.test(email) || form.password.length < 8) { setError('Enter your name, a valid email and a password of at least 8 characters.'); return; }
    if (inviteEmail && email !== inviteEmail) { setError(`This invitation is for ${inviteEmail}. Use that email address to accept it.`); return; }
    if (!stored) {
      const domains = reg.allowedDomains ?? [];
      if (domains.length && !domains.some((d) => email.endsWith(`@${d.replace(/^@/, '')}`))) { setError(`Sign-up is limited to these email domains: ${domains.join(', ')}.`); return; }
    }
    if (state.users.some((u) => u.email?.trim().toLowerCase() === email)) { setError('That email already has an account. Sign in instead.'); return; }
    const { password: _ignored, ...profile } = form;
    const secret = await passwordFields(form.password);
    const external = !!stored?.external;
    // A stored invitation counts as pre-approval; the demo code goes through the normal queue.
    dispatch({ type: 'signup', user: { ...profile, ...secret, name: profile.name.trim(), email, batch: Number(form.batch), status: approval ? 'pending' : 'active', invitedBy: invite.invitedBy, external, ...(external ? { roleId: 'external' } : {}) } });
    if (stored) dispatch({ type: 'update', col: 'invites', id: stored.id, silent: true, patch: { status: 'accepted', acceptedAt: Date.now(), usedAt: Date.now() } });
    if (approval) setWaiting(true);
    else nav('/feed');
  };

  if (waiting) {
    return (
      <AuthShell>
        <div className="p-8">
          <h2 className="text-2xl font-bold">Thanks for joining! 🎉</h2>
          <p className="mt-2 text-sm text-slate-300">A community admin will review your membership shortly. You can sign in as soon as you’re approved.</p>
          <Link to="/login" className="btn btn-primary mt-6 w-full">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {!invite ? (
        <div className="p-8">
          <h2 className="text-2xl font-bold">Invitation not found</h2>
          <p className="mt-2 text-sm text-slate-300">This invitation link is invalid, already used or expired. {reg.open !== false ? 'You can still join: sign-up is open to everyone.' : ''}</p>
          {reg.open !== false && <Link to="/signup" className="btn btn-primary mt-6 w-full">Sign up</Link>}
          <Link to="/login" className="btn btn-ghost mt-2 w-full">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="p-7 sm:p-8" noValidate>
          <h2 className="text-2xl font-bold">You’re invited</h2>
          <p className="mt-2 text-sm text-slate-300">
            {user(invite.invitedBy)?.name ?? 'A member'} invited you to join {state.settings.networkName}. {approval ? 'An admin will approve your membership after you sign up.' : 'An invitation is a quick way in: your account is ready as soon as you sign up.'}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Full name"><input className="input" value={form.name} onChange={set('name')} autoComplete="name" /></Field></div>
            <div className="col-span-2"><Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" readOnly={!!inviteEmail} /></Field></div>
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
