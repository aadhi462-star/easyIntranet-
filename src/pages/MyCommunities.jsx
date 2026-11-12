// My Communities (v2 workstream D, D8): only real memberships. Needs you (your open invitations,
// then your pending requests), Managing (Owner, Admin, Moderator, Instructor, Teaching Assistant)
// and Member, each row with your role in that community (PER-01), its status, visibility and
// members, Open and a menu with Leave. An Owner's Leave is disabled with the reason (MEM-09).
// Left and removed communities are not listed. Creating a community has its own page (F1):
// Create Community opens /communities/new, and an old ?new=1 link (/groups?new=1 lands here)
// is sent there too. Invitations offer Accept and Decline (F9).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { toast } from '../lib/toast.js';
import { communityApi, communityPath, errorText, onCommunityChange } from '../lib/communities.js';
import { useChannelSync, useCommunityWrite } from '../components/groups/useCommunity.js';
import { Icon } from '../components/icons.jsx';
import { Badge, Button, IconButton } from '../components/ui/Controls.jsx';
import { confirmAction } from '../components/ui/Confirm.jsx';
import { CommunityTile, NoCommunities, VisibilityBadge } from '../components/public/CommunityCards.jsx';
import MembershipAction, { roleLabel, shortDate } from '../components/groups/MembershipAction.jsx';

const MANAGING = ['owner', 'admin', 'moderator', 'instructor', 'teaching_assistant'];
const CAN_MANAGE = ['owner', 'admin', 'moderator'];
const VIS_LABEL = { public: 'Public', private: 'Private', closed: 'Closed' };
const COME_BACK = {
  public: 'It’s Public, so you can join again at any time.',
  private: 'It’s Private, so you’ll need to ask again to come back.',
  closed: 'It’s Closed, so you’ll need a new invitation to come back.',
};

/** Your communities (GET /communities) and open invitations (GET /me/invitations). */
function useMine() {
  const [s, setS] = useState({ status: 'loading', communities: [], invitations: [] });
  const load = useCallback(async () => {
    const [list, inv] = await Promise.allSettled([api('/communities'), api('/me/invitations')]);
    if (list.status === 'rejected') {
      setS((prev) => ({ ...prev, status: prev.status === 'ready' ? 'ready' : 'error', message: errorText(list.reason) }));
      return;
    }
    setS({ status: 'ready', communities: list.value.communities, invitations: inv.status === 'fulfilled' ? inv.value.invitations : [] });
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => onCommunityChange(() => { load(); }), [load]);
  const retry = () => { setS((prev) => ({ ...prev, status: 'loading' })); load(); };
  return { ...s, load, retry };
}

export default function MyCommunities() {
  const { can } = useStore();
  const [params] = useSearchParams();
  const allowed = can('group.create');
  const { status, communities, invitations, message, load, retry } = useMine();

  useEffect(() => { document.title = 'My Communities · CommunityOne'; }, []);
  if (params.get('new') === '1' && allowed) return <Navigate to="/communities/new" replace />;

  const byName = (a, b) => a.name.localeCompare(b.name);
  const member = communities.filter((c) => ['active', 'restricted'].includes(c.membership?.state));
  const managing = member.filter((c) => c.membership.state === 'active' && MANAGING.includes(c.membership.role)).sort(byName);
  const belonging = member.filter((c) => !managing.includes(c)).sort(byName);
  const pending = communities.filter((c) => c.membership?.state === 'pending').sort(byName);
  // A request and an invitation to the same community show once, as the invitation (MEM-13).
  const invited = new Set(invitations.map((i) => i.community.name));
  const requests = pending.filter((c) => !invited.has(c.name));
  const needs = invitations.length + requests.length;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">My Communities</h1>
          <p className="mt-1 text-[var(--az-text-2)]">Communities you belong to or manage. Only you see this list.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed && <Link to="/communities/new" className="btn btn-primary"><Icon name="plus" size={18} />Create Community</Link>}
          <Link to="/explore" className="btn btn-secondary"><Icon name="explore" size={18} />Explore</Link>
        </div>
      </header>

      {status === 'loading' ? <RowSkeletons />
        : status === 'error' ? (
          <div role="alert" className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div><p className="font-semibold">Couldn’t load your communities</p><p className="t-small">{message}</p></div>
            <Button onClick={retry}>Try again</Button>
          </div>
        ) : !member.length && !needs ? (
          <NoCommunities title="You haven’t joined any communities yet">
            <p>Nothing is joined for you. Find ones that fit, or start your own.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/explore" className="btn btn-primary">Explore communities</Link>
              {allowed && <Link to="/communities/new" className="btn btn-secondary">Create Community</Link>}
            </div>
          </NoCommunities>
        ) : (
          <>
            {needs > 0 && (
              <Section title="Needs you" count={needs}>
                <ul className="panel divide-y divide-[var(--az-divider)]">
                  {invitations.map((i) => <InvitationRow key={i.id} i={i} onDone={load} />)}
                  {requests.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                      <CommunityTile c={c} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="t-small">You asked to join · {VIS_LABEL[c.visibility]} · its admins decide</p>
                      </div>
                      <Badge tone="info">Request pending</Badge>
                      <MembershipAction c={c} onChange={load} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {managing.length > 0 && <Section title="Managing" count={managing.length}><Rows list={managing} onDone={load} /></Section>}
            {belonging.length > 0 && <Section title="Member" count={belonging.length}><Rows list={belonging} onDone={load} /></Section>}
          </>
        )}
    </div>
  );
}

function Section({ title, count, children }) {
  const id = `mc-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="t-h2">{title} <span className="font-normal text-[var(--az-text-2)]">{count}</span></h2>
      {children}
    </section>
  );
}

function InvitationRow({ i, onDone }) {
  const { refresh } = useCommunityWrite();
  const [busy, setBusy] = useState(null); // 'accept' | 'decline'
  const accept = async () => {
    setBusy('accept');
    try {
      const res = await api(`/me/invitations/${encodeURIComponent(i.id)}/accept`, { method: 'POST', body: {} });
      toast(`You joined ${res.community?.name ?? i.community.name}`);
      if (res.community?.id) await refresh(res.community.id);
    } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(null); await onDone(); }
  };
  // Declining is recorded and safe to repeat; the inviter sees it, and they can invite again.
  const decline = async () => {
    setBusy('decline');
    try {
      await api(`/me/invitations/${encodeURIComponent(i.id)}/decline`, { method: 'POST', body: {} });
      toast(`Invitation to ${i.community.name} declined`);
    } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(null); await onDone(); }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <CommunityTile c={{ id: i.id, name: i.community.name }} size={40} />
      <div className="min-w-0 flex-[1_1_220px]">
        <p className="truncate font-semibold">{i.community.name}</p>
        <p className="t-small">
          {[i.inviter?.name ? `Invitation from ${i.inviter.name}` : 'Invitation', VIS_LABEL[i.community.visibility], `Expires ${shortDate(i.expiresAt)}`].filter(Boolean).join(' · ')}
          {i.role && i.role !== 'member' ? ` · as ${roleLabel(i.role)}` : ''}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" busy={busy === 'accept'} disabled={!!busy} onClick={accept} aria-label={`Accept invitation to ${i.community.name}`}>Accept</Button>
        <Button variant="secondary" size="sm" busy={busy === 'decline'} disabled={!!busy} onClick={decline} aria-label={`Decline invitation to ${i.community.name}`}>Decline</Button>
      </div>
    </li>
  );
}

function statusOf(c) {
  if (c.status === 'archived') return ['Community archived', 'Read only', 'neutral'];
  if (c.membership.state === 'restricted') return ['Restricted', 'You can read, not post', 'warn'];
  return ['Active', null, 'ok'];
}

const HEAD = ['Community', 'Your role', 'Status', 'Visibility', 'Members', 'Actions'];
const GRID = 'md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.7fr)_auto] md:items-center md:gap-4';

function Rows({ list, onDone }) {
  return (
    <div className="panel">
      <div aria-hidden="true" className={`hidden border-b border-[var(--az-hairline)] px-4 py-2.5 ${GRID}`}>
        {HEAD.map((h, n) => <span key={h} className={`t-label ${n === HEAD.length - 1 ? 'text-right' : ''}`}>{h}</span>)}
      </div>
      <ul className="divide-y divide-[var(--az-divider)]">
        {list.map((c) => <Row key={c.id} c={c} onDone={onDone} />)}
      </ul>
    </div>
  );
}

// One community: a row of columns from 768 px, a labelled block below that.
function Row({ c, onDone }) {
  const [label, note, tone] = statusOf(c);
  const role = c.membership.state === 'active' ? c.membership.role : 'member';
  const cell = (name, children, extra = '') => (
    <div className={`flex items-baseline gap-3 py-1 md:block md:py-0 ${extra}`}>
      <span className="t-small w-24 shrink-0 md:sr-only">{name}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
  return (
    <li className={`px-4 py-3 ${GRID}`}>
      <div className="flex min-w-0 items-center gap-3 pb-2 md:pb-0">
        <CommunityTile c={c} size={36} />
        <Link to={communityPath(c)} className="truncate font-semibold hit hover:underline">{c.name}</Link>
      </div>
      {cell('Your role', roleLabel(role))}
      {cell('Status', <><Badge tone={tone}>{label}</Badge>{note && <span className="t-small mt-0.5 block">{note}</span>}</>)}
      {cell('Visibility', <VisibilityBadge visibility={c.visibility} />)}
      {cell('Members', <span className="tabular-nums">{c.memberCount ?? 0}</span>)}
      <div className="flex items-center gap-2 pt-2 md:justify-end md:pt-0">
        {CAN_MANAGE.includes(role) && <Link to={communityPath(c, 'manage')} className="btn btn-ghost btn-sm">Manage</Link>}
        <Link to={communityPath(c)} className="btn btn-secondary btn-sm" aria-label={`Open ${c.name}`}>Open</Link>
        <RowMenu c={c} role={role} onDone={onDone} />
      </div>
    </li>
  );
}

function RowMenu({ c, role, onDone }) {
  const { me } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const owner = role === 'owner';
  const leave = async () => {
    setOpen(false);
    if (!(await confirmAction({ title: `Leave ${c.name}?`, body: COME_BACK[c.visibility] }))) return;
    const res = await run(c.id, () => communityApi.leave(c.id), { ok: `You left ${c.name}` });
    if (res) channels.drop(c.id, me.id);
    await onDone();
  };
  const item = 'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-[var(--az-text)] hover:bg-[var(--az-sunken)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';
  return (
    <div ref={ref} className="relative">
      <IconButton icon="more" size="sm" label={`More for ${c.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      {open && (
        <div role="menu" aria-label={c.name} className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-[var(--az-hairline)] bg-[var(--az-surface)] p-1.5 shadow-[var(--az-shadow)]">
          <Link role="menuitem" className={item} to="/notifications?settings=1" onClick={() => setOpen(false)}>
            <Icon name="bell" size={18} className="text-[var(--az-text-2)]" />Notification settings
          </Link>
          <button type="button" role="menuitem" className={item} disabled={owner} aria-describedby={owner ? `own-${c.id}` : undefined} onClick={leave}>
            <Icon name="logout" size={18} className="text-[var(--az-text-2)]" />Leave community
          </button>
          {owner && <p id={`own-${c.id}`} className="t-small px-3 pb-1.5">Transfer ownership first, in Manage, Members.</p>}
        </div>
      )}
    </div>
  );
}

function RowSkeletons() {
  return (
    <div role="status" aria-label="Loading your communities" className="panel divide-y divide-[var(--az-divider)]">
      {Array.from({ length: 4 }, (_, n) => (
        <div key={n} className="flex items-center gap-3 p-4">
          <span className="skeleton h-9 w-9 !rounded-lg" /><span className="skeleton h-4 w-1/3" /><span className="skeleton ml-auto h-8 w-20 !rounded-lg" />
        </div>
      ))}
    </div>
  );
}
