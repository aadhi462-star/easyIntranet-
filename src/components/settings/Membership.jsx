// Settings, Membership (G2, board V2GSettings): how people join, the join question for a Private
// community, invitations, and "Invite people who match", a one-off action that sends an
// invitation to everyone whose profile matches (POST /communities/:id/invite-matching). Nobody
// is added for them; the automatic membership rule it replaces was switched off by a migration.
import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { managePath } from '../../lib/manage.js';
import { toast } from '../../lib/toast.js';
import { Badge, Button } from '../ui/Controls.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { VISIBILITY } from './Privacy.jsx';
import { Group, InfoRow, Locked, plural, SectionForm, TextField, useSectionDraft } from './shared.jsx';

const JOIN = {
  public: 'Public: they join at once.',
  private: 'Private: they ask to join and an Admin approves each request.',
  closed: 'Closed: only people with an invitation can join.',
};
const FIELDS = [['batch', 'Batch'], ['department', 'Department'], ['city', 'City']];
const RULE_FIELD = { batch: 'batch', dept: 'department', department: 'department', city: 'city' };

export default function Membership({ g, src }) {
  const vis = src.community.visibility ?? 'public';
  const base = useMemo(() => ({ joinQuestion: src.settings.joinQuestion ?? '' }), [src.settings.joinQuestion]);
  const d = useSectionDraft(src, base);
  const rule = src.settings.dynamicRule;
  const save = () => d.submit({ settings: { joinQuestion: d.value.joinQuestion.trim() || null } });
  return (
    <SectionForm title="Membership" draft={d} onSave={save} fields={['settings.joinQuestion']}
      summary={d.dirty ? 'You changed the join question.' : ''}
      lede={`How people come into ${g.name}. Nobody is ever added to a community they didn’t choose.`}>
      <Group title="How people join">
        <div>
          <InfoRow title="How people join" to={managePath(g, 'settings', 'privacy')} action="Change">{JOIN[vis]} Set in Privacy and visibility.</InfoRow>
          <InfoRow title="Invite people" to={`${managePath(g, 'members')}?view=invitations`} action="Invite">By name or email. They choose whether to join.</InfoRow>
        </div>
        <TextField label="Join question" value={d.value.joinQuestion} onChange={(x) => d.set('joinQuestion', x)} maxLength={200}
          hint={`Asked when someone asks to join, and shown to Admins with the request. Up to 200 characters.${vis === 'private' ? '' : ` Used only while ${g.name} is ${VISIBILITY.private.label}.`}`}
          error={d.fieldError('settings.joinQuestion')} />
        <Locked>Removed members can ask to join again after 7 days.</Locked>
      </Group>
      <InviteMatching g={g} rule={rule} />
    </SectionForm>
  );
}

/** G2: pick one profile field and a value, see how many people match, then send invitations. */
function InviteMatching({ g, rule }) {
  const id = useId();
  const fromRule = rule && RULE_FIELD[rule.field] ? RULE_FIELD[rule.field] : 'batch';
  const [field, setField] = useState(fromRule);
  // The old rule's value carries over for Batch and City (a department was stored by name).
  const [value, setValue] = useState(rule && ['batch', 'city'].includes(rule.field) && rule.op !== 'contains' ? String(rule.value ?? '') : '');
  const [facets, setFacets] = useState(null);
  const [preview, setPreview] = useState(null); // { status, total, members }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { api('/directory/facets').then(setFacets).catch(() => setFacets({ batches: [], departments: [], cities: [], failed: true })); }, []);
  const options = !facets ? [] : field === 'batch' ? facets.batches.map((b) => [String(b), String(b)])
    : field === 'department' ? facets.departments.map((x) => [x.id, x.name]) : facets.cities.map((c) => [c, c]);
  const label = options.find(([k]) => k === value)?.[1] ?? value;

  // How many people match, from the directory (people who show in it), and how many are already in.
  useEffect(() => {
    setResult(null); setError('');
    if (!value) { setPreview(null); return undefined; }
    let live = true;
    setPreview({ status: 'loading' });
    api(`/directory?${new URLSearchParams({ [field]: value, limit: '100' })}`)
      .then((r) => { if (live) setPreview({ status: 'ready', total: r.total, members: r.people.filter((p) => g.members?.includes(p.id)).length, partial: r.total > r.people.length }); })
      .catch((e) => { if (live) setPreview({ status: 'error', message: errorText(e) }); });
    return () => { live = false; };
  }, [field, value, g.members]);

  const toInvite = preview?.status === 'ready' ? Math.max(preview.total - preview.members, 0) : 0;
  const fieldLabel = FIELDS.find(([k]) => k === field)[1];
  const send = async () => {
    if (!value) { setError('Choose a value first.'); return; }
    const ok = await confirmAction({
      title: `Send invitations to people whose ${fieldLabel.toLowerCase()} is ${label}?`,
      body: `About ${plural(toInvite, 'person', 'people')} get an invitation to ${g.name}. They choose whether to join; nobody is added for them. People already in ${g.name} are left out, and anyone already invited keeps the invitation they have.`,
      confirm: 'Send invitations',
    });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      const r = await api(`/communities/${encodeURIComponent(g.id)}/invite-matching`, { method: 'POST', idempotent: true, body: { [field]: field === 'batch' ? Number(value) : value } });
      // Each result is invited (a new invitation), open (they already had one) or skipped.
      const results = Array.isArray(r.results) ? r.results : [];
      const count = (st) => results.filter((x) => x.status === st).length;
      setResult({ matched: r.matched ?? results.length, sent: count('invited'), open: count('open'), skipped: count('skipped'), limit: r.limit && r.matched > r.limit ? r.limit : null });
      toast(`${plural(count('invited'), 'invitation')} sent`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Group title="Invite people who match" aside={<Badge tone="info">One-off</Badge>}
      hint="Sends an invitation to everyone whose profile matches. They choose whether to join; nobody is added for them.">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-f`} className="text-sm font-semibold text-[var(--az-text)]">Profile field</label>
          <select id={`${id}-f`} className="input w-full" value={field} onChange={(e) => { setField(e.target.value); setValue(''); }}>
            {FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-v`} className="text-sm font-semibold text-[var(--az-text)]">is</label>
          <select id={`${id}-v`} className="input w-full" value={value} onChange={(e) => setValue(e.target.value)} disabled={!facets}
            aria-describedby={`${id}-p${error ? ` ${id}-e` : ''}`} aria-invalid={error ? true : undefined}>
            <option value="">{facets ? `Choose a ${fieldLabel.toLowerCase()}` : 'Loading…'}</option>
            {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>
      <p id={`${id}-p`} className="t-small" role="status">
        {!value ? 'Choose a value to see how many people match.'
          : preview?.status === 'loading' ? 'Counting the people who match…'
            : preview?.status === 'error' ? preview.message
              : preview?.status === 'ready' ? `${preview.partial ? 'At least ' : ''}${plural(preview.total, 'person', 'people')} match in the directory · ${preview.members} already ${preview.members === 1 ? 'is a member' : 'are members'}` : ''}
      </p>
      {error && <p id={`${id}-e`} className="field-error" role="alert">{error}</p>}
      {result && (
        <p className="notice notice-ok" role="status">
          {plural(result.matched, 'person', 'people')} matched. {plural(result.sent, 'invitation')} sent{result.open ? `; ${result.open} already had one` : ''}{result.skipped ? `; ${result.skipped} skipped` : ''}.
          {result.limit ? ` Only the first ${result.limit} were invited; narrow the match for the rest.` : ''} Follow them in Manage, Members, Invitations.
        </p>
      )}
      <div><Button variant="primary" icon="share" busy={busy} disabled={!value || preview?.status !== 'ready' || toInvite === 0} onClick={send}>
        {preview?.status === 'ready' && toInvite > 0 ? `Send ${plural(toInvite, 'invitation')}` : 'Send invitations'}
      </Button></div>
      {rule && rule.value && (
        <p className="t-small">Your automatic rule (“{RULE_FIELD[rule.field] ? FIELDS.find(([k]) => k === RULE_FIELD[rule.field])[1] : rule.field} {rule.op === 'contains' ? 'contains' : 'is'} {String(rule.value)}”) was switched off{rule.retiredAt || rule.offAt ? ` on ${new Date(rule.retiredAt || rule.offAt).toLocaleDateString()}` : ''}. Nobody it added was removed. Use it once as invitations above.</p>
      )}
    </Group>
  );
}
