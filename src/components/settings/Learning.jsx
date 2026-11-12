// Settings, Learning (board V2GSettings): the section switch and what it means, how courses work,
// and the course counts. When a Platform Admin has Learning off for all of CommunityOne, this
// says so and the switch can't be used; the community's own choice is kept for when it returns.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { communityPath } from '../../lib/communities.js';
import { isOn, useFeatures } from '../../lib/features.js';
import Switch from '../manage/Switch.jsx';
import { withSections } from './Content.jsx';
import { Group, InfoRow, SectionForm, useSectionDraft } from './shared.jsx';

export default function Learning({ g, src }) {
  const platformOn = isOn(useFeatures(), 'learning');
  const base = useMemo(() => ({ learning: src.sections?.learning ?? true }), [src.sections?.learning]);
  const d = useSectionDraft(src, base);
  const [courses, setCourses] = useState(null);
  useEffect(() => {
    if (!platformOn || !base.learning) { setCourses(null); return; }
    api(`/communities/${encodeURIComponent(g.id)}/courses`).then((r) => setCourses(r.courses ?? [])).catch(() => setCourses(null));
  }, [g.id, platformOn, base.learning]);
  const n = (status) => (courses ?? []).filter((c) => c.status === status).length;
  const save = () => d.submit({ settings: { sections: withSections(src, { learning: d.value.learning }) } });
  return (
    <SectionForm title="Learning" draft={d} onSave={save} summary={d.dirty ? `You switched Learning ${d.value.learning ? 'on' : 'off'}.` : ''}
      lede={`Courses, enrolments and certificates in ${g.name}.`}>
      {!platformOn && <p role="status" className="notice notice-info">Learning is switched off for all of CommunityOne by a Platform Admin, so this switch can’t be used now. Courses are kept, and {g.name}’s own choice returns with it.</p>}
      <Group title="Learning in this community">
        <Switch id="set-learning" label="Learning in this community" checked={platformOn && d.value.learning} disabled={!platformOn}
          onChange={(on) => d.set('learning', on)}
          hint="Off hides the Learning section. Courses, progress and certificates are kept; certificates keep verifying." />
        <div>
          <InfoRow title="How courses work">Owners and Admins build courses, and the Instructors they add to one. Certificates are issued automatically with a verification code.</InfoRow>
          {platformOn && base.learning && (
            <InfoRow title="Courses" to={communityPath(g, 'learning')} action="Open Teaching">
              {courses ? `${n('published')} published · ${n('draft')} drafts · ${n('archived')} archived` : 'Counting the courses…'}
            </InfoRow>
          )}
        </div>
      </Group>
    </SectionForm>
  );
}
