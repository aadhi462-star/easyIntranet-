import { Glyph } from '../components/icons.jsx';
import { Link } from 'react-router-dom';
import { Logo, ThemeToggle } from '../components/ui.jsx';

// Section order follows the HooBank template: navbar, hero, stats, features, showcase,
// testimonials, CTA, footer. Copy is AlumniZone's own.
const stats = [['8,400+', 'Alumni members'], ['120', 'Active groups'], ['340', 'Events a year']];

const features = [
  ['📣', 'The Wall', 'Post updates, polls and announcements. Admins can mark posts as Mandatory Read and track who has acknowledged them.'],
  ['👥', 'Groups', 'Spaces for your batch, city or interests, each with its own feed, forums, events and members.'],
  ['📅', 'Events', 'Reunions and meet-ups with RSVPs, hosts and event assistants, in month or list view.'],
  ['💬', 'Channels', 'Real-time chat rooms. Link one to a group and new members join automatically.'],
  ['🗂️', 'Forums', 'Long-form questions and answers organised by category, with drafts and upvotes.'],
  ['📖', 'Manuals', 'A shared knowledge base of chapters and articles: handbooks, guides and checklists.'],
];

const testimonials = [
  ['Meera Iyer', 'Class of 2014 · Mumbai', 'We went from a scattered WhatsApp group to monthly chapter meet-ups. Polls and RSVPs made planning painless.'],
  ['Karthik Menon', 'Class of 2016 · Founder', 'My first three hires came from the jobs channel. It’s the most trusted network I have.'],
  ['Priya Sharma', 'Class of 2015 · Mentor', 'Matching students with mentors used to take weeks of email. Now it’s a group and a forum.'],
];

export default function Landing() {
  return (
    <div className="relative overflow-hidden">
      <div className="aurora" />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <a href="#features" className="hidden px-3 text-sm text-slate-300 hover:text-white sm:inline">Features</a>
          <a href="#stories" className="hidden px-3 text-sm text-slate-300 hover:text-white sm:inline">Stories</a>
          <Link to="/explore" className="hidden px-3 text-sm text-slate-300 hover:text-white sm:inline">Explore</Link>
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Sign in</Link>
          <Link to="/signup" className="btn btn-primary">Join</Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-2 lg:pt-20">
        <div>
          <span className="chip"><Glyph value="🎓" tile={false} size={16} /> Open alumni community · free to join</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Your alumni community, <span className="text-brand-gradient">in one place.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
            Catch up on the wall, join groups, go to events and keep your story up to date. Open to every alumnus, with friendly moderation to keep it a good place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn btn-primary h-12 px-6">Join the community</Link>
            <Link to="/explore" className="btn btn-ghost h-12 px-6">Look around first</Link>
          </div>
        </div>
        <HeroPreview />
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-3 sm:px-6">
        {stats.map(([n, l]) => (
          <div key={l} className="glass p-6">
            <div className="text-4xl font-extrabold text-brand-gradient">{n}</div>
            <div className="mt-1 text-sm uppercase tracking-wider text-slate-400">{l}</div>
          </div>
        ))}
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h2 className="max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Everything your network needs, built in.</h2>
        <p className="mt-3 max-w-xl text-slate-400">No third-party tools to stitch together. Wall, groups, events, channels, forums and manuals share one login and one directory.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([icon, title, text]) => (
            <article key={title} className="glass p-6 transition hover:-translate-y-0.5">
              <div className="brand-gradient grid h-12 w-12 place-items-center rounded-xl text-xl">{icon}</div>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="stories" className="relative z-10 mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">What alumni say</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {testimonials.map(([name, meta, quote]) => (
            <figure key={name} className="glass p-6">
              <blockquote className="text-[15px] leading-relaxed text-slate-200">“{quote}”</blockquote>
              <figcaption className="mt-5 text-sm"><b>{name}</b><div className="text-slate-400">{meta}</div></figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="brand-gradient flex flex-col items-start justify-between gap-6 rounded-3xl p-8 sm:flex-row sm:items-center sm:p-12">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Find your batch today</h2>
            <p className="mt-2 text-white/85">Free, open to every alumnus, and it takes under a minute.</p>
          </div>
          <Link to="/signup" className="btn h-12 bg-white px-6 text-ink-900 hover:bg-white/90">Join free</Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6">
          <Logo size={28} />
          <p>© {new Date().getFullYear()} CommunityOne. One Platform. Every Community.</p>
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="glass p-5">
        <div className="flex items-center gap-3">
          <span className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-500" />
          <div><div className="text-sm font-semibold">Sara Thomas</div><div className="text-xs text-slate-400">Announcement · 2h</div></div>
          <span className="chip ml-auto !bg-amber-400/15 !text-amber-200">Mandatory read</span>
        </div>
        <p className="mt-4 text-sm text-slate-200">The Annual Alumni Homecoming is confirmed for next month! 🎉</p>
        <div className="mt-4 flex gap-4 text-xs text-slate-400"><span>❤️ 24</span><span><Glyph value="💬" tile={false} size={16} /> 8</span><span><Glyph value="✅" tile={false} size={16} /> 112 acknowledged</span></div>
      </div>
      <div className="glass absolute -bottom-10 -right-4 w-56 p-4 sm:-right-10">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand-400">Next event</div>
        <div className="mt-1 font-semibold">Bengaluru Meet-up</div>
        <div className="text-xs text-slate-400">Cubbon Park · 18 going</div>
      </div>
    </div>
  );
}
