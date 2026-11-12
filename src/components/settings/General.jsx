// Settings, General (board V2GSettings): name, short description, category, guidelines and the
// "Who this is for" line. Its address follows the name, so a new name moves the page with it.
import { useId, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../../../shared/categories.js';
import { managePath } from '../../lib/manage.js';
import { changedText, Group, SectionForm, TextField, useSectionDraft } from './shared.jsx';

const LABEL = { name: 'Name', description: 'Short description', category: 'Category', guidelines: 'Guidelines', audience: 'Who this is for' };

export default function General({ g, src }) {
  const navigate = useNavigate();
  const c = src.community;
  const base = useMemo(() => ({
    name: c.name ?? '', description: c.description ?? '', category: c.category ?? '',
    guidelines: src.settings.guidelines ?? '', audience: src.settings.audience ?? '',
  }), [c.name, c.description, c.category, src.settings.guidelines, src.settings.audience]);
  const d = useSectionDraft(src, base);
  const v = d.value;
  const catId = useId();
  const nameError = d.value.name.trim().length < 2 || d.value.name.trim().length > 80 ? 'Give the community a name of 2 to 80 characters.' : null;
  const showNameError = d.changed.includes('name') ? nameError : null;

  const save = async () => {
    if (nameError) return;
    const body = {}; const settings = {};
    for (const k of d.changed) {
      if (k === 'name') body.name = v.name.trim();
      else if (k === 'description') body.description = v.description.trim() || null;
      else if (k === 'category') body.category = v.category || null;
      else settings[k] = k === 'audience' ? (v.audience.trim() || null) : v[k];
    }
    if (Object.keys(settings).length) body.settings = settings;
    const res = await d.submit(body);
    // A new name is a new address: stay on this page at it.
    if (res?.community?.slug && res.community.slug !== (g.slug || g.id)) navigate(managePath(res.community, 'settings', 'general'), { replace: true });
  };

  const categories = CATEGORIES.includes(base.category) || !base.category ? CATEGORIES : [base.category, ...CATEGORIES];
  return (
    <SectionForm title="General" lede={`What ${g.name} is called, what it’s for and how members are asked to behave.`} draft={d}
      fields={['name', 'category', 'settings.guidelines', 'settings.audience']}
      summary={changedText(d.changed.map((k) => LABEL[k]))} onSave={save}>
      {(src?.community?.template || src?.community?.lastChange) && (
        <p className="t-small">
          {src.community.template && <>Made from the {src.community.template.name} template, version {src.community.template.version}. Later template changes don’t reach it. </>}
          {src.community.lastChange && <>Last changed by {src.community.lastChange.by}, {new Date(src.community.lastChange.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.</>}
        </p>
      )}
      <Group title="About this community">
        <TextField label="Name" value={v.name} onChange={(x) => d.set('name', x)} maxLength={80} required
          hint="2 to 80 characters. Its address follows the name." error={showNameError || d.fieldError('name')} />
        <TextField label="Short description" multiline rows={3} value={v.description} onChange={(x) => d.set('description', x)} maxLength={1000}
          hint="Shown on its card in Explore and at the top of About. Up to 1,000 characters." />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={catId} className="text-sm font-semibold text-[var(--az-text)]">Category</label>
          <select id={catId} className="input w-full sm:max-w-sm" value={v.category} onChange={(e) => d.set('category', e.target.value)}
            aria-describedby={d.fieldError('category') ? `${catId}-e` : undefined} aria-invalid={d.fieldError('category') ? true : undefined}>
            {!base.category && <option value="">Choose a category</option>}
            {categories.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          {d.fieldError('category') && <span id={`${catId}-e`} className="field-error">{d.fieldError('category')}</span>}
        </div>
        <TextField label="Who this is for" value={v.audience} onChange={(x) => d.set('audience', x)} maxLength={200}
          hint="One line on the join screen, for example “Alumni living and working in Bengaluru”. Up to 200 characters." error={d.fieldError('settings.audience')} />
      </Group>
      <Group title="Guidelines">
        <TextField label="Community guidelines" multiline rows={6} value={v.guidelines} onChange={(x) => d.set('guidelines', x)} maxLength={5000}
          hint="Members see these on About and on the Overview. Up to 5,000 characters." error={d.fieldError('settings.guidelines')} />
      </Group>
    </SectionForm>
  );
}
