// Settings, Notifications (G5, board V2GSettings): whether members of this community get an email
// by default for each category. In-app notifications always arrive, and a member who set a
// category themselves keeps their choice (NTF-01). Saved as settings.notifyDefaults.
import { useMemo } from 'react';
import Switch from '../manage/Switch.jsx';
import { Group, Locked, SectionForm, useSectionDraft } from './shared.jsx';

// The platform's own email defaults (server/lib/notify.js CATEGORIES), in its words.
const CATEGORIES = [
  ['replies', 'Replies to your posts', false],
  ['mentions', 'Mentions', true],
  ['joinDecisions', 'Join requests and decisions', true],
  ['events', 'Events you’re going to', true],
  ['announcements', 'New announcements', false],
  ['learning', 'Your courses', true],
];

export default function Notifications({ g, src }) {
  const saved = src.settings.notifyDefaults;
  const base = useMemo(() => Object.fromEntries(CATEGORIES.map(([k, , def]) => [k, typeof saved?.[k] === 'boolean' ? saved[k] : def])), [saved]);
  const d = useSectionDraft(src, base);
  const save = () => d.submit({ settings: { notifyDefaults: Object.fromEntries(CATEGORIES.map(([k]) => [k, !!d.value[k]])) } });
  return (
    <SectionForm title="Notifications" draft={d} onSave={save} fields={['settings.notifyDefaults']}
      summary={d.dirty ? `You changed ${d.changed.map((k) => CATEGORIES.find(([x]) => x === k)[1]).join(', ')}.` : ''}
      lede={`Whether members of ${g.name} get an email by default. In-app notifications always arrive. A member who changed a category themselves keeps their choice.`}>
      <Group title="Email defaults" hint="Each row shows the platform default; the switch is what this community uses instead.">
        <div className="divide-y divide-[var(--az-divider)]">
          {CATEGORIES.map(([k, label, def]) => (
            <Switch key={k} id={`set-notify-${k}`} label={label} checked={d.value[k]} onChange={(on) => d.set(k, on)}
              hint={`Platform default: ${def ? 'On' : 'Off'}${d.value[k] !== def ? ' · changed here' : ''}`} />
          ))}
        </div>
        {d.fieldError('settings.notifyDefaults') && <p role="alert" className="field-error">{d.fieldError('settings.notifyDefaults')}</p>}
        <Locked>Always sent: moderation decisions about you, your reports and appeals, and account notices.</Locked>
      </Group>
    </SectionForm>
  );
}
