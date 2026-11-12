// Settings, Privacy and visibility (G4, boards V2GSettings and V2GPhoneSettings). Choosing a new
// visibility and saving first shows what will happen, with real counts from
// GET /communities/:id/visibility-impact; only then is it saved. The server re-evaluates pending
// requests itself (VIS-13) and audits the change.
import { useMemo } from 'react';
import { api } from '../../lib/api.js';
import { confirmAction } from '../ui/Confirm.jsx';
import { Choices, Group, Locked, plural, SectionForm, useSectionDraft } from './shared.jsx';

export const VISIBILITY = {
  public: { label: 'Public', icon: 'globe', hint: 'Anyone signed in to CommunityOne can find it, read it and join at once.' },
  private: { label: 'Private', icon: 'lock', hint: 'Anyone can find it and see its card. Content is for members; people ask to join and an Admin approves.' },
  closed: { label: 'Closed', icon: 'eyeoff', hint: 'Hidden from Explore, search and suggestions. People join only by invitation.' },
};

const contentText = (m) => {
  if (!m) return 'discussions, events, resources and courses';
  const parts = [plural(m.posts ?? 0, 'post'), plural(m.events ?? 0, 'event'), plural(m.resources ?? 0, 'resource'), plural(m.courses ?? 0, 'course')];
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
};

/** What changing from `from` to `to` does, as lines for the confirm. `x` is the impact, or null. */
function effects(g, from, to, x) {
  const n = (k) => (x ? x[k] ?? 0 : null);
  const waiting = n('pendingRequests');
  const invites = n('openInvitations');
  const lines = [];
  if (to === 'public') {
    if (from === 'private') lines.push(waiting == null ? 'Everyone waiting to join becomes a member at once.' : waiting ? `The ${plural(waiting, 'person', 'people')} waiting to join become${waiting === 1 ? 's a member' : ' members'} at once.` : 'Nobody is waiting to join, so no requests change.');
    if (from === 'closed') lines.push('It appears in Explore, search and suggestions straight away.');
    lines.push(x ? `Its members-only content becomes readable by everyone signed in: ${contentText(x.membersOnlyContent)}.` : 'Its discussions, events, resources and courses become readable by everyone signed in.');
  }
  if (to === 'private') {
    if (from === 'public') {
      lines.push('Discussions, events, resources and courses become members-only straight away.');
      lines.push('People who aren’t members still see its card and can ask to join; an Admin approves each one.');
    } else {
      lines.push('It appears in Explore and search again; people who aren’t members see its card and can ask to join.');
      lines.push('Content stays members-only.');
    }
  }
  if (to === 'closed') {
    if (from === 'public') lines.push('Discussions, events, resources and courses become members-only straight away.');
    lines.push(waiting == null ? 'Pending join requests are dropped; those people would need an invitation.' : waiting ? `${plural(waiting, 'pending request')} ${waiting === 1 ? 'is' : 'are'} dropped; they’d need an invitation.` : 'There are no pending join requests to drop.');
    lines.push('It leaves Explore, search and suggestions now.');
  }
  lines.push(`All ${plural(g.memberCount ?? 0, 'member')} stay members. Nobody is removed.`);
  if (invites) lines.push(`${plural(invites, 'open invitation')} still work${invites === 1 ? 's' : ''}.`);
  return lines;
}

export default function Privacy({ g, src }) {
  const current = src.community.visibility ?? 'public';
  const base = useMemo(() => ({ visibility: current }), [current]);
  const d = useSectionDraft(src, base);
  const to = d.value.visibility;

  const save = async () => {
    let impact = null;
    try { impact = await api(`/communities/${encodeURIComponent(g.id)}/visibility-impact?to=${encodeURIComponent(to)}`); } catch { impact = null; }
    const lines = effects(g, current, to, impact);
    const ok = await confirmAction({
      title: `Make ${g.name} ${VISIBILITY[to].label}?`,
      body: (
        <>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          {!impact && <p className="mt-3">The exact numbers couldn’t be loaded just now.</p>}
        </>
      ),
      cancel: `Keep it ${VISIBILITY[current].label}`, confirm: `Make it ${VISIBILITY[to].label}`, danger: to === 'closed',
    });
    if (ok) await d.submit({ visibility: to }, { ok: `${g.name} is now ${VISIBILITY[to].label}` });
  };

  return (
    <SectionForm title="Privacy and visibility" draft={d} onSave={save} summary={d.dirty ? `You changed Visibility to ${VISIBILITY[to].label}.` : ''}
      lede={`Who can find ${g.name} and what they can see. Access is checked on every request, so a change applies the moment it’s saved.`}>
      <Group title="Visibility">
        <Choices legend="Who can find and read it" value={to} onChange={(x) => d.set('visibility', x)}
          options={Object.entries(VISIBILITY).map(([value, o]) => ({ value, ...o, current: value === current }))} />
        <Locked>Member-only content stays out of search, notification previews and file links for people who aren’t members.</Locked>
      </Group>
    </SectionForm>
  );
}
