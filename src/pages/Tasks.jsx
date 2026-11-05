import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, fmtDate } from '../lib/store.jsx';
import { Empty, PageHeader, Tabs } from '../components/ui.jsx';
import { BoardCards } from '../components/collab/TaskBoard.jsx';
import { BoardForm, BoardView, canSeeBoard } from '../components/collab/board.jsx';
import { ScopeBadge } from '../components/collab/common.jsx';

export default function Tasks() {
  const { id } = useParams();
  const { state, me } = useStore();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('boards');

  if (id) {
    const board = (state.boards ?? []).find((b) => b.id === id);
    if (!board || !canSeeBoard(state, me, board)) return <div className="glass p-8">Board not found. <Link to="/tasks" className="text-brand-400 underline">Back to boards</Link></div>;
    return (
      <>
        <Link to="/tasks" className="text-sm text-brand-400 hover:underline">← All boards</Link>
        <PageHeader title={board.name} subtitle={<span className="inline-flex items-center gap-2"><ScopeBadge scope={board.scope} groupId={board.groupId} /> {board.members.length} members</span>} />
        <BoardView board={board} />
      </>
    );
  }

  const boards = (state.boards ?? []).filter((b) => canSeeBoard(state, me, b));
  const boardIds = new Set(boards.map((b) => b.id));
  const myTasks = (state.tasks ?? []).filter((t) => t.assigneeId === me.id && boardIds.has(t.boardId))
    .map((t) => ({ t, board: boards.find((b) => b.id === t.boardId) }))
    .filter(({ t, board }) => !board.sections.find((s) => s.id === t.status)?.done)
    .sort((a, b) => (a.t.dueAt ?? Infinity) - (b.t.dueAt ?? Infinity));

  return (
    <>
      <PageHeader title="Tasks & Boards" subtitle="Plan reunions, chapter events and projects together."
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}>＋ New board</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'boards', label: 'Boards', count: boards.length }, { id: 'mine', label: 'My tasks', count: myTasks.length }]} />
      {tab === 'boards' && (boards.length ? <BoardCards boards={boards} /> : <Empty icon="✅" title="No boards yet">Create one to get started.</Empty>)}
      {tab === 'mine' && (
        <div className="space-y-2">
          {!myTasks.length && <Empty icon="🎉" title="Nothing assigned to you">You’re all caught up.</Empty>}
          {myTasks.map(({ t, board }) => {
            const overdue = t.dueAt && t.dueAt < Date.now();
            return (
              <Link key={t.id} to={`/tasks/${board.id}`} className="glass flex flex-wrap items-center gap-3 p-4 hover:bg-white/5">
                <div className="min-w-0 flex-1"><div className="font-semibold">{t.title}</div><div className="text-xs text-slate-400">{board.name} · {board.sections.find((s) => s.id === t.status)?.name}</div></div>
                {t.dueAt && <span className={`text-sm ${overdue ? 'text-rose-300' : 'text-slate-300'}`}><Glyph value="📅" tile={false} size={16} /> {fmtDate(t.dueAt, { day: 'numeric', month: 'short' })}</span>}
              </Link>
            );
          })}
        </div>
      )}
      {creating && <BoardForm onClose={() => setCreating(false)} onCreated={(bid) => nav(`/tasks/${bid}`)} />}
    </>
  );
}
