// About CommunityOne (board V2CLanding, About page): the platform, the communities on it, who
// can see them, the roles inside one, and how to start one. Describes only what exists (C13).
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';
import { VisibilityBadge } from '../components/public/CommunityCards.jsx';

const STEPS = [
  ['Discover', 'Browse Public communities, no account needed.'],
  ['Join', 'Join instantly, or ask to join Private ones.'],
  ['Participate', 'Post, reply, RSVP and meet members.'],
  ['Learn', 'Take courses your communities offer.'],
  ['Contribute', 'Mentor, share, host events, start your own community.'],
];
const ROLES = [
  ['Owner', 'Started the community or was handed it. Decides its settings and who runs it.'],
  ['Admin', 'Manages members, requests, content and events.'],
  ['Moderator', 'Reviews reports and keeps discussions within the community’s rules.'],
  ['Instructor', 'Builds and teaches the community’s courses.'],
  ['Teaching assistant', 'Helps instructors with learners and grading.'],
  ['Member', 'Takes part: posts, replies, goes to events and takes courses.'],
];
const SEEN = [
  ['public', 'Anyone can find it and see what it’s about, and anyone with an account can join at once. Its discussions, events and resources are for members.'],
  ['private', 'Its name and description are listed. You ask to join, and its admins decide.'],
  ['closed', 'Never listed or shown in search. You join by invitation only.'],
];

export default function About() {
  return (
    <PublicPage title="About CommunityOne" lede="CommunityOne is one platform for every kind of community: alumni networks, schools and departments, professional and technology groups, businesses, organisations and hobby groups. Each runs its own space, with its own members, rules and look.">
      <Section title="One account, many communities">
        <p>You create one account. With it you can join as many communities as you like and hold a different role in each. None of them is a default, and nobody is added to a community without choosing it.</p>
      </Section>
      <Section title="Who can see a community">
        <dl className="flex flex-col gap-4">
          {SEEN.map(([v, text]) => (
            <div key={v} className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
              <dt className="shrink-0 sm:w-24"><VisibilityBadge visibility={v} /></dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Roles inside a community">
        <p>Roles belong to one community. Being an admin in one gives you nothing in another.</p>
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[var(--az-hairline)] text-[var(--az-text)]"><th scope="col" className="px-4 py-3 font-semibold">Role</th><th scope="col" className="px-4 py-3 font-semibold">What they do</th></tr></thead>
            <tbody>
              {ROLES.map(([role, text]) => (
                <tr key={role} className="border-b border-[var(--az-divider)] last:border-0">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-[var(--az-text)]">{role}</th>
                  <td className="px-4 py-3">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="How it works" id="how-it-works">
        <ol className="flex flex-col gap-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-3"><span className="w-7 shrink-0 font-bold text-[var(--az-link)]">{String(i + 1).padStart(2, '0')}</span><span><b className="text-[var(--az-text)]">{title}.</b> {text}</span></li>
          ))}
        </ol>
      </Section>
      <Section title="Starting a community">
        <p>Signed-in members can start a community, unless CommunityOne’s administrators have limited who can. You choose its name, description, category and visibility, and give roles to people you trust. You become its Owner.</p>
        <p>A community’s admins can ask for it to be deleted, and CommunityOne’s administrators review the request. A deleted community can be restored for 30 days.</p>
      </Section>
      <Section title="Questions?">
        <p>Read Help and Support, or get in touch.</p>
        <div className="flex flex-wrap gap-3">
          <Link className="btn btn-secondary" to="/help">Help and Support</Link>
          <Link className="btn btn-secondary" to="/explore">Explore Communities</Link>
        </div>
      </Section>
    </PublicPage>
  );
}
