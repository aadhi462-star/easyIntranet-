// Certificate verification (board S5Certificate, decision D8). Public: no sign-in needed, so
// anyone handed a code can check it. Shows only name, course, community, date and code; never an
// email, profile, scores or other courses. "Print or save as PDF" uses the browser's own print.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { errorText } from '../lib/communities.js';
import { toast } from '../lib/toast.js';
import { PublicFooter, PublicHeader, usePageTitle } from '../components/public/PublicChrome.jsx';
import { LogoMark } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';

const longDate = (at) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const CODE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;
const tidy = (v) => { const c = v.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : v.trim().toUpperCase(); };

export default function Verify() {
  const { code } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState({ state: code ? 'loading' : 'idle' });
  const [text, setText] = useState('');
  usePageTitle('Verify a certificate');
  useEffect(() => {
    if (!code) { setS({ state: 'idle' }); return; }
    setS({ state: 'loading' });
    api(`/certificates/${encodeURIComponent(code)}`)
      .then((d) => setS({ state: 'ready', cert: d.certificate }))
      .catch((e) => setS({ state: e.status === 404 ? 'missing' : 'error', message: errorText(e) }));
  }, [code]);
  const check = (e) => {
    e.preventDefault();
    if (!CODE.test(text.trim())) { setS({ state: 'missing' }); return; }
    nav(`/verify/${tidy(text)}`); setText('');
  };
  const link = typeof window !== 'undefined' ? `${location.origin}${location.pathname}#/verify/${code}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('Verification link copied'); } catch { toast('Couldn’t copy. Copy it from the address bar.', 'error'); } };

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-ink-950)]">
      <div className="print:hidden"><PublicHeader /></div>
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14">
        <div className="print:hidden">
          <h1 className="t-h1 text-white">Verify a certificate</h1>
          <p className="text-2 mt-2">Certificates from courses on CommunityOne each have a code. Enter one to check it.</p>
        </div>

        {s.state === 'loading' && <div aria-busy="true" aria-label="Checking the code" className="glass h-72 animate-pulse" />}
        {s.state === 'missing' && <p role="alert" className="glass p-5 text-sm text-amber-100">No certificate matches this code. Check it was typed exactly as printed, for example ABCD-2345.</p>}
        {s.state === 'error' && <p role="alert" className="glass p-5 text-sm text-rose-300">{s.message}</p>}
        {s.state === 'ready' && (
          <>
            <article aria-label="Certificate" className="relative overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-8 sm:p-12 print:border-black print:bg-white print:text-black">
              <div className="flex items-center gap-2"><LogoMark size={32} /><span className="font-bold text-white print:text-black">Community<span className="text-brand-300 print:text-black">One</span></span></div>
              <p className="t-label mt-8 print:text-black">Certificate of completion</p>
              <p className="text-2 mt-4 print:text-black">This certifies that</p>
              <p className="mt-1 text-[32px] font-bold leading-tight text-white print:text-black">{s.cert.name}</p>
              <p className="text-2 mt-3 print:text-black">completed</p>
              <p className="mt-1 text-2xl font-semibold text-white print:text-black">{s.cert.course}</p>
              <p className="text-2 mt-1 print:text-black">in {s.cert.community}</p>
              <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-[var(--az-divider)] pt-5 text-sm print:border-black">
                <div><dt className="t-small print:text-black">Issued</dt><dd className="text-white print:text-black">{longDate(s.cert.issuedAt)}</dd></div>
                <div><dt className="t-small print:text-black">Verification code</dt><dd className="font-mono text-white print:text-black">{s.cert.code}</dd></div>
              </dl>
            </article>
            <section aria-labelledby="ok-h" className="band flex flex-col gap-3 p-5 print:hidden">
              {s.cert.revoked
                ? <h2 id="ok-h" className="t-h3 flex items-center gap-2 text-amber-200"><Icon name="alert" size={18} />This certificate was withdrawn</h2>
                : <h2 id="ok-h" className="t-h3 flex items-center gap-2 text-brand-300"><Icon name="check" size={18} />Certificate verified</h2>}
              <p className="t-small">Shows only the name, course, community, date and code. No email, profile, scores or other courses.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" onClick={() => window.print()}><Icon name="download" size={16} />Print or save as PDF</button>
                <button className="btn btn-ghost" onClick={copy}><Icon name="link" size={16} />Copy verification link</button>
              </div>
            </section>
          </>
        )}

        <form onSubmit={check} className="flex flex-wrap items-end gap-2 print:hidden">
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 text-xs font-semibold text-slate-300">{code ? 'Check another code' : 'Verification code'}
            <input className="input font-mono uppercase" required placeholder="ABCD-2345" maxLength={9} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button className="btn btn-ghost">Check</button>
        </form>
        <p className="t-small print:hidden">Have an account? Your own certificates are in <Link to="/learning" className="text-brand-300 underline">My Learning</Link>.</p>
      </main>
      <div className="print:hidden"><PublicFooter /></div>
    </div>
  );
}
