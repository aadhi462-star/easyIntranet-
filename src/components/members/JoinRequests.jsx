// Join requests at the top of the Members tab, for Admins (board V2EModules, Members). Approve and
// Decline use the existing request routes; the community is re-read afterwards.
import { useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { communityApi } from '../../lib/communities.js';
import { Avatar } from '../ui.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { useChannelSync, useCommunityWrite } from '../groups/useCommunity.js';
import { NameLink } from './MemberCard.jsx';

export default function JoinRequests({ group }) {
  const { dispatch, user } = useStore();
  const { run } = useCommunityWrite();
  const channels = useChannelSync();
  const [busy, setBusy] = useState(null);
  const ids = group.joinRequests || [];
  if (!ids.length) return null;

  const decide = async (id, approve) => {
    setBusy(`${id}-${approve ? 'yes' : 'no'}`);
    try {
      const ok = await run(group.id, () => communityApi.decide(group.id, id, approve), { ok: approve ? 'Request approved' : 'Request declined' });
      if (!ok) return;
      if (approve) channels.add(group.id, [id]);
      dispatch({ type: 'notify', silent: true, notification: { userId: id, kind: 'group', link: `/groups/${group.id}`,
        text: approve ? `Your request to join ${group.name} was approved` : `Your request to join ${group.name} was declined` } });
    } finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="mem-req-h" className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mem-req-h" className="t-h3 flex items-center gap-2">Join requests <Badge>{ids.length}</Badge></h3>
        <span className="t-small">Admins only</span>
      </div>
      <ul className="list-rows">
        {ids.map((id) => {
          const u = user(id) ?? { id, name: 'Member', hue: 160 };
          const meta = [u.batch, u.dept, u.city].filter(Boolean).join(' · ');
          const note = group.requestNotes?.[id];
          return (
            <li key={id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar user={u} size={44} />
              <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                <NameLink id={id} name={u.name} />
                {meta && <span className="t-small">{meta}</span>}
                {note && <span className="t-small mt-0.5 break-words">“{note}”</span>}
                {group.requestAnswers?.[id] && <span className="t-small mt-0.5 break-words"><b className="font-semibold text-[var(--az-text)]">{group.joinQuestion ?? 'Answer'}</b> {group.requestAnswers[id]}</span>}
              </span>
              <span className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" busy={busy === `${id}-yes`} disabled={!!busy} onClick={() => decide(id, true)} aria-label={`Approve ${u.name}`}>Approve</Button>
                <Button variant="secondary" size="sm" busy={busy === `${id}-no`} disabled={!!busy} onClick={() => decide(id, false)} aria-label={`Decline ${u.name}`}>Decline</Button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
