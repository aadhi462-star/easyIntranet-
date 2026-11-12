// Settings, Moderation and safety (board V2GSettings): what's handled where. Nothing to save here;
// reports are decided in the Queue, and the platform's rules are shown as Managed rows.
import { managePath } from '../../lib/manage.js';
import { Group, InfoRow, Locked, plural, useMemberList } from './shared.jsx';

export default function Moderation({ g }) {
  const members = useMemberList(g);
  const staff = members.list.filter((m) => ['owner', 'admin', 'moderator'].includes(m.role) && (m.state ?? 'active') === 'active').length;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="t-label">Settings · Owners and Admins</span>
        <h2 className="t-h2">Moderation and safety</h2>
        <p className="t-small max-w-2xl">Who reviews what members report in {g.name}, and the rules CommunityOne sets for every community.</p>
      </header>
      <Group title="Reports">
        <div>
          <InfoRow title="Who reviews reports" to={managePath(g, 'members')} action="See staff">
            Moderators, Admins and the Owner{members.status === 'ready' ? `: ${plural(staff, 'person', 'people')}` : ''}. Nobody reviews a report about themselves.
          </InfoRow>
          <InfoRow title="The queue" to={managePath(g, 'queue')} action="Open the queue">Reports, posts held for approval, join requests and appeals, one at a time.</InfoRow>
          <InfoRow title="Decided reports" to={`${managePath(g, 'queue')}?show=resolved`} action="Open the log">Every decision with who made it and the reason given.</InfoRow>
        </div>
        <Locked>Report reasons: Spam · Harassment or bullying · Hate · False or misleading · Off-topic · Something else.</Locked>
        <Locked>Reports about the Owner, and reports open 7 days with no active moderator, go to CommunityOne. Owners and Admins can send any report there.</Locked>
      </Group>
    </div>
  );
}
