import { useEffect } from 'react';
import { useStore } from '../store.jsx';
import { matchesRule } from '../../components/groups/helpers.js';
import { isActiveUser } from '../../components/people/shared.jsx';

/** Adds users who match a group's dynamic membership rule, and notifies them. */
export default function DynamicMembership() {
  const { state, dispatch } = useStore();
  useEffect(() => {
    for (const g of state.groups) {
      if (!String(g.dynamicRule?.value ?? '').trim()) continue;
      // Skip people who left or were removed (optedOut), and pending/deactivated accounts.
      const optedOut = new Set(g.optedOut || []);
      const add = state.users.filter((u) => isActiveUser(u) && !optedOut.has(u.id) && matchesRule(u, g.dynamicRule) && !g.members.includes(u.id)).map((u) => u.id);
      if (!add.length) continue;
      dispatch({ type: 'group/addMembers', id: g.id, userIds: add, silent: true });
      for (const userId of add) {
        dispatch({ type: 'notify', silent: true, notification: { id: `dm-${g.id}-${userId}`, userId, kind: 'group', text: `You were added to ${g.name} based on your profile`, link: `/groups/${g.id}` } });
      }
    }
  }, [state.groups, state.users, dispatch]);
  return null;
}
