// Step 4, Preview (F8, board V2FConfigure "4 · Preview"): the community's header and Overview drawn
// from the draft, as someone who isn't a member yet sees it, at desktop or phone width (phone
// first on phones). Sample posts and an event carry a Sample badge; the buttons don't act.
// Nothing here is saved or sent.
import { useState } from 'react';
import { Icon } from '../icons.jsx';
import { Badge } from '../ui/Controls.jsx';
import { CommunityTile, VisibilityBadge } from '../public/CommunityCards.jsx';
import { lines, SECTION_LIST } from './draft.js';
import { StepBar, StepTitle, useIsPhone } from './parts.jsx';

const ACCENT = 'teal';

function samplesFor(d) {
  const c = d.config;
  const own = d.template?.samples;
  const topics = c.topics.map((x) => x.trim()).filter(Boolean);
  const posts = Array.isArray(own?.posts) && own.posts.length
    ? own.posts.slice(0, 2).map((p) => ({ topic: p.topic ?? topics[0] ?? '', title: p.title ?? String(p) }))
    : [
      { topic: topics[0] ?? '', title: 'Introduce yourself: who you are and what brings you here' },
      { topic: topics[1] ?? topics[0] ?? '', title: 'What would you like this community to do first?' },
    ];
  const when = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const event = own?.event?.title
    ? { title: own.event.title, category: own.event.category ?? c.eventCategories[0] ?? '' }
    : { title: c.eventCategories[0] ? `${c.eventCategories[0]}: first get-together` : 'First get-together', category: c.eventCategories[0] ?? '' };
  return { posts, event: { ...event, when } };
}

export default function PreviewStep({ draft, pictures, learningAllowed, onBack, onPublish }) {
  const phoneScreen = useIsPhone();
  const [view, setView] = useState(phoneScreen ? 'phone' : 'desktop');
  const phone = view === 'phone';
  const c = draft.config;
  const name = c.name.trim() || 'Your community';
  const g = { name, accent: ACCENT };
  const on = (s) => c.sections.includes(s);
  const tabs = ['Overview', ...SECTION_LIST.filter((s) => on(s.id)).map((s) => s.label), ...(c.learning && learningAllowed ? ['Learning'] : []), 'Members', 'About'];
  const join = c.visibility === 'private' ? 'Request to join' : c.visibility === 'closed' ? 'Invitation only' : 'Join';
  const { posts, event } = samplesFor(draft);
  const rules = lines(c.guidelines);
  const inert = { 'aria-disabled': true, tabIndex: -1, onClick: (e) => e.preventDefault() };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <StepTitle>Preview</StepTitle>
        <div role="group" aria-label="Preview width" className="inline-flex rounded-lg border border-[var(--az-hairline)] bg-[var(--az-surface)] p-0.5">
          {[['desktop', 'monitor', 'Desktop'], ['phone', 'user', 'Phone']].map(([id, icon, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${view === id ? 'bg-[var(--az-sunken)] text-[var(--az-text)]' : 'text-[var(--az-text-2)]'}`}>
              <Icon name={icon} size={16} />{label}
            </button>
          ))}
        </div>
      </div>

      <div role="note" className="notice notice-info flex items-start gap-2">
        <Icon name="eye" size={18} className="mt-0.5 shrink-0" />
        <span><b>Preview only.</b> This is how the page will look to someone who isn’t a member yet. Items marked Sample are examples and are not saved; your community starts with no posts. Nobody else can see this.</span>
      </div>

      <div className={`mx-auto w-full overflow-hidden rounded-2xl border border-[var(--az-hairline)] bg-[var(--az-page)] ${phone ? 'max-w-[390px]' : ''}`}
        aria-label={`${name}, preview at ${phone ? 'phone' : 'desktop'} width`} role="region">
        {pictures.cover
          ? <img src={pictures.cover.url} alt="" className={`w-full object-cover ${phone ? 'aspect-[13/4]' : 'aspect-[32/5]'}`} />
          : <div className={`cm-cover cm-${ACCENT} grid w-full place-items-center ${phone ? 'aspect-[13/4]' : 'aspect-[32/5]'}`}><span className="t-small">No cover yet</span></div>}
        <div className="bg-[var(--az-surface)]">
          <div className={`flex gap-3 px-4 pb-3 ${phone ? 'flex-col' : 'items-end px-6'}`}>
            <span className="-mt-7 inline-block self-start rounded-2xl border-2 border-[var(--az-surface)]">
              {pictures.logo ? <img src={pictures.logo.url} alt="" className={`${phone ? 'h-12 w-12' : 'h-16 w-16'} rounded-xl object-cover`} /> : <CommunityTile c={g} size={phone ? 48 : 64} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-h2 block [overflow-wrap:anywhere]">{name}</span>
              <span className="t-small flex flex-wrap items-center gap-2">{[c.category, '1 member'].filter(Boolean).join(' · ')}{c.visibility && <VisibilityBadge visibility={c.visibility} />}</span>
            </span>
            <button type="button" className={`btn btn-primary ${phone ? 'w-full' : ''}`} {...inert}>{join}</button>
          </div>
          <div className={`no-scrollbar flex gap-5 overflow-x-auto border-t border-[var(--az-divider)] ${phone ? 'px-4' : 'px-6'}`}>
            {tabs.map((t, i) => (
              <span key={t} className={`shrink-0 border-b-2 py-2.5 text-sm ${i === 0 ? `cm-${ACCENT} border-[var(--cm-ink)] font-semibold text-[var(--az-text)]` : 'border-transparent text-[var(--az-text-2)]'}`}>{t}</span>
            ))}
          </div>
        </div>

        <div className={`grid gap-4 p-4 ${phone ? '' : 'p-6 md:grid-cols-[minmax(0,1fr)_280px]'}`}>
          <div className="flex min-w-0 flex-col gap-4">
            <section className="panel flex flex-col gap-2 p-5">
              <h2 className="t-h3">Welcome</h2>
              <p className="text-sm leading-[22px] text-[var(--az-text)] [overflow-wrap:anywhere]">{c.description.trim() || 'Your description appears here.'}</p>
              {c.audience.trim() && <p className="t-small">For: {c.audience.trim()}</p>}
            </section>
            {on('discussions') && (
              <section className="panel flex flex-col gap-3 p-5">
                <h2 className="t-h3">Discussions</h2>
                {posts.map((p) => (
                  <article key={p.title} className="flex flex-col gap-1 border-t border-[var(--az-divider)] pt-3 first-of-type:border-0 first-of-type:pt-0">
                    <span className="flex flex-wrap items-center gap-2"><Badge tone="warn">Sample</Badge><span className="t-small">Sample member{p.topic ? ` · ${p.topic}` : ''}</span></span>
                    <span className="text-[15px] font-semibold text-[var(--az-text)]">{p.title}</span>
                  </article>
                ))}
              </section>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {on('events') && (
              <section className="panel flex flex-col gap-2 p-5">
                <h2 className="t-h3">Next event</h2>
                <span><Badge tone="warn">Sample</Badge></span>
                <span className="text-[15px] font-semibold text-[var(--az-text)]">{event.title}</span>
                <span className="t-small">{[event.when, event.category].filter(Boolean).join(' · ')}</span>
              </section>
            )}
            {rules.length > 0 && (
              <section className="panel flex flex-col gap-2 p-5">
                <h2 className="t-h3">Guidelines</h2>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-[22px] text-[var(--az-text)]">
                  {rules.slice(0, 2).map((r) => <li key={r}>{r}</li>)}
                </ul>
                {rules.length > 2 && <span className="t-small">And {rules.length - 2} more on About.</span>}
              </section>
            )}
            <section className="panel flex flex-col gap-2 p-5">
              <h2 className="t-h3">Members</h2>
              <p className="t-small">Just you so far.</p>
            </section>
          </div>
        </div>
      </div>
      <p className="t-small text-center">Buttons in the preview don’t do anything.</p>

      <StepBar back={{ label: 'Back to configure', onClick: onBack }} next={{ label: 'Validate and publish', short: 'Publish', onClick: onPublish }} />
    </div>
  );
}
