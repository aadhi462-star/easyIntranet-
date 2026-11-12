// The community header menu's "Invite people" dialog (v2 workstream F, F10): adding people
// directly became an invitation, so this is the same invite form as Manage, Members,
// Invitations. Nobody joins until they accept.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { managePath } from '../../lib/manage.js';
import { useStore } from '../../lib/store.jsx';
import { Modal } from '../ui.jsx';
import { Skeleton } from '../ui/Controls.jsx';
import InviteForm from '../invitations/InviteForm.jsx';
import { roleOf } from './helpers.js';

export default function AddMembers({ group, onClose }) {
  const { me } = useStore();
  const [ctx, setCtx] = useState(null); // { members, invitations }
  useEffect(() => {
    let live = true;
    const id = encodeURIComponent(group.id);
    Promise.allSettled([api(`/communities/${id}/members`), api(`/communities/${id}/invitations?status=open`)]).then(([m, i]) => {
      if (live) setCtx({ members: m.status === 'fulfilled' ? m.value.members : [], invitations: i.status === 'fulfilled' ? i.value.invitations : [] });
    });
    return () => { live = false; };
  }, [group.id]);
  const myRole = group.adminMode ? 'admin' : (ctx?.members.find((m) => m.id === me.id)?.role ?? roleOf(group, me.id));

  return (
    <Modal title={`Invite people to ${group.name}`} onClose={onClose} wide>
      <p className="text-2 mb-4 text-sm">Each person gets an invitation by notification or email. Nobody joins until they accept. You can follow every invitation in <Link className="link" to={`${managePath(group, 'members')}?view=invitations`} onClick={onClose}>Manage, Members, Invitations</Link>.</p>
      {group.adminMode ? (
        <p className="notice notice-info">You’re viewing in Administrative Mode. Only the community’s Owners and Admins send invitations.</p>
      ) : !ctx ? <Skeleton lines={4} label="Loading" /> : (
        <InviteForm g={group} me={me} myRole={myRole} members={ctx.members} invitations={ctx.invitations} onCancel={onClose} idPrefix="invite-dialog" />
      )}
    </Modal>
  );
}
