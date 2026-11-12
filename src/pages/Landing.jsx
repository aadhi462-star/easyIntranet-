// Public landing page (v2 workstream C, board V2CLanding), in the brief's order: hero, live
// discovery, features, how it works, discussions, events and resources, learning, benefits and
// a final call to action. Only the discovery cards carry real data (GET /api/public/communities);
// every product picture is a static drawing marked Example (C2), and there are no totals,
// testimonials or logos (C5). No community is pinned or featured above the others (C3).
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store.jsx';
import { Icon } from '../components/icons.jsx';
import { PublicFooter, PublicHeader, usePageTitle } from '../components/public/PublicChrome.jsx';
import { CardSkeletons, CommunityCard, LoadError, NoCommunities, usePublicCommunities } from '../components/public/CommunityCards.jsx';

const wrap = 'mx-auto max-w-[1200px] px-4 sm:px-8';
const sectionCls = `${wrap} scroll-mt-4 py-16 outline-none sm:py-20`;
/** Where Start a community goes: the account first, then the current create form (C13). */
export const START_PATH = `/signup?next=${encodeURIComponent('/communities?new=1')}`;

const FEATURES = [
  ['groups', 'Many communities, one sign-in', 'Your school, your city, your field and your hobby, side by side, with one profile.'],
  ['idcard', 'A role in each', 'A member in one community, a moderator in another and the owner of a third. Each role applies only where it was given.'],
  ['lock', 'Public, Private or Closed', 'Open to anyone, by request, or by invitation only. Members-only content stays with members.'],
  ['home', 'Home brings it together', 'Replies to you, required reads, upcoming events and courses in progress from all your communities, in order of what matters.'],
  ['search', 'Search what you can see', 'Find people, discussions, events and resources across your communities, never beyond what you’re allowed to open.'],
  ['shield', 'Safety built in', 'Report anything that breaks the rules. Moderators review it, decisions are recorded, and members can appeal.'],
];
export const STEPS = [
  ['Discover', 'Browse Public communities. No account needed.'],
  ['Join', 'Join Public ones at once, or ask to join Private ones.'],
  ['Participate', 'Post, reply, RSVP and meet other members.'],
  ['Learn', 'Take the courses your communities offer.'],
  ['Contribute', 'Mentor, share, host events, or start a community of your own.'],
];
const DISCUSSIONS = [
  'Posts, questions, polls and announcements, with replies and reactions.',
  'Topics keep things findable; admins pin what matters.',
  'Required reads ask members to confirm they’ve read them.',
  'Attach files, save posts for later, and get notified of replies.',
];
const LEARNING = [
  'Instructors and teaching assistants build courses from lessons, quizzes and assignments.',
  'Learners work at their own pace; assignments get feedback and a grade.',
  'Certificates on completion, verifiable by anyone with the link.',
  'My Learning shows every course you’re taking, across all your communities.',
];
const FOR_MEMBERS = [
  'One place for every community you’re part of, instead of a different app for each.',
  'You choose what joins your Home: nobody adds you to a community without asking.',
  'Your profile’s privacy settings apply in every community.',
  'Learn from people who share your background or interests.',
];
const FOR_ORGANISERS = [
  'Decide who gets in: open, by request, or by invitation.',
  'Share the work with Admins, Moderators and Instructors, each with clear limits.',
  'See what’s working with community analytics that respect members’ privacy.',
  'Your community’s content and members stay inside your community.',
];

export default function Landing() {
  usePageTitle(null);
  const { me } = useStore();
  const loc = useLocation();

  // Features, Learning and How it works from another page land here and scroll (C1).
  useEffect(() => {
    const el = loc.state?.scrollTo && document.getElementById(loc.state.scrollTo);
    if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); }
  }, [loc.state]);

  const secondary = me ? <Link to="/home" className="btn btn-secondary">Open CommunityOne</Link> : <Link to="/signup" className="btn btn-secondary">Get Started</Link>;

  return (
    <div className="min-h-full bg-[var(--az-page)] text-[var(--az-text)]">
      <PublicHeader />
      <main id="main">
        <section aria-labelledby="hero-h" className={`${wrap} grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14`}>
          <div className="min-w-0">
            <p className="t-label">One platform for every community</p>
            <h1 id="hero-h" className="t-display mt-4 max-sm:!text-[28px] max-sm:!leading-[34px]">Find your people.<br />Build your community.</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-7 text-[var(--az-text-2)]">
              Discover communities, connect with people, share knowledge, join conversations and learn together. Everything you need to stay connected, in one place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/explore" className="btn btn-primary">Explore Communities</Link>
              {secondary}
            </div>
            <p className="t-small mt-4">Public communities are open to browse. No account needed to look around.</p>
          </div>
          <HeroExample />
        </section>

        <Discovery />

        <section id="features" tabIndex={-1} aria-labelledby="features-h" className={sectionCls}>
          <p className="t-label">Features</p>
          <h2 id="features-h" className="t-h1 mt-2 max-w-3xl">One account, every community you belong to</h2>
          <p className="mt-3 max-w-2xl text-[var(--az-text-2)]">CommunityOne holds the communities; each community decides its own members, rules and look.</p>
          <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, text]) => (
              <li key={title} className="flex flex-col gap-2">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--az-ok-soft)] text-[var(--az-link)]"><Icon name={icon} /></span>
                <h3 className="t-h3 mt-1">{title}</h3>
                <p className="t-body text-[var(--az-text-2)]">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" tabIndex={-1} aria-labelledby="how-h" className="scroll-mt-4 bg-[var(--az-band)] outline-none">
          <div className={`${wrap} py-16 sm:py-20`}>
            <p className="t-label">How it works</p>
            <h2 id="how-h" className="t-h1 mt-2">From looking around to taking part</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-4 border-t border-[var(--az-hairline)] pt-5 lg:flex-col lg:gap-2">
                  <span className="text-sm font-bold text-[var(--az-link)]">{String(i + 1).padStart(2, '0')}</span>
                  <span><h3 className="t-h3">{title}</h3><p className="t-body mt-1 text-[var(--az-text-2)]">{text}</p></span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="talk-h" className={`${sectionCls} grid items-center gap-10 lg:grid-cols-2`}>
          <div>
            <p className="t-label">Discussions and engagement</p>
            <h2 id="talk-h" className="t-h1 mt-2">Conversations that stay in their community</h2>
            <p className="mt-3 text-[var(--az-text-2)]">Every community has its own discussions, organised by topic and kept for the people who belong there.</p>
            <Bullets items={DISCUSSIONS} />
          </div>
          <DiscussionsExample />
        </section>

        <section aria-labelledby="meet-h" className="bg-[var(--az-band)]">
          <div className={`${wrap} py-16 sm:py-20`}>
            <p className="t-label">Events and resources</p>
            <h2 id="meet-h" className="t-h1 mt-2">Meet up, and keep what matters in one place</h2>
            <div className="mt-10 grid gap-10 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <h3 className="t-h2">Events</h3>
                <p className="text-[var(--az-text-2)]">Meet-ups, reunions and webinars, in person or online. RSVP, join the waitlist when it’s full, get a reminder, and add it to your calendar.</p>
                <EventsExample />
              </div>
              <div className="flex flex-col gap-4">
                <h3 className="t-h2">Resources</h3>
                <p className="text-[var(--az-text-2)]">Files and links each community keeps for its members, in categories. Uploads are checked for their real file type, and only members can open them.</p>
                <ResourcesExample />
              </div>
            </div>
          </div>
        </section>

        <section id="learning" tabIndex={-1} aria-labelledby="learning-h" className={`${sectionCls} grid items-center gap-10 lg:grid-cols-2`}>
          <div>
            <p className="t-label">Learning</p>
            <h2 id="learning-h" className="t-h1 mt-2">Courses inside the communities that run them</h2>
            <p className="mt-3 text-[var(--az-text-2)]">Learning belongs to a community: its instructors teach, its members learn, and the discussion is a tab away.</p>
            <Bullets items={LEARNING} />
          </div>
          <CourseExample />
        </section>

        <section aria-labelledby="why-h" className="bg-[var(--az-band)]">
          <div className={`${wrap} py-16 sm:py-20`}>
            <p className="t-label">Why CommunityOne</p>
            <h2 id="why-h" className="t-h1 mt-2 max-w-3xl">Good for members, and for the people who run communities</h2>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {[['For members', FOR_MEMBERS], ['For community organisers', FOR_ORGANISERS]].map(([title, items]) => (
                <div key={title} className="panel p-6 sm:p-8">
                  <h3 className="t-h2">{title}</h3>
                  <Bullets items={items} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="cta-h" className={`${wrap} py-16 text-center sm:py-24`}>
          <h2 id="cta-h" className="t-h1">Your community is waiting.</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--az-text-2)]">Find a community that shares your interests, goals and ideas.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/explore" className="btn btn-primary">Explore Communities</Link>
            {secondary}
          </div>
          <p className="t-small mt-5">Running a group already? <Link to={me ? '/communities?new=1' : START_PATH} className="link">Start a community</Link></p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function Bullets({ items }) {
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[15px] leading-6"><Icon name="check" size={18} className="mt-0.5 text-[var(--az-link)]" />{t}</li>
      ))}
    </ul>
  );
}

/** Live communities, filtered in place by the categories the server lists (C3). */
function Discovery() {
  const [category, setCategory] = useState('');
  const { status, communities, categories, retry } = usePublicCommunities({ category, limit: 6 });
  // The chips come from the unfiltered list, so choosing one doesn't hide the others.
  const [chips, setChips] = useState([]);
  useEffect(() => { if (status === 'ready' && !category && categories.length) setChips(categories); }, [status, category, categories]);
  const seeAll = category ? `/explore?${new URLSearchParams({ category })}` : '/explore';

  return (
    <section id="explore" aria-labelledby="explore-h" className="bg-[var(--az-band)]">
      <div className={`${wrap} py-16 sm:py-20`}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="t-label">Explore</p>
            <h2 id="explore-h" className="t-h1 mt-2">Communities you can join today</h2>
            <p className="mt-3 max-w-2xl text-[var(--az-text-2)]">Public communities you can join straight away. Private ones show what they’re about and take a request their admins review. Closed communities are by invitation and never listed.</p>
          </div>
          <Link to={seeAll} className="btn btn-secondary max-sm:hidden">{category ? `See all ${category} communities` : 'See all communities'}</Link>
        </div>
        {chips.length > 0 && (
          <div role="group" aria-label="Filter by category" className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {['', ...chips].map((cat) => (
              <button key={cat || 'all'} type="button" className="filter-chip" aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat || 'All'}</button>
            ))}
          </div>
        )}
        <div className="mt-6" aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'loading' && <CardSkeletons n={3} />}
          {status === 'error' && <LoadError onRetry={retry} />}
          {status === 'ready' && communities.length === 0 && (
            <NoCommunities title="No communities to browse yet">
              <p>Create an account to start one.</p>
              <Link to={START_PATH} className="btn btn-primary mt-4">Get Started</Link>
            </NoCommunities>
          )}
          {status === 'ready' && communities.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
              {communities.map((c, i) => <li key={c.id} className={`flex min-w-0 ${i >= 3 ? 'max-sm:hidden' : ''} [&>article]:min-w-0 [&>article]:flex-1`}><CommunityCard c={c} /></li>)}
            </ul>
          )}
        </div>
        <Link to={seeAll} className="btn btn-secondary mt-6 w-full sm:hidden">{category ? `See all ${category} communities` : 'See all communities'}</Link>
      </div>
    </section>
  );
}

// ---- Example drawings (C2). Each is one image to screen readers, described in one sentence. ----

function Example({ label, className = '', children }) {
  return (
    <div role="img" aria-label={label} className={`panel relative min-w-0 overflow-hidden ${className}`}>
      <span aria-hidden="true" className="badge badge-neutral absolute right-3 top-3 z-10">Example</span>
      <div aria-hidden="true" className="contents">{children}</div>
    </div>
  );
}
const tile = (letters, accent = 'teal') => <span className={`cm-tile cm-${accent}`} style={{ width: 40, height: 40, borderRadius: 10, fontSize: 14 }}>{letters}</span>;
const DateTile = ({ day, month }) => (
  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--az-sunken)] text-center leading-none">
    <span><span className="block text-[11px] font-semibold uppercase text-[var(--az-text-2)]">{month}</span><span className="block text-lg font-bold">{day}</span></span>
  </span>
);

function HeroExample() {
  return (
    <Example label="Example of a community page on CommunityOne, showing a discussion post, an upcoming event and a course.">
      <div className="cm-teal cm-cover flex items-center gap-3 px-5 pb-4 pt-5 max-sm:hidden">
        {tile('HR')}
        <div className="min-w-0"><p className="t-h3">Harbour Rowers</p><p className="t-small">Hobbies and Interests · Public</p></div>
      </div>
      <div className="flex gap-4 overflow-hidden border-b border-[var(--az-hairline)] px-5 text-sm font-medium text-[var(--az-text-2)] max-sm:hidden">
        {['Overview', 'Discussions', 'Learning', 'Events', 'Resources', 'Members', 'About'].map((t, i) => (
          <span key={t} className={`whitespace-nowrap py-3 ${i === 0 ? 'border-b-2 border-[var(--az-link)] text-[var(--az-text)]' : ''}`}>{t}</span>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-5 max-sm:pt-12">
        <div className="sunken p-4">
          <p className="t-small"><b className="text-[var(--az-text)]">Club admin</b> · Announcements</p>
          <p className="mt-1.5 text-sm leading-6">Saturday’s beginner session moves to 7:00. The boathouse opens at 6:30, and life jackets are provided.</p>
          <p className="t-small mt-2 flex gap-4"><span className="inline-flex items-center gap-1"><Icon name="like" size={14} />Like</span><span className="inline-flex items-center gap-1"><Icon name="channels" size={14} />Reply</span><span className="inline-flex items-center gap-1"><Icon name="bookmarks" size={14} />Save</span></p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--az-hairline)] p-3">
          <DateTile day="14" month="Sat" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">Beginner session on the water</p><p className="t-small">7:00 · Boathouse</p></div>
          <span className="badge badge-ok">Going</span>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--az-hairline)] p-3 max-sm:hidden">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--az-ok-soft)] text-[var(--az-link)]"><Icon name="cap" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Rowing basics</p>
            <p className="t-small">Lesson 2 of 4</p>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--az-sunken)]"><span className="block h-full w-1/2 rounded-full bg-[var(--az-link)]" /></span>
          </div>
        </div>
      </div>
    </Example>
  );
}

function DiscussionsExample() {
  return (
    <Example label="Example of a community’s discussions: a pinned required read, a question with replies and a poll.">
      <div className="flex gap-2 overflow-hidden border-b border-[var(--az-hairline)] p-4 pr-24">
        {['All', 'Announcements', 'Questions', 'Meet-ups'].map((t, i) => <span key={t} className={`whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold ${i === 0 ? 'bg-[var(--az-text)] text-[var(--az-page)]' : 'bg-[var(--az-sunken)]'}`}>{t}</span>)}
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-xl border border-[var(--az-hairline)] p-4">
          <span className="badge badge-warn"><Icon name="pinned" size={13} />Required read</span>
          <p className="mt-2 text-sm font-semibold">Updated safety rules for the boathouse</p>
          <p className="t-small mt-1">Confirm once you’ve read it</p>
          <span className="btn btn-secondary btn-sm mt-3">I’ve read this</span>
        </div>
        <div className="rounded-xl border border-[var(--az-hairline)] p-4">
          <span className="badge badge-info">Question</span>
          <p className="mt-2 text-sm font-semibold">Which sessions suit complete beginners?</p>
          <p className="t-small mt-1 inline-flex items-center gap-1"><Icon name="channels" size={14} />Replies from members</p>
        </div>
        <div className="rounded-xl border border-[var(--az-hairline)] p-4">
          <span className="badge badge-neutral"><Icon name="poll" size={13} />Poll</span>
          <p className="mt-2 text-sm font-semibold">Pick a date for the spring regatta</p>
          {['First Saturday of the month', 'Second Saturday of the month'].map((o, i) => (
            <p key={o} className="mt-2 flex items-center gap-2 text-sm"><span className={`h-4 w-4 rounded-full border-2 ${i === 0 ? 'border-[var(--az-link)] bg-[var(--az-link)] shadow-[inset_0_0_0_3px_var(--az-surface)]' : 'border-[var(--az-control)]'}`} />{o}</p>
          ))}
        </div>
      </div>
    </Example>
  );
}

function EventsExample() {
  return (
    <Example label="Example of two events: one you’re going to and one with a waitlist." className="flex flex-col gap-3 p-4 pt-12">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--az-hairline)] p-3">
        <DateTile day="14" month="Sat" />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Beginner session on the water</p><p className="t-small">Boathouse · 7:00</p></div>
        <span className="badge badge-ok">Going</span>
        <span className="t-small inline-flex items-center gap-1"><Icon name="calendar" size={14} />Add to calendar</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--az-hairline)] p-3">
        <DateTile day="20" month="Fri" />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Open evening</p><p className="t-small">Online · 18:30</p></div>
        <span className="badge badge-warn">On the waitlist</span>
      </div>
    </Example>
  );
}

function ResourcesExample() {
  const rows = [['doc', 'Club handbook', 'PDF'], ['doc', 'Safety checklist', 'Document'], ['link', 'Tide times', 'Link']];
  return (
    <Example label="Example of a community’s resources: two files and a link, for members only." className="p-4 pt-12">
      <ul className="divide-y divide-[var(--az-hairline)]">
        {rows.map(([icon, name, kind]) => (
          <li key={name} className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--az-sunken)] text-[var(--az-text-2)]"><Icon name={icon} size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{name}</span><span className="t-small">{kind}</span></span>
            <span className="t-small inline-flex items-center gap-1"><Icon name="lock" size={13} />Members only</span>
          </li>
        ))}
      </ul>
    </Example>
  );
}

function CourseExample() {
  const lessons = [['Getting into the boat', 'Done', 'ok'], ['Your first strokes', 'Continue', 'info'], ['Quiz: safety on the water', 'Quiz', 'neutral'], ['Plan a training session', 'Assignment', 'neutral']];
  return (
    <Example label="Example of a course inside a community: progress, four lessons including a quiz and an assignment, and a certificate on completion.">
      <div className="cm-teal cm-cover p-5 pr-24">
        <p className="t-small">Course · Harbour Rowers</p>
        <p className="t-h2 mt-1">Rowing basics</p>
        <p className="t-small mt-1">Instructor and teaching assistant from the club</p>
      </div>
      <div className="p-5">
        <p className="t-small">Lesson 2 of 4</p>
        <span className="mt-2 block h-2 overflow-hidden rounded-full bg-[var(--az-sunken)]"><span className="block h-full w-1/2 rounded-full bg-[var(--az-link)]" /></span>
        <ol className="mt-4 divide-y divide-[var(--az-hairline)]">
          {lessons.map(([title, state, tone], i) => (
            <li key={title} className="flex items-center gap-3 py-3 text-sm">
              <span className="w-5 font-semibold text-[var(--az-text-2)]">{i + 1}</span>
              <span className="min-w-0 flex-1 font-medium">{title}</span>
              <span className={`badge badge-${tone}`}>{state}</span>
            </li>
          ))}
        </ol>
        <p className="t-small mt-3 flex items-center gap-2"><Icon name="medal" size={16} />Certificate on completion. Anyone with its link can check it’s real.</p>
      </div>
    </Example>
  );
}
