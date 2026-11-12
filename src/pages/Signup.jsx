// Create account (v2 workstream C, board V2CAuth frames 4–7): name, email, one password field
// with Show (C12) and the agreement to the Terms and Privacy pages (C14). Errors sit next to
// their field. Then "Check your email", with a resend. Sign-ups paused or limited to some
// domains are the platform's settings, in the platform's words (C10).
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, newKey } from '../lib/api.js';
import { AuthField, AuthShell, AuthTitle, describedBy, EMAIL_RE, Notice, PasswordField, useRegistration } from '../components/auth/AuthParts.jsx';
import { nextPath, stashNext } from './Login.jsx';

const AGREE = 'Accept the Terms of Service and Privacy Policy to create your account.';

export default function Signup() {
  const { search, state: navState } = useLocation();
  const reg = useRegistration();
  const ids = { name: useId(), email: useId(), password: useId(), agree: useId() };
  const refs = { name: useRef(null), email: useRef(null), password: useRef(null), agree: useRef(null) };
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({}); // field → message (or 'EMAIL_TAKEN')
  const [formError, setFormError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const keyRef = useRef(newKey()); // one key per filled-in form, so retries can't create two accounts
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // state updates are async, so a fast double submit needs a ref
  const next = nextPath(search);
  // Joining from a community's card says where the person will come back to (C9).
  const lookingAt = next.startsWith('/c/') ? navState?.community : null;

  // Focus the first field with an error after each failed submit.
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const first = ['name', 'email', 'password', 'agree'].find((k) => errors[k]);
    if (first) refs[first].current?.focus();
  }, [focusTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value }); setErrors({ ...errors, [k]: undefined }); setFormError('');
    keyRef.current = newKey(); // a changed form is a new attempt
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    const email = form.email.trim();
    const found = {};
    if (!form.name.trim()) found.name = 'Enter your name.';
    if (!EMAIL_RE.test(email)) found.email = 'Enter a valid email address.';
    if (form.password.length < 8) found.password = 'Use a password of at least 8 characters.';
    if (!agreed) found.agree = AGREE;
    setErrors(found); setFormError('');
    if (Object.keys(found).length) { setFocusTick((n) => n + 1); return; }
    busyRef.current = true; setBusy(true);
    try {
      await api('/auth/register', { method: 'POST', idempotencyKey: keyRef.current, body: { name: form.name.trim(), email, password: form.password, acceptedGuidelines: true } });
      stashNext(email, next);
      setSentTo(email);
    } catch (err) {
      const field = err.extra?.field && ids[err.extra.field] ? err.extra.field : null;
      if (err.code === 'EMAIL_TAKEN') setErrors({ email: 'EMAIL_TAKEN' });
      else if (field) setErrors({ [field]: err.message });
      else setFormError(err.message);
      setFocusTick((n) => n + 1);
    } finally { busyRef.current = false; setBusy(false); }
  };

  if (reg && !reg.open) {
    return (
      <AuthShell title="New accounts are paused">
        <AuthTitle lede="CommunityOne isn’t accepting new accounts right now. You can still browse Public communities.">New accounts are paused</AuthTitle>
        <div className="mt-6 flex flex-col gap-3">
          <Link to="/explore" className="btn btn-primary">Explore Communities</Link>
          <Link to="/login" className="btn btn-secondary">Sign in</Link>
        </div>
      </AuthShell>
    );
  }

  if (sentTo) return <CheckEmail email={sentTo} devMailbox={reg?.devMailbox} onStartAgain={() => { setSentTo(''); keyRef.current = newKey(); }} />;

  const emailError = errors.email === 'EMAIL_TAKEN'
    ? <>An account with this email already exists. <Link className="link" to="/login" state={{ email: form.email.trim() }}>Sign in</Link>, or <Link className="link" to="/forgot" state={{ email: form.email.trim() }}>reset your password</Link> if you’ve forgotten it.</>
    : errors.email;

  return (
    <AuthShell title="Create account" mode="signup">
      <form onSubmit={submit} noValidate>
        <AuthTitle lede="One account for every community you belong to.">Create your account</AuthTitle>
        <div className="mt-6">
          {lookingAt && <Notice tone="info">You were looking at <b>{lookingAt}</b>. If you confirm your email in this browser, we’ll bring you back to it so you can join.</Notice>}
          {reg?.allowedDomains?.length > 0 && <Notice tone="info">Sign-ups are limited to: {reg.allowedDomains.join(', ')}.</Notice>}
          {formError && <Notice>{formError}</Notice>}
          <div className="flex flex-col gap-4">
            <AuthField label="Full name" id={ids.name} error={errors.name}>
              <input ref={refs.name} id={ids.name} className="input" value={form.name} onChange={set('name')} autoComplete="name" maxLength={80}
                aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy(ids.name, { error: errors.name })} />
            </AuthField>
            <AuthField label="Email" id={ids.email} error={emailError}>
              <input ref={refs.email} id={ids.email} className="input" type="email" inputMode="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com"
                aria-invalid={errors.email ? true : undefined} aria-describedby={describedBy(ids.email, { error: errors.email })} />
            </AuthField>
            <PasswordField id={ids.password} inputRef={refs.password} value={form.password} onChange={set('password')} autoComplete="new-password"
              hint="At least 8 characters." error={errors.password} />
            <div>
              <div className="flex min-h-11 items-start gap-3 text-sm leading-6">
                <input ref={refs.agree} id={ids.agree} type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--az-focus)]" checked={agreed}
                  aria-invalid={errors.agree ? true : undefined} aria-describedby={describedBy(ids.agree, { error: errors.agree })}
                  onChange={(e) => { setAgreed(e.target.checked); setErrors({ ...errors, agree: undefined }); }} />
                <label htmlFor={ids.agree}>
                  I agree to the CommunityOne <Link to="/terms" target="_blank" className="link">Terms of Service</Link> and <Link to="/privacy" target="_blank" className="link">Privacy Policy</Link>.
                </label>
              </div>
              {errors.agree && <div id={`${ids.agree}-error`} className="field-error">{errors.agree}</div>}
            </div>
          </div>
        </div>
        <button className="btn btn-primary mt-6 w-full" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
        <p className="mt-5 text-center text-sm text-[var(--az-text-2)]">Already have an account? <Link to={`/login${search}`} className="link">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

/** "Check your email", with a resend (REG-06: the older link stops working). */
function CheckEmail({ email, devMailbox, onStartAgain }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true); setError(''); setNote('');
    try { setNote((await api('/auth/verify/resend', { method: 'POST', body: { email } })).message); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Check your email">
      <div role="status">
        <AuthTitle>Check your email</AuthTitle>
        <p className="mt-2 text-[15px] leading-6 text-[var(--az-text-2)]">We sent a confirmation link to <b className="text-[var(--az-text)]">{email}</b>. Open it to finish creating your account. The link expires in 24 hours.</p>
      </div>
      <p className="mt-4 text-sm text-[var(--az-text-2)]">Didn’t get it? Check your spam folder, or send it again.</p>
      {note && <div className="mt-4"><Notice tone="ok">{note}</Notice></div>}
      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      <button type="button" className="btn btn-secondary mt-4 w-full" disabled={busy} onClick={resend}>{busy ? 'Sending…' : 'Send it again'}</button>
      <p className="mt-5 text-center text-sm text-[var(--az-text-2)]">
        Wrong address? <button type="button" className="link min-h-11" onClick={onStartAgain}>Start again</button> · <Link to="/login" className="link">Back to sign in</Link>
      </p>
      {devMailbox && <p className="t-small mt-3 text-center">Development: emails are printed in the server console and listed at <a className="link" href={`/api/dev/outbox?to=${encodeURIComponent(email)}`} target="_blank" rel="noreferrer">/api/dev/outbox</a>.</p>}
    </AuthShell>
  );
}
