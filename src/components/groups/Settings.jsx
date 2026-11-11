import { Glyph } from '../icons.jsx';
import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { Field } from '../ui.jsx';
import { ACCESS, APPS, RULE_FIELDS, matchesRule } from './helpers.js';
import { errorText, visibilityOf } from '../../lib/communities.js';
import { useCommunityLifecycle, useCommunityWrite } from './useCommunity.js';

// A community with no stored module list (AlumniZone) has every module on, as its tabs show.
export default function Settings({ group }) {
  const { state, me } = useStore();
  const { patch } = useCommunityWrite();
  const lifecycle = useCommunityLifecycle();
  const archived = group.status === 'archived';
  const fromGroup = () => ({ name: group.name, description: group.description, guidelines: group.guidelines || '', accessType: group.accessType, apps: group.apps ?? APPS.map((x) => x.id), announceOnly: !!group.announceOnly });
  const [v, setV] = useState(fromGroup);
  const [rule, setRule] = useState(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Re-sync when the group changes elsewhere (e.g. the Edit group modal) so a later save doesn't revert it.
  const sig = JSON.stringify([group.name, group.description, group.guidelines, group.accessType, group.apps, group.announceOnly, group.dynamicRule]);
  useEffect(() => {
    setV(fromGroup());
    setRule(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setSaved(false); setError(''); setV({ ...v, [k]: e.target.value }); };
  const ruleValue = String(rule.value ?? '').trim();
  // Unsaved changes: a bar to save or discard, and a warning before leaving the page (SET-09).
  const dirty = JSON.stringify([v, rule]) !== JSON.stringify([fromGroup(), group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' }]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const preview = ruleValue ? state.users.filter((u) => matchesRule(u, rule)) : [];

  // Saved on the server; pending requests are re-evaluated there when the access type changes.
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await patch(group, {
        name: v.name.trim() || group.name, description: v.description || null, visibility: visibilityOf(v.accessType),
        settings: {
          guidelines: v.guidelines, apps: v.apps.includes('members') ? v.apps : [...v.apps, 'members'],
          announceOnly: v.announceOnly, whoCanPost: v.announceOnly ? 'admins' : 'members',
          dynamicRule: ruleValue ? { ...rule, value: ruleValue } : null,
        },
      }, { inline: true });
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      {/* The brief's sections (Stage 6, board S6Settings); each jumps to its part of the form. */}
      <nav aria-label="Settings sections" className="no-scrollbar flex gap-2 overflow-x-auto">
        {[['set-general', 'General'], ['set-privacy', 'Privacy and visibility'], ['set-content', 'Discussions and content'], ['set-modules', 'Modules'], ['set-membership', 'Membership'], ['set-safety', 'Moderation and safety'], ['danger', 'Danger Zone']].map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            className={`inline-flex min-h-10 shrink-0 items-center rounded-full border border-[var(--az-hairline)] px-3.5 text-sm ${id === 'danger' ? 'text-rose-300' : 'text-2 hover:text-white'}`}>{label}</a>
        ))}
      </nav>
      <section id="set-general" className="glass space-y-4 p-5">
        <h3 className="font-bold">General</h3>
        <Field label="Name"><input className="input" value={v.name} onChange={set('name')} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={v.description} onChange={set('description')} /></Field>
        <Field label="Guidelines" hint="Shown on the dashboard Guidelines widget."><textarea className="input min-h-20" value={v.guidelines} onChange={set('guidelines')} /></Field>
      </section>

      <section id="set-content" className="glass space-y-3 p-5">
        <h3 className="font-bold">Discussions and content</h3>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="accent-brand-500" checked={v.announceOnly} onChange={(e) => setV({ ...v, announceOnly: e.target.checked })} />
          Only admins can post in the feed (announcement group)
        </label>
      </section>

      <section id="set-privacy" className="glass p-5">
        <h3 className="mb-3 font-bold">Privacy and visibility</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(ACCESS).map(([k, a]) => (
            <label key={k} className={`cursor-pointer rounded-xl border p-3 text-sm ${v.accessType === k ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 hover:bg-white/5'}`}>
              <input type="radio" name="access" className="sr-only" checked={v.accessType === k} onChange={() => setV({ ...v, accessType: k })} />
              <div className="font-semibold"><span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span></div><div className="mt-1 text-xs text-slate-400">{a.desc}</div>
            </label>
          ))}
        </div>
      </section>

      <section id="set-modules" className="glass p-5">
        <h3 className="mb-3 font-bold">Modules</h3>
        <div className="flex flex-wrap gap-2">
          {APPS.map((a) => (
            <label key={a.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${v.apps.includes(a.id) ? 'border-brand-500 bg-brand-500/15' : 'border-white/10'}`}>
              <input type="checkbox" className="accent-brand-500" disabled={a.id === 'members'} checked={v.apps.includes(a.id)}
                onChange={() => setV({ ...v, apps: v.apps.includes(a.id) ? v.apps.filter((x) => x !== a.id) : [...v.apps, a.id] })} />
              <span className="inline-flex items-center gap-2"><Glyph value={a.icon} size={22} />{a.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section id="set-membership" className="glass space-y-3 p-5">
        <h3 className="font-bold">Membership</h3>
        <Locked text="Removed members can ask to join again after 7 days" />
        <h4 className="pt-2 text-sm font-semibold text-white">Dynamic membership</h4>
        <p className="text-sm text-slate-400">People whose profile matches this rule are added automatically, now and when they join later. For now this runs while an admin of this group has CommunityOne open.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="input" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value })} aria-label="Profile field">
            {RULE_FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value })} aria-label="Condition">
            <option value="eq">is</option><option value="contains">contains</option>
          </select>
          <input className="input" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} placeholder="Value (blank = off)" aria-label="Value" />
        </div>
        {ruleValue && <p className="text-xs text-slate-400">Matches {preview.length} {preview.length === 1 ? 'person' : 'people'}: {preview.map((u) => u.name).join(', ') || 'none'}</p>}
      </section>

      <section id="set-safety" className="glass space-y-3 p-5">
        <h3 className="font-bold">Moderation and safety</h3>
        <p className="text-sm text-slate-400">Members report posts, replies, events and other members; reports go to this community’s moderators (Manage → Queue).</p>
        <Locked text="Report reasons: Spam · Harassment or bullying · Hate · False or misleading · Off-topic · Something else" />
        <Locked text="Files: up to 10 MB; PDF, images, Office documents and plain text" />
      </section>

      {dirty && (
        <div role="region" aria-label="Unsaved changes" className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-[var(--az-surface)] p-3 shadow-xl lg:bottom-4">
          <span className="flex-1 text-sm">You have unsaved changes.</span>
          <button type="button" className="btn btn-ghost" onClick={() => { setV(fromGroup()); setRule(group.dynamicRule ?? { field: 'batch', op: 'eq', value: '' }); setError(''); }}>Discard</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {archived
            ? <button type="button" className="btn btn-ghost" onClick={() => lifecycle.archive(group, false)}>Restore community</button>
            : <button type="button" className="btn btn-ghost text-rose-300" onClick={() => lifecycle.archive(group, true)} disabled={group.allHands}>Archive community</button>}
          {me.admin && <button type="button" className="btn btn-ghost text-rose-300" onClick={() => lifecycle.remove(group)} disabled={group.allHands}>Delete community</button>}
        </div>
        <div className="flex items-center gap-3">
          {error && <span role="alert" className="text-sm text-rose-300">{error}</span>}
          {saved && <span role="status" className="text-sm text-emerald-300">Saved</span>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>
    </form>
  );
}

/** A rule the platform sets: shown, never editable here (SET-01). */
function Locked({ text }) {
  return (
    <p className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--az-sunken)] px-3 py-2.5 text-sm">
      <span className="rounded-full bg-white/[.08] px-2.5 py-0.5 text-xs font-semibold text-slate-200">Managed by CommunityOne</span>
      <span className="min-w-0 flex-1 text-slate-200">{text}</span>
    </p>
  );
}
