// Outline icon set (24px grid, rounded 1.75px strokes) in the surrounding text colour.
// `<Icon illustrated>` (user label chips only) adds a soft fill from the chip's tone (.ill-*).
//
// Entries are SVG path strings (a path ending in "z" is a closed shape and gets the fill),
// { c: [cx, cy, r] } circles, { r: [x, y, w, h, rx] } rects, and { dots: 'M…' } paths drawn
// with a heavier stroke so zero-length segments read as dots.

const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9v11.5h14V9', 'M10 20.5V15h4v5.5z'],
  explore: [{ c: [12, 12, 9] }, 'm15.5 8.5-2 5-5 2 2-5z'],
  create: [{ r: [3, 3, 18, 18, 4] }, 'M12 8v8M8 12h8'],
  plus: ['M12 5v14M5 12h14'],
  feeds: [{ r: [3, 5, 15, 14, 2] }, 'M18 8.5h2a1 1 0 0 1 1 1V17a2 2 0 0 1-2 2H5', { r: [6, 8, 5, 4, 0.5] }, 'M13.5 9h2M13.5 12h2M6 15.5h9.5'],
  groups: [{ c: [9, 8, 3.2] }, 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6z', { c: [17, 8.5, 2.6] }, 'M16.2 14.1c2.7.4 4.8 2.7 4.8 5.9'],
  events: [{ r: [3, 5, 18, 16, 2] }, 'M8 3v4M16 3v4M3 10h18', { dots: 'M7.5 14h0M12 14h0M16.5 14h0M7.5 17.5h0M12 17.5h0' }],
  mic: [{ r: [9, 3, 6, 11, 3] }, 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7'],
  live: [{ r: [2.5, 9, 12, 10, 2] }, 'm14.5 12.5 5-3v9l-5-3z', 'M17 3.5a5.5 5.5 0 0 1 3.5 3.3', 'M16.5 6.3a2.6 2.6 0 0 1 1.5 1.5'],
  forums: ['M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-3-3h-1',
    'M3 10a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-3 3v-3a2 2 0 0 1-2-2z', 'M6.5 11.5h6M6.5 14h4'],
  ideas: ['M9.5 18h5M10.5 21h3', 'M9.5 16.5c0-1.2-.5-2-1.3-2.8a5.5 5.5 0 1 1 7.6 0c-.8.8-1.3 1.6-1.3 2.8z',
    'M12 1.5v1.5M4.6 4.6l1.1 1.1M19.4 4.6l-1.1 1.1M2 11h1.5M20.5 11H22'],
  channels: ['M10.2 6.6A5.4 4.4 0 0 1 21 7.2c0 1.5-.8 2.9-2 3.7V13l-2.5-1.3',
    'M2.5 13.5c0-3 3-5.5 6.8-5.5S16 10.5 16 13.5 13 19 9.3 19c-.9 0-1.8-.1-2.6-.4l-3.2 1.9.8-2.9a5.3 5.3 0 0 1-1.8-4.1z',
    { dots: 'M6.4 13.5h0M9.3 13.5h0M12.2 13.5h0' }],
  surveys: [{ r: [5, 4.5, 14, 17, 2] }, { r: [9, 2.5, 6, 3.5, 1] }, 'm8 11 1.3 1.3 2.2-2.3M13.5 11.5H16m-8 4.5 1.3 1.3 2.2-2.3m2 .5H16'],
  tasks: [{ r: [2.5, 4.5, 19, 15, 2] }, 'M2.5 8.5h19M9 4.5v15M15 4.5v15', 'M4.6 12h2.4M10.8 12h2.4', 'm16.7 12.4 1.2 1.2 2-2.2'],
  files: ['M7 7.5V4a1 1 0 0 1 1-1h6.5L17 5.5v3', 'M10 5.5h3.5', 'M3 10a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  manuals: ['M2.5 5.5c3.5-1 6.5-.5 9.5 1.5 3-2 6-2.5 9.5-1.5v13c-3.5-1-6.5-.5-9.5 1.5-3-2-6-2.5-9.5-1.5z', 'M12 7v13.5',
    'M5 9.5h4M5 12.5h4M5 15.5h3M15 9.5h4M15 12.5h4M15 15.5h3'],
  calendar: [{ r: [3, 5, 18, 16, 2] }, 'M8 3v4M16 3v4M3 10h18', { dots: 'M7.5 13.8h0M12 13.8h0M16.5 13.8h0M7.5 17.4h0M12 17.4h0M16.5 17.4h0' }],
  apps: ['M9 4.5a2 2 0 1 1 4 0V6h4a1 1 0 0 1 1 1v4h-1.5a2 2 0 1 0 0 4H18v4a1 1 0 0 1-1 1h-4v-1.5a2 2 0 1 0-4 0V20H5a1 1 0 0 1-1-1v-4h1.5a2 2 0 1 0 0-4H4V7a1 1 0 0 1 1-1h4z'],
  webtabs: [{ r: [2.5, 3.5, 19, 17, 2] }, 'M2.5 7.5h19', { dots: 'M5.5 5.5h0M7.6 5.5h0M9.7 5.5h0' }, { c: [12, 14, 4.3] },
    'M7.7 14h8.6M12 9.7c1.3 1.2 1.9 2.6 1.9 4.3s-.6 3.1-1.9 4.3c-1.3-1.2-1.9-2.6-1.9-4.3s.6-3.1 1.9-4.3z'],
  people: [{ c: [8.5, 8, 3.3] }, 'M2.5 20c0-3.4 2.7-6 6-6s6 2.6 6 6z', { c: [16.5, 9, 2.8] }, 'M15.5 14.3c3 .1 6 2.1 6 5.7'],
  structure: [{ r: [9, 2.5, 6, 5, 1.5] }, { r: [2.5, 16.5, 6, 5, 1.5] }, { r: [15.5, 16.5, 6, 5, 1.5] }, 'M12 7.5v4.5M5.5 16.5V12h13v4.5'],
  trophy: ['M8 3.5h8V9a4 4 0 0 1-8 0z', 'M8 5H5.5a2.5 2.5 0 0 0 2.7 4.5M16 5h2.5a2.5 2.5 0 0 1-2.7 4.5', 'M12 13v3M8.5 21h7M10 16h4l.6 5H9.4z',
    'm12 4.8.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z'],
  admin: [{ c: [12, 12, 6.5] }, { c: [12, 12, 2.8] }, { dots: 'M12 3.2v.6M12 20.2v.6M3.2 12h.6M20.2 12h.6M5.8 5.8l.4.4M17.8 17.8l.4.4M5.8 18.2l.4-.4M17.8 6.2l.4-.4' }],
  myfeed: [{ r: [3, 4, 15, 14, 2] }, 'M6 8h9M6 11h6M6 14h3.5', { c: [17.5, 16.5, 3.8] }, { c: [17.5, 15.6, 1.1] }, 'M15.5 18.7c.5-.9 1.1-1.3 2-1.3s1.5.4 2 1.3'],
  wall: ['M3 21h18', 'M5 21V9h4v12z', 'M9 21V3h7v18z', 'M16 21V10.5h3V21z', 'M11.5 21v-3h2v3', { dots: 'M11.5 6.5h0M13.5 6.5h0M11.5 10h0M13.5 10h0M11.5 13.5h0M13.5 13.5h0' }],
  announce: ['M3.5 10v4a1 1 0 0 0 1 1h2l8 4.5v-15L6.5 9h-2a1 1 0 0 0-1 1z', 'm6.5 15 1 4.5h2.2l-.9-4', 'M18 9.3l2.4-1.4M18.5 12h3M18 14.7l2.4 1.4'],
  mandatory: ['M13.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l3 3v6.5', 'M7.5 8h7M7.5 11.5h7M7.5 15h3.5', { c: [17.5, 17.5, 3.8] }, 'm15.8 17.6 1.1 1.1 2.1-2.3'],
  questions: ['M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-9l-4.5 3.5v-3.5H4A1.5 1.5 0 0 1 2.5 16V6A1.5 1.5 0 0 1 4 4.5z',
    'M9.8 9a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.3', { dots: 'M12 15.4h0' }],
  following: ['M7 3c1.6 0 2.4 1.8 2.4 4.1S8.5 11 7 11 4.6 9.3 4.6 7.1 5.4 3 7 3z', 'M5.3 13.4h3.4M5.4 13.4c0 1.1.6 1.9 1.6 1.9s1.6-.8 1.6-1.9',
    'M16.6 6.5c1.6 0 2.4 1.8 2.4 4.1s-.9 3.9-2.4 3.9-2.4-1.7-2.4-3.9.8-4.1 2.4-4.1z', 'M14.9 16.9h3.4M15 16.9c0 1.1.6 1.9 1.6 1.9s1.6-.8 1.6-1.9',
    { dots: 'M3 19.8h0M5 20.8h0M7.5 21.2h0M10 20.7h0' }],
  bookmarks: ['M6.5 3.5h11v17l-5.5-4-5.5 4z'],
  pinned: ['M12 18.5s-6-5.6-6-9.9a6 6 0 0 1 12 0c0 4.3-6 9.9-6 9.9z', { c: [12, 8.6, 2.3] }, 'M8.3 17.6C6 18 4.5 18.7 4.5 19.5c0 1.1 3.4 2 7.5 2s7.5-.9 7.5-2c0-.8-1.5-1.5-3.8-1.9'],
  drafts: ['M12.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h8l4 4v3', 'M7.5 8.5h6M7.5 12h7M7.5 15.5h3.5', 'm14 20.5.6-2.9 5.2-5.2a1.5 1.5 0 0 1 2.1 2.1l-5.2 5.2z'],
  scheduled: ['M11.5 20.5H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3', 'M7.5 3v4M14.5 3v4M3 10h11', { dots: 'M6.6 13.6h0M9.6 13.6h0M6.6 16.8h0' },
    { c: [17.5, 17, 4.5] }, 'M17.5 14.8V17l1.6 1'],

  // Interface extras
  search: [{ c: [11, 11, 6.5] }, 'm16 16 4.5 4.5'],
  label: ['M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1 .4l7 7a1.5 1.5 0 0 1 0 2.1l-7.6 7.6a1.5 1.5 0 0 1-2.1 0l-7-7a1.5 1.5 0 0 1-.4-1z', { dots: 'M8.5 8.5h0' }],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  belloff: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0', 'M4 4l16 16'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  sun: [{ c: [12, 12, 4] }, 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  monitor: [{ r: [2.5, 4, 19, 12.5, 2] }, 'M9 20.5h6M12 16.5v4'],
  medal: ['M8 2.5l2.5 6M16 2.5l-2.5 6', { c: [12, 14.5, 6] }, 'm12 11.3 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z'],
  pen: ['M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z', 'M13.5 7l3 3'],
  poll: [{ r: [3, 3, 18, 18, 2] }, 'M8 16v-4M12 16V8M16 16v-6'],
  share: [{ c: [18, 5.5, 2.5] }, { c: [6, 12, 2.5] }, { c: [18, 18.5, 2.5] }, 'M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1'],
  chart: ['M3.5 3.5v17h17', 'm7 15 4-4.5 3 3 5.5-6'],
  shield: ['M12 2.5 4 5.5v6c0 4.6 3.4 8.6 8 10 4.6-1.4 8-5.4 8-10v-6z', 'm8.8 12 2.2 2.2 4.4-4.4'],
  flag: ['M5 21.5V3.5', 'M5 4h12l-2.5 4L17 12H5z'],
  idcard: [{ r: [2.5, 5, 19, 14, 2] }, { c: [8.5, 11, 2.2] }, 'M5.5 16.2c.6-1.3 1.7-2 3-2s2.4.7 3 2', 'M14 10h4.5M14 13.5h3'],
  palette: ['M12 2.5a9.5 9.5 0 0 0 0 19c1.4 0 2-1 2-2 0-1.4-1.2-1.8-1.2-3.1 0-1 .8-1.9 1.9-1.9H17a4.5 4.5 0 0 0 4.5-4.5c0-4.2-4.3-7.5-9.5-7.5z',
    { dots: 'M7.5 11h0M9.5 7h0M14.5 7h0M17 10.5h0' }],
  bolt: ['M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z'],
  clock: [{ c: [12, 13, 8] }, 'M12 9v4l2.5 2', 'M9.5 2.5h5'],
  list: [{ r: [4.5, 3, 15, 18, 2] }, 'M8 8h8M8 12h8M8 16h5'],
  download: ['M12 3.5v11', 'm7.5 10 4.5 4.5 4.5-4.5', 'M4 17v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V17'],
  lock: [{ r: [4.5, 10.5, 15, 11, 2] }, 'M8 10.5V7.5a4 4 0 0 1 8 0v3', { dots: 'M12 15.5h0' }],
  sparkle: ['M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6z',
    'M18.5 15.5c.3 1.7.9 2.3 2.5 2.5-1.6.2-2.2.8-2.5 2.5-.3-1.7-.9-2.3-2.5-2.5 1.6-.2 2.2-.8 2.5-2.5z'],
  globe: [{ c: [12, 12, 9] }, 'M3 12h18', 'M12 3c2.5 2.5 3.5 5.6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.6-3.5-9s1-6.5 3.5-9z'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  code: [{ r: [2.5, 4, 19, 16, 2] }, 'm9 10-2.5 2.5L9 15M15 10l2.5 2.5L15 15M12.8 9l-1.6 7'],
  inbox: ['M3 13.5 5.5 5a1 1 0 0 1 1-.5h11a1 1 0 0 1 1 .5l2.5 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z', 'M3 13.5h5l1.5 2.5h5l1.5-2.5h5'],
  eyeoff: ['M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', { c: [12, 12, 3] }, 'M4 4l16 16'],
  sprout: ['M12 21v-8', 'M12 13c0-3.9-2.6-6.5-7-6.5 0 4 2.7 6.5 7 6.5z', 'M12 11c0-3.3 2.3-5.5 6.5-5.5 0 3.5-2.4 5.5-6.5 5.5z', 'M7.5 21h9'],
  user: [{ c: [12, 8, 4] }, 'M4 21c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5z'],
  star: ['m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  paperclip: ['M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7'],
  eye: ['M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', { c: [12, 12, 3] }],
  record: [{ c: [12, 12, 8.5] }, { c: [12, 12, 3.5] }],
  micoff: [{ r: [9, 3, 6, 11, 3] }, 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7', 'M4 4l16 16'],
  alert: [{ c: [12, 12, 9] }, 'M12 7.5V13', { dots: 'M12 16.3h0' }],
  ban: [{ c: [12, 12, 9] }, 'M5.6 5.6l12.8 12.8'],
  doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M8.5 13h7M8.5 16.5h5'],
  cap: ['M22 9 12 4 2 9l10 5z', 'M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5', 'M22 9v5'],
};

/**
 * Interface emoji → icon. Modules defined their icons as emoji; rendering them through
 * <Glyph> swaps in the illustrated icon. Emoji that are content (reactions, badges, a group's
 * chosen emoji) have no entry and render unchanged.
 */
const EMOJI_ICON = {
  '🏠': 'home', '📰': 'feeds', '👥': 'groups', '📅': 'events', '🗓️': 'calendar', '🎤': 'mic', '📡': 'live', '🎥': 'live',
  '🗂️': 'forums', '💡': 'ideas', '💬': 'channels', '📋': 'surveys', '✅': 'tasks', '📁': 'files', '📖': 'manuals', '🧩': 'apps',
  '🌐': 'webtabs', '🧑‍🤝‍🧑': 'people', '🌳': 'structure', '🏆': 'trophy', '⚙️': 'admin', '🏛️': 'wall', '📢': 'announce', '❓': 'questions',
  '👣': 'following', '🔖': 'bookmarks', '📌': 'pinned', '📝': 'drafts', '⏰': 'scheduled', '📊': 'poll', '👤': 'user', '🛡️': 'shield',
  '📜': 'list', '🚩': 'flag', '🪪': 'idcard', '🎨': 'palette', '⚡': 'bolt', '⏱️': 'clock', '🧾': 'list', '💾': 'download',
  '🔐': 'lock', '🔒': 'lock', '✨': 'sparkle', '🌍': 'globe', '👋': 'sparkle', '🆕': 'sparkle', '🎉': 'sparkle', '🔗': 'link', '🧱': 'code',
  '✏️': 'pen', '📣': 'share', '🔍': 'search', '🔎': 'search', '📭': 'inbox', '🫥': 'eyeoff', '🙈': 'eyeoff', '🙋': 'questions',
  '🔕': 'belloff', '🔔': 'bell', '🌱': 'sprout', '🏷️': 'label', '🏅': 'medal',
  '📎': 'paperclip', '👁': 'eye', '👁️': 'eye', '🕶️': 'eyeoff', '⏺': 'record', '🔇': 'micoff', '❗': 'alert', '⛔': 'ban', '📄': 'doc',
  '🎓': 'cap', '⏳': 'clock', '✎': 'pen', '⭐': 'star', '📍': 'pinned', '🗳️': 'poll', '📈': 'chart', '🔥': 'sparkle', '🧭': 'globe',
};

export const ICON_NAMES = Object.keys(ICONS);
export const iconFor = (value) => (ICONS[value] ? value : EMOJI_ICON[value] ?? null);

/** Raw artwork. `illustrated` fills closed shapes with the tile's soft tone. */
export function Icon({ name, size = 20, className = '', illustrated = false, label }) {
  const parts = ICONS[name];
  if (!parts) return null;
  const fill = illustrated ? 'var(--ill-fill)' : 'none';
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <path key={i} d={p} fill={/z\s*$/i.test(p) ? fill : 'none'} />;
        if (p.c) return <circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} fill={fill} />;
        if (p.r) return <rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} fill={fill} />;
        return <path key={i} d={p.dots} strokeWidth="2.6" />;
      })}
    </svg>
  );
}

/**
 * Interface icon. `value` is an icon name or a mapped interface emoji; anything else (e.g. a
 * group's own emoji) is rendered as-is so content isn't lost. Since the CommunityOne redesign
 * (decision R3) every icon is a single outline in the surrounding text colour; `tile` puts it on
 * a quiet square for list rows and headers.
 */
export function Glyph({ value, size = 28, className = '', tile = true }) {
  const name = iconFor(value);
  if (!name) return value ? <span aria-hidden="true" className={className}>{value}</span> : null;
  const art = <Icon name={name} size={Math.round(size * (tile ? 0.64 : 1))} />;
  return (
    <span aria-hidden="true" className={`ill ${tile ? 'ill-tile' : ''} ${className}`}
      style={tile ? { width: size, height: size } : undefined}>
      {art}
    </span>
  );
}
