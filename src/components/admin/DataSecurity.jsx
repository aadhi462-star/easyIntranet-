import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { fmtDate, useStore } from '../../lib/store.jsx';
import { Field } from '../ui.jsx';
import { download, toCsv } from './charts.jsx';
import { toast } from '../../lib/toast.js';
import { confirmAction } from '../ui/Confirm.jsx';

const DemoBadge = () => <span className="badge badge-warn">Demo · not connected</span>;

export function AuditLog() {
  const { state, user } = useStore();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [type, setType] = useState('');
  const [limit, setLimit] = useState(100);
  const all = state.activity || [];
  const types = [...new Set(all.map((a) => a.type))].sort();
  const rows = all.filter((a) => (!who || a.userId === who) && (!type || a.type === type)
    && (!q || `${a.type} ${a.ref ?? ''} ${user(a.userId)?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const exportCsv = () => download('audit-log.csv', toCsv(rows.map((a) => ({
    time: new Date(a.at).toISOString(), member: user(a.userId)?.name ?? a.userId ?? '', action: a.type, ref: a.ref ?? '', points: a.points,
  }))), 'text/csv');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" type="search" placeholder="Search log" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" />
        <select className="input !w-44" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by member"><option value="">All members</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select className="input !w-48" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by action"><option value="">All actions</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <button className="btn btn-ghost ml-auto" onClick={exportCsv}>Export CSV</button>
      </div>
      {rows.length === 0 ? <p className="panel p-6 text-sm text-2">No activity recorded yet. Every action taken in the app appears here.</p> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-2"><tr><th className="p-3">Time</th><th className="p-3">Member</th><th className="p-3">Action</th><th className="p-3">Reference</th></tr></thead>
            <tbody className="divide-y divide-[var(--az-hairline)]">
              {rows.slice(0, limit).map((a) => (
                <tr key={a.id}><td className="whitespace-nowrap p-3 text-2">{fmtDate(a.at)}</td><td className="p-3">{user(a.userId)?.name ?? '—'}</td>
                  <td className="p-3"><code className="text-xs text-[var(--az-link)]">{a.type}</code></td><td className="p-3 font-mono text-xs text-2">{a.ref ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(limit + 200)}>Show more ({rows.length - limit} left)</button>}
    </div>
  );
}

// --- Password-protected export: PBKDF2 (SHA-256, 250k iterations) → AES-GCM 256. ---
const enc = new TextEncoder();
// Chunked: spreading a large Uint8Array into fromCharCode overflows the call stack.
const b64 = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptJson(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return JSON.stringify({ format: 'azenc', v: 1, kdf: 'PBKDF2-SHA256', iterations: 250000, salt: b64(salt), iv: b64(iv), data: b64(data) });
}
export async function decryptJson(text, password) {
  const f = JSON.parse(text);
  if (f.format !== 'azenc') throw new Error('Not a CommunityOne encrypted export.');
  const key = await deriveKey(password, unb64(f.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

const COLLECTIONS = [
  ['users', 'Members'], ['posts', 'Wall posts'], ['groups', 'Groups'], ['events', 'Events'], ['forumPosts', 'Forums'], ['forumCategories', 'Forum categories'],
  ['channels', 'Channels'], ['dms', 'Direct messages'], ['manuals', 'Manuals'], ['files', 'Files'], ['ideas', 'Ideas'], ['tasks', 'Tasks'],
  ['surveys', 'Surveys'], ['surveyResponses', 'Survey responses'], ['townhalls', 'Town halls'], ['customApps', 'Custom apps'], ['appRecords', 'App records'], ['activity', 'Audit log'],
];

// Never export credentials, even hashed ones.
const withoutSecrets = (u) => { if (!u) return u; const { password: _p, passwordHash: _h, passwordSalt: _s, ...rest } = u; return rest; };

export function DataExport() {
  const { state } = useStore();
  const [picked, setPicked] = useState(['users', 'posts', 'groups', 'events', 'forumPosts', 'manuals']);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [decPass, setDecPass] = useState('');
  const [decMsg, setDecMsg] = useState('');
  const avail = COLLECTIONS.filter(([k]) => Array.isArray(state[k]));
  const clean = (k, list) => (k === 'users' ? list.map(withoutSecrets) : list);
  const payload = () => ({ exportedAt: new Date().toISOString(), network: state.settings.networkName, ...Object.fromEntries(picked.map((k) => [k, clean(k, state[k] ?? [])])) });
  const stamp = new Date().toISOString().slice(0, 10);

  const encrypted = async () => {
    if (password.length < 8) return alert('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      download(`alumnizone-export-${stamp}.azenc`, await encryptJson(payload(), password), 'application/octet-stream');
      toast('Encrypted export downloaded.');
    } catch (e) {
      toast(`Couldn’t create the encrypted export: ${e?.message || 'unknown error'}`, 'error');
    } finally { setBusy(false); }
  };
  const decrypt = async () => {
    if (!file) return;
    setDecMsg('');
    try {
      const data = await decryptJson(await file.text(), decPass);
      download(file.name.replace(/\.azenc$/, '') + '.json', JSON.stringify(data, null, 2));
      setDecMsg(`Decrypted: ${Object.keys(data).filter((k) => Array.isArray(data[k])).length} collections saved as JSON.`);
    } catch (e) { setDecMsg(e.name === 'OperationError' ? 'Wrong password or corrupted file.' : e.message); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel space-y-4 p-5">
        <h3 className="font-bold">Export data</h3>
        <fieldset className="grid grid-cols-2 gap-1">
          <legend className="mb-2 text-xs font-semibold text-[var(--az-text)]">Modules</legend>
          {avail.map(([k, l]) => (
            <label key={k} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={picked.includes(k)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k))} />{l} <span className="text-xs text-2">{state[k].length}</span></label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => setPicked(avail.map(([k]) => k))}>Select all</button>
          <button className="btn btn-primary" disabled={!picked.length} onClick={() => download(`alumnizone-export-${stamp}.json`, JSON.stringify(payload(), null, 2))}>Download JSON</button>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-[var(--az-text)]">CSV per collection</div>
          <div className="flex flex-wrap gap-2">
            {picked.map((k) => <button key={k} className="btn btn-ghost h-10 text-xs" onClick={() => download(`${k}.csv`, toCsv(state[k] || []), 'text/csv')}>{k}.csv</button>)}
          </div>
        </div>
        <div className="rounded-xl bg-[var(--az-sunken)] p-4">
          <Field label="Password-protected export" hint="AES-256-GCM, key derived with PBKDF2 (250,000 iterations). Lose the password and the file can’t be opened.">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <button className="btn btn-primary mt-3" disabled={busy || !picked.length} onClick={encrypted}>{busy ? 'Encrypting…' : 'Download encrypted (.azenc)'}</button>
        </div>
      </section>
      <section className="panel space-y-4 p-5">
        <h3 className="font-bold">Open an encrypted export</h3>
        <Field label=".azenc file"><input className="input" type="file" accept=".azenc,application/octet-stream,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Password"><input className="input" type="password" value={decPass} onChange={(e) => setDecPass(e.target.value)} /></Field>
        <button className="btn btn-primary" disabled={!file || !decPass} onClick={decrypt}>Decrypt and download JSON</button>
        {decMsg && <p role="status" className="text-sm text-[var(--az-text)]">{decMsg}</p>}
        <p className="text-xs text-2">Decryption happens entirely in your browser.</p>
      </section>
    </div>
  );
}

export function Security() {
  const { state, me, dispatch } = useStore();
  const sec = { sso: { enabled: false, provider: '', entityId: '', ssoUrl: '' }, externalUsers: true, directorySync: false, customDomain: '', mobileAppName: '', ...state.settings.security };
  const setSec = (patch) => dispatch({ type: 'set', key: 'settings', value: (s) => ({ ...s, security: { ...sec, ...s.security, ...patch } }) });
  const setSso = (patch) => setSec({ sso: { ...sec.sso, ...patch } });
  const [target, setTarget] = useState('');
  const member = state.users.find((u) => u.id === target);

  const memberData = (id) => ({
    profile: withoutSecrets(state.users.find((u) => u.id === id)),
    posts: state.posts.filter((p) => p.authorId === id),
    comments: state.posts.flatMap((p) => p.comments.filter((c) => c.authorId === id).map((c) => ({ ...c, postId: p.id }))),
    forumPosts: state.forumPosts.filter((f) => f.authorId === id),
    forumReplies: state.forumPosts.flatMap((f) => f.replies.filter((r) => r.authorId === id).map((r) => ({ ...r, forumPostId: f.id }))),
    events: state.events.filter((e) => e.hostId === id),
    rsvps: state.events.filter((e) => e.rsvps?.[id]).map((e) => ({ eventId: e.id, status: e.rsvps[id] })),
    messages: state.channels.flatMap((c) => c.messages.filter((m) => m.authorId === id).map((m) => ({ ...m, channelId: c.id }))),
    directMessages: (state.dms || []).flatMap((d) => (d.messages || []).filter((m) => m.authorId === id)),
    ideas: (state.ideas || []).filter((i) => i.authorId === id),
    files: (state.files || []).filter((f) => (f.authorId ?? f.ownerId) === id),
    appRecords: (state.appRecords || []).filter((r) => r.authorId === id),
    activity: (state.activity || []).filter((a) => a.userId === id),
  });

  const erase = async () => {
    if (!member || member.id === me.id) return;
    if (!(await confirmAction(`Permanently erase all content by ${member.name}? Their posts, comments, replies, messages, ideas, files and records will be deleted. This can’t be undone.`))) return;
    const id = member.id;
    dispatch({ type: 'set', key: 'posts', value: (l) => l.filter((p) => p.authorId !== id).map((p) => ({ ...p, comments: p.comments.filter((c) => c.authorId !== id), likes: p.likes.filter((x) => x !== id) })) });
    dispatch({ type: 'set', key: 'forumPosts', silent: true, value: (l) => l.filter((f) => f.authorId !== id).map((f) => ({ ...f, replies: f.replies.filter((r) => r.authorId !== id) })) });
    dispatch({ type: 'set', key: 'channels', silent: true, value: (l) => l.map((c) => ({ ...c, messages: c.messages.filter((m) => m.authorId !== id), members: c.members.filter((m) => m !== id) })) });
    for (const col of ['ideas', 'files', 'appRecords', 'praise', 'surveyResponses']) {
      if (Array.isArray(state[col])) dispatch({ type: 'set', key: col, silent: true, value: (l) => l.filter((x) => (x.authorId ?? x.ownerId ?? x.fromId) !== id) });
    }
    if (Array.isArray(state.dms)) dispatch({ type: 'set', key: 'dms', silent: true, value: (l) => l.map((d) => ({ ...d, messages: (d.messages || []).filter((m) => m.authorId !== id) })) });
    dispatch({ type: 'update', col: 'users', id, silent: true, patch: { bio: '', skills: [], career: [], status: 'deactivated', deactivated: true, erasedAt: Date.now() } });
    alert(`${member.name}’s content has been erased and the account deactivated.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2"><h3 className="flex-1 font-bold">Single sign-on (SAML)</h3><DemoBadge /></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--az-focus)]" checked={sec.sso.enabled} onChange={(e) => setSso({ enabled: e.target.checked })} />Enable SSO</label>
        <Field label="Identity provider"><select className="input" value={sec.sso.provider} onChange={(e) => setSso({ provider: e.target.value })}>
          <option value="">Choose…</option><option>Okta</option><option>Azure AD / Entra ID</option><option>Google Workspace</option><option>OneLogin</option><option>Custom SAML 2.0</option></select></Field>
        <Field label="Entity ID / Issuer"><input className="input" value={sec.sso.entityId} onChange={(e) => setSso({ entityId: e.target.value })} placeholder="https://idp.example.edu/metadata" /></Field>
        <Field label="SSO login URL"><input className="input" value={sec.sso.ssoUrl} onChange={(e) => setSso({ ssoUrl: e.target.value })} placeholder="https://idp.example.edu/sso/saml" /></Field>
        <p className="text-xs text-2">Settings are saved, but sign-in still uses CommunityOne accounts in this demo.</p>
      </section>
      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2"><h3 className="flex-1 font-bold">Directory, domain & mobile</h3><DemoBadge /></div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--az-focus)]" checked={sec.directorySync} onChange={(e) => setSec({ directorySync: e.target.checked })} />Sync members from a directory (Active Directory / LDAP)</label>
        <Field label="Custom domain" hint="Point a CNAME to your community host"><input className="input" value={sec.customDomain} onChange={(e) => setSec({ customDomain: e.target.value })} placeholder="community.example.edu" /></Field>
        <Field label="White-labelled mobile app name"><input className="input" value={sec.mobileAppName} onChange={(e) => setSec({ mobileAppName: e.target.value })} placeholder={`${state.settings.networkName} Mobile`} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--az-focus)]" checked={sec.externalUsers} onChange={(e) => setSec({ externalUsers: e.target.checked })} />Allow external (guest) users</label>
        <p className="text-xs text-2">Data is encrypted in transit by HTTPS; exports can be password-protected under Data export.</p>
      </section>
      <section className="panel space-y-3 p-5 lg:col-span-2">
        <h3 className="font-bold">GDPR tools</h3>
        <p className="text-sm text-2">Respond to data-access and erasure requests from members.</p>
        <div className="flex flex-wrap gap-2">
          <select className="input max-w-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Member">
            <option value="">Choose a member…</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>
          <button className="btn btn-ghost" disabled={!member} onClick={() => download(`member-data-${member.id}.json`, JSON.stringify(memberData(member.id), null, 2))}>Export member’s data</button>
          <button className="btn btn-danger" disabled={!member || member.id === me.id} onClick={erase}>Erase member’s content</button>
        </div>
      </section>
    </div>
  );
}

export function AssistSettings() {
  const { state, dispatch } = useStore();
  const assist = { enabled: true, writer: true, summaries: true, translation: true, sentiment: true, ...state.settings.assist };
  const set = (patch) => dispatch({ type: 'set', key: 'settings', value: (s) => ({ ...s, assist: { ...assist, ...s.assist, ...patch } }) });
  const onDevice = typeof self !== 'undefined' && ('Summarizer' in self || 'Writer' in self);
  const opts = [['writer', 'Writing assistant in post and article editors'], ['summaries', 'Post, thread and town hall summaries'], ['translation', 'Translate posts and comments'], ['sentiment', 'Sentiment analysis in analytics']];
  return (
    <section className="panel max-w-2xl space-y-3 p-5">
      <h3 className="font-bold"><Glyph value="sparkle" tile={false} size={16} /> Smart Assist</h3>
      <p className="text-sm text-2">
        Smart Assist uses your browser’s built-in on-device AI when available ({onDevice ? 'detected' : 'not detected — simple local fallbacks are used'}). No content is sent to an external service.
      </p>
      <label className="flex min-h-11 items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5 accent-[var(--az-focus)]" checked={assist.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Enable Smart Assist for this network</label>
      <div className={`space-y-1 pl-7 ${assist.enabled ? '' : 'pointer-events-none opacity-50'}`}>
        {opts.map(([k, l]) => <label key={k} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--az-focus)]" checked={assist[k]} onChange={(e) => set({ [k]: e.target.checked })} />{l}</label>)}
      </div>
      <p className="text-xs text-2">Modules read <code>settings.assist</code> to show or hide AI buttons.</p>
    </section>
  );
}
