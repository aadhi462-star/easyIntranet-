// One event occurrence (board V2EModules, Events) and its RSVP buttons, on the v2 tokens.
// Shared by the community Events tab, the Events page and the community Overview. The date tile
// may carry the community's accent (identity, E3); buttons and links stay the platform style.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { setRsvp } from '../../lib/events.js';
import { toast } from '../../lib/toast.js';
import { AvatarStack } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Badge } from '../ui/Controls.jsx';
import { isUrl, recurrenceText, scopeLabel, whenText } from './eventUtils.js';

/** RSVP choices. The server decides whether they're open (`can.rsvp`) and has the last word on
 * capacity and deadlines, so a refusal is shown as its message. On phones the buttons share the
 * row and wrap full width. */
export function RsvpButtons({ event, compact = false }) {
  const [pending, setPending] = useState(null);
  if (!event.rsvpEnabled || !event.can?.rsvp) return null;
  const mine = event.myRsvp;
  // A full event offers its waitlist instead of "Going" (Stage 4, decision S4-4).
  const full = event.can.full && mine !== 'going';
  const opts = mine === 'waitlist'
    ? [['no', 'Leave waitlist']]
    : [full ? ['waitlist', 'Join waitlist'] : ['going', 'Going'], ['maybe', 'Maybe'], ['no', 'Not going']];
  const choose = async (v) => {
    if (pending || v === mine) return;
    setPending(v);
    try {
      const e = await setRsvp(event.id, v);
      toast(e.myRsvp === 'waitlist' ? `You’re number ${e.waitlistPosition} on the waitlist` : v === 'waitlist' ? 'A place was free: you’re going' : 'RSVP saved');
    } catch (err) {
      toast(err.extra?.waitlist ? 'It just filled up. Join the waitlist to get the next free place.' : err.message, 'error');
    } finally { setPending(null); }
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {mine === 'waitlist' && <p className="notice notice-warn" role="status">You’re number {event.waitlistPosition} on the waitlist. If a place opens, you’ll be moved to Going and told.</p>}
      <div role="group" aria-label="RSVP" className="flex flex-wrap gap-2">
        {opts.map(([v, l]) => {
          const on = mine === v;
          return (
            <button key={v} type="button" aria-pressed={on} disabled={!!pending} aria-busy={pending === v || undefined}
              onClick={(e) => { e.preventDefault(); choose(v); }}
              className={`btn ${compact ? 'btn-sm' : ''} ${on ? 'btn-primary' : 'btn-secondary'} min-w-[6.5rem] flex-1 sm:flex-none ${mine === 'waitlist' ? 'sm:min-w-0' : ''}`}>
              {on && <Icon name="check" size={16} />}{l}
            </button>
          );
        })}
      </div>
      {full && mine !== 'waitlist' && <p className="t-small">This event is full{event.counts?.waitlist ? ` · ${event.counts.waitlist} waiting` : ''}.</p>}
    </div>
  );
}

/** "Online" from the location the host typed; a link is shown as a map link. */
const isOnline = (loc = '') => /^\s*online\b/i.test(loc);

/** The date tile: month in the community accent when there is one, else the quiet text colour. */
export function DateTile({ start }) {
  const d = new Date(start);
  return (
    <span aria-hidden="true" className="grid w-14 shrink-0 place-items-center rounded-xl border border-[var(--cm-line,var(--az-hairline))] bg-[var(--az-surface)] py-1.5 text-center">
      <span className="text-[12px] font-bold uppercase leading-4 tracking-[.04em] text-[var(--cm-ink,var(--az-text-2))]">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      <span className="text-[15px] font-bold leading-6 text-[var(--az-text)]">{d.getDate()}</span>
    </span>
  );
}

/**
 * One event occurrence. `event.occStart` / `occEnd` are used when present. `flat` draws it as a
 * row inside a list panel (community Events tab); otherwise it is its own panel. `showCommunity`
 * names the community in the details line (off inside a community).
 */
export default function EventCard({ event, flat = false, showCommunity = true }) {
  const { state } = useStore();
  const start = event.occStart ?? event.start;
  const going = Object.entries(event.rsvps || {}).filter(([, v]) => v === 'going').map(([k]) => k);
  const goingCount = event.counts?.going ?? going.length;
  const cancelled = event.status === 'cancelled';
  const past = (event.occEnd ?? event.end) < Date.now();
  const full = !!event.can?.full;
  const online = isOnline(event.location);
  const details = [event.eventType, showCommunity && scopeLabel(event, state.groups), recurrenceText(event.recurrence)].filter(Boolean).join(' · ');
  return (
    <article className={`flex min-w-0 items-start gap-4 ${flat ? 'px-4 py-4 sm:px-5' : 'panel p-4 sm:p-5'}`}>
      <DateTile start={start} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="t-h3 min-w-0 break-words"><Link to={`/events/${event.id}`} className="text-[var(--az-text)] hit hover:underline">{event.title}</Link></h3>
          {online && <Badge tone="info" icon="video">Online</Badge>}
          {cancelled && <Badge tone="bad">Cancelled</Badge>}
          {!cancelled && past && <Badge>Ended</Badge>}
          {!cancelled && !past && event.myRsvp === 'waitlist' && <Badge tone="warn" icon="clock">Waitlist</Badge>}
          {!cancelled && !past && full && event.myRsvp !== 'waitlist' && <Badge tone="warn">Full</Badge>}
          {event.inviteOnly && <Badge icon="lock">Invite-only</Badge>}
        </div>
        <p className="t-small flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span>{whenText(event)}</span>
          {event.location && <>
            <span aria-hidden="true">·</span>
            {online ? <span className="inline-flex items-center gap-1"><Icon name="video" size={14} />Online</span>
              : isUrl(event.location) ? <a href={event.location} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1"><Icon name="place" size={14} />Open in Maps<span className="sr-only"> (opens in a new tab)</span></a>
                : <span className="inline-flex min-w-0 items-center gap-1 break-words"><Icon name="place" size={14} />{event.location}</span>}
          </>}
        </p>
        {details && <p className="t-small">{details}</p>}
        {event.description && !cancelled && <p className="text-2 line-clamp-2 break-words text-sm">{event.description}</p>}
        {cancelled && <p className="t-small">Cancelled{event.cancelReason ? `: ${event.cancelReason.replace(/\.$/, '')}` : ''}. People who were going were told.</p>}
        {!cancelled && !past && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <RsvpButtons event={event} compact />
            {(goingCount > 0 || event.capacity) && (
              <span className="t-small flex items-center gap-2">
                {going.length > 0 && <AvatarStack ids={going} size={22} />}
                {full && event.capacity ? `${goingCount} of ${event.capacity} places taken` : `${goingCount} going${event.capacity ? ` of ${event.capacity}` : ''}`}
              </span>
            )}
          </div>
        )}
        {past && !cancelled && goingCount > 0 && <p className="t-small">{goingCount} went</p>}
      </div>
    </article>
  );
}
