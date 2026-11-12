// Settings, Discussions and content (G3 switches, board V2GSettings): whether Discussions is on,
// who can start discussions, whether new posts wait for approval, and the discussion topics
// (saved straight away through the topics routes, so they aren't part of this page's Save).
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { toast } from '../../lib/toast.js';
import Switch from '../manage/Switch.jsx';
import { Button } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { changedText, Choices, Group, Locked, plural, SectionForm, useSectionDraft } from './shared.jsx';

// Sections a community can switch off (v2 E1); settings.sections lists the ones that are on.
export const SWITCHABLE = ['discussions', 'events', 'resources', 'learning'];
export const sectionsOn = (src) => SWITCHABLE.filter((k) => src.sections?.[k] ?? true);
/** The full list to save, with one section switched. */
export const withSections = (src, on) => SWITCHABLE.filter((k) => (k in on ? on[k] : (src.sections?.[k] ?? true)));

const LABEL = { discussions: 'Discussions', whoCanPost: 'Who can start discussions', requireApproval: 'Hold new posts for approval' };

export default function Content({ g, src }) {
  const s = src.settings;
  const base = useMemo(() => ({
    discussions: src.sections?.discussions ?? true,
    whoCanPost: s.whoCanPost ?? (s.announceOnly ? 'admins' : 'members'),
    requireApproval: !!s.requireApproval,
  }), [src.sections?.discussions, s.whoCanPost, s.announceOnly, s.requireApproval]);
  const d = useSectionDraft(src, base);
  const v = d.value;
  const save = () => {
    const settings = {};
    if (d.changed.includes('whoCanPost')) { settings.whoCanPost = v.whoCanPost; settings.announceOnly = v.whoCanPost === 'admins'; }
    if (d.changed.includes('requireApproval')) settings.requireApproval = v.requireApproval;
    if (d.changed.includes('discussions')) settings.sections = withSections(src, { discussions: v.discussions });
    return d.submit({ settings });
  };
  return (
    <SectionForm title="Discussions and content" draft={d} onSave={save} summary={changedText(d.changed.map((k) => LABEL[k]))}
      lede={`What members can post in ${g.name}, and the topics they file it under.`}>
      <Group title="Discussions">
        <Switch id="set-discussions" label="Discussions in this community" checked={v.discussions} onChange={(on) => d.set('discussions', on)}
          hint="Off hides the Discussions section and its address. Nothing in it is deleted; it all comes back when you switch it on." />
        <Choices legend="Who can start discussions" value={v.whoCanPost} onChange={(x) => d.set('whoCanPost', x)} options={[
          { value: 'members', label: 'Members' },
          { value: 'admins', label: 'Only Owners and Admins', hint: 'Members can still reply and react. Good for announcement communities.' },
        ]} />
        <Switch id="set-hold" label="Hold new posts for approval" checked={v.requireApproval} onChange={(on) => d.set('requireApproval', on)}
          hint="Moderators approve them in the Queue. Posts by Moderators and above publish at once." />
        <Locked>Attachments: images and PDFs, up to 4 per post.</Locked>
      </Group>
      <Topics g={g} on={base.discussions} />
    </SectionForm>
  );
}

/** Discussion topics: up to 12; rename, archive (posts keep their place, under No topic), add. */
function Topics({ g, on }) {
  const id = useId();
  const [s, setS] = useState({ status: 'loading', topics: [] });
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, name }
  const load = useCallback(() => api(`/communities/${encodeURIComponent(g.id)}/topics`)
    .then((r) => setS({ status: 'ready', topics: r.topics }))
    .catch((e) => setS({ status: 'error', topics: [], message: e.code === 'SECTION_OFF' ? 'Switch Discussions on and save to edit its topics.' : errorText(e) })), [g.id]);
  useEffect(() => { load(); }, [load, on]);
  const call = async (fn, ok) => {
    setBusy(true); setError('');
    try { const r = await fn(); setS({ status: 'ready', topics: r.topics }); if (ok) toast(ok); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  const add = async () => {
    const n = name.trim();
    if (!n) { setError('Type a topic name first.'); return; }
    if (await call(() => api(`/communities/${encodeURIComponent(g.id)}/topics`, { method: 'POST', body: { name: n } }), 'Topic added')) setName('');
  };
  const rename = async () => {
    if (!editing.name.trim()) { setError('Give the topic a name.'); return; }
    if (await call(() => api(`/topics/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: { name: editing.name.trim() } }), 'Topic renamed')) setEditing(null);
  };
  const archive = async (t) => {
    if (!(await confirmAction({ title: `Archive the topic ${t.name}?`, body: `Its ${plural(t.posts ?? 0, 'discussion')} stay${t.posts === 1 ? 's' : ''} and show under “No topic”.`, confirm: 'Archive topic' }))) return;
    call(() => api(`/topics/${encodeURIComponent(t.id)}`, { method: 'DELETE' }), 'Topic archived');
  };
  const full = s.topics.length >= 12;
  return (
    <Group title="Discussion topics" hint="Members pick one when they post and filter Discussions by it. Up to 12. Changes here are saved straight away.">
      {s.status === 'loading' ? <div className="skeleton h-20" aria-label="Loading the topics" />
        : s.status === 'error' ? <p role="alert" className="notice notice-info">{s.message}</p> : (
          <>
            {s.topics.length === 0 ? <p className="t-small">No topics yet.</p> : (
              <ul className="flex flex-col" aria-label="Topics">
                {s.topics.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--az-divider)] py-2.5 first:border-t-0">
                    {editing?.id === t.id ? (
                      <>
                        <input className="input min-w-0 flex-[1_1_180px]" aria-label={`New name for ${t.name}`} value={editing.name} maxLength={40} autoFocus
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(); } if (e.key === 'Escape') setEditing(null); }} />
                        <span className="flex gap-2">
                          <Button size="sm" variant="primary" busy={busy} onClick={rename}>Save name</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-[1_1_180px]">
                          <span className="block truncate text-[15px] font-medium text-[var(--az-text)]">{t.name}</span>
                          <span className="t-small">{plural(t.posts ?? 0, 'discussion')}</span>
                        </span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setError(''); setEditing({ id: t.id, name: t.name }); }} aria-label={`Rename ${t.name}`}>Rename</Button>
                          <Button size="sm" variant="ghost" onClick={() => archive(t)} aria-label={`Archive ${t.name}`}>Archive</Button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex min-w-0 flex-wrap gap-2">
              <input className="input min-w-0 flex-[1_1_200px]" value={name} maxLength={40} disabled={full} aria-label="New topic name"
                placeholder={full ? 'The list is full (12)' : 'New topic'} aria-describedby={error ? `${id}-e` : undefined} aria-invalid={error ? true : undefined}
                onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
              <Button icon="plus" onClick={add} disabled={full} busy={busy && !editing}>Add topic</Button>
            </div>
            {error && <p id={`${id}-e`} role="alert" className="field-error">{error}</p>}
            <p className="t-small">Archiving keeps its discussions; they show under “No topic”.</p>
          </>
        )}
    </Group>
  );
}
