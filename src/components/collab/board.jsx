import { Glyph } from '../icons.jsx';
import { useMemo, useState } from 'react';
import { useStore, fmtDate, timeAgo, uid } from '../../lib/store.jsx';
import { Avatar, Field, Modal, Tabs, UserLink } from '../ui.jsx';
import { Menu, OptionsInput, Select, UserPicker, fromDateInput, myGroups, toDateInput } from './common.jsx';
import { confirmAction } from '../ui/Confirm.jsx';

const PRIORITIES = [['none', 'No priority'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
const PRIO_CLS = { low: 'text-leaf-300', medium: 'text-amber-300', high: 'text-orange-300', urgent: 'text-rose-300' };
const day = 864e5;

export function useBoardHelpers(board) {
  const { state } = useStore();
  const tasks = (state.tasks ?? []).filter((t) => t.boardId === board.id);
  const doneIds = new Set(board.sections.filter((s) => s.done).map((s) => s.id));
  const isDone = (t) => doneIds.has(t.status);
  const byId = Object.fromEntries((state.tasks ?? []).map((t) => [t.id, t]));
  const blockers = (t) => (t.blockedBy ?? []).map((id) => byId[id]).filter((b) => b && !doneIds.has(b.status) && !board.sections.find((s) => s.id === b.status && s.done));
  return { tasks, isDone, blockers, byId };
}

export function canSeeBoard(state, me, b) {
  if (b.scope === 'network') return true;
  // The owner and explicit board members always see it (e.g. a group board made by someone who later left the group).
  if (b.ownerId === me.id || b.members?.includes(me.id)) return true;
  if (b.scope === 'group') return myGroups(state, me).some((g) => g.id === b.groupId);
  return false;
}

export function BoardForm({ board, groupId, onClose, onCreated }) {
  const { state, dispatch, me } = useStore();
  const [f, setF] = useState(() => board ? structuredClone(board) : {
    name: '', scope: groupId ? 'group' : 'network', groupId: groupId ?? '', members: [me.id], labels: [], customFields: [],
    sections: [{ id: uid('s'), name: 'To do' }, { id: uid('s'), name: 'In progress' }, { id: uid('s'), name: 'Done', done: true }],
  });
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const boardTasks = board ? (state.tasks ?? []).filter((t) => t.boardId === board.id) : [];
  const setSection = (i, patch) => set('sections', f.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setFieldDef = (i, patch) => set('customFields', f.customFields.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.sections.length) return;
    if (f.scope === 'group' && !f.groupId) { setError('Choose a group for a group board.'); return; }
    const data = { ...f, name: f.name.trim(), groupId: f.scope === 'group' ? f.groupId || null : null };
    if (board) {
      dispatch({ type: 'update', col: 'boards', id: board.id, patch: data });
      // Tasks in removed sections move to the first remaining section.
      const ids = new Set(data.sections.map((s) => s.id));
      boardTasks.filter((t) => !ids.has(t.status)).forEach((t) => dispatch({ type: 'update', col: 'tasks', id: t.id, silent: true, patch: { status: data.sections[0].id } }));
    }
    else { const id = uid('b'); dispatch({ type: 'add', col: 'boards', item: { ...data, id, ownerId: me.id } }); onCreated?.(id); }
    onClose();
  };

  return (
    <Modal title={board ? 'Board settings' : 'New board'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Board name"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Visibility">
            <Select label="Visibility" value={f.scope} onChange={(v) => { set('scope', v); setError(''); }} options={[['network', 'Network'], ['group', 'Group'], ['private', 'Private (members only)']]} />
          </Field>
          {f.scope === 'group' && (
            <Field label="Group"><Select label="Group" value={f.groupId} onChange={(v) => { set('groupId', v); setError(''); }} options={[['', 'Choose a group'], ...myGroups(state, me, board?.groupId ?? groupId).map((g) => [g.id, g.name])]} /></Field>
          )}
        </div>
        <Field label="Members"><UserPicker value={f.members} onChange={(v) => set('members', v)} /></Field>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-300">Sections (columns)</legend>
          <div className="space-y-2">
            {f.sections.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <input className="input" value={s.name} onChange={(e) => setSection(i, { name: e.target.value })} aria-label={`Section ${i + 1} name`} />
                <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" checked={!!s.done} onChange={(e) => setSection(i, { done: e.target.checked })} /> Done</label>
                <button type="button" className="btn btn-ghost h-10 w-10 !p-0" aria-label="Move up" disabled={!i} onClick={() => { const a = [...f.sections]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set('sections', a); }}>↑</button>
                <button type="button" className="btn btn-ghost h-10 w-10 !p-0 text-rose-300" aria-label="Remove section" disabled={f.sections.length < 2}
                  onClick={async () => {
                    const n = boardTasks.filter((t) => t.status === s.id).length;
                    if (n && !(await confirmAction(`Remove “${s.name}”? Its ${n} task${n === 1 ? '' : 's'} will move to the first section when you save.`))) return;
                    set('sections', f.sections.filter((_, j) => j !== i));
                  }}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => set('sections', [...f.sections, { id: uid('s'), name: 'New section' }])}>＋ Add section</button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-300">Labels</legend>
          <div className="flex flex-wrap gap-2">
            {f.labels.map((l) => <button type="button" key={l} className="chip" onClick={() => set('labels', f.labels.filter((x) => x !== l))} aria-label={`Remove label ${l}`}>{l} ✕</button>)}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New label" aria-label="New label" />
            <button type="button" className="btn btn-ghost" onClick={() => { if (label.trim() && !f.labels.includes(label.trim())) set('labels', [...f.labels, label.trim()]); setLabel(''); }}>Add</button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-slate-300">Custom fields</legend>
          <div className="space-y-2">
            {f.customFields.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_auto_auto] gap-2 sm:grid-cols-[1fr_130px_1fr_auto]">
                <input className="input" value={c.name} onChange={(e) => setFieldDef(i, { name: e.target.value })} aria-label="Field name" />
                <Select label="Field type" value={c.type} onChange={(v) => setFieldDef(i, { type: v })} options={[['text', 'Text'], ['number', 'Number'], ['select', 'Dropdown'], ['date', 'Date']]} />
                {c.type === 'select' ? (
                  <OptionsInput className="input col-span-3 sm:col-span-1" placeholder="Options, comma separated" value={c.options}
                    onChange={(options) => setFieldDef(i, { options })} aria-label="Dropdown options" />
                ) : <span className="hidden sm:block" />}
                <button type="button" className="btn btn-ghost h-10 w-10 !p-0 text-rose-300" aria-label="Remove field" onClick={() => set('customFields', f.customFields.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => set('customFields', [...f.customFields, { id: uid('cf'), name: 'New field', type: 'text' }])}>＋ Add custom field</button>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button className="btn btn-primary w-full">{board ? 'Save board' : 'Create board'}</button>
      </form>
    </Modal>
  );
}

export function TaskModal({ board, task, defaultSection, onClose, canEdit = true }) {
  const { state, dispatch, me, user } = useStore();
  const { tasks, blockers, isDone, byId } = useBoardHelpers(board);
  const [f, setF] = useState(() => task ? structuredClone(task) : {
    title: '', description: '', assigneeId: me.id, dueAt: null, priority: 'none', labels: [], custom: {}, blockedBy: [], checklist: [], comments: [],
    status: defaultSection ?? board.sections[0].id,
  });
  const [item, setItem] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const members = state.users.filter((u) => board.members.includes(u.id) || u.id === f.assigneeId);

  const save = (e) => {
    e?.preventDefault();
    if (!canEdit || !f.title.trim()) return;
    const target = board.sections.find((s) => s.id === f.status);
    if (target?.done && blockers(f).length) { setError(`Blocked by: ${blockers(f).map((b) => b.title).join(', ')}. Finish those first.`); return; }
    // Comments are saved as they're posted; keep the stored list so none are lost.
    if (task) dispatch({ type: 'update', col: 'tasks', id: task.id, patch: (x) => ({ ...x, ...f, comments: x.comments ?? [] }) });
    else {
      dispatch({ type: 'add', col: 'tasks', item: { ...f, boardId: board.id, order: tasks.filter((t) => t.status === f.status).length } });
    }
    if (f.assigneeId && f.assigneeId !== me.id && f.assigneeId !== task?.assigneeId) {
      dispatch({ type: 'notify', notification: { userId: f.assigneeId, kind: 'task', text: `${me.name} assigned you “${f.title}” on ${board.name}`, link: `/tasks/${board.id}` } });
    }
    onClose();
  };

  // Would making `depId` block this task create a cycle (depId already depends on this task)?
  const createsCycle = (depId) => {
    if (!task) return false;
    const seen = new Set();
    const stack = [depId];
    while (stack.length) {
      const id = stack.pop();
      if (id === task.id) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(byId[id]?.blockedBy ?? []));
    }
    return false;
  };
  const toggleDep = (t) => {
    const on = f.blockedBy.includes(t.id);
    if (!on && createsCycle(t.id)) { setError(`“${t.title}” already depends on this task, so it can’t also block it.`); return; }
    setError('');
    set('blockedBy', on ? f.blockedBy.filter((x) => x !== t.id) : [...f.blockedBy, t.id]);
  };
  const addComment = () => {
    if (!comment.trim()) return;
    const c = { id: uid('tc'), authorId: me.id, text: comment.trim(), createdAt: Date.now() };
    dispatch({ type: 'update', col: 'tasks', id: task.id, silent: true, patch: (x) => ({ ...x, comments: [...(x.comments ?? []), c] }) });
    set('comments', [...f.comments, c]);
    setComment('');
  };

  const customInput = (c) => {
    const v = f.custom?.[c.id] ?? '';
    const put = (val) => set('custom', { ...f.custom, [c.id]: val });
    if (c.type === 'select') return <Select label={c.name} value={v} onChange={put} options={[['', '—'], ...(c.options ?? []).map((o) => [o, o])]} />;
    if (c.type === 'date') return <input className="input" type="date" value={toDateInput(v)} onChange={(e) => put(fromDateInput(e.target.value))} aria-label={c.name} />;
    return <input className="input" type={c.type === 'number' ? 'number' : 'text'} value={v} onChange={(e) => put(c.type === 'number' ? Number(e.target.value) : e.target.value)} aria-label={c.name} />;
  };

  return (
    <Modal title={task ? 'Task' : 'New task'} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        {!canEdit && <p className="text-xs text-slate-400">View only — you’re not a member of this board.</p>}
        <fieldset disabled={!canEdit} className="space-y-4">
        <input className="input text-lg font-semibold" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Task title" aria-label="Task title" />
        <textarea className="input min-h-20" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Description" aria-label="Description" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section"><Select label="Section" value={f.status} onChange={(v) => { set('status', v); setError(''); }} options={board.sections.map((s) => [s.id, s.name])} /></Field>
          <Field label="Assignee"><Select label="Assignee" value={f.assigneeId ?? ''} onChange={(v) => set('assigneeId', v || null)} options={[['', 'Unassigned'], ...members.map((u) => [u.id, u.name])]} /></Field>
          <Field label="Due date"><input className="input" type="date" value={toDateInput(f.dueAt)} onChange={(e) => set('dueAt', fromDateInput(e.target.value))} /></Field>
          <Field label="Priority"><Select label="Priority" value={f.priority} onChange={(v) => set('priority', v)} options={PRIORITIES} /></Field>
          {board.customFields.map((c) => <Field key={c.id} label={c.name}>{customInput(c)}</Field>)}
        </div>
        {!!board.labels.length && (
          <Field label="Labels">
            <div className="flex flex-wrap gap-2">
              {board.labels.map((l) => {
                const on = f.labels.includes(l);
                return <button type="button" key={l} aria-pressed={on} className={`chip min-h-8 ${on ? '!bg-brand-500 !text-white' : ''}`} onClick={() => set('labels', on ? f.labels.filter((x) => x !== l) : [...f.labels, l])}>{l}</button>;
              })}
            </div>
          </Field>
        )}
        <Field label="Blocked by (dependencies)" hint="This task can’t move to a Done section until these are done.">
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto scroll-thin">
            {tasks.filter((t) => t.id !== task?.id).map((t) => {
              const on = f.blockedBy.includes(t.id);
              return (
                <button type="button" key={t.id} aria-pressed={on} onClick={() => toggleDep(t)}
                  className={`chip min-h-8 ${on ? '!bg-rose-500/30 !text-rose-100' : '!bg-white/5 !text-slate-300'}`}>{isDone(t) ? '✓ ' : ''}{t.title}</button>
              );
            })}
          </div>
        </Field>
        <Field label={`Checklist ${f.checklist.length ? `(${f.checklist.filter((c) => c.done).length}/${f.checklist.length})` : ''}`}>
          <ul className="space-y-1">
            {f.checklist.map((c) => (
              <li key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={c.done} onChange={() => set('checklist', f.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} aria-label={c.text} />
                <span className={c.done ? 'text-slate-500 line-through' : ''}>{c.text}</span>
                <button type="button" className="ml-auto text-xs text-slate-500 hover:text-rose-300" onClick={() => set('checklist', f.checklist.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.text}`}>✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add subtask" aria-label="Add subtask"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (item.trim()) { set('checklist', [...f.checklist, { id: uid('k'), text: item.trim(), done: false }]); setItem(''); } } }} />
            <button type="button" className="btn btn-ghost" onClick={() => { if (item.trim()) { set('checklist', [...f.checklist, { id: uid('k'), text: item.trim(), done: false }]); setItem(''); } }}>Add</button>
          </div>
        </Field>
        {task && (
          <Field label="Comments">
            <div className="space-y-2">
              {f.comments.map((c) => (
                <div key={c.id} className="flex gap-2 rounded-lg bg-white/5 p-2 text-sm"><Avatar user={user(c.authorId)} size={24} />
                  <div><UserLink id={c.authorId} /> <span className="text-xs text-slate-500">{timeAgo(c.createdAt)}</span><p>{c.text}</p></div></div>
              ))}
              <div className="flex gap-2">
                <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment" aria-label="Write a comment" />
                <button type="button" className="btn btn-ghost" onClick={addComment}>Comment</button>
              </div>
            </div>
          </Field>
        )}
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {canEdit && <div className="flex justify-between gap-2">
          {task ? <button type="button" className="btn btn-ghost text-rose-300" onClick={async () => { if (await confirmAction('Delete this task?')) { dispatch({ type: 'remove', col: 'tasks', id: task.id }); onClose(); } }}>Delete</button> : <span />}
          <button className="btn btn-primary">{task ? 'Save task' : 'Create task'}</button>
        </div>}
      </form>
    </Modal>
  );
}

function TaskCard({ task, board, onOpen, onDragStart, blocked, done, canEdit }) {
  const { user } = useStore();
  const overdue = task.dueAt && !done && task.dueAt < Date.now() - day / 2;
  const checks = task.checklist ?? [];
  return (
    <div draggable={canEdit} onDragStart={canEdit ? onDragStart : undefined} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={`${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} rounded-xl border border-white/8 bg-ink-850/90 p-3 text-sm shadow transition hover:border-brand-500/50 focus-visible:outline-2 focus-visible:outline-brand-500`}>
      <div className="flex flex-wrap gap-1">{task.labels?.map((l) => <span key={l} className="chip !text-[10px]">{l}</span>)}</div>
      <div className={`mt-1 font-semibold ${done ? 'text-slate-400 line-through' : ''}`}>{task.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {task.priority && task.priority !== 'none' && <span className={PRIO_CLS[task.priority]}>● {task.priority}</span>}
        {task.dueAt && <span className={overdue ? 'text-rose-300' : ''}><Glyph value="events" tile={false} size={16} /> {fmtDate(task.dueAt, { day: 'numeric', month: 'short' })}</span>}
        {!!checks.length && <span>{checks.filter((c) => c.done).length}/{checks.length}</span>}
        {!!task.comments?.length && <span><Glyph value="channels" tile={false} size={16} /> {task.comments.length}</span>}
        {blocked && <span className="text-rose-300" title="Blocked by unfinished tasks"><Glyph value="ban" tile={false} size={16} /> blocked</span>}
        {board.customFields.filter((c) => task.custom?.[c.id] && c.type !== 'date').slice(0, 1).map((c) => <span key={c.id}>{c.name}: {String(task.custom[c.id])}</span>)}
        <span className="ml-auto">{task.assigneeId && <Avatar user={user(task.assigneeId)} size={22} />}</span>
      </div>
    </div>
  );
}

export function BoardView({ board }) {
  const { state, dispatch, me, user } = useStore();
  const { tasks, isDone, blockers } = useBoardHelpers(board);
  const [view, setView] = useState('board');
  const [open, setOpen] = useState(null); // task | { new: sectionId }
  const [settings, setSettings] = useState(false);
  const [drag, setDrag] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [toast, setToast] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [q, setQ] = useState('');
  const canEdit = board.ownerId === me.id || board.members.includes(me.id) || me.admin;

  const visible = tasks.filter((t) => (assignee === 'all' || (assignee === 'none' ? !t.assigneeId : t.assigneeId === assignee))
    && (!q || t.title.toLowerCase().includes(q.toLowerCase())));
  const inSection = (sid) => visible.filter((t) => t.status === sid).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const moveTo = (taskId, sectionId, beforeId) => {
    if (!canEdit) return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    const target = board.sections.find((s) => s.id === sectionId);
    if (target.done && blockers(t).length) {
      setToast(`“${t.title}” is blocked by ${blockers(t).map((b) => b.title).join(', ')}.`);
      setTimeout(() => setToast(''), 3500);
      return;
    }
    const ids = tasks.filter((x) => x.status === sectionId && x.id !== taskId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => x.id);
    const at = beforeId ? ids.indexOf(beforeId) : -1;
    ids.splice(at < 0 ? ids.length : at, 0, taskId);
    ids.forEach((id, order) => {
      const cur = tasks.find((x) => x.id === id);
      if (id === taskId) dispatch({ type: 'update', col: 'tasks', id, patch: { status: sectionId, order }, silent: cur.status === sectionId });
      else if (cur.order !== order) dispatch({ type: 'update', col: 'tasks', id, patch: { order }, silent: true });
    });
  };

  const members = state.users.filter((u) => board.members.includes(u.id) || tasks.some((t) => t.assigneeId === u.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={view} onChange={setView} tabs={[{ id: 'board', label: 'Board' }, { id: 'list', label: 'List' }, { id: 'workload', label: 'Workload' }, { id: 'schedule', label: 'Team schedule' }]} />
        <input className="input !w-44" type="search" placeholder="Filter tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tasks" />
        <Select className="!w-44" label="Filter by assignee" value={assignee} onChange={setAssignee} options={[['all', 'Everyone'], ['none', 'Unassigned'], ...members.map((u) => [u.id, u.name])]} />
        <div className="ml-auto flex gap-2">
          {canEdit && <button className="btn btn-primary" onClick={() => setOpen({ new: board.sections[0].id })}>＋ Task</button>}
          {canEdit && <Menu label="Board actions" items={[
            { label: 'Board settings', onClick: () => setSettings(true) },
            { label: 'Delete board', danger: true, hidden: board.ownerId !== me.id && !me.admin, onClick: async () => {
              if (!(await confirmAction(`Delete “${board.name}” and its ${tasks.length} tasks?`))) return;
              tasks.forEach((t) => dispatch({ type: 'remove', col: 'tasks', id: t.id, silent: true }));
              dispatch({ type: 'remove', col: 'boards', id: board.id });
            } },
          ]} />}
        </div>
      </div>
      {toast && <div role="alert" className="glass mb-3 p-3 text-sm text-rose-200"><Glyph value="ban" tile={false} size={16} /> {toast}</div>}

      {view === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4 scroll-thin">
          {board.sections.map((s) => (
            <section key={s.id} aria-label={s.name}
              onDragOver={(e) => { e.preventDefault(); setOverCol(s.id); }} onDragLeave={() => setOverCol(null)}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); if (drag) moveTo(drag, s.id); setDrag(null); }}
              className={`glass flex w-72 shrink-0 flex-col p-3 transition ${overCol === s.id ? 'ring-2 ring-brand-500' : ''}`}>
              <header className="mb-3 flex items-center gap-2 px-1">
                <h3 className="font-semibold">{s.name}</h3>{s.done && <span aria-label="Done section">✓</span>}
                <span className="text-xs text-slate-500">{inSection(s.id).length}</span>
                {canEdit && <button className="ml-auto h-8 w-8 rounded-lg text-slate-400 hover:bg-white/5" aria-label={`Add task to ${s.name}`} onClick={() => setOpen({ new: s.id })}>＋</button>}
              </header>
              <div className="flex min-h-16 flex-col gap-2">
                {inSection(s.id).map((t) => (
                  <div key={t.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOverCol(null); if (drag && drag !== t.id) moveTo(drag, s.id, t.id); setDrag(null); }}>
                    <TaskCard task={t} board={board} canEdit={canEdit} done={s.done} blocked={!s.done && blockers(t).length > 0}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); setDrag(t.id); }} onOpen={() => setOpen(t)} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-400">
              <tr><th className="p-3">Task</th><th className="p-3">Section</th><th className="p-3">Assignee</th><th className="p-3">Due</th><th className="p-3">Priority</th>
                {board.customFields.map((c) => <th key={c.id} className="p-3">{c.name}</th>)}</tr>
            </thead>
            <tbody>
              {[...visible].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)).map((t) => (
                <tr key={t.id} className="cursor-pointer border-t border-white/5 hover:bg-white/5" onClick={() => setOpen(t)}>
                  <td className="p-3 font-medium">{isDone(t) ? '' : blockers(t).length ? '' : ''}{t.title}</td>
                  <td className="p-3">{board.sections.find((s) => s.id === t.status)?.name}</td>
                  <td className="p-3">{user(t.assigneeId)?.name ?? '—'}</td>
                  <td className="p-3">{t.dueAt ? fmtDate(t.dueAt, { day: 'numeric', month: 'short' }) : '—'}</td>
                  <td className={`p-3 ${PRIO_CLS[t.priority] ?? ''}`}>{t.priority === 'none' ? '—' : t.priority}</td>
                  {board.customFields.map((c) => <td key={c.id} className="p-3">{c.type === 'date' && t.custom?.[c.id] ? fmtDate(t.custom[c.id], { day: 'numeric', month: 'short' }) : String(t.custom?.[c.id] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'workload' && <Workload board={board} tasks={visible} members={members} isDone={isDone} onOpen={setOpen} />}
      {view === 'schedule' && <Schedule tasks={visible} members={members} isDone={isDone} onOpen={setOpen} />}

      {open && <TaskModal board={board} task={open.new ? null : open} defaultSection={open.new} canEdit={canEdit} onClose={() => setOpen(null)} />}
      {settings && <BoardForm board={board} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Workload({ tasks, members, isDone, onOpen }) {
  const rows = [...members, { id: null, name: 'Unassigned' }].map((u) => {
    const mine = tasks.filter((t) => (t.assigneeId ?? null) === u.id);
    return { u, open: mine.filter((t) => !isDone(t)), done: mine.filter(isDone).length };
  }).filter((r) => r.u.id || r.open.length);
  const max = Math.max(1, ...rows.map((r) => r.open.length));
  return (
    <div className="space-y-3">
      {rows.map(({ u, open, done }) => (
        <div key={u.id ?? 'none'} className="glass p-4">
          <div className="flex items-center gap-3">
            {u.id ? <Avatar user={u} size={32} /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10">?</span>}
            <div className="w-36 truncate font-semibold">{u.name}</div>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`${open.length} open tasks`}>
              <div className={`h-full rounded-full ${open.length >= 4 ? 'bg-rose-400' : open.length >= 2 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${(open.length / max) * 100}%` }} />
            </div>
            <div className="w-28 text-right text-xs text-slate-400">{open.length} open · {done} done</div>
          </div>
          {!!open.length && (
            <div className="mt-3 flex flex-wrap gap-2">
              {open.map((t) => <button key={t.id} className="chip min-h-8 !bg-white/5 !text-slate-200" onClick={() => onOpen(t)}>{t.title}{t.dueAt ? ` · ${fmtDate(t.dueAt, { day: 'numeric', month: 'short' })}` : ''}</button>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Schedule({ tasks, members, isDone, onOpen }) {
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - 2 * day; });
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => start + i * day), [start]);
  const today = new Date().setHours(0, 0, 0, 0);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button className="btn btn-ghost" onClick={() => setStart(start - 7 * day)} aria-label="Previous week">←</button>
        <button className="btn btn-ghost" onClick={() => setStart(today - 2 * day)}>Today</button>
        <button className="btn btn-ghost" onClick={() => setStart(start + 7 * day)} aria-label="Next week">→</button>
        <span className="text-sm text-slate-400">{fmtDate(days[0], { day: 'numeric', month: 'short' })} – {fmtDate(days.at(-1), { day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="glass overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-xs">
          <thead>
            <tr><th className="w-36 p-2 text-left text-slate-400">Member</th>
              {days.map((d) => <th key={d} className={`p-2 font-medium ${d === today ? 'text-brand-400' : 'text-slate-400'}`}>{fmtDate(d, { weekday: 'short' })}<br />{new Date(d).getDate()}</th>)}</tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="p-2"><div className="flex items-center gap-2"><Avatar user={u} size={22} /><span className="truncate">{u.name}</span></div></td>
                {days.map((d) => (
                  <td key={d} className={`h-14 p-1 align-top ${d === today ? 'bg-brand-500/10' : ''}`}>
                    {tasks.filter((t) => t.assigneeId === u.id && t.dueAt >= d && t.dueAt < d + day).map((t) => (
                      <button key={t.id} onClick={() => onOpen(t)} title={t.title}
                        className={`mb-1 block w-full truncate rounded px-1.5 py-1 text-left ${isDone(t) ? 'bg-emerald-500/20 text-emerald-100 line-through' : 'bg-brand-500/30 text-white'}`}>{t.title}</button>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
