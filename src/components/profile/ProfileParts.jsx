// Pieces of the profile page (v2 D10, board V2DProfile). Everything shown comes from the server,
// which has already applied the owner's privacy choices, blocks and community access; nothing
// here works out what to hide.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { communityPath } from '../../lib/communities.js';
import { timeAgo, useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { Avatar, Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Button, IconButton, Skeleton } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { CommunityTile } from '../public/CommunityCards.jsx';

const enc = encodeURIComponent;
const ROLE = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', instructor: 'Instructor', teaching_assistant: 'Teaching assistant', member: 'Member' };
const hueOf = (id) => [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

/** A titled panel. */
export function Panel({ title, count, children, className = '', id }) {
  return (
    <section className={`panel min-w-0 p-5 ${className}`} aria-labelledby={id}>
      <h2 id={id} className="t-h3 flex items-center gap-2 text-[var(--az-text)]">{title}{count != null && <span className="t-small tabular-nums">{count}</span>}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** One message for every case (deleted, suspended, blocked you, not found), so nothing is revealed. */
export function Unavailable() {
  return (
    <div className="panel mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--az-sunken)] text-[var(--az-text-3)]"><Icon name="user" size={22} /></span>
      <h1 className="t-h2 mt-3 text-[var(--az-text)]">This profile isn’t available</h1>
      <p className="t-small mt-1">The person may have left CommunityOne or limited who can see them.</p>
      <Link to="/" className="btn btn-secondary mt-5">Back to Home</Link>
    </div>
  );
}

/** A small menu behind an icon button. `items`: [{ label, onSelect, danger }]. */
export function MoreMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    // The first item takes focus, so the menu works from the keyboard.
    ref.current?.querySelector('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton icon="more" label={label} variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-[var(--az-sunken)] focus:bg-[var(--az-sunken)] ${it.danger ? 'text-[var(--az-danger)]' : 'text-[var(--az-text)]'}`}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** GET a list once per `path`; `reload` asks again. */
export function useLoad(path) {
  const [s, setS] = useState({ status: 'loading', data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setS((prev) => ({ ...prev, status: 'loading' }));
    api(path).then((data) => live && setS({ status: 'ready', data })).catch((err) => live && setS({ status: 'error', data: null, message: err.message }));
    return () => { live = false; };
  }, [path, tick]);
  return { ...s, reload: () => setTick((n) => n + 1) };
}

function LoadError({ message, onRetry }) {
  return (
    <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
      <span className="flex-1">{message || 'This didn’t load.'}</span>
      <Button size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function CommunityRow({ c, own }) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-1.5">
      <CommunityTile c={c} size={32} />
      <Link to={communityPath(c)} className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--az-text)] hit hover:underline">{c.name}</Link>
      {own && c.visibility !== 'public' && <Badge icon={c.visibility === 'closed' ? 'eyeoff' : 'lock'}>{c.visibility === 'closed' ? 'Closed' : 'Private'}</Badge>}
      <span className="t-small shrink-0">{ROLE[c.role] ?? 'Member'}</span>
    </li>
  );
}

/**
 * Communities on a profile (GET /profiles/:id/communities): shared ones first, then the person's
 * Public ones. `limit` shows the first few with a link to the full tab.
 */
export function Communities({ state, own, firstName, limit, onAll }) {
  if (state.status === 'loading' && !state.data) return <Skeleton lines={3} label="Loading communities" />;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={state.reload} />;
  const list = state.data?.communities ?? [];
  if (!list.length) return <p className="t-small">{own ? 'You haven’t joined a community yet.' : `No communities to show. You see only the ones you share with ${firstName} and ${firstName}’s Public ones.`}</p>;
  const cut = (xs) => (limit ? xs.slice(0, limit) : xs);
  const more = limit && list.length > limit;
  if (own) {
    const quiet = list.filter((c) => c.visibility !== 'public').map((c) => c.name);
    return (
      <>
        <ul className="divide-y divide-[var(--az-hairline)]">{cut(list).map((c) => <CommunityRow key={c.id} c={c} own />)}</ul>
        {more && <button type="button" className="link mt-2 text-sm" onClick={onAll}>All {list.length} communities</button>}
        <p className="t-small mt-3">Others see only the communities they share with you, plus your Public ones.
          {quiet.length > 0 && ` ${listNames(quiet)} ${quiet.length === 1 ? 'isn’t' : 'aren’t'} Public, so people outside ${quiet.length === 1 ? 'it' : 'them'} never see ${quiet.length === 1 ? 'it' : 'them'} here.`}</p>
      </>
    );
  }
  const shared = list.filter((c) => c.shared);
  const others = list.filter((c) => !c.shared);
  const shownShared = cut(shared);
  const shownOthers = limit ? others.slice(0, Math.max(0, limit - shownShared.length)) : others;
  return (
    <>
      {shownShared.length > 0 && <><h3 className="t-label mt-1">In common</h3><ul className="divide-y divide-[var(--az-hairline)]">{shownShared.map((c) => <CommunityRow key={c.id} c={c} />)}</ul></>}
      {shownOthers.length > 0 && <><h3 className={`t-label ${shownShared.length ? 'mt-4' : 'mt-1'}`}>Public communities</h3><ul className="divide-y divide-[var(--az-hairline)]">{shownOthers.map((c) => <CommunityRow key={c.id} c={c} />)}</ul></>}
      {more && <button type="button" className="link mt-2 text-sm" onClick={onAll}>All {list.length} communities</button>}
    </>
  );
}
const listNames = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

const TYPE = { announcement: ['info', 'Announcement'], question: ['neutral', 'Question'], poll: ['neutral', 'Poll'] };

/** That person's posts you can read (GET /profiles/:id/posts), 20 at a time. */
export function Posts({ id, as, own, firstName }) {
  const base = `/profiles/${enc(id)}/posts${as ? `?as=${as}` : ''}`;
  const [s, setS] = useState({ status: 'loading', posts: [], next: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setS({ status: 'loading', posts: [], next: null });
    api(base).then((r) => live && setS({ status: 'ready', posts: r.posts, next: r.next }))
      .catch((err) => live && setS({ status: 'error', posts: [], next: null, message: err.message }));
    return () => { live = false; };
  }, [base, tick]);
  const more = async () => {
    setS((x) => ({ ...x, status: 'more' }));
    try {
      const r = await api(`${base}${as ? '&' : '?'}before=${enc(s.next)}`);
      setS((x) => ({ status: 'ready', posts: [...x.posts, ...r.posts], next: r.next }));
    } catch (err) { toast(err.message, 'error'); setS((x) => ({ ...x, status: 'ready' })); }
  };
  if (s.status === 'loading') return <div className="panel p-5"><Skeleton lines={4} label="Loading posts" /></div>;
  if (s.status === 'error') return <LoadError message={s.message} onRetry={() => setTick((n) => n + 1)} />;
  if (!s.posts.length) {
    return (
      <div className="panel p-8 text-center">
        <p className="t-h3 text-[var(--az-text)]">{own && !as ? 'You haven’t posted yet' : 'No posts to show'}</p>
        <p className="t-small mt-1">{own && !as ? 'Your posts in your communities appear here.' : `Only posts in communities you can read are shown${firstName ? `, so some of ${firstName}’s may not appear` : ''}.`}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {s.posts.map((p) => (
          <li key={p.id} className="panel p-4">
            <div className="t-small flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to={communityPath(p.community)} className="font-semibold text-[var(--az-text-2)] hit hover:underline">{p.community.name}</Link>
              <span aria-hidden="true">·</span>
              <time dateTime={p.publishedAt}>{timeAgo(Date.parse(p.publishedAt))}</time>
              {TYPE[p.type] && <Badge tone={TYPE[p.type][0]}>{TYPE[p.type][1]}</Badge>}
            </div>
            <Link to={`/post/${enc(p.id)}`} className="mt-2 block whitespace-pre-line text-sm leading-6 text-[var(--az-text)] hover:underline">{p.excerpt}</Link>
          </li>
        ))}
      </ul>
      {s.next && <Button className="w-full" busy={s.status === 'more'} onClick={more}>Show more posts</Button>}
    </div>
  );
}

/** Your connections: requests first, then connections A to Z (existing /connections routes). */
export function Connections() {
  const { user } = useStore();
  const s = useLoad('/connections');
  const [busy, setBusy] = useState('');
  const run = async (key, path, method, done) => {
    setBusy(key);
    try { await api(path, { method }); toast(done); s.reload(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(''); }
  };
  if (s.status === 'loading' && !s.data) return <div className="panel p-5"><Skeleton lines={4} label="Loading connections" /></div>;
  if (s.status === 'error') return <LoadError message={s.message} onRetry={s.reload} />;
  const { incoming = [], outgoing = [], connected = [] } = s.data ?? {};
  const az = [...connected].sort((a, b) => a.name.localeCompare(b.name));
  const who = (p) => user(p.id) ?? { id: p.id, name: p.name, hue: hueOf(p.id) };
  const row = (p, note, actions) => (
    <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
      <Avatar user={who(p)} size={40} />
      <span className="min-w-0 flex-1">
        <Link to={`/people/${enc(p.id)}`} className="block truncate text-sm font-semibold text-[var(--az-text)] hit hover:underline">{p.name}</Link>
        <span className="t-small block truncate">{[who(p).title, note].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="flex gap-2">{actions}</span>
    </li>
  );
  const base = (id) => `/connections/${enc(id)}`;
  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <Panel title="Requests" count={incoming.length} id="conn-requests">
          <ul className="divide-y divide-[var(--az-hairline)]">
            {incoming.map((p) => row(p, 'wants to connect', (
              <>
                <Button size="sm" variant="primary" busy={busy === `a${p.id}`} onClick={() => run(`a${p.id}`, `${base(p.id)}/accept`, 'POST', `You’re connected with ${p.name}`)}>Accept</Button>
                <Button size="sm" busy={busy === `d${p.id}`} onClick={() => run(`d${p.id}`, `${base(p.id)}/decline`, 'POST', 'Request ignored')}>Ignore</Button>
              </>
            )))}
          </ul>
        </Panel>
      )}
      {outgoing.length > 0 && (
        <Panel title="Sent requests" count={outgoing.length} id="conn-sent">
          <ul className="divide-y divide-[var(--az-hairline)]">
            {outgoing.map((p) => row(p, 'request sent', (
              <Button size="sm" variant="ghost" busy={busy === `c${p.id}`} onClick={() => run(`c${p.id}`, base(p.id), 'DELETE', 'Request cancelled')}>Cancel request</Button>
            )))}
          </ul>
        </Panel>
      )}
      <Panel title="Connections" count={az.length} id="conn-list">
        {az.length ? (
          <ul className="divide-y divide-[var(--az-hairline)]">
            {az.map((p) => row(p, 'connected', (
              <MoreMenu label={`More actions for ${p.name}`} items={[{ label: 'Remove connection', danger: true, onSelect: async () => {
                  if (await confirmAction({ title: `Remove ${p.name} from your connections?`, body: 'You can connect again later. They aren’t told.', confirm: 'Remove' })) run(`r${p.id}`, base(p.id), 'DELETE', 'Connection removed');
                } }]} />
            )))}
          </ul>
        ) : <p className="t-small">No connections yet. Connect with people from their profiles.</p>}
      </Panel>
    </div>
  );
}

const CONTACT = [['everyone', 'Everyone signed in'], ['connections', 'Only my connections'], ['nobody', 'Only me']];

/** Privacy, saved as you change it (PATCH /profiles/me with the profile's version). */
export function Privacy({ profile, onSaved }) {
  const [s, setS] = useState({ status: 'idle' });
  const save = async (patch) => {
    setS({ status: 'saving' });
    try {
      const r = await api('/profiles/me', { method: 'PATCH', body: { version: profile.version, ...patch } });
      onSaved(r.profile);
      setS({ status: 'saved' });
    } catch (err) {
      setS({ status: err.code === 'STALE_VERSION' ? 'stale' : 'error', message: err.message });
    }
  };
  const listed = !!profile.directoryVisible;
  return (
    <Panel title="Privacy" id="privacy-h">
      <label htmlFor="privacy-contact" className="block text-sm font-semibold text-[var(--az-text)]">Who can see my email, birthday and LinkedIn</label>
      <select id="privacy-contact" className="input mt-1.5" value={profile.contactVisibility ?? 'everyone'} disabled={s.status === 'saving'} aria-describedby="privacy-contact-hint"
        onChange={(e) => save({ contactVisibility: e.target.value })}>
        {CONTACT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <p id="privacy-contact-hint" className="t-small mt-1">Your name, headline and city are always visible to signed-in members.</p>
      <div className="mt-4 flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span id="privacy-listed" className="block text-sm font-semibold text-[var(--az-text)]">List me in member directories</span>
          <span id="privacy-listed-hint" className="t-small block">Off: you won’t appear in Members tabs or people search. Your posts still show your name.</span>
        </span>
        <button type="button" role="switch" aria-checked={listed} aria-labelledby="privacy-listed" aria-describedby="privacy-listed-hint" disabled={s.status === 'saving'}
          onClick={() => save({ directoryVisible: !listed })}
          style={listed ? { backgroundImage: 'var(--az-fill)' } : undefined}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${listed ? 'border-transparent' : 'border-[var(--az-control)] bg-[var(--az-sunken)]'}`}>
          <span aria-hidden="true" className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-[var(--az-surface)] shadow transition-[left] ${listed ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      <div className="mt-3 min-h-6" role="status" aria-live="polite">
        {s.status === 'saving' && <span className="t-small">Saving…</span>}
        {s.status === 'saved' && <span className="t-small inline-flex items-center gap-1 text-[var(--az-ok)]"><Icon name="check" size={14} />Saved</span>}
      </div>
      {s.status === 'stale' && (
        <div role="alert" className="notice notice-warn mt-2 flex flex-wrap items-center gap-3">
          <span className="flex-1">Your profile changed in another tab or device, so this wasn’t saved. Reload to see the latest, then change it again.</span>
          <Button size="sm" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}
      {s.status === 'error' && <p role="alert" className="notice notice-bad mt-2">{s.message}</p>}
    </Panel>
  );
}

/** Download my data: POST /account/export after the password (USR-08). */
export function YourData() {
  const [open, setOpen] = useState(false);
  return (
    <Panel title="Your data" id="data-h">
      <p className="text-sm text-[var(--az-text-2)]">Your account, profile, sign-ins and activity as one file. You’ll be asked for your password first.</p>
      <Button className="mt-3" icon="download" onClick={() => setOpen(true)}>Download my data</Button>
      {open && <ExportDialog onClose={() => setOpen(false)} />}
    </Panel>
  );
}

function ExportDialog({ onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/account/export', { method: 'POST', body: { password } });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `communityone-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Your data is downloading');
      onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Download my data" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-[var(--az-text-2)]">Enter your password to confirm it’s you. The download is recorded in your activity.</p>
        <label htmlFor="export-password" className="mt-4 block text-sm font-semibold text-[var(--az-text)]">Password</label>
        <input id="export-password" className="input mt-1.5" type="password" autoComplete="current-password" value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'export-password-error' : undefined} />
        {error && <p id="export-password-error" role="alert" className="field-error">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon="download" busy={busy}>Download</Button>
        </div>
      </form>
    </Modal>
  );
}
