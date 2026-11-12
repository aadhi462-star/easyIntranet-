// Icons: Lucide (lucide-react, pinned), one outline style in the surrounding text colour
// (v2 brief, decision B5). The app's own icon names map to Lucide icons here, so every screen
// keeps asking for `<Icon name="events" />` and the look changes in one place.
//
// No emoji is ever rendered: interface emoji left in older data (module icons, a community's old
// emoji logo, reactions) map to an icon, and anything unmapped shows a neutral shape instead.
import {
  Ban, Bell, BellOff, BookOpen, Bookmark, Building2, Cake, Calendar, CalendarDays, Camera, CameraOff, ChartColumn, ChartLine,
  Check, ChevronDown, ChevronLeft, ChevronUp, CircleDot, CircleHelp, ClipboardList, Clock, Code, Compass, Download, Ellipsis, ExternalLink,
  Eye, EyeOff, FileCheck, FilePen, FileText, Flag, Folder, Footprints, Frown, Gift, Globe, GraduationCap, HandHeart, Heart,
  House, IdCard, Image, Inbox, Info, Laugh, Lightbulb, Link, List, ListChecks, Lock, LogOut, MapPin, Medal, Megaphone, Meh, Menu,
  MessageSquare, MessagesSquare, Mic, MicOff, Monitor, Moon, Music, Network, Newspaper, Palette, PartyPopper, Paperclip,
  Pencil, PhoneOff, Pin, Plus, Presentation, Puzzle, Radio, Repeat, Reply, ScreenShare, ScreenShareOff, Search, Settings,
  Shapes, Share2, Shield, Smile, Sparkles, SquarePlus, Sprout, Star, Sun, Tag, ThumbsUp, Ticket, TriangleAlert, Trophy, User,
  Users, Video, Volume2, Vote, X, Zap,
} from 'lucide-react';

const ICONS = {
  home: House, explore: Compass, create: SquarePlus, plus: Plus, feeds: Newspaper, groups: Users, events: Calendar,
  mic: Mic, live: Radio, forums: MessagesSquare, ideas: Lightbulb, channels: MessageSquare, surveys: ClipboardList,
  tasks: ListChecks, files: Folder, manuals: BookOpen, calendar: CalendarDays, apps: Puzzle, webtabs: Globe, people: Users,
  structure: Network, trophy: Trophy, admin: Settings, myfeed: Newspaper, wall: Building2, announce: Megaphone,
  mandatory: FileCheck, questions: CircleHelp, following: Footprints, bookmarks: Bookmark, pinned: Pin, drafts: FilePen,
  scheduled: Clock, search: Search, label: Tag, bell: Bell, belloff: BellOff, menu: Menu, more: Ellipsis, sun: Sun,
  moon: Moon, monitor: Monitor, medal: Medal, pen: Pencil, poll: ChartColumn, share: Share2, chart: ChartLine,
  shield: Shield, flag: Flag, idcard: IdCard, palette: Palette, bolt: Zap, clock: Clock, list: List, download: Download,
  lock: Lock, sparkle: Sparkles, globe: Globe, link: Link, code: Code, inbox: Inbox, eyeoff: EyeOff, sprout: Sprout,
  user: User, star: Star, paperclip: Paperclip, eye: Eye, record: CircleDot, micoff: MicOff, alert: TriangleAlert,
  ban: Ban, doc: FileText, cap: GraduationCap, check: Check, up: ChevronUp, down: ChevronDown, x: X,
  // v2 additions
  info: Info, heart: Heart, like: ThumbsUp, happy: Smile, neutral: Meh, sad: Frown, cake: Cake, party: PartyPopper,
  video: Video, place: MapPin, image: Image, gift: Gift, repeat: Repeat, vote: Vote, shape: Shapes, logout: LogOut, back: ChevronLeft,
  // parked modules (calls, files, reactions, arcade)
  camera: Camera, cameraoff: CameraOff, screen: ScreenShare, screenoff: ScreenShareOff, hangup: PhoneOff, speaker: Volume2,
  slides: Presentation, music: Music, laugh: Laugh, thanks: HandHeart, reply: Reply, external: ExternalLink, ticket: Ticket,
};

/** Interface emoji still found in older data → icon name. */
const EMOJI_ICON = {
  '🏠': 'home', '📰': 'feeds', '👥': 'groups', '📅': 'events', '🗓️': 'calendar', '🎤': 'mic', '📡': 'live', '🎥': 'video',
  '🗂️': 'forums', '💡': 'ideas', '💬': 'channels', '📋': 'surveys', '✅': 'check', '📁': 'files', '📖': 'manuals', '🧩': 'apps',
  '🌐': 'webtabs', '🧑‍🤝‍🧑': 'people', '🌳': 'structure', '🏆': 'trophy', '⚙️': 'admin', '🏛️': 'wall', '📢': 'announce', '❓': 'questions',
  '👣': 'following', '🔖': 'bookmarks', '📌': 'pinned', '📝': 'drafts', '⏰': 'scheduled', '📊': 'poll', '👤': 'user', '🛡️': 'shield',
  '📜': 'list', '🚩': 'flag', '🪪': 'idcard', '🎨': 'palette', '⚡': 'bolt', '⏱️': 'clock', '🧾': 'list', '💾': 'download',
  '🔐': 'lock', '🔒': 'lock', '✨': 'sparkle', '🌍': 'globe', '👋': 'sparkle', '🆕': 'sparkle', '🎉': 'party', '🔗': 'link', '🧱': 'code',
  '✏️': 'pen', '📣': 'share', '🔍': 'search', '🔎': 'search', '📭': 'inbox', '🫥': 'eyeoff', '🙈': 'eyeoff', '🙋': 'questions',
  '🔕': 'belloff', '🔔': 'bell', '🌱': 'sprout', '🏷️': 'label', '🏅': 'medal',
  '📎': 'paperclip', '👁': 'eye', '👁️': 'eye', '🕶️': 'eyeoff', '⏺': 'record', '🔇': 'micoff', '❗': 'alert', '⛔': 'ban', '📄': 'doc',
  '🎓': 'cap', '⏳': 'clock', '✎': 'pen', '⭐': 'star', '📍': 'place', '🗳️': 'vote', '📈': 'chart', '🔥': 'sparkle', '🧭': 'explore',
  '🤍': 'heart', '❤️': 'heart', '👍': 'like', '😊': 'happy', '😐': 'neutral', '😞': 'sad', '🎂': 'cake', '🏢': 'wall', '🚫': 'ban',
  '🔁': 'repeat', '🖼️': 'image', '🎁': 'gift', 'ℹ️': 'info', '🗒️': 'drafts', '📚': 'manuals', '🧑‍💼': 'user', '🌟': 'star',
  '😂': 'laugh', '🙏': 'thanks', '🙌': 'thanks', '👀': 'eye',
};

export const ICON_NAMES = Object.keys(ICONS);
export const iconFor = (value) => (ICONS[value] ? value : EMOJI_ICON[value] ?? null);
/** True for text that starts with an emoji or pictographic symbol. */
export const isEmoji = (value) => typeof value === 'string' && /^\p{Extended_Pictographic}/u.test(value.trim());

/** One icon. Decorative unless `label` is given (then it's announced as an image). */
export function Icon({ name, size = 20, className = '', label, strokeWidth = 1.75 }) {
  const Art = ICONS[name];
  if (!Art) return null;
  return <Art size={size} strokeWidth={strokeWidth} className={`shrink-0 ${className}`} role={label ? 'img' : undefined}
    aria-label={label} aria-hidden={label ? undefined : 'true'} focusable="false" />;
}

/**
 * Interface icon from an icon name or a mapped emoji. Unmapped emoji (an old community logo, a
 * custom reaction) show a neutral shape: emoji are never drawn (B5). `tile` puts it on a quiet
 * square for list rows and headers.
 */
export function Glyph({ value, size = 28, className = '', tile = true }) {
  if (!value) return null;
  const name = iconFor(value) ?? 'shape';
  const art = <Icon name={name} size={Math.round(size * (tile ? 0.64 : 1))} />;
  return (
    <span aria-hidden="true" className={`ill ${tile ? 'ill-tile' : ''} ${className}`}
      style={tile ? { width: size, height: size } : undefined}>
      {art}
    </span>
  );
}
