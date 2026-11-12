// Community management (redesign Stage 6): addresses and the words used across the Manage tab.
import { communityPath } from './communities.js';

export const MANAGE_SECTIONS = ['overview', 'queue', 'members', 'analytics', 'settings', 'branding'];
/** /c/<community>/manage[/<section>]; plain /manage opens the role's first section (D5). */
export const managePath = (community, section) => `${communityPath(community, 'manage')}${section ? `/${section}` : ''}`;

// D2: the fixed list of reasons.
export const REASONS = [
  ['spam', 'Spam'], ['harassment', 'Harassment or bullying'], ['hate', 'Hate'],
  ['misleading', 'False or misleading'], ['off_topic', 'Off-topic'], ['other', 'Something else'],
];
export const REASON_LABEL = Object.fromEntries(REASONS);

// D3: decisions, in the words the person affected and the reviewer see.
export const ACTION_LABEL = {
  dismiss: 'Dismissed', remove: 'Removed', warn: 'Warned', restrict: 'Restricted',
  remove_member: 'Removed from the community', block: 'Blocked',
  reported: 'Reported', restored: 'Restored', appealed: 'Appealed',
  appeal_upheld: 'Appeal decided: kept', appeal_overturned: 'Appeal decided: undone', escalated: 'Sent to CommunityOne',
};
export const TARGET_LABEL = { post: 'Post', comment: 'Reply', event: 'Event', member: 'Member' };
