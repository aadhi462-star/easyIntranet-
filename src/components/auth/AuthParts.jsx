// The parts every sign-in screen shares (v2 workstream C, board V2CAuth): one centred card under
// a slim header, with the footer links below it (C6); labelled fields; a password field with
// Show (C12); notices; and the "Send a new link" form for links that didn't work (C8).
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Logo } from '../ui.jsx';

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
const FOOTER = [['/about', 'About'], ['/help', 'Help and Support'], ['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/contact', 'Contact']];

/** Sign in / Create account switch at the top of the card (C4). */
function AuthTabs({ mode }) {
  const { search } = useLocation();
  const tab = (to, id, label) => (
    <Link to={`${to}${search}`} aria-current={mode === id ? 'page' : undefined}
      className={`grid min-h-11 flex-1 place-items-center rounded-lg text-sm font-semibold ${mode === id ? 'bg-[var(--az-surface)] text-[var(--az-text)] shadow-[0_1px_2px_rgba(23,33,31,.12)]' : 'text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Sign in or create an account" className="mb-6 flex gap-1 rounded-xl bg-[var(--az-sunken)] p-1">
      {tab('/login', 'login', 'Sign in')}
      {tab('/signup', 'signup', 'Create account')}
    </nav>
  );
}

/**
 * Sign-in layout: slim header, one card up to 440 px, footer links. `mode` adds the Sign in /
 * Create account switch; `aside` replaces the header's Explore link (Forgot password uses it).
 */
export function AuthShell({ title, mode, aside, children }) {
  useEffect(() => { document.title = title ? `${title} · CommunityOne` : 'CommunityOne'; }, [title]);
  return (
    <div className="flex min-h-full flex-col bg-[var(--az-page)] text-[var(--az-text)]">
      <header className="border-b border-[var(--az-hairline)] bg-[var(--az-surface)]">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
          <Link to="/" aria-label="CommunityOne home" className="rounded-lg"><Logo size={32} /></Link>
          {aside ?? (
            <Link to="/explore" className="btn btn-ghost">
              <span className="sm:hidden">Explore</span><span className="max-sm:hidden">Explore Communities</span>
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
        <div className="panel w-full max-w-[440px] p-6 sm:p-8">
          {mode && <AuthTabs mode={mode} />}
          {children}
        </div>
        <nav aria-label="Footer" className="mt-6 flex max-w-[440px] flex-wrap justify-center gap-x-4">
          {FOOTER.map(([to, label]) => <Link key={to} to={to} className="inline-flex min-h-11 items-center text-sm text-[var(--az-text-2)] hover:text-[var(--az-text)]">{label}</Link>)}
        </nav>
      </main>
    </div>
  );
}

export function AuthTitle({ children, lede }) {
  return (
    <>
      <h1 className="t-h2">{children}</h1>
      {lede && <p className="mt-2 text-[15px] leading-6 text-[var(--az-text-2)]">{lede}</p>}
    </>
  );
}

/** A labelled field. `extra` sits at the end of the label row (Forgot your password?). */
export function AuthField({ label, id, error, hint, extra, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {extra}
      </div>
      {children}
      {hint && <p id={`${id}-hint`} className="t-small mt-1.5">{hint}</p>}
      {error && <div id={`${id}-error`} className="field-error">{error}</div>}
    </div>
  );
}

/** Describes a field by its hint and error, for aria-describedby. */
export const describedBy = (id, { hint, error } = {}) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

/** One password field with Show (C12). */
export function PasswordField({ id, label = 'Password', value, onChange, autoComplete, hint, error, extra, inputRef }) {
  const [shown, setShown] = useState(false);
  return (
    <AuthField label={label} id={id} hint={hint} error={error} extra={extra}>
      <div className="relative">
        <input ref={inputRef} id={id} className="input !pr-20" type={shown ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange}
          aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, { hint, error })} />
        <button type="button" className="btn btn-ghost btn-sm absolute right-1.5 top-1/2 -translate-y-1/2" aria-pressed={shown} aria-controls={id}
          onClick={() => setShown(!shown)}>
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </AuthField>
  );
}

/** A message above the fields. `tone` is bad, warn, ok or info. */
export function Notice({ tone = 'bad', title, children, role = tone === 'bad' ? 'alert' : 'status' }) {
  return (
    <div role={role} className={`notice notice-${tone} mb-5`}>
      {title && <strong className="font-semibold">{title} </strong>}{children}
    </div>
  );
}

/** GET /auth/registration: whether sign-ups are open, domain limits, and the development mailbox (C11). */
export function useRegistration() {
  const [reg, setReg] = useState(null);
  useEffect(() => { api('/auth/registration').then(setReg, () => setReg({ open: true })); }, []);
  return reg;
}

/**
 * Asks for an email and sends a new link (C8): the confirmation link (`/auth/verify/resend`) or
 * the reset link (`/auth/password/forgot`). The reply is the same for every address.
 */
export function SendLinkForm({ route, title, lede, sentNote, initialEmail = '', footer }) {
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef(null);
  const send = async (e) => {
    e?.preventDefault();
    if (busyRef.current) return;
    if (!EMAIL_RE.test(email.trim())) { setError('Enter the email you signed up with.'); inputRef.current?.focus(); return; }
    busyRef.current = true; setBusy(true); setError('');
    try { setSent((await api(route, { method: 'POST', body: { email: email.trim() } })).message); } catch (err) { setError(err.message); } finally { busyRef.current = false; setBusy(false); }
  };
  if (sent) {
    return (
      <div>
        <AuthTitle lede={sent}>Check your email</AuthTitle>
        <p role="status" className="t-small mt-3">{sentNote}</p>
        <Link to="/login" className="btn btn-primary mt-6 w-full">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={send} noValidate>
      <AuthTitle lede={lede}>{title}</AuthTitle>
      <div className="mt-6">
        <AuthField label="Email" id={id} error={error}>
          <input ref={inputRef} id={id} className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email}
            aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, { error })} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
        </AuthField>
      </div>
      <button className="btn btn-primary mt-5 w-full" disabled={busy}>{busy ? 'Sending…' : 'Send a new link'}</button>
      {footer && <p className="mt-5 text-center text-sm text-[var(--az-text-2)]">{footer}</p>}
    </form>
  );
}
