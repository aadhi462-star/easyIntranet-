// Loading, empty and error states for post lists (v2 board V2EDiscussions, "States").
import { Icon } from '../icons.jsx';

/** One or more placeholder post cards while a list loads. */
export function FeedSkeleton({ count = 2, label = 'Loading posts' }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-2.5 p-5">
          <div className="flex items-center gap-3"><span className="skeleton h-11 w-11 !rounded-full" /><span className="skeleton h-3.5 w-2/5" /></div>
          <span className="skeleton h-3.5 w-[95%]" />
          <span className="skeleton h-3.5 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** A centred message for an empty list, with an optional action. */
export function FeedEmpty({ icon = 'channels', title, children, action }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-6 text-center">
      <Icon name={icon} size={28} className="text-[var(--az-text-3)]" />
      <p className="t-h3 text-[var(--az-text)]">{title}</p>
      {children && <p className="text-sm text-[var(--az-text-2)]">{children}</p>}
      {action}
    </div>
  );
}

/** A list that didn't load, with Try again. */
export function FeedError({ message, onRetry }) {
  return (
    <div role="alert" className="notice notice-bad flex flex-wrap items-center gap-3">
      <Icon name="alert" size={18} className="shrink-0 text-[var(--az-danger)]" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}
