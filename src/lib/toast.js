// Tiny app-wide toast bus: call toast('Saved') from anywhere; <Toaster /> in Layout shows it.
export function toast(text, tone = 'ok') {
  window.dispatchEvent(new CustomEvent('az-toast', { detail: { id: Math.random().toString(36).slice(2), text, tone } }));
}

// Confirmations for store actions the member triggers directly. Background runners pass
// `silent` and never toast.
export const ACTION_TOASTS = {
  'post/create': 'Posted',
  'post/delete': 'Post deleted',
  'post/comment': 'Comment added',
  'post/ack': 'Acknowledged',
  bookmark: 'Bookmarks updated',
  'group/create': 'Group created',
  'group/join': 'Membership updated',
  'event/create': 'Event created',
  'event/rsvp': 'RSVP saved',
  'event/delete': 'Event deleted',
  'forum/save': 'Saved',
  'forum/reply': 'Reply posted',
  'channel/create': 'Channel created',
  'manual/article': 'Article saved',
  'profile/update': 'Profile saved',
  reset: 'Demo data reset',
};
