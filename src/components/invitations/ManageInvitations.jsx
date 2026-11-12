// Manage, Members, Invitations (v2 workstream F, F9; board V2FInvites): Invite people, then the
// invitations already sent. For Owners and Admins; platform staff in Administrative Mode see the
// list but don't invite (they hold no membership to invite from).
import InviteForm from './InviteForm.jsx';
import InvitationList from './InvitationList.jsx';

export default function ManageInvitations({ g, me, myRole, members, invites }) {
  const canInvite = !g.adminMode && g.status !== 'archived';
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {canInvite ? (
        <section aria-labelledby="inv-form-h" className="panel flex min-w-0 flex-col gap-4 p-4 sm:p-5">
          <div>
            <h3 id="inv-form-h" className="t-h3">Invite people</h3>
            <p className="t-small mt-1">Invite a CommunityOne member or an email address. Nobody joins {g.name} until they accept.</p>
          </div>
          <InviteForm g={g} me={me} myRole={myRole} members={members} invitations={invites.list} onSent={() => invites.reload()} />
        </section>
      ) : (
        <p className="notice notice-info">
          {g.adminMode ? 'You’re viewing in Administrative Mode: you can see the invitations, but only the community’s Owners and Admins send them.'
            : 'This community is archived, so it isn’t accepting new members. Restore it in Settings to invite people.'}
        </p>
      )}
      <InvitationList invites={invites} me={me} canAct={canInvite} />
    </div>
  );
}
