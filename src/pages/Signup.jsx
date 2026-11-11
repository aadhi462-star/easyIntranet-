import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Field } from '../components/ui.jsx';
import { api, newKey } from '../lib/api.js';
import { AuthShell, EMAIL_RE, nextPath, stashNext, stashProfile } from './Login.jsx';

const DEPTS = ['Computer Science', 'Electronics', 'Electrical', 'Mechanical', 'Civil', 'Chemical', 'Business', 'Design', 'Other'];

export default function Signup() {
  const { state } = useStore();
  const { search } = useLocation();
  // The server decides whether sign-ups are open; the guidelines text still comes from settings.
  const [server, setServer] = useState(null);
  useEffect(() => { api('/auth/registration').then(setServer).catch(() => setServer({ open: true })); }, []);
  const reg = { ...(state.settings.registration ?? {}), ...(server ?? {}), open: server ? server.open : true };
  const [form, setForm] = useState({ name: '', email: '', password: '', batch: new Date().getFullYear() - 1, dept: DEPTS[0], city: '' });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const keyRef = useRef(newKey()); // one key per filled-in form, so retries can't create two accounts
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state updates are async, so a fast double submit needs a ref
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    const email = form.email.trim();
    if (!form.name.trim() || !EMAIL_RE.test(email)) return setError('Enter your name and a valid email address.');
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');
    if (!agreed) return setError('Please accept the community guidelines to join.');
    busyRef.current = true; setBusy(true);
    try {
      await api('/auth/register', { method: 'POST', idempotencyKey: keyRef.current, body: { name: form.name.trim(), email, password: form.password, acceptedGuidelines: true } });
      stashNext(email, nextPath(search));
      stashProfile(email, { batch: Number(form.batch) || null, dept: form.dept, city: form.city.trim() });
      setSentTo(email);
    } catch (err) {
      setError(err.message);
      if (err.code !== 'NETWORK') keyRef.current = newKey(); // a changed form is a new attempt
    } finally { busyRef.current = false; setBusy(false); }
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

  if (sentTo) {
    return (
      <AuthShell>
        <div className="p-8" role="status">
          <h2 className="text-2xl font-bold">Check your email</h2>
          <p className="mt-2 text-sm text-slate-300">We sent a confirmation link to <b className="text-white">{sentTo}</b>. Open it to finish creating your account. The link expires in 24 hours.</p>
          {server?.devMailbox && <p className="mt-3 rounded-xl bg-white/5 px-4 py-3 text-xs text-slate-400">Development: emails are printed in the server console and listed at <a className="text-brand-300 underline" href={`/api/dev/outbox?to=${encodeURIComponent(sentTo)}`} target="_blank" rel="noreferrer">/api/dev/outbox</a>.</p>}
          <Link to="/login" className="btn btn-primary mt-6 w-full">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="signup">
      <form onSubmit={submit} className="p-7 sm:p-8" noValidate>
        <h2 className="text-2xl font-semibold">Create your CommunityOne account</h2>
        <p className="mt-2 text-sm text-slate-300">Free to join. One account for every community you belong to.</p>
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
        <button className="btn btn-primary mt-4 h-11 w-full" disabled={busy}>Create my account</button>
        <p className="mt-4 text-center text-sm text-slate-400">Already a member? <Link to="/login" className="text-brand-300 hover:underline">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
