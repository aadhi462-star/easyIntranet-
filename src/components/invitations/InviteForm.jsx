// Invite people to a community (v2 workstream F, F9 and F10; board V2FInvites "Inviting"): by
// CommunityOne member, found with the directory search, or by email address, several at once,
// with an optional role and message. Sending never makes anyone a member: each person gets an
// invitation and joins only if they accept. The answer is one result per person, shown plainly.
// Used in Manage, Members, Invitations and in the header menu's Invite people dialog.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, newKey } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { Avatar } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Button, IconButton } from '../ui/Controls.jsx';
import { dayText } from './useInvitations.js';

const PER_SEND = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };
const ROLE_OPTIONS = [['member', 'Member'], ['moderator', 'Moderator'], ['admin', 'Admin']];
const PLURAL = { member: 'Members', moderator: 'Moderators', admin: 'Admins' };

/** Addresses typed with commas, semicolons, spaces or new lines → unique, lower-cased. */
export function parseEmails(text) {
  return [...new Set(String(text).split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Directory search (GET /directory?q=), a moment after typing stops. */
function usePeopleSearch(q) {
  const [s, setS] = useState({ status: 'idle', people: [] });
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setS({ status: 'idle', people: [] }); return undefined; }
    let live = true;
    setS((prev) => ({ ...prev, status: 'loading' }));
    const t = setTimeout(() => {
      api(`/directory?limit=8&q=${encodeURIComponent(text)}`)
        .then((d) => live && setS({ status: 'ready', people: d.people }))
        .catch((err) => live && setS({ status: 'error', people: [], message: errorText(err) }));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return s;
}

/**
 * `myRole`: the inviter's role here (roles below it can be offered). `members`: the community's
 * member rows with their state, to mark people already in or blocked. `invitations`: the list,
 * to mark people already invited. `onSent(results)` after a send.
 */
export default function InviteForm({ g, myRole, members = [], invitations = [], me, onSent, onCancel, idPrefix }) {
  const auto = useId();
  const id = idPrefix ?? auto;
  const [tab, setTab] = useState('members');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]); // [{ id, name }]
  const [emailText, setEmailText] = useState('');
  const [role, setRole] = useState('member');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { field?, message }
  const [results, setResults] = useState(null);
  const key = useRef(newKey());
  const search = usePeopleSearch(q);

  const stateOf = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m.state])), [members]);
  const openFor = useMemo(() => Object.fromEntries(invitations.filter((i) => i.status === 'open' && i.user).map((i) => [i.user.id, i])), [invitations]);
  const roles = ROLE_OPTIONS.filter(([r]) => RANK[r] < (RANK[myRole] ?? 0));
  const emails = parseEmails(emailText);
  const badEmail = emails.find((e) => !EMAIL_RE.test(e));
  const total = picked.length + emails.length;
  const tooMany = total > PER_SEND;
  const changed = () => { setError(null); key.current = newKey(); };

  const add = (p) => { changed(); setPicked((l) => (l.some((x) => x.id === p.id) ? l : [...l, { id: p.id, name: p.name }])); };
  const drop = (pid) => { changed(); setPicked((l) => l.filter((x) => x.id !== pid)); };

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!total) { setError({ message: 'Choose at least one person, or enter an email address.' }); return; }
    if (badEmail) { setTab('emails'); setError({ field: 'emails', message: `“${badEmail}” isn’t a complete email address.` }); return; }
    if (tooMany) { setError({ message: `Invite up to ${PER_SEND} people at a time. You have ${total}.` }); return; }
    setBusy(true); setError(null);
    try {
      const body = { role, ...(picked.length ? { userIds: picked.map((p) => p.id) } : {}), ...(emails.length ? { emails } : {}), ...(message.trim() ? { message: message.trim() } : {}) };
      const d = await api(`/communities/${encodeURIComponent(g.id)}/invitations`, { method: 'POST', body, idempotencyKey: key.current });
      const names = Object.fromEntries(picked.map((p) => [p.id, p.name]));
      const list = (d.results ?? []).map((r) => ({ ...r, label: r.userId ? (names[r.userId] ?? r.invitation?.user?.name ?? 'Someone') : r.email }));
      setResults(list);
      setPicked([]); setEmailText(''); setQ('');
      key.current = newKey();
      onSent?.(list);
    } catch (err) {
      setError({ field: err.code === 'INVALID_EMAIL' ? 'emails' : undefined, message: errorText(err) });
    } finally { setBusy(false); }
  };

  const tabBtn = (k, label) => (
    <button type="button" role="tab" id={`${id}-tab-${k}`} aria-selected={tab === k} aria-controls={`${id}-panel-${k}`} onClick={() => setTab(k)}
      className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-[15px] ${tab === k ? 'border-[var(--az-focus)] font-semibold text-[var(--az-text)]' : 'border-transparent text-[var(--az-text-2)] hover:text-[var(--az-text)]'}`}>
      {label}{k === 'members' && picked.length > 0 ? ` · ${picked.length}` : k === 'emails' && emails.length > 0 ? ` · ${emails.length}` : ''}
    </button>
  );

  const searchHint = `${id}-search-hint`;
  const emailHint = `${id}-email-hint`;
  const emailErr = `${id}-email-err`;
  const msgHint = `${id}-msg-hint`;
  const formErr = `${id}-err`;

  return (
    <form onSubmit={send} noValidate className="flex min-w-0 flex-col gap-4" aria-describedby={error && !error.field ? formErr : undefined}>
      <div role="tablist" aria-label="Invite by" className="flex flex-wrap gap-x-5 border-b border-[var(--az-hairline)]">
        {tabBtn('members', 'CommunityOne members')}
        {tabBtn('emails', 'Email addresses')}
      </div>

      <div role="tabpanel" id={`${id}-panel-members`} aria-labelledby={`${id}-tab-members`} hidden={tab !== 'members'} className="flex min-w-0 flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--az-text)]">Find people</span>
          <span className="relative block">
            <span aria-hidden="true" className="text-3 pointer-events-none absolute inset-y-0 left-3 flex items-center"><Icon name="search" size={16} /></span>
            <input className="input pl-9" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, department or year" aria-describedby={searchHint} autoComplete="off" />
          </span>
          <span id={searchHint} className="t-small">People in the CommunityOne directory. They get a notification and an email.</span>
        </label>
        {search.status === 'loading' && <p role="status" className="t-small">Searching…</p>}
        {search.status === 'error' && <p role="alert" className="notice notice-bad">{search.message}</p>}
        {search.status === 'ready' && (
          <ul aria-label="Search results" className="flex flex-col divide-y divide-[var(--az-divider)] rounded-xl border border-[var(--az-hairline)]">
            {search.people.filter((p) => p.id !== me?.id).length === 0 && <li className="t-small p-3">Nobody in the directory matches “{q.trim()}”. Try email addresses instead.</li>}
            {search.people.filter((p) => p.id !== me?.id).map((p) => {
              const state = stateOf[p.id];
              const inside = state === 'active' || state === 'restricted';
              const blocked = state === 'blocked';
              const open = openFor[p.id];
              const chosen = picked.some((x) => x.id === p.id);
              const detail = [p.department, p.batch].filter(Boolean).join(' · ');
              const why = inside ? 'Already a member' : blocked ? 'Blocked here. Unblock them in Members first.' : open ? `Already invited ${dayText(open.sentAt ?? open.createdAt)}. Resend instead.` : null;
              return (
                <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar user={{ name: p.name, hue: p.avatarHue ?? 160 }} size={36} />
                  <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                    <span className="truncate font-semibold text-[var(--az-text)]">{p.name}</span>
                    {detail && <span className="t-small truncate">{detail}</span>}
                    {why && <span className="t-small">{why}</span>}
                  </span>
                  {chosen
                    ? <Button size="sm" onClick={() => drop(p.id)} aria-label={`Remove ${p.name} from the list`}>Remove</Button>
                    : !why && <Button size="sm" variant="secondary" icon="plus" onClick={() => add(p)} aria-label={`Add ${p.name}`}>Add</Button>}
                </li>
              );
            })}
          </ul>
        )}
        {picked.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="t-label">To invite</span>
            <ul className="flex flex-wrap gap-2" aria-label="To invite">
              {picked.map((p) => (
                <li key={p.id} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[var(--az-control)] bg-[var(--az-surface)] pl-3.5 text-sm font-medium text-[var(--az-text)]">
                  {p.name}
                  <IconButton icon="x" size="sm" label={`Remove ${p.name}`} className="!min-h-9 !w-9 !border-transparent !bg-transparent" onClick={() => drop(p.id)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div role="tabpanel" id={`${id}-panel-emails`} aria-labelledby={`${id}-tab-emails`} hidden={tab !== 'emails'} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--az-text)]">Email addresses</span>
          <textarea className="input min-h-24" value={emailText} placeholder="name@example.com, name@example.com"
            onChange={(e) => { changed(); setEmailText(e.target.value); }}
            aria-invalid={error?.field === 'emails' || undefined} aria-describedby={`${emailHint}${error?.field === 'emails' ? ` ${emailErr}` : ''}`} />
          <span id={emailHint} className="t-small">Separate with commas or new lines. Up to {PER_SEND} at a time.</span>
          {error?.field === 'emails' && <span id={emailErr} role="alert" className="field-error">{error.message}</span>}
        </label>
        <p className="notice notice-info flex items-start gap-2.5"><Icon name="info" size={18} className="mt-0.5 text-[var(--az-info)]" />
          <span>If an address belongs to a CommunityOne account, that person also gets the invitation in Notifications. The invitation only works for that address.</span></p>
      </div>

      {roles.length > 1 && (
        <label className="flex flex-col gap-1.5 sm:max-w-xs">
          <span className="text-sm font-medium text-[var(--az-text)]">Join as</span>
          <select className="input" value={role} onChange={(e) => { changed(); setRole(e.target.value); }}>
            {roles.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--az-text)]">Message (optional)</span>
        <textarea className="input min-h-20" maxLength={500} value={message} onChange={(e) => { changed(); setMessage(e.target.value); }} aria-describedby={msgHint} />
        <span id={msgHint} className="t-small">Up to 500 characters, shown with the invitation.</span>
      </label>

      <p className="t-small">They join as {PLURAL[role]} once they accept{role === 'member' ? '; you can change roles after that' : ''}. Nobody joins until they accept. Invitations last 14 days.</p>

      {error && !error.field && <p id={formErr} role="alert" className="notice notice-bad">{error.message}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>{results ? 'Done' : 'Cancel'}</Button>}
        <Button type="submit" variant="primary" icon="inbox" busy={busy} disabled={!total || tooMany}>
          {total ? `Send ${total} ${total === 1 ? 'invitation' : 'invitations'}` : 'Send invitations'}
        </Button>
      </div>

      {results && <Results results={results} />}
    </form>
  );
}

/** One line per person: invited, already invited, or not invited and why. */
export function Results({ results }) {
  const sent = results.filter((r) => r.status === 'invited').length;
  return (
    <section aria-live="polite" aria-label="Invitation results" className="sunken flex flex-col gap-2 p-4">
      <p className="font-semibold text-[var(--az-text)]">{sent ? `${sent} ${sent === 1 ? 'invitation' : 'invitations'} sent` : 'No new invitations sent'}</p>
      <ul className="flex flex-col divide-y divide-[var(--az-divider)]">
        {results.map((r, n) => (
          <li key={`${r.userId ?? r.email}-${n}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="min-w-0 flex-[1_1_180px] break-words font-medium text-[var(--az-text)]">{r.label}</span>
            {r.status === 'invited' && <Badge tone="ok" icon="check">Invited</Badge>}
            {r.status === 'open' && <><Badge tone="info">Already invited</Badge><span className="t-small basis-full">Already invited {dayText(r.invitation?.sentAt ?? r.invitation?.createdAt)}. Resend instead.</span></>}
            {r.status === 'skipped' && <><Badge tone="warn">Not invited</Badge><span className="t-small basis-full">{r.message}</span></>}
          </li>
        ))}
      </ul>
    </section>
  );
}
