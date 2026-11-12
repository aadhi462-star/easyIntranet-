// Server writes for Groups & Spaces. Every write goes to the API and is followed by a fresh read
// of that community, so the screen shows what the server actually stored (no optimistic state).
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { toast } from '../../lib/toast.js';
import { communityApi, errorText, refreshCommunity } from '../../lib/communities.js';
import { confirmAction } from '../ui/Confirm.jsx';

export function useCommunityWrite() {
  const { dispatch, me } = useStore();
  const meId = me?.id;
  const refresh = useCallback((id) => refreshCommunity(id, dispatch, { me: meId }).catch(() => null), [dispatch, meId]);

  /**
   * Runs `fn` (an API call), then refreshes community `id`. Errors are toasted unless `inline`,
   * in which case they're rethrown for the caller to show next to the form.
   * Resolves to the response, or null when the write failed.
   */
  const run = useCallback(async (id, fn, { ok, inline = false } = {}) => {
    try {
      const res = await fn();
      if (ok) toast(ok);
      return res ?? {};
    } catch (err) {
      if (inline) throw err;
      toast(errorText(err), 'error');
      return null;
    } finally {
      if (id) await refresh(id);
    }
  }, [refresh]);

  /** PATCH with the version this screen last saw (a STALE_VERSION conflict refreshes it too). */
  const patch = useCallback((group, body, opts) => run(group.id, () => communityApi.update(group.id, { version: group.serverVersion ?? 1, ...body }), opts), [run]);

  return { run, patch, refresh };
}

/** Keeps linked chat channels (still local) in step with a group's membership. */
export function useChannelSync() {
  const { state, dispatch } = useStore();
  const add = (groupId, userIds) => {
    for (const c of state.channels.filter((x) => x.groupId === groupId)) {
      dispatch({ type: 'update', col: 'channels', id: c.id, silent: true, patch: (x) => ({ ...x, members: [...new Set([...x.members, ...userIds])] }) });
    }
  };
  // Drop someone from linked channels (members and admins). A channel left empty is deleted; one
  // whose admin list empties promotes the first remaining member.
  const drop = (groupId, id) => {
    for (const c of state.channels.filter((x) => x.groupId === groupId && (x.members.includes(id) || (x.admins || []).includes(id)))) {
      const rest = c.members.filter((m) => m !== id);
      if (!rest.length) { dispatch({ type: 'channel/delete', id: c.id, silent: true }); continue; }
      dispatch({ type: 'update', col: 'channels', id: c.id, silent: true, patch: (x) => {
        const members = x.members.filter((m) => m !== id);
        if (!x.admins) return { ...x, members };
        const admins = x.admins.filter((m) => m !== id);
        return { ...x, members, admins: admins.length ? admins : members.slice(0, 1) };
      } });
    }
  };
  return { add, drop };
}

/** Archive / restore (community admins) and permanent delete (platform staff only). */
export function useCommunityLifecycle() {
  const { state, dispatch } = useStore();
  const { run } = useCommunityWrite();
  const nav = useNavigate();
  const archive = async (g, archived) => {
    if (archived && !(await confirmAction(`Archive ${g.name}? It becomes read-only and leaves Discover. Admins can restore it.`))) return;
    return run(g.id, () => communityApi.archive(g.id, archived), { ok: archived ? 'Community archived' : 'Community restored' });
  };
  const remove = async (g) => {
    const typed = prompt(`This permanently deletes ${g.name} and everything in it. It can’t be undone.\n\nType the community name to confirm:`);
    if (typed == null) return;
    if (typed.trim() !== g.name) { toast('The name didn’t match, so nothing was deleted.', 'error'); return; }
    const res = await run(null, () => communityApi.remove(g.id), { ok: 'Community deleted' });
    if (!res) return;
    for (const c of state.channels.filter((c) => c.groupId === g.id)) dispatch({ type: 'remove', col: 'channels', id: c.id, silent: true });
    dispatch({ type: 'communities/merge', groups: [], drop: [g.id], silent: true });
    nav('/groups');
  };
  return { archive, remove };
}
