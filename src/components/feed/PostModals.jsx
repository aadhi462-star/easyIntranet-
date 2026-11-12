import { MOODS } from './utils.js';
import { Icon } from '../icons.jsx';

// Post insights, Social Advocacy reports, reposts ("Share to community") and "Report post" were
// browser-only features. They have no server support yet, so they were removed from the feed
// rather than pretending to work; they come back with their API endpoints.

export function SentimentMeter({ counts, label = 'Sentiment' }) {
  const total = counts.happy + counts.neutral + counts.unhappy;
  const pct = (k) => (total ? Math.round((counts[k] / total) * 100) : 0);
  const colors = { happy: 'bg-[var(--az-ok)]', neutral: 'bg-[var(--az-text-3)]', unhappy: 'bg-[var(--az-danger)]' };
  return (
    <div>
      <div className="t-small mb-1.5 flex items-center justify-between"><span>{label}</span><span>{total} signals</span></div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--az-sunken)]" role="img"
        aria-label={`Happy ${pct('happy')}%, neutral ${pct('neutral')}%, unhappy ${pct('unhappy')}%`}>
        {Object.keys(colors).map((k) => <div key={k} className={colors[k]} style={{ width: `${pct(k)}%` }} />)}
      </div>
      <div className="mt-1.5 flex gap-3 text-xs text-[var(--az-text-2)]">
        {Object.keys(colors).map((k) => <span key={k} className="inline-flex items-center gap-1"><Icon name={MOODS[k]} size={14} />{pct(k)}%</span>)}
      </div>
    </div>
  );
}
