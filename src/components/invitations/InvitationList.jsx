// The invitations a community has sent (v2 workstream F, F9; board V2FInvites): filters by
// status with counts, then a table from 768 px (Invited, How, Invited by, Sent, Expires, Status,
// Actions) and stacked cards below it with Resend and Revoke in a menu. Resend sends a new link
// and the old one stops working (MEM-12); Revoke asks first. The server checks both again.
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Badge, Button, Skeleton } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import Menu from '../resources/Menu.jsx';
import { STATUSES, dayText, inviteeOf, statusInfo, untilText } from './useInvitations.js';

/** What the Expires column says for each status. */
function endText(i) {
  if (i.status === 'open') return untilText(i.expiresAt);
  if (i.status === 'accepted') return `Accepted ${dayText(i.acceptedAt)}`;
  if (i.status === 'revoked') return `Revoked ${dayText(i.revokedAt)}`;
  if (i.status === 'declined') return `Declined ${dayText(i.declinedAt ?? i.updatedAt)}`.trim();
  return `Ended ${dayText(i.expiresAt)}`;
}

export default function InvitationList({ invites, me, canAct }) {
  const [filter, setFilter] = useState('open');
  const [busy, setBusy] = useState(null);
  const count = (k) => invites.list.filter((i) => i.status === k).length;
  const shown = invites.list.filter((i) => i.status === filter);

  const resend = async (i) => {
    setBusy(i.id);
    try {
      await api(`/invitations/${encodeURIComponent(i.id)}/resend`, { method: 'POST', body: {} });
      toast(`New invitation sent to ${inviteeOf(i)}. The old link no longer works.`);
      await invites.reload();
    } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(null); }
  };
  const revoke = async (i) => {
    const ok = await confirmAction({ title: `Revoke the invitation to ${inviteeOf(i)}?`, body: 'The link stops working at once. You can invite them again later.', confirm: 'Revoke', danger: true });
    if (!ok) return;
    setBusy(i.id);
    try {
      await api(`/invitations/${encodeURIComponent(i.id)}`, { method: 'DELETE' });
      toast(`Invitation to ${inviteeOf(i)} revoked`);
      await invites.reload();
    } catch (err) { toast(errorText(err), 'error'); } finally { setBusy(null); }
  };
  const actionsOf = (i) => (!canAct ? [] : [
    (i.status === 'open' || i.status === 'expired') && { label: 'Resend', icon: 'repeat', onSelect: () => resend(i) },
    i.status === 'open' && { label: 'Revoke', icon: 'x', danger: true, onSelect: () => revoke(i) },
  ].filter(Boolean));

  return (
    <section aria-labelledby="inv-list-h" className="flex min-w-0 flex-col gap-3">
      <h3 id="inv-list-h" className="t-h3">Invitations</h3>
      <div role="group" aria-label="Status" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
        {STATUSES.map(([k, label]) => (
          <button key={k} type="button" className="filter-chip shrink-0" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}{invites.status === 'ready' ? ` · ${count(k)}` : ''}
          </button>
        ))}
      </div>

      {invites.status === 'loading' && <div className="panel p-5"><Skeleton lines={4} label="Loading invitations" /></div>}
      {invites.status === 'error' && (
        <div role="alert" className="notice notice-bad flex flex-wrap items-center justify-between gap-3">
          <span><strong>Couldn’t load the invitations.</strong> {invites.message}</span>
          <Button size="sm" onClick={invites.reload}>Try again</Button>
        </div>
      )}
      {invites.status === 'ready' && (shown.length === 0 ? (
        <p className="sunken t-small p-4">{filter === 'open' ? 'No pending invitations. People you invite are listed here until they accept or decline.' : `No ${statusInfo(filter)[1].toLowerCase()} invitations.`}</p>
      ) : (
        <>
          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>{['Invited', 'How', 'Invited by', 'Sent', 'Expires', 'Status'].map((h) => <th key={h} scope="col" className="t-label whitespace-nowrap border-b border-[var(--az-hairline)] px-4 py-3">{h}</th>)}
                  <th scope="col" className="t-label border-b border-[var(--az-hairline)] px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--az-divider)]">
                {shown.map((i) => {
                  const [, label, tone] = statusInfo(i.status);
                  const acts = actionsOf(i);
                  return (
                    <tr key={i.id} className="align-top">
                      <td className="max-w-[16rem] break-words px-4 py-3 font-semibold text-[var(--az-text)]">{inviteeOf(i)}</td>
                      <td className="text-2 px-4 py-3">{i.user ? 'Member' : 'Email'}</td>
                      <td className="text-2 px-4 py-3">{i.invitedBy ? `${i.invitedBy.name}${i.invitedBy.id === me?.id ? ' (you)' : ''}` : ''}</td>
                      <td className="text-2 whitespace-nowrap px-4 py-3">{dayText(i.sentAt ?? i.createdAt)}</td>
                      <td className="text-2 whitespace-nowrap px-4 py-3">{endText(i)}</td>
                      <td className="px-4 py-3"><Badge tone={tone}>{label}</Badge></td>
                      <td className="px-4 py-3">
                        <span className="flex justify-end gap-2">
                          {acts.map((a) => (
                            <Button key={a.label} size="sm" variant={a.danger ? 'ghost' : 'secondary'} className={a.danger ? '!text-[var(--az-danger)]' : ''}
                              disabled={busy === i.id} onClick={a.onSelect} aria-label={`${a.label} the invitation to ${inviteeOf(i)}`}>{a.label}</Button>
                          ))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {shown.map((i) => {
              const [, label, tone] = statusInfo(i.status);
              const acts = actionsOf(i);
              return (
                <li key={i.id} className="panel flex min-w-0 items-start gap-3 p-4">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words font-semibold text-[var(--az-text)]">{inviteeOf(i)}</span>
                    <span className="t-small">{i.user ? 'Member' : 'Email'} · by {i.invitedBy?.id === me?.id ? 'you' : i.invitedBy?.name ?? 'an Admin'} · sent {dayText(i.sentAt ?? i.createdAt)}</span>
                    <span className="flex flex-wrap items-center gap-2"><Badge tone={tone}>{label}</Badge><span className="t-small">{i.status === 'open' ? `Expires ${endText(i)}` : endText(i)}</span></span>
                  </span>
                  {acts.length > 0 && (
                    <Menu label={`Actions for the invitation to ${inviteeOf(i)}`} width={180} items={acts}
                      trigger={({ props }) => (
                        <button type="button" {...props} disabled={busy === i.id} aria-label={`Actions for the invitation to ${inviteeOf(i)}`} className="btn btn-ghost btn-icon btn-sm shrink-0">
                          <Icon name="more" size={18} />
                        </button>
                      )} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ))}
      <p className="t-small">Resend sends a new link and the old one stops working. Revoke asks first. Every invitation, resend and revoke is in the activity log.</p>
    </section>
  );
}
