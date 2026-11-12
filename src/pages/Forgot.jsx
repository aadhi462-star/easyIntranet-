// Forgot password (v2 workstream C, C7; board V2CAuth frames 12–13): a page instead of a dialog,
// so it can be linked from Sign in, the locked-account message and an expired reset link, works
// with Back, and keeps the email already typed (passed in router state, never in the address).
// The reply is the same for every address (REG-10); repeats hit the rate limit (REG-11).
import { useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { AuthField, AuthShell, AuthTitle, describedBy, EMAIL_RE, Notice } from '../components/auth/AuthParts.jsx';

export default function Forgot() {
  const loc = useLocation();
  const id = useId();
  const inputRef = useRef(null);
  const [email, setEmail] = useState(loc.state?.email ?? '');
  const [fieldError, setFieldError] = useState('');
  const [error, setError] = useState(''); // from the server, e.g. the rate limit
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const send = async (e) => {
    e?.preventDefault();
    if (busyRef.current) return;
    if (!EMAIL_RE.test(email.trim())) { setFieldError('Enter the email you signed up with.'); inputRef.current?.focus(); return; }
    busyRef.current = true; setBusy(true); setError('');
    try { setSent((await api('/auth/password/forgot', { method: 'POST', body: { email: email.trim() } })).message); } catch (err) { setError(err.message); } finally { busyRef.current = false; setBusy(false); }
  };

  const back = <Link to="/login" state={{ email }} className="btn btn-ghost">Back to sign in</Link>;
  if (sent) {
    return (
      <AuthShell title="Check your email" aside={back}>
        <div role="status"><AuthTitle lede={sent}>Check your email</AuthTitle></div>
        {error && <div className="mt-4"><Notice>{error}</Notice></div>}
        <p className="t-small mt-3">The link works once and expires in an hour.</p>
        <button type="button" className="btn btn-secondary mt-6 w-full" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send another link'}</button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Reset your password" aside={back}>
      <form onSubmit={send} noValidate>
        <AuthTitle lede="Enter the email you signed up with and we’ll send a link to choose a new password.">Reset your password</AuthTitle>
        <div className="mt-6">
          {error && <Notice>{error}</Notice>}
          <AuthField label="Email" id={id} error={fieldError}>
            <input ref={inputRef} id={id} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
              aria-invalid={fieldError ? true : undefined} aria-describedby={describedBy(id, { error: fieldError })} onChange={(e) => { setEmail(e.target.value); setFieldError(''); setError(''); }} />
          </AuthField>
        </div>
        <button className="btn btn-primary mt-5 w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
    </AuthShell>
  );
}
