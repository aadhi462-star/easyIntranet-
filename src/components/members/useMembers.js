// The Members tab's list, straight from GET /communities/:id/members (VIS-11): the server decides
// who may see it and which people are listed; profiles come from the directory, which already
// shows only what each person allows. Re-read whenever the community changes (a request approved,
// a role changed in Manage). `filters` (v2 F, Alumni communities): { gradYear, department },
// sent to the server, which matches only what each person's profile lets it show.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText, onCommunityChange } from '../../lib/communities.js';

// Owners and staff first, then by name.
export const ROLE_ORDER = { owner: 0, admin: 1, moderator: 2, member: 3 };

export function useMembers(communityId, { enabled = true, filters = {} } = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== '' && v != null)).toString();
  const [state, setState] = useState({ status: enabled ? 'loading' : 'off', members: [], message: '' });
  const load = useCallback(async () => {
    if (!enabled || !communityId) { setState({ status: 'off', members: [], message: '' }); return; }
    setState((s) => ({ ...s, status: s.members.length ? 'refreshing' : 'loading' }));
    try {
      const { members } = await api(`/communities/${encodeURIComponent(communityId)}/members${query ? `?${query}` : ''}`);
      // Moderators also get removed and blocked people; those belong in Manage, Members.
      const listed = members.filter((m) => m.state === 'active' || m.state === 'restricted')
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || String(a.name).localeCompare(String(b.name)));
      setState({ status: 'ready', members: listed, message: '' });
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', message: errorText(err) }));
    }
  }, [communityId, enabled, query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onCommunityChange((id) => { if (id === communityId) load(); }), [communityId, load]);
  return { ...state, reload: load };
}
