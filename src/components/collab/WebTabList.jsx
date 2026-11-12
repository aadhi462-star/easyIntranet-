import { Glyph } from '../icons.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { Empty, Field, Modal } from '../ui.jsx';
import { confirmAction } from '../ui/Confirm.jsx';
import { Menu, ScopeBadge, Select } from './common.jsx';

export const visibleTab = (state, me, t) => t.scope === 'network' || (t.scope === 'private' && t.ownerId === me.id)
  || (t.scope === 'group' && (me.admin || state.groups.find((g) => g.id === t.groupId)?.members.includes(me.id)));

export function WebTabForm({ tab, groupId, onClose }) {
  const { state, dispatch, me } = useStore();
  const [f, setF] = useState({ name: tab?.name ?? '', url: tab?.url ?? 'https://', scope: tab?.scope ?? (groupId ? 'group' : me.admin ? 'network' : 'private'), groupId: tab?.groupId ?? groupId ?? '' });
  const [error, setError] = useState('');
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const submit = (e) => {
    e.preventDefault();
    let url;
    try { url = new URL(f.url.trim()); } catch { setError('Enter a full web address starting with https://'); return; }
    if (!/^https?:$/.test(url.protocol)) { setError('Only http and https addresses are allowed.'); return; }
    if (!f.name.trim()) { setError('Give the tab a name.'); return; }
    if (f.scope === 'group' && !f.groupId) { setError('Choose a group for a group tab.'); return; }
    const data = { name: f.name.trim(), url: url.href, scope: f.scope, groupId: f.scope === 'group' ? f.groupId || null : null };
    if (tab) dispatch({ type: 'update', col: 'webTabs', id: tab.id, patch: data });
    else dispatch({ type: 'add', col: 'webTabs', prepend: false, item: { ...data, ownerId: me.id } });
    onClose();
  };
  const scopes = [...(me.admin ? [['network', 'Network (everyone)']] : []), ['group', 'Group'], ['private', 'Private (only me)']];
  return (
    <Modal title={tab ? 'Edit web tab' : 'Add web tab'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Alumni newsletter" /></Field>
        <Field label="URL" hint="Some sites block being embedded. Those still open in a new tab."><input className="input" type="url" value={f.url} onChange={set('url')} /></Field>
        <Field label="Show to"><Select label="Visibility" value={f.scope} onChange={set('scope')} options={scopes} /></Field>
        {f.scope === 'group' && (
          <Field label="Group"><Select label="Group" value={f.groupId} onChange={set('groupId')} options={[['', 'Choose a group'], ...state.groups.filter((g) => me.admin || g.admins.includes(me.id) || g.members.includes(me.id)).map((g) => [g.id, g.name])]} /></Field>
        )}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button className="btn btn-primary w-full">{tab ? 'Save' : 'Add tab'}</button>
      </form>
    </Modal>
  );
}

export function WebTabFrame({ tab }) {
  return (
    <div>
      <div className="glass mb-3 flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="min-w-0 flex-1 truncate text-slate-400">{tab.url}</span>
        <a href={tab.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Open in new tab <Glyph value="external" tile={false} size={14} /></a>
      </div>
      <iframe src={tab.url} title={tab.name} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerPolicy="no-referrer"
        className="h-[70vh] w-full rounded-2xl border border-white/10 bg-white" />
      <p className="mt-2 text-xs text-slate-500">If the page stays blank, the site doesn’t allow embedding. Use “Open in new tab”.</p>
    </div>
  );
}

/** Web tab list. In a group (`groupId`) it shows that group's tabs and opens them inline. */
export default function WebTabList({ groupId }) {
  const { state, dispatch, me } = useStore();
  const [form, setForm] = useState(null); // null | 'new' | tab
  const [open, setOpen] = useState(null);
  const tabs = (state.webTabs ?? []).filter((t) => (groupId ? t.groupId === groupId : visibleTab(state, me, t)));
  const canManage = (t) => t.ownerId === me.id || me.admin;
  const current = tabs.find((t) => t.id === open);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {groupId && tabs.map((t) => (
          <button key={t.id} className={`btn ${open === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOpen(t.id)}><Glyph value="webtabs" tile={false} size={16} /> {t.name}</button>
        ))}
        <button className="btn btn-primary ml-auto" onClick={() => setForm('new')}>＋ Add web tab</button>
      </div>
      {groupId && current ? <WebTabFrame tab={current} /> : !tabs.length ? (
        <Empty icon="webtabs" title="No web tabs">Pin websites you use often so everyone can open them here.</Empty>
      ) : !groupId && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tabs.map((t) => (
            <div key={t.id} className="glass flex items-start gap-3 p-4">
              <Link to={`/webtabs/${t.id}`} className="min-w-0 flex-1">
                <div className="font-semibold hover:underline"><Glyph value="webtabs" tile={false} size={16} /> {t.name}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{new URL(t.url).host}</div>
                <div className="mt-2"><ScopeBadge scope={t.scope} groupId={t.groupId} /></div>
              </Link>
              {canManage(t) && <Menu label={`Actions for ${t.name}`} items={[
                { label: 'Edit', onClick: () => setForm(t) },
                { label: 'Delete', danger: true, onClick: async () => (await confirmAction(`Delete the “${t.name}” tab?`)) && dispatch({ type: 'remove', col: 'webTabs', id: t.id }) },
              ]} />}
            </div>
          ))}
        </div>
      )}
      {groupId && !current && !!tabs.length && <p className="text-sm text-slate-400">Choose a tab above to open it.</p>}
      {form && <WebTabForm tab={form === 'new' ? null : form} groupId={groupId} onClose={() => setForm(null)} />}
    </div>
  );
}
