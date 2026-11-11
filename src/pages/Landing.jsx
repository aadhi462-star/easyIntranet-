// Public landing page (redesign Stage 2, REDESIGN_BRIEF.md Part B): what CommunityOne is, real
// communities to join, what you can do, how it works, AlumniZone as one community inside it.
// Every community, count and event shown comes from GET /api/public/communities.
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../components/icons.jsx';
import { NETWORK_COMMUNITY } from '../lib/communities.js';
import { PublicFooter, PublicHeader, usePageTitle } from '../components/public/PublicChrome.jsx';
import { CardSkeletons, CommunityCard, CommunityTile, eventWhen, LoadError, NoCommunities, usePublicCommunities } from '../components/public/CommunityCards.jsx';

const wrap = 'mx-auto max-w-[1200px] px-4 sm:px-8';
const eyebrow = 'text-xs font-semibold uppercase tracking-[0.08em] text-brand-300';
const h2 = 'mt-2 text-[30px] font-bold leading-tight tracking-tight text-white sm:text-[36px]';

const CAPABILITIES = [
  ['search', 'Discover communities', 'Search by interest, institution, city or profession.'],
  ['channels', 'Join discussions', 'Posts, questions, polls and announcements with replies.'],
  ['people', 'Connect with members', 'Find classmates, colleagues and mentors; build relationships.'],
  ['events', 'Attend events', 'Meet-ups, reunions and webinars, online or in person.'],
  ['doc', 'Share resources', 'Files, guides and links, kept within each community.'],
  ['cap', 'Learn together', 'Courses and lessons inside the communities you join.'],
];
export const STEPS = [
  ['Discover', 'Browse public communities, no account needed.'],
  ['Join', 'Join instantly, or request access to private ones.'],
  ['Participate', 'Post, reply, RSVP and meet members.'],
  ['Learn', 'Take courses your communities offer.'],
  ['Contribute', 'Mentor, share, host events, start your own community.'],
];
const plural = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;

export default function Landing() {
  usePageTitle(null);
  const loc = useLocation();
  const { status, communities, message, retry } = usePublicCommunities({ limit: 7 });
  const alumni = communities.find((c) => c.id === NETWORK_COMMUNITY);
  const others = communities.filter((c) => c.id !== NETWORK_COMMUNITY).slice(0, 6);
  const shown = alumni ? [alumni, ...others].slice(0, 6) : others;

  // "How It Works" from another public page lands here and scrolls to the section.
  useEffect(() => {
    if (loc.state?.scrollTo) document.getElementById(loc.state.scrollTo)?.scrollIntoView({ block: 'start' });
  }, [loc.state]);

  return (
    <div className="min-h-full bg-[var(--color-ink-950)]">
      <PublicHeader />
      <main id="main">
        <section aria-labelledby="hero-h" className="relative overflow-hidden">
          <div aria-hidden="true" className="auth-grid pointer-events-none absolute inset-0" />
          <div className={`${wrap} relative flex flex-wrap items-center gap-12 py-20 sm:py-24`}>
            <div className="min-w-0 flex-[1_1_460px]">
              <p className={eyebrow}>One platform. Every community.</p>
              <h1 id="hero-h" className="mt-4 text-[42px] font-extrabold leading-[1.04] tracking-tight text-white sm:text-[64px]">
                Find your people.<br />Build your community.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
                Discover communities, connect with people, share knowledge, join conversations and learn together. Everything you need to stay connected, in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/explore" className="btn btn-primary min-h-12 !px-5 text-[15px]">Explore Communities</Link>
                <Link to="/signup" className="btn btn-ghost min-h-12 !px-5 text-[15px]">Get Started</Link>
              </div>
              <p className="mt-5 text-sm text-slate-400">Free to join. Browse public communities without an account.</p>
            </div>
            <HeroCommunities status={status} alumni={alumni} others={others} />
          </div>
        </section>

        <section aria-labelledby="discover-h" className="border-t border-[var(--az-hairline)]">
          <div className={`${wrap} py-20`}>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className={eyebrow}>Discover</p>
                <h2 id="discover-h" className={h2}>Communities you can join today</h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">Public communities are open to everyone. Private ones accept members by request. Closed communities are invitation-only and never listed.</p>
              </div>
              <Link to="/explore" className="btn btn-ghost min-h-11">See all communities</Link>
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

        <section aria-labelledby="about-h" className="border-t border-[var(--az-hairline)] bg-[var(--az-sidebar)]">
          <div className={`${wrap} py-20`}>
            <p className={eyebrow}>What you can do</p>
            <h2 id="about-h" className={h2}>Everything a community needs, in one account</h2>
            <ul className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {CAPABILITIES.map(([icon, title, text]) => (
                <li key={title} className="flex flex-col gap-3 rounded-xl border border-[var(--az-hairline)] p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--az-hairline)] bg-[var(--az-surface)] text-brand-300"><Icon name={icon} /></span>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-300">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="scroll-mt-4 border-t border-[var(--az-hairline)]">
          <div className={`${wrap} py-20`}>
            <p className={eyebrow}>How it works</p>
            <h2 id="how-h" className={h2}>From first visit to giving back</h2>
            <ol className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="glass flex flex-col gap-2 p-5">
                  <span className="text-sm font-bold text-brand-300">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="font-semibold text-white">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-300">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {alumni && (
          <section aria-labelledby="featured-h" className="border-t border-[var(--az-hairline)] bg-[var(--az-sidebar)]">
            <div className={`${wrap} flex flex-wrap items-center gap-10 py-20`}>
              <div className="min-w-0 flex-[1_1_420px]">
                <p className={eyebrow}>Featured community</p>
                <h2 id="featured-h" className={h2}>{alumni.name} lives on CommunityOne</h2>
                <p className="mt-3 max-w-xl leading-relaxed text-slate-300">
                  {alumni.name} is one of the communities on CommunityOne. Its members keep their profiles, connections, discussions and events, and can join other communities with the same account.
                </p>
                <div className="mt-6"><Link to="/explore" className="btn btn-ghost min-h-11">Explore Communities</Link></div>
              </div>
              <div className="glass flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <CommunityTile name={alumni.name} accent />
                  <div><div className="font-semibold text-white">{alumni.name}</div>
                    <div className="text-xs text-slate-400">{[alumni.category, alumni.visibility === 'private' ? 'Private' : 'Public', plural(alumni.memberCount)].filter(Boolean).join(' · ')}</div></div>
                </div>
                {alumni.upcomingEvents?.length > 0
                  ? (
                    <ul className="flex flex-col gap-2.5 border-t border-[var(--az-hairline)] pt-3 text-sm">
                      {alumni.upcomingEvents.map((e) => (
                        <li key={e.id} className="flex justify-between gap-3"><span className="text-slate-200">{e.title}</span><span className="shrink-0 text-xs text-slate-400">{eventWhen(e)}</span></li>
                      ))}
                    </ul>
                  )
                  : <p className="border-t border-[var(--az-hairline)] pt-3 text-sm text-slate-400">No upcoming public events right now.</p>}
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="cta-h" className="border-t border-[var(--az-hairline)]">
          <div className={`${wrap} flex flex-col items-center gap-4 py-24 text-center`}>
            <h2 id="cta-h" className="text-[34px] font-bold tracking-tight text-white sm:text-[44px]">Your community is waiting.</h2>
            <p className="max-w-xl text-slate-300">Find a community that shares your interests, goals and ideas.</p>
            <Link to="/explore" className="btn btn-primary mt-2 min-h-12 !px-5 text-[15px]">Explore Communities</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

/** Hero visual: a few real communities as cards. Decorative (the list below is the real one). */
function HeroCommunities({ status, alumni, others }) {
  if (status !== 'ready' || (!alumni && !others.length)) {
    return <div aria-hidden="true" className="hidden min-h-[260px] min-w-0 flex-[1_1_420px] rounded-xl border border-dashed border-[var(--az-hairline)] lg:block" />;
  }
  const lead = alumni ?? others[0];
  const rest = others.filter((c) => c.id !== lead.id).slice(0, 2);
  return (
    <div className="grid min-w-0 flex-[1_1_420px] grid-cols-2 gap-3.5" aria-hidden="true">
      <div className="glass col-span-2 flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <CommunityTile name={lead.name} accent />
          <div className="min-w-0"><div className="font-semibold text-white">{lead.name}</div><div className="text-xs text-slate-400">{plural(lead.memberCount)}</div></div>
        </div>
        {lead.upcomingEvents?.[0] && <div className="text-xs text-slate-300">{lead.upcomingEvents[0].title} · {eventWhen(lead.upcomingEvents[0])}</div>}
      </div>
      {rest.map((c) => (
        <div key={c.id} className="glass flex min-w-0 flex-col gap-2 p-4">
          <div className="flex items-center gap-2.5"><CommunityTile name={c.name} size={36} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{c.name}</div><div className="text-xs text-slate-400">{plural(c.memberCount)}</div></div></div>
          {c.upcomingEvents?.[0] && <div className="truncate text-xs text-slate-400">{c.upcomingEvents[0].title}</div>}
        </div>
      ))}
    </div>
  );
}
