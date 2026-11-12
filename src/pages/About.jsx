// About CommunityOne: the platform, communities inside it, and how it works.
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';
import { STEPS } from './Landing.jsx';

export default function About() {
  return (
    <PublicPage title="About CommunityOne" lede="CommunityOne is one platform for every community: alumni networks, institutions and departments, professional groups, interest groups, learning groups and private teams.">
      <Section title="One account, many communities">
        <p>You create one CommunityOne account. With it you can join as many communities as you like, and you can have a different role in each: a member in one, a moderator in another, the owner of a third.</p>
        <p>Each community has its own members, discussions, events and settings, and decides who can see what. Public communities are open to everyone. Private communities show their name and description but keep their content for members, who join by request. Closed communities are invitation-only and never listed.</p>
      </Section>
      <Section title="Communities of every kind">
        <p>CommunityOne is the platform; communities are the spaces on it. Alumni networks, schools, professional groups, technology and business communities, organisations and hobby groups each run their own space, with their own members, rules and look. None is the default, and nobody is added to one without choosing it.</p>
      </Section>
      <Section title="How it works" id="how-it-works">
        <ol className="flex flex-col gap-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-3"><span className="w-7 shrink-0 font-bold text-brand-300">{String(i + 1).padStart(2, '0')}</span><span><b className="text-white">{title}.</b> {text}</span></li>
          ))}
        </ol>
        <p><Link className="font-semibold text-brand-300 underline-offset-4 hover:underline" to="/explore">Explore communities</Link> to get started, or read <Link className="font-semibold text-brand-300 underline-offset-4 hover:underline" to="/help">Help and Support</Link>.</p>
      </Section>
    </PublicPage>
  );
}
