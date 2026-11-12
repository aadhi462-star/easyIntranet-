import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renders post text with clickable @mentions, #hashtags and links. */
export default function RichText({ text = '', mentions = [], className = '' }) {
  const { user } = useStore();
  const people = mentions.map(user).filter(Boolean);
  const re = new RegExp(
    [people.length ? `@(?:${people.map((u) => esc(u.name)).join('|')})` : null, '#\\w+', 'https?://[^\\s]+'].filter(Boolean).join('|'), 'g');
  const out = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok[0] === '@') {
      const u = people.find((p) => `@${p.name}` === tok);
      out.push(<Link key={m.index} to={`/people/${u.id}`} className="font-semibold text-[var(--az-link)] hover:underline">{tok}</Link>);
    } else if (tok[0] === '#') {
      out.push(<Link key={m.index} to={`/feed?tag=${tok.slice(1).toLowerCase()}`} className="font-medium text-[var(--az-link)] hover:underline">{tok}</Link>);
    } else {
      out.push(<a key={m.index} href={tok} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--az-link)] underline underline-offset-2">{tok}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <p className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>{out}</p>;
}
