import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Field } from '../components/ui.jsx';
import { AuthShell } from './Login.jsx';

const DEPTS = ['Computer Science', 'Electronics', 'Electrical', 'Mechanical', 'Civil', 'Chemical', 'Business', 'Design', 'Other'];

export default function Signup() {
  const { state, dispatch } = useStore();
  const nav = useNavigate();
  const reg = state.settings.registration ?? { open: true };
  const [form, setForm] = useState({ name: '', email: '', password: '', batch: new Date().getFullYear() - 1, dept: DEPTS[0], city: '' });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };

  const submit = (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return setError('Enter your name and a valid email address.');
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');
    const domains = reg.allowedDomains ?? [];
    if (domains.length && !domains.some((d) => email.endsWith(`@${d.replace(/^@/, '')}`))) return setError(`Sign-up is limited to these email domains: ${domains.join(', ')}.`);
    if (state.users.some((u) => u.email.toLowerCase() === email)) return setError('That email already has an account. Sign in instead.');
    if (!agreed) return setError('Please accept the community guidelines to join.');
    const { password: _ignored, ...profile } = form;
    dispatch({ type: 'signup', user: { ...profile, name: profile.name.trim(), email, batch: Number(form.batch) } });
    if (reg.requireApproval) setPending(true);
    else nav('/feed');
  };

  if (!reg.open) {
    return (
      <AuthShell>
        <div className="p-8">
          <h2 className="text-2xl font-bold">Sign-ups are paused</h2>
          <p className="mt-2 text-sm text-slate-300">The community admins have paused new sign-ups for now. If you have an invitation link, use it to join.</p>
          <Link to="/login" className="btn btn-primary mt-6 w-full">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  if (pending) {
    return (
      <AuthShell>
        <div className="p-8">
          <h2 className="text-2xl font-bold">Thanks for joining! 🎉</h2>
          <p className="mt-2 text-sm text-slate-300">A community admin will review your membership shortly. You can sign in as soon as you’re approved.</p>
          <Link to="/explore" className="btn btn-primary mt-6 w-full">Look around while you wait</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="signup">
      <form onSubmit={submit} className="p-7 sm:p-8" noValidate>
        <h2 className="text-2xl font-semibold">Join the community</h2>
        <p className="mt-2 text-sm text-slate-300">Free and open to every alumnus. Takes under a minute.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Full name"><input className="input" value={form.name} onChange={set('name')} autoComplete="name" /></Field></div>
          <div className="col-span-2"><Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" /></Field></div>
          <div className="col-span-2"><Field label="Password" hint="At least 8 characters"><input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></Field></div>
          <Field label="Graduation year"><input className="input" type="number" min="1950" max="2100" value={form.batch} onChange={set('batch')} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={set('city')} autoComplete="address-level2" /></Field>
          <div className="col-span-2">
            <Field label="Department">
              <select className="input" value={form.dept} onChange={set('dept')}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select>
            </Field>
          </div>
        </div>
        <details className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-xs text-slate-300">
          <summary className="cursor-pointer font-semibold">Community guidelines</summary>
          <p className="mt-2 leading-relaxed">{reg.guidelines}</p>
        </details>
        <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-400" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setError(''); }} />
          I agree to follow the community guidelines.
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-rose-300">{error}</p>}
        <button className="btn btn-primary mt-4 h-11 w-full">Create my account</button>
        <p className="mt-4 text-center text-sm text-slate-400">Already a member? <Link to="/login" className="text-brand-300 hover:underline">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
