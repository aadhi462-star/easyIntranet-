// Administration → Settings, Roles and permissions, Announcements, Institutions (board
// S7Settings; D2, D4, D7, D8). Settings are version-checked: a save over someone else's newer
// save is refused, never silently merged (SET-03). Restyled for v2 G (board V2GPlatformAdmin).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { refreshFeatures } from '../../lib/features.js';
import { errorText } from '../../lib/communities.js';
import { dateText, ROLE_LABEL } from '../../lib/platform.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Badge, Button } from '../ui/Controls.jsx';
import { AnnouncementBar, Check, Chips, DataTable, Failed, Field, Loading, Option } from './bits.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const SECTIONS = [['registration', 'Registration'], ['communities', 'Communities'], ['files', 'Files and storage'], ['features', 'Features']];
const TYPES = [['pdf', 'PDF'], ['image', 'Images'], ['office', 'Word, Excel, PowerPoint'], ['text', 'Plain text and CSV']];
const MODULES = {
  'module.tasks': 'Tasks and boards', 'module.apps': 'Custom apps', 'module.webtabs': 'Web tabs', 'module.live': 'Live and meetings', 'module.townhalls': 'Town halls',
  'module.channels': 'Channels and chats', 'module.surveys': 'Surveys', 'module.forums': 'Forums', 'module.files': 'Files', 'module.manuals': 'Manuals', 'module.orgchart': 'Community structure chart', 'module.ideas': 'Ideas', 'module.leaderboard': 'Recognition leaderboard', 'module.assist': 'Smart Assist', learning: 'Learning in communities', 'admin.legacy': 'Older Administration tools (this browser only)',
};

export default function PlatformSettings() {
  const [section, setSection] = useState('registration');
  const [s, setS] = useState({ state: 'loading' });
  const load = useCallback(() => api('/admin/settings').then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) })), []);
  useEffect(() => { load(); }, [load]);
  if (s.state === 'loading') return <Loading label="Loading settings" />;
  if (s.state === 'error') return <Failed message={s.message} onRetry={load} />;
  return (
    <div className="flex flex-col gap-5">
      <Chips label="Section" value={section} onChange={setSection} options={SECTIONS.map(([id, label]) => ({ id, label }))} />
      {section === 'features' ? <Features list={s.d.features} onSaved={load} />
        : <SettingForm key={section} section={section} value={s.d.settings[section]} onSaved={load} />}
    </div>
  );
}

function SettingForm({ section, value, onSaved }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = Object.keys(v).some((k) => !k.startsWith('_') && !['updatedAt', 'updatedBy'].includes(k) && JSON.stringify(v[k]) !== JSON.stringify(value[k]));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const patch = Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_') && !['updatedAt', 'updatedBy'].includes(k) && JSON.stringify(v[k]) !== JSON.stringify(value[k])));
    try { await api(`/admin/settings/${section}`, { method: 'PUT', body: { version: value._version, value: patch } }); toast('Saved'); onSaved(); } catch (err) { setError(errorText(err)); }
    setBusy(false);
  };
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  return (
    <form onSubmit={save} className="panel flex max-w-2xl flex-col gap-5 p-5">
      {section === 'registration' && (
        <>
          <Check label="Anyone can create an account" hint="Off: the sign-up page says registration is closed." checked={v.open} onChange={(x) => set('open', x)} />
          <Check label="New accounts wait for approval" hint="A Platform Admin approves each one under Users → Waiting for approval." checked={v.requireApproval} onChange={(x) => set('requireApproval', x)} />
          <Field label="Allowed email domains" hint="Comma-separated, like example.edu. Empty means any domain.">
            <input className="input" value={(v.allowedDomains ?? []).join(', ')} onChange={(e) => set('allowedDomains', e.target.value.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean))} />
          </Field>
        </>
      )}
      {section === 'communities' && (
        <fieldset className="flex flex-col gap-2"><legend className="t-label mb-2">Who can create communities</legend>
          {[['anyone', 'Any member', 'Every signed-in member can start one'], ['staff', 'Platform staff only', 'Members can’t create communities; existing ones are untouched']].map(([id, label, hint]) => (
            <Option key={id} name="who" checked={v.whoCanCreate === id} onChange={() => set('whoCanCreate', id)} label={label} hint={hint} />
          ))}
        </fieldset>
      )}
      {section === 'files' && (
        <>
          <fieldset><legend className="t-label mb-2">Largest file</legend>
            <div role="radiogroup" aria-label="Largest file" className="flex gap-2">{[5, 10].map((mb) => (
              <button key={mb} type="button" role="radio" aria-checked={v.maxFileMb === mb} onClick={() => set('maxFileMb', mb)}
                className="filter-chip" aria-pressed={v.maxFileMb === mb}>{mb} MB</button>
            ))}</div>
            <p className="t-small mt-2">10 MB is the most the server stores per file (decision S4-1).</p>
          </fieldset>
          <fieldset className="flex flex-col gap-2"><legend className="t-label mb-2">Allowed file types</legend>
            {TYPES.map(([id, label]) => <Check key={id} label={label} checked={(v.types ?? []).includes(id)} onChange={(x) => set('types', x ? [...new Set([...(v.types ?? []), id])] : (v.types ?? []).filter((t) => t !== id))} />)}
          </fieldset>
          <p className="t-small">Changes apply to new uploads only; existing files stay and still open. There’s no virus scanner; the allowed types are the protection (decision S4-6).</p>
        </>
      )}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="t-small">{value.updatedBy ? `Last changed by ${value.updatedBy} on ${dateText(value.updatedAt)}` : 'Not changed since setup'}</span>
        <Button type="submit" variant="primary" size="sm" busy={busy} disabled={!changed}>Save</Button>
      </div>
    </form>
  );
}

function Features({ list, onSaved }) {
  const [busy, setBusy] = useState(null);
  const flip = async (f) => {
    setBusy(f.key);
    try { await api(`/admin/features/${encodeURIComponent(f.key)}`, { method: 'PUT', body: { enabled: !f.enabled } }); toast(f.enabled ? 'Turned off · data kept' : 'Turned on'); refreshFeatures(); onSaved(); } catch (e) { toast(errorText(e), 'error'); }
    setBusy(null);
  };
  return (
    <section className="panel flex max-w-2xl flex-col p-5" aria-labelledby="ft-h">
      <h3 id="ft-h" className="t-h3">Modules</h3>
      <ul className="list-rows mt-2">
        {list.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0 flex-[1_1_200px]"><span>{MODULES[f.key] ?? f.description}</span><span className="t-small block">{f.key === 'module.assist' ? 'Not built yet' : f.enabled ? 'On' : 'Off · data kept'}</span></span>
            {f.key !== 'module.assist' && <Button size="sm" aria-pressed={f.enabled} busy={busy === f.key} onClick={() => flip(f)}>{f.enabled ? 'Turn off' : 'Turn on'}</Button>}
          </li>
        ))}
      </ul>
      <p className="t-small mt-3">Turning a module off hides it everywhere and keeps its data; turning it back on restores it as it was.</p>
    </section>
  );
}

// ---- Roles and permissions: what the server enforces, read-only, and who holds platform roles.
const Y = 'yes'; const N = 'no';
const MATRIX = [
  ['Post, reply, RSVP, enrol', Y, Y, Y, Y, Y, 'as a member'],
  ['Review reports and held posts', N, N, Y, Y, Y, 'escalated only'],
  ['Approve members, change roles below theirs', N, N, N, Y, Y, 'yes, logged'],
  ['Build and grade a course', N, 'their course', N, Y, Y, 'yes, logged'],
  ['Community settings and analytics', N, N, N, Y, Y, 'yes, logged'],
  ['Transfer ownership, request deletion', N, N, N, N, Y, N],
  ['Delete a community, suspend people', N, N, N, N, N, Y],
];
const ROLE_ORDER = ['super_admin', 'platform_admin', 'user_manager', 'community_manager', 'lms_manager', 'trust_safety', 'finance_manager', 'support_agent'];
const cellText = (x) => (x === Y ? <><Icon name="check" size={18} className="text-[var(--az-ok)]" /><span className="sr-only">Yes</span></> : x === N ? <span className="text-2">No</span> : x);

export function RolesMatrix() {
  const [s, setS] = useState({ state: 'loading' });
  const load = useCallback(() => { api('/admin/roles').then((d) => setS({ state: 'ready', d })).catch((e) => setS({ state: 'error', message: errorText(e) })); }, []);
  useEffect(() => { load(); }, [load]);
  const heads = ['Member', 'Instructor', 'Moderator', 'Admin', 'Owner', 'Platform Admin'];
  const columns = [
    { head: 'Can', place: 'title', wrap: true, cell: (r) => r[0] },
    ...heads.map((h, i) => ({ head: h, cell: (r) => cellText(r[i + 1]) })),
  ];
  const counts = s.d ? Object.fromEntries(ROLE_ORDER.map((r) => [r, s.d.holders.filter((h) => h.role === r).length])) : null;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-2 -mt-2 text-sm">Read-only: what each community role and Platform Admin can do, as the server enforces it, then who holds each platform role.</p>
      <DataTable label="Roles and permissions" columns={columns} rows={MATRIX} rowKey={(r) => r[0]} cardLabel={(r) => r[0]} />
      <section aria-labelledby="hold-h" className="flex flex-col gap-3">
        <h3 id="hold-h" className="t-h3">Who holds platform roles</h3>
        {s.state === 'loading' ? <Loading label="Loading" lines={2} /> : s.state === 'error' ? <Failed message={s.message} onRetry={load} /> : (
          <>
            <div className="flex flex-wrap gap-2">{ROLE_ORDER.map((r) => <Badge key={r}>{ROLE_LABEL[r]} · {counts[r]}</Badge>)}</div>
            {s.d.holders.length ? (
              <ul className="list-rows panel px-4">{s.d.holders.map((h) => (
                <li key={`${h.role}:${h.user.id}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold">{h.user.name}</span><span className="text-2">{ROLE_LABEL[h.role] ?? h.role} · since {dateText(h.grantedAt)}</span></li>
              ))}</ul>
            ) : <p className="notice notice-info">Nobody holds a platform role.</p>}
          </>
        )}
        <p className="t-small">Roles are given from a person’s panel in Users. Granting Platform Admin is for Super Admins only, never for themselves, and asks for your password (D4).</p>
      </section>
    </div>
  );
}

// ---- Announcements (D7): in the app only, one at a time.
export function Announcements() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [communities, setCommunities] = useState([]);
  const [f, setF] = useState({ message: '', link: '', audience: 'all', communityIds: [], endsAt: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/admin/announcements').then((d) => setList(d.announcements)).catch((e) => setError(errorText(e))), []);
  useEffect(() => { load(); api('/admin/communities?show=all').then((d) => setCommunities(d.communities)).catch(() => {}); }, [load]);
  const live = list?.find((a) => !a.endedAt && (!a.endsAt || new Date(a.endsAt) > new Date()));
  const publish = async (e) => {
    e.preventDefault();
    if (live && !(await confirmAction('Publishing replaces the current announcement. Continue?'))) return;
    setBusy(true); setError('');
    try {
      await api('/admin/announcements', { method: 'POST', body: { message: f.message.trim(), link: f.link.trim() || null, audience: f.audience,
        communityIds: f.audience === 'communities' ? f.communityIds : [], endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null } });
      toast('Announcement published'); setF({ message: '', link: '', audience: 'all', communityIds: [], endsAt: '' }); load();
    } catch (err) { setError(errorText(err)); }
    setBusy(false);
  };
  const end = async (a) => { try { await api(`/admin/announcements/${a.id}/end`, { method: 'POST' }); toast('Announcement ended'); load(); } catch (e) { toast(errorText(e), 'error'); } };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form onSubmit={publish} className="panel flex min-w-0 flex-col gap-4 p-5" aria-labelledby="na-h">
        <h3 id="na-h" className="t-h3">New announcement</h3>
        <Field label="Message" hint={`Up to 280 characters · ${280 - f.message.length} left`}><textarea className="input min-h-20" maxLength={280} required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <Field label="Link" hint="Optional, to a page in CommunityOne, like /events"><input className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/events" /></Field>
        <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm font-medium">Who sees it</legend>
          {[['all', 'Everyone'], ['communities', 'Members of chosen communities']].map(([id, label]) => (
            <label key={id} className="flex items-center gap-3 text-[15px]"><input type="radio" name="aud" checked={f.audience === id} onChange={() => setF({ ...f, audience: id })} className="h-[18px] w-[18px] accent-[var(--az-focus)]" /><span>{label}</span></label>
          ))}
          {f.audience === 'communities' && (
            <div className="sunken flex max-h-48 flex-col gap-2 overflow-y-auto p-3">
              {communities.map((c) => (
                <Check key={c.id} label={c.name} checked={f.communityIds.includes(c.id)}
                  onChange={(on) => setF({ ...f, communityIds: on ? [...f.communityIds, c.id] : f.communityIds.filter((x) => x !== c.id) })} />
              ))}
            </div>
          )}
        </fieldset>
        <Field label="Ends" hint="Optional; it shows until the end of that day, or until people dismiss it"><input type="date" className="input" value={f.endsAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <p className="t-small">One announcement at a time; publishing replaces the current one. Shown in the app only, no email.</p>
        {error && <p role="alert" className="field-error">{error}</p>}
        <div className="flex justify-end"><Button type="submit" variant="primary" busy={busy} disabled={!f.message.trim() || (f.audience === 'communities' && !f.communityIds.length)}>Publish announcement</Button></div>
      </form>
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-labelledby="pv-h" className="flex flex-col gap-2">
          <h3 id="pv-h" className="t-label">How it appears on Home</h3>
          <AnnouncementBar a={{ message: f.message || live?.message || 'Your message', link: f.link || live?.link }} preview />
        </section>
        <section aria-labelledby="past-h">
          <h3 id="past-h" className="t-label mb-1">Recent</h3>
          {list === null ? <Loading label="Loading" lines={2} /> : list.length ? (
            <ul className="list-rows">{list.map((a) => {
              const isLive = a === live;
              return (
                <li key={a.id} className="flex flex-col gap-1 py-3 text-sm">
                  <span className="break-words">{a.message}</span>
                  <span className="t-small">{isLive ? 'Showing now' : 'Ended'} · {a.audience === 'all' ? 'everyone' : `${a.communityIds.length} communities`} · {a.dismissals} dismissed · {dateText(a.createdAt)}</span>
                  {isLive && <Button size="sm" className="self-start" onClick={() => end(a)}>End now</Button>}
                </li>
              );
            })}</ul>
          ) : <p className="text-2 text-sm">No announcements yet.</p>}
        </section>
      </div>
    </div>
  );
}

// ---- Institutions and departments (existing server routes, now with a screen).
export function Institutions() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [dept, setDept] = useState({});
  const load = useCallback(() => api('/institutions').then((d) => setList(d.institutions)).catch((e) => setError(errorText(e))), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e) => {
    e.preventDefault();
    try { await api('/admin/institutions', { method: 'POST', body: { name: name.trim() }, idempotent: true }); setName(''); toast('Institution added'); load(); } catch (err) { toast(errorText(err), 'error'); }
  };
  const addDept = async (id) => {
    try { await api(`/admin/institutions/${id}/departments`, { method: 'POST', body: { name: (dept[id] ?? '').trim() }, idempotent: true }); setDept({ ...dept, [id]: '' }); toast('Department added'); load(); } catch (err) { toast(errorText(err), 'error'); }
  };
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="New institution" className="min-w-0 flex-[1_1_220px]"><input className="input" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Button type="submit" disabled={!name.trim()}>Add</Button>
      </form>
      {error && <Failed message={error} onRetry={() => { setError(''); load(); }} />}
      {list === null ? <Loading label="Loading institutions" /> : list.length ? (
        <ul className="flex flex-col gap-3">{list.map((i) => (
          <li key={i.id} className="panel flex flex-col gap-3 p-4">
            <b className="break-words font-semibold">{i.name}{i.city ? <span className="text-2 font-normal"> · {i.city}</span> : null}</b>
            <span className="t-small">{i.departments.length ? i.departments.map((d) => d.name).join(' · ') : 'No departments yet'}</span>
            <div className="flex flex-wrap gap-2">
              <label className="min-w-0 flex-[1_1_220px]"><span className="sr-only">New department for {i.name}</span><input className="input" placeholder="New department" maxLength={120} value={dept[i.id] ?? ''} onChange={(e) => setDept({ ...dept, [i.id]: e.target.value })} /></label>
              <Button size="sm" variant="ghost" disabled={!(dept[i.id] ?? '').trim()} onClick={() => addDept(i.id)}>Add department</Button>
            </div>
          </li>
        ))}</ul>
      ) : <p className="notice notice-info">No institutions yet.</p>}
    </div>
  );
}
