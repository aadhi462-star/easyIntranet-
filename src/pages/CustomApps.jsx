import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fmtDate, timeAgo, uid, useStore } from '../lib/store.jsx';
import { Empty, Field, Modal, PageHeader, Tabs, UserLink } from '../components/ui.jsx';
import { BarList, PieChart, download, toCsv } from '../components/admin/charts.jsx';
import { OptionsInput } from '../components/collab/common.jsx';

const FIELD_TYPES = [['text', 'Single line'], ['longtext', 'Long text'], ['number', 'Number'], ['date', 'Date'], ['select', 'Dropdown'], ['checkbox', 'Checkbox'], ['user', 'Member']];

export default function CustomApps() {
  const { id } = useParams();
  return id ? <AppView id={id} /> : <AppList />;
}

function AppList() {
  const { state, me, user } = useStore();
  const [creating, setCreating] = useState(false);
  const apps = state.customApps || [];
  return (
    <>
      <PageHeader title="Custom Apps" subtitle="Build forms to collect information, then report on the records."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>+ New app</button>} />
      {apps.length === 0 ? <Empty icon="apps" title="No apps yet">Create a form like “Mentorship request” or “Job referral”.</Empty> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => {
            const n = (state.appRecords || []).filter((r) => r.appId === a.id).length;
            return (
              <Link key={a.id} to={`/apps/${a.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
                <Glyph value={a.icon || 'apps'} size={48} className="text-xl" />
                <h2 className="mt-3 font-bold">{a.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{a.description}</p>
                <p className="mt-3 text-xs text-slate-500">{a.fields.length} fields · {n} records · owner {user(a.ownerId)?.name ?? '—'}{a.ownerId === me.id ? ' (you)' : ''}</p>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <AppEditor onClose={() => setCreating(false)} />}
    </>
  );
}

function AppEditor({ app, onClose }) {
  const { dispatch, me } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState(app?.name ?? '');
  const [icon, setIcon] = useState(app?.icon ?? 'apps');
  const [description, setDescription] = useState(app?.description ?? '');
  const [notifyOwner, setNotifyOwner] = useState(app?.notifyOwner ?? true);
  const [fields, setFields] = useState(app?.fields ?? [{ id: uid('fd'), label: 'Title', type: 'text', required: true, options: [] }]);
  const setField = (i, patch) => setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, d) => { const n = [...fields]; [n[i], n[i + d]] = [n[i + d], n[i]]; setFields(n); };

  const save = () => {
    if (!name.trim() || !fields.length || fields.some((f) => !f.label.trim())) return alert('Give the app a name and every field a label.');
    const data = { name: name.trim(), icon, description, notifyOwner, fields };
    if (app) dispatch({ type: 'update', col: 'customApps', id: app.id, patch: data });
    else {
      const id = uid('app');
      dispatch({ type: 'add', col: 'customApps', item: { id, ownerId: me.id, ...data } });
      nav(`/apps/${id}`);
    }
    onClose();
  };

  return (
    <Modal title={app ? 'Edit app' : 'New app'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="Icon"><input className="input text-center" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></Field>
          <Field label="App name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <Field label="Description"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={notifyOwner} onChange={(e) => setNotifyOwner(e.target.checked)} />Notify me when a new record is submitted (workflow)</label>
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-300">Fields</div>
          <ul className="space-y-2">
            {fields.map((f, i) => (
              <li key={f.id} className="rounded-xl bg-white/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input className="input min-w-40 flex-1" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} aria-label="Field label" placeholder="Field label" />
                  <select className="input !w-36" value={f.type} onChange={(e) => setField(i, { type: e.target.value })} aria-label="Field type">
                    {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="flex min-h-11 items-center gap-1.5 text-xs"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
                  <button className="btn btn-ghost h-10 w-10 !p-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move field up">↑</button>
                  <button className="btn btn-ghost h-10 w-10 !p-0" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Move field down">↓</button>
                  <button className="btn btn-ghost h-10 w-10 !p-0" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label="Remove field">✕</button>
                </div>
                {f.type === 'select' && (
                  <OptionsInput className="input mt-2" placeholder="Options, comma separated" value={f.options} aria-label="Dropdown options"
                    onChange={(options) => setField(i, { options })} />
                )}
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost mt-2" onClick={() => setFields([...fields, { id: uid('fd'), label: '', type: 'text', required: false, options: [] }])}>+ Add field</button>
        </div>
        <button className="btn btn-primary w-full" onClick={save}>{app ? 'Save changes' : 'Create app'}</button>
      </div>
    </Modal>
  );
}

function display(field, value, user) {
  if (value == null || value === '') return '—';
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'user') return user(value)?.name ?? '—';
  // Date inputs store "YYYY-MM-DD"; parse at local noon so it doesn't shift a day west of UTC.
  if (field.type === 'date') return fmtDate(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00` : value).getTime(), { day: 'numeric', month: 'short', year: 'numeric' });
  return String(value);
}

function AppView({ id }) {
  const { state, me, user, dispatch } = useStore();
  const nav = useNavigate();
  const app = (state.customApps || []).find((a) => a.id === id);
  const [tab, setTab] = useState('records');
  const [record, setRecord] = useState(null); // null | 'new' | record
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  if (!app) return <Empty icon="apps" title="App not found"><Link className="text-brand-400 underline" to="/apps">Back to apps</Link></Empty>;
  const isOwner = app.ownerId === me.id || me.admin;
  const records = (state.appRecords || []).filter((r) => r.appId === id)
    .filter((r) => !q || app.fields.some((f) => display(f, r.values[f.id], user).toLowerCase().includes(q.toLowerCase())));

  const exportCsv = () => download(`${app.name}.csv`, toCsv(records.map((r) => ({
    Submitted: new Date(r.createdAt).toISOString(), By: user(r.authorId)?.name ?? '',
    ...Object.fromEntries(app.fields.map((f) => [f.label, display(f, r.values[f.id], user)])),
  }))), 'text/csv');

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3"><Glyph value={app.icon} size={38} />{app.name}</span>} subtitle={app.description}
        actions={<>
          <button className="btn btn-primary" onClick={() => setRecord('new')}>+ New record</button>
          {isOwner && <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit app</button>}
          {isOwner && <button className="btn btn-ghost" onClick={() => {
            if (!confirm(`Delete “${app.name}” and all its records?`)) return;
            (state.appRecords || []).filter((r) => r.appId === id).forEach((r) => dispatch({ type: 'remove', col: 'appRecords', id: r.id, silent: true }));
            dispatch({ type: 'remove', col: 'customApps', id });
            nav('/apps');
          }}>Delete</button>}
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'records', label: 'Records', count: records.length }, { id: 'reports', label: 'Reports' }]} />
      {tab === 'records' ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="input max-w-sm" type="search" placeholder="Filter records" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter records" />
            <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
          </div>
          {records.length === 0 ? <Empty icon="inbox" title="No records yet" /> : (
            <div className="glass overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-400">
                  <tr>{app.fields.map((f) => <th key={f.id} className="p-3">{f.label}</th>)}<th className="p-3">Submitted</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[.03]">
                      {app.fields.map((f) => <td key={f.id} className="max-w-56 truncate p-3 text-slate-200">{display(f, r.values[f.id], user)}</td>)}
                      <td className="whitespace-nowrap p-3 text-xs text-slate-400"><UserLink id={r.authorId} className="!font-medium" /> · {timeAgo(r.createdAt)}</td>
                      <td className="whitespace-nowrap p-3 text-right">
                        {(r.authorId === me.id || isOwner) && <>
                          <button className="btn btn-ghost h-9 text-xs" onClick={() => setRecord(r)}>Edit</button>
                          <button className="btn btn-ghost ml-1 h-9 text-xs" onClick={() => confirm('Delete this record?') && dispatch({ type: 'remove', col: 'appRecords', id: r.id })}>Delete</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : <Reports app={app} records={records} onExport={exportCsv} />}
      {record && <RecordForm app={app} record={record === 'new' ? null : record} onClose={() => setRecord(null)} />}
      {editing && <AppEditor app={app} onClose={() => setEditing(false)} />}
    </>
  );
}

function Reports({ app, records, onExport }) {
  const { user } = useStore();
  const groupable = app.fields.filter((f) => ['select', 'checkbox', 'user'].includes(f.type));
  const [by, setBy] = useState(groupable[0]?.id ?? '');
  const [kind, setKind] = useState('bar');
  const field = app.fields.find((f) => f.id === by);
  const counts = {};
  for (const r of records) { const k = field ? display(field, r.values[field.id], user) : 'All'; counts[k] = (counts[k] || 0) + 1; }
  const data = Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const byDay = {};
  for (const r of records) { const d = new Date(r.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); byDay[d] = (byDay[d] || 0) + 1; }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="glass p-5">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Group by">
            <select className="input" value={by} onChange={(e) => setBy(e.target.value)}>
              {groupable.length === 0 && <option value="">(no dropdown, checkbox or member fields)</option>}
              {groupable.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          <div role="group" aria-label="Chart type" className="flex gap-1">
            {[['bar', 'Bar'], ['pie', 'Pie']].map(([v, l]) => <button key={v} className={`btn h-11 ${kind === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setKind(v)}>{l}</button>)}
          </div>
          <button className="btn btn-ghost h-11" onClick={onExport}>Export CSV</button>
        </div>
        {data.length === 0 ? <p className="text-sm text-slate-400">No records to report on.</p>
          : kind === 'bar' ? <BarList data={data} /> : <PieChart data={data} label={`Records by ${field?.label}`} />}
      </section>
      <section className="glass p-5">
        <h2 className="mb-3 font-bold">Summary</h2>
        <p className="text-3xl font-extrabold">{records.length}</p>
        <p className="text-sm text-slate-400">total records</p>
        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-300">Submissions by day</h3>
        <BarList data={Object.entries(byDay).map(([label, value]) => ({ label, value }))} />
      </section>
    </div>
  );
}

function RecordForm({ app, record, onClose }) {
  const { state, dispatch } = useStore();
  const [values, setValues] = useState(record?.values ?? {});
  const [error, setError] = useState('');
  const set = (id, v) => setValues({ ...values, [id]: v });
  const submit = (e) => {
    e.preventDefault();
    const missing = app.fields.filter((f) => f.required && (values[f.id] == null || (typeof values[f.id] === 'string' && !values[f.id].trim()) || values[f.id] === false));
    if (missing.length) return setError(`Required: ${missing.map((f) => f.label).join(', ')}`);
    if (record) dispatch({ type: 'update', col: 'appRecords', id: record.id, patch: { values } });
    else dispatch({ type: 'add', col: 'appRecords', item: { appId: app.id, values } });
    onClose();
  };
  return (
    <Modal title={record ? 'Edit record' : `New ${app.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {app.fields.map((f) => {
          const v = values[f.id] ?? '';
          const label = `${f.label}${f.required ? ' *' : ''}`;
          if (f.type === 'checkbox') return <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-brand-500" checked={!!values[f.id]} onChange={(e) => set(f.id, e.target.checked)} />{label}</label>;
          return (
            <Field key={f.id} label={label}>
              {f.type === 'longtext' ? <textarea className="input min-h-24" value={v} onChange={(e) => set(f.id, e.target.value)} />
                : f.type === 'select' ? <select className="input" value={v} onChange={(e) => set(f.id, e.target.value)}><option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                : f.type === 'user' ? <select className="input" value={v} onChange={(e) => set(f.id, e.target.value)}><option value="">Choose a member…</option>{state.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                : <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v} onChange={(e) => set(f.id, e.target.value)} />}
            </Field>
          );
        })}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button className="btn btn-primary w-full">{record ? 'Save' : 'Submit'}</button>
      </form>
    </Modal>
  );
}
