// What the invited person sees at /invite/c/:token (v2 workstream F, F9; board V2FInvites "What
// the invited person sees"), signed in or out, in one column. GET /invitations/:token says who
// invited them to what while the link can be used, or why not (by error code). Signed out, the
// page shows nothing about the community and offers Sign in or Create account, which come
// straight back here (?next=). For another account, a forwarded link reveals nothing (VIS-09).
// Accepting re-checks everything on the server and opens the community.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { communityPath, errorText, refreshCommunity } from '../lib/communities.js';
import { useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { Icon } from '../components/icons.jsx';
import { Button, Skeleton } from '../components/ui/Controls.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';
import { CommunityTile, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import { roleLabel } from '../components/groups/MembershipAction.jsx';
import { dayText } from '../components/invitations/useInvitations.js';

// Error codes → the state the board draws for them.
const STATE_OF = {
  INVITE_EXPIRED: 'expired',
  INVITE_REVOKED: 'unusable', INVITE_USED: 'unusable', INVITE_INVALID: 'unusable',
  INVITER_NOT_ALLOWED: 'invalid', COMMUNITY_UNAVAILABLE: 'invalid', COMMUNITY_REMOVED: 'invalid', REMOVED_AFTER_INVITE: 'invalid', BLOCKED: 'invalid', ARCHIVED: 'invalid',
  WRONG_ACCOUNT: 'other',
};

const VIS_NOTE = {
  closed: 'Closed communities are hidden from search; only members see what’s inside.',
  private: 'Private communities show their name and description to everyone; only members see what’s inside.',
  public: 'Anyone can find this community and read what’s posted.',
};

export default function InvitationPage() {
  const { token } = useParams();
  const { me, dispatch } = useStore();
  const nav = useNavigate();
  const [s, setS] = useState({ state: 'loading' });
  const [busy, setBusy] = useState(null);
  const here = `/invite/c/${encodeURIComponent(token ?? '')}`;
  const signedIn = !!me;

  const load = useCallback(async () => {
    setS({ state: 'loading' });
    try {
      const { invitation } = await api(`/invitations/${encodeURIComponent(token)}`);
      if (!signedIn) setS({ state: 'signedOut' });
      else if (invitation.forYou === false) setS({ state: 'other', invitation });
      else setS({ state: 'valid', invitation });
    } catch (err) {
      const st = STATE_OF[err.code];
      setS(st ? { state: st, message: err.message } : { state: 'error', message: errorText(err) });
    }
  }, [token, signedIn]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = 'Invitation · CommunityOne'; }, []);

  const accept = async () => {
    setBusy('accept');
    try {
      const res = await api(`/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} });
      if (res.community?.id) await refreshCommunity(res.community.id, dispatch, { me: me.id }).catch(() => null);
      toast(`You joined ${res.community?.name ?? 'the community'}`);
      nav(res.community ? communityPath(res.community) : '/communities', { replace: true });
    } catch (err) {
      const st = STATE_OF[err.code];
      setS((prev) => (st ? { state: st, message: err.message, invitation: prev.invitation } : { ...prev, actionError: errorText(err) }));
      setBusy(null);
    }
  };
  const decline = async () => {
    const name = s.invitation?.community?.name ?? 'this community';
    const ok = await confirmAction({ title: `Decline the invitation to ${name}?`, body: 'The link stops working. An Admin can invite you again later.', confirm: 'Decline' });
    if (!ok) return;
    setBusy('decline');
    try {
      await api(`/invitations/${encodeURIComponent(token)}/decline`, { method: 'POST', body: {} });
      setS((prev) => ({ state: 'declined', invitation: prev.invitation }));
    } catch (err) {
      const st = STATE_OF[err.code];
      setS((prev) => (st ? { state: st, message: err.message, invitation: prev.invitation } : { ...prev, actionError: errorText(err) }));
    } finally { setBusy(null); }
  };
  const switchAccount = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (err) { if (err.status !== 401) { toast(errorText(err), 'error'); return; } }
    dispatch({ type: 'logout' });
    nav(`/login?next=${encodeURIComponent(here)}`);
  };

  const home = <Link to={signedIn ? '/home' : '/'} className="btn btn-secondary">Go to Home</Link>;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-8 sm:py-12">
      {s.state === 'loading' && <div className="panel p-6"><Skeleton lines={4} label="Loading the invitation" /></div>}

      {s.state === 'valid' && <Valid i={s.invitation} busy={busy} actionError={s.actionError} onAccept={accept} onDecline={decline} />}

      {s.state === 'signedOut' && (
        <Card icon="lock" title="Sign in to see your invitation">
          <p>Sign in, or create an account with the address the invitation was sent to. You come straight back here.</p>
          <Actions>
            <Link to={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary">Sign in</Link>
            <Link to={`/signup?next=${encodeURIComponent(here)}`} className="btn btn-secondary">Create account</Link>
          </Actions>
        </Card>
      )}

      {s.state === 'other' && (
        <Card icon="user" title="This invitation is for a different account">
          <p>{s.invitation?.sentTo ? `It was sent to ${s.invitation.sentTo}.` : 'It was sent to another account or email address.'} Sign in with that account to accept it.</p>
          <Actions><Button variant="primary" onClick={switchAccount}>Sign in with another account</Button>{home}</Actions>
        </Card>
      )}

      {s.state === 'expired' && (
        <Card icon="clock" title="This invitation has expired">
          <p>Invitations last 14 days. Ask the person who invited you, or another Admin of the community, to send you a new one.</p>
          <Actions>{home}</Actions>
        </Card>
      )}

      {s.state === 'unusable' && (
        <Card icon="ban" title="This invitation can’t be used">
          <p>It was withdrawn, or it has already been used. If you expected to join, ask an Admin of the community.</p>
          <Actions>{home}</Actions>
        </Card>
      )}

      {s.state === 'invalid' && (
        <Card icon="alert" title="This invitation is no longer valid">
          <p>The community isn’t accepting new members right now, or the person who invited you can no longer invite. Ask an Admin for a new invitation.</p>
          {s.message && <p className="t-small">{s.message}</p>}
          <Actions>{home}</Actions>
        </Card>
      )}

      {s.state === 'declined' && (
        <Card icon="check" title="Invitation declined">
          <p>You won’t join {s.invitation?.community?.name ?? 'the community'}. If you change your mind, ask an Admin to invite you again.</p>
          <Actions>{home}</Actions>
        </Card>
      )}

      {s.state === 'error' && (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span><strong>Couldn’t load the invitation.</strong> {s.message}</span>
          <Button size="sm" onClick={load}>Try again</Button>
        </div>
      )}
    </div>
  );
}

function Card({ icon, title, children }) {
  return (
    <section aria-labelledby="inv-h" className="panel flex flex-col gap-3 p-5 text-[15px] leading-6 text-[var(--az-text)] sm:p-6">
      <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[10px] bg-[var(--az-sunken)] text-[var(--az-text-2)]"><Icon name={icon} size={22} /></span>
      <h1 id="inv-h" className="t-h2">{title}</h1>
      {children}
    </section>
  );
}

const Actions = ({ children }) => <div className="mt-1 flex flex-wrap gap-2">{children}</div>;

function Valid({ i, busy, actionError, onAccept, onDecline }) {
  const c = i.community ?? {};
  return (
    <section aria-labelledby="inv-h" className="panel flex flex-col gap-4 p-5 text-[15px] leading-6 text-[var(--az-text)] sm:p-6">
      <div className="flex min-w-0 items-center gap-3">
        <CommunityTile c={{ id: c.id ?? c.name, name: c.name ?? '', accent: c.accent }} size={44} />
        <div className="min-w-0">
          <h1 id="inv-h" className="t-h2 break-words">{c.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {c.memberCount != null && <span className="t-small">{c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}</span>}
            {c.visibility && <VisibilityBadge visibility={c.visibility} />}
          </div>
        </div>
      </div>
      <p>
        {i.inviter?.name ? `${i.inviter.name} invited you${i.createdAt || i.sentAt ? ` on ${dayText(i.sentAt ?? i.createdAt)}` : ''}.` : 'You’re invited.'}
        {i.expiresAt && ` This invitation expires on ${dayText(i.expiresAt)}.`}
      </p>
      {i.message && <blockquote className="sunken whitespace-pre-line break-words p-4">{i.message}</blockquote>}
      {c.description && <p className="text-2">{c.description}</p>}
      {c.visibility && <p className="t-small">{VIS_NOTE[c.visibility]}</p>}
      <p className="notice notice-info">You join only if you accept. You’ll be {i.role === 'admin' ? 'an Admin' : `a ${roleLabel(i.role ?? 'member')}`}.</p>
      {actionError && <p role="alert" className="notice notice-bad">{actionError}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" busy={busy === 'accept'} disabled={!!busy} onClick={onAccept}>Accept and join</Button>
        <Button variant="secondary" busy={busy === 'decline'} disabled={!!busy} onClick={onDecline}>Decline</Button>
      </div>
    </section>
  );
}
