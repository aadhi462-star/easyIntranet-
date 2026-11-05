import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';
import { AvatarStack, Empty } from '../ui.jsx';
import { ScopeBadge } from './common.jsx';
import { BoardForm, BoardView, canSeeBoard } from './board.jsx';

function BoardCard({ board }) {
  const { state } = useStore();
  const tasks = (state.tasks ?? []).filter((t) => t.boardId === board.id);
  const doneIds = board.sections.filter((s) => s.done).map((s) => s.id);
  const done = tasks.filter((t) => doneIds.includes(t.status)).length;
  return (
    <>
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{board.name}</h3><ScopeBadge scope={board.scope} groupId={board.groupId} /></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{done}/{tasks.length} tasks done</span><AvatarStack ids={board.members} size={22} /></div>
    </>
  );
}

/** Board cards: links to /tasks/:id, or opens in place when `onOpen` is given. */
export function BoardCards({ boards, onOpen }) {
  const cls = 'glass block p-5 text-left transition hover:-translate-y-0.5';
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((b) => (onOpen
        ? <button key={b.id} className={cls} onClick={() => onOpen(b.id)}><BoardCard board={b} /></button>
        : <Link key={b.id} to={`/tasks/${b.id}`} className={cls}><BoardCard board={b} /></Link>))}
    </div>
  );
}

/** Boards for a group (or all visible boards). Selecting one opens it inline. */
export default function TaskBoard({ groupId }) {
  const { state, me } = useStore();
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const boards = (state.boards ?? []).filter((b) => (groupId ? b.groupId === groupId : canSeeBoard(state, me, b)));
  const open = boards.find((b) => b.id === openId);

  if (open) {
    return (
      <div>
        <button className="mb-3 text-sm text-brand-400 hover:underline" onClick={() => setOpenId(null)}>← Boards</button>
        <h2 className="mb-3 text-xl font-bold">{open.name}</h2>
        <BoardView board={open} />
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4 flex justify-end"><button className="btn btn-primary" onClick={() => setCreating(true)}>＋ New board</button></div>
      {boards.length ? <BoardCards boards={boards} onOpen={setOpenId} /> : <Empty icon="✅" title="No boards yet">Create a board to plan work together.</Empty>}
      {creating && <BoardForm groupId={groupId} onClose={() => setCreating(false)} onCreated={setOpenId} />}
    </div>
  );
}
