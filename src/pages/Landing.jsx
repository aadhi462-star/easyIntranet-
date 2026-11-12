// Public landing page (refined design system, board R1Landing): finding a community is the main
// action, and real communities in their own colours carry the visuals; no community is pinned or
// featured above the others (v2 brief). Every community, count and event comes from
// GET /api/public/communities.
import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons.jsx';
import { accentOf } from '../lib/communities.js';
import { PublicFooter, PublicHeader, usePageTitle } from '../components/public/PublicChrome.jsx';
import { CardSkeletons, CommunityCard, CommunityTile, eventWhen, LoadError, NoCommunities, usePublicCommunities } from '../components/public/CommunityCards.jsx';

const wrap = 'mx-auto max-w-[1200px] px-4 sm:px-8';

// "Inside every community": what each part is for. Descriptions only, no sample content.
const PARTS = [
  ['channels', 'Discussions', 'Posts, questions, polls and announcements, with replies. Admins can pin what matters and ask members to confirm they’ve read it.'],
  ['events', 'Events', 'Meet-ups, reunions and webinars, in person or online. RSVP, see who’s going and add the event to your calendar.'],
  ['doc', 'Resources', 'Files and links the community keeps for its members. Only members can open them.'],
  ['cap', 'Learning', 'Courses run by the community’s own instructors, with lessons you can work through at your own pace.'],
];
export const STEPS = [
  ['Discover', 'Browse public communities, no account needed.'],
  ['Join', 'Join instantly, or request access to private ones.'],
  ['Participate', 'Post, reply, RSVP and meet members.'],
  ['Learn', 'Take courses your communities offer.'],
  ['Contribute', 'Mentor, share, host events, start your own community.'],
];
const HOW = [
  ['Create one free account', 'Name, email and a password. Confirm your email and you’re in.'],
  ['Join your communities', 'Public ones at once; Private ones after an admin approves your request.'],
  ['Take part', 'Post, reply, RSVP and learn. Your Home shows what’s new across all of them.'],
];
const plural = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;

export default function Landing() {
  usePageTitle(null);
  const loc = useLocation();
  const { status, communities, categories, message, retry } = usePublicCommunities({ limit: 7 });
  const shown = communities.slice(0, 6);

  // "How It Works" from another public page lands here and scrolls to the section.
  useEffect(() => {
    if (loc.state?.scrollTo) document.getElementById(loc.state.scrollTo)?.scrollIntoView({ block: 'start' });
  }, [loc.state]);

  return (
    <div className="min-h-full bg-[var(--color-ink-950)]">
      <PublicHeader />
      <main id="main">
        <section aria-labelledby="hero-h" className={`${wrap} flex flex-wrap items-center gap-x-14 gap-y-10 py-14 sm:py-20`}>
          <div className="min-w-0 flex-[3_1_560px]">
            <p className="t-label">Communities for alumni, cities, interests and teams</p>
            <h1 id="hero-h" className="t-display mt-4 text-white">Find your people.<br />Build your community.</h1>
            <p className="text-2 mt-5 max-w-xl text-[17px] leading-7">
              Join the communities you belong to, take part in their discussions and events, and learn together. One account for all of them.
            </p>
            <FindCommunity categories={categories} />
            <p className="t-small mt-4">
              Running a group already? <Link to="/signup" className="text-brand-300 hover:underline">Start a community</Link>
              {' · '}Have an account? <Link to="/login" className="text-brand-300 hover:underline">Sign in</Link>
            </p>
          </div>
          <Mosaic status={status} list={communities} />
        </section>

        <section id="discover" aria-labelledby="discover-h" className="bg-[var(--az-band)]">
          <div className={`${wrap} py-16 sm:py-20`}>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="t-label">Discover</p>
                <h2 id="discover-h" className="t-h1 mt-2 text-white">Communities you can join today</h2>
                <p className="text-2 mt-3 max-w-2xl leading-relaxed">Public ones you can join straight away; Private ones take a request their admins review. Closed communities are invitation only and never listed.</p>
              </div>
              <Link to="/explore" className="btn btn-ghost">See all communities</Link>
            </div>
            <div className="mt-8">
              {status === 'loading' && <CardSkeletons n={6} />}
              {status === 'error' && <LoadError message={message} onRetry={retry} />}
              {status === 'ready' && shown.length === 0 && <NoCommunities>No public communities yet. Create an account to start one.</NoCommunities>}
              {status === 'ready' && shown.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                  {shown.map((c) => <CommunityCard key={c.id} c={c} />)}
                </div>
              )}
            </div>
          </div>
        </section>


        <section aria-labelledby="parts-h" className="bg-[var(--az-band)]">
          <div className={`${wrap} py-16 sm:py-20`}>
            <p className="t-label">Inside every community</p>
            <h2 id="parts-h" className="t-h1 mt-2 text-white">Talk, meet, share and learn in one place</h2>
            <Parts />
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className={`${wrap} scroll-mt-4 py-16 sm:py-20`}>
          <p className="t-label">How it works</p>
          <h2 id="how-h" className="t-h1 mt-2 text-white">Three steps</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {HOW.map(([title, text], i) => (
              <li key={title} className="flex flex-col gap-2 border-t border-[var(--az-hairline)] pt-5">
                <span className="text-sm font-bold text-brand-300">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="t-h3 text-white">{title}</h3>
                <p className="text-2 t-body">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="org-h" className={`${wrap} pb-20`}>
          <div className="band flex flex-wrap items-center justify-between gap-6 p-6 sm:p-10">
            <div className="min-w-0 flex-[1_1_360px]">
              <h2 id="org-h" className="t-h2 text-white">Run a community? Bring it here.</h2>
              <p className="text-2 mt-2 max-w-xl">Create a Public, Private or Closed community, invite your members and choose who can post and host events.</p>
            </div>
            <Link to="/signup" className="btn btn-primary">Start a community</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

/** The main action: a search that opens Explore with the words or category chosen. */
function FindCommunity({ categories }) {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const id = useId();
  const go = (params) => nav(`/explore?${new URLSearchParams(params)}`);
  return (
    <form role="search" aria-label="Find a community" className="raised mt-8 flex flex-col gap-3 p-4"
      onSubmit={(e) => { e.preventDefault(); go(text.trim() ? { q: text.trim() } : {}); }}>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor={id} className="sr-only">Search communities</label>
        <input id={id} type="search" className="input !min-h-[52px] !bg-[var(--az-sunken)] !text-base" placeholder="Search communities, e.g. Bengaluru or mentorship"
          value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary !min-h-[52px] !px-5">Search</button>
      </div>
      {categories.length > 0 && (
        <div role="group" aria-label="Browse by category" className="flex flex-wrap items-center gap-2">
          {categories.slice(0, 5).map((cat) => (
            <button key={cat} type="button" onClick={() => go({ category: cat })}
              className="text-2 min-h-10 rounded-full border border-[var(--az-hairline)] px-4 text-sm font-medium hover:text-white">{cat}</button>
          ))}
          <Link to="/explore" className="text-2 min-h-10 px-2 text-sm font-medium leading-10 hover:text-white">Browse all</Link>
        </div>
      )}
    </form>
  );
}

/** Real communities in their own colours: one large tile for the biggest, smaller ones round it. */
function Mosaic({ status, list }) {
  if (status !== 'ready' || !list.length) {
    return <div aria-hidden="true" className="hidden min-h-[360px] min-w-0 flex-[2_1_380px] rounded-2xl border border-dashed border-[var(--az-hairline)] lg:block" />;
  }
  const [lead, ...others] = list;
  const rest = others.slice(0, 4);
  const next = lead.upcomingEvents?.[0];
  return (
    <div aria-label="Some of the communities on CommunityOne" className="grid min-w-0 flex-[2_1_380px] grid-cols-2 gap-3">
      <Link to={`/explore?q=${encodeURIComponent(lead.name)}`} className={`cm-${accentOf(lead)} cm-cover col-span-2 flex flex-col gap-4 rounded-2xl border border-[var(--cm-line)] p-5 text-white`}>
        <span className="flex items-center gap-3.5">
          <CommunityTile c={lead} size={56} />
          <span className="min-w-0"><span className="t-h2 block">{lead.name}</span><span className="cm-ink text-sm">{[lead.category, plural(lead.memberCount)].filter(Boolean).join(' · ')}</span></span>
        </span>
        {next && <span className="text-2 text-sm">Next: <span className="text-white">{next.title}</span> · {eventWhen(next)}</span>}
      </Link>
      {rest.map((c) => (
        <Link key={c.id} to={`/explore?q=${encodeURIComponent(c.name)}`} className={`cm-${accentOf(c)} flex min-w-0 items-center gap-3 rounded-xl border border-[var(--cm-line)] bg-[var(--cm-tint)] p-3.5 text-white`}>
          <CommunityTile c={c} size={40} />
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="t-small">{plural(c.memberCount)}</span></span>
        </Link>
      ))}
    </div>
  );
}

/** What a community has, as tabs: one part described at a time. */
function Parts() {
  const [on, setOn] = useState(0);
  const base = useId();
  const key = (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (on + d + PARTS.length) % PARTS.length;
    setOn(n);
    document.getElementById(`${base}-t${n}`)?.focus();
  };
  const [icon, title, text] = PARTS[on];
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div role="tablist" aria-label="What a community has" aria-orientation="vertical" className="flex flex-col gap-1" onKeyDown={key}>
        {PARTS.map(([, t], i) => (
          <button key={t} id={`${base}-t${i}`} role="tab" type="button" aria-selected={on === i} aria-controls={`${base}-p`} tabIndex={on === i ? 0 : -1}
            onClick={() => setOn(i)}
            className={`min-h-12 rounded-lg px-4 text-left text-[15px] transition ${on === i ? 'bg-[var(--az-surface)] font-semibold text-white shadow-[inset_3px_0_0_var(--color-brand-400)]' : 'text-2 font-medium hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>
      <div id={`${base}-p`} role="tabpanel" aria-labelledby={`${base}-t${on}`} className="glass flex flex-col gap-3 p-6 sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--az-sunken)] text-brand-300"><Icon name={icon} /></span>
        <h3 className="t-h2 text-white">{title}</h3>
        <p className="text-2 max-w-prose leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
