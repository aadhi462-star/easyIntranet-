import { useEffect, useRef } from 'react';
import { useStore } from '../store.jsx';
import { matchesRule } from '../../components/groups/helpers.js';
import { isActiveUser } from '../../components/people/shared.jsx';
import { communityApi, refreshCommunity } from '../communities.js';

/**
 * Adds users who match a group's dynamic membership rule, and notifies them.
 *
 * Interim: the server only lets community admins add members, so this runs only in the browser
 * of a viewer whose server permissions say they administer that community (permissions.canAdmin),
 * and adds people through POST /communities/:id/members. For everyone else it does nothing.
 * A server-side membership job will replace this runner.
 */
export default function DynamicMembership() {
  const { state, dispatch, me } = useStore();
  // Each person is tried once per community per session, so someone the server won't add
  // (inactive, removed or blocked there) isn't retried on every state change.
  const tried = useRef(new Set());
  const running = useRef(new Set());
  const meId = me?.id;
  useEffect(() => {
    if (!meId) return;
    for (const g of state.groups) {
      if (!g.permissions?.canAdmin || g.status === 'archived' || running.current.has(g.id)) continue;
      if (!String(g.dynamicRule?.value ?? '').trim()) continue;
      // Skip people who left or were removed in this browser (optedOut), and pending/deactivated accounts.
      const optedOut = new Set(g.optedOut || []);
      const add = state.users.filter((u) => isActiveUser(u) && !optedOut.has(u.id) && matchesRule(u, g.dynamicRule) && !g.members.includes(u.id)
        && !(g.joinRequests || []).includes(u.id) && !tried.current.has(`${g.id}:${u.id}`)).map((u) => u.id);
      if (!add.length) continue;
      add.forEach((id) => tried.current.add(`${g.id}:${id}`));
      running.current.add(g.id);
      communityApi.addMembers(g.id, add)
        .then(({ added = [] }) => {
          for (const userId of added) {
            dispatch({ type: 'notify', silent: true, notification: { id: `dm-${g.id}-${userId}`, userId, kind: 'group', text: `You were added to ${g.name} based on your profile`, link: `/groups/${g.id}` } });
          }
          if (added.length) return refreshCommunity(g.id, dispatch, { me: meId });
        })
        .catch(() => { /* offline or no longer an admin: try again next session */ })
        .finally(() => running.current.delete(g.id));
    }
  }, [state.groups, state.users, dispatch, meId]);
  return null;
}
