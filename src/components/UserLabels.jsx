import { useStore } from '../lib/store.jsx';
import { Icon } from './icons.jsx';

export const LABEL_TONES = ['saffron', 'leaf', 'gold'];

export function labelsFor(state, userId) {
  return (state.userLabels || []).filter((l) => l.members.includes(userId));
}

/** One label chip. */
export function LabelChip({ label, small = false }) {
  return (
    <span className={`ulabel ill-${label.tone} ${small ? 'ulabel-sm' : ''}`} title={label.description || label.name}>
      {label.icon && <Icon name={label.icon} size={small ? 12 : 14} illustrated />}
      {label.name}
    </span>
  );
}

/**
 * A member's labels, next to their name. `context="post"` only shows labels the admin marked
 * "Show on posts" so busy feeds stay readable; `max` collapses the rest into "+N".
 */
export default function UserLabels({ userId, context, max = 3, small = false, className = '' }) {
  const { state } = useStore();
  const all = labelsFor(state, userId).filter((l) => context !== 'post' || l.showOnPosts);
  if (!all.length) return null;
  const shown = all.slice(0, max);
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((l) => <LabelChip key={l.id} label={l} small={small} />)}
      {all.length > shown.length && (
        <span className="ulabel ill-gold ulabel-sm" title={all.slice(max).map((l) => l.name).join(', ')}>+{all.length - shown.length}</span>
      )}
    </span>
  );
}
