import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, uid, timeAgo } from '../lib/store.jsx';
import { summarize } from '../lib/assist.js';
import { Avatar, Empty, Field, Modal, PageHeader, Tabs, UserLink } from '../components/ui.jsx';
import TownHallList, { STATUS_STYLES, displayStatus } from '../components/events/TownHallList.jsx';
import PeoplePicker from '../components/events/PeoplePicker.jsx';
import { canSeeTownhall, fromInput, toInput } from '../components/events/eventUtils.js';
import { confirmAction } from '../components/ui/Confirm.jsx';

export default function TownHalls() {
  const { id } = useParams();
  return id ? <Session id={id} /> : <Home />;
}

function Home() {
  const { state, me, can } = useStore();
  const [tab, setTab] = useState('upcoming');
  const [creating, setCreating] = useState(false);
  const count = (s) => (state.townhalls || []).filter((t) => canSeeTownhall(t, me, state.groups) && displayStatus(t).key === s).length;
  return (
    <div>
      <PageHeader title="Town Halls" subtitle="Live Q&A sessions. Ask questions, upvote the ones you care about, and catch the highlights."
        actions={can('townhall.host') && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New session</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'live', label: '● Live', count: count('live') }, { id: 'upcoming', label: 'Upcoming', count: count('upcoming') }, { id: 'ended', label: 'Ended', count: count('ended') }]} />
      <TownHallList status={tab} />
      {creating && <CreateSession onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateSession({ onClose }) {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));
  const def = (() => { const d = new Date(Date.now() + 2 * 864e5); d.setHours(17, 0, 0, 0); return d.getTime(); })();
  const [f, setF] = useState({ title: '', description: '', start: toInput(def), duration: 60, moderators: [], allowAnonymous: true, moderateQuestions: true, groupId: '' });
  const [error, setError] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const start = fromInput(f.start);
    if (!f.title.trim()) return setError('Give the session a title.');
    if (Number.isNaN(start)) return setError('Choose when it starts.');
    const id = uid('th');
    dispatch({ type: 'add', col: 'townhalls', item: { id, title: f.title.trim(), description: f.description.trim(), hostId: me.id,
      moderators: [...new Set([me.id, ...f.moderators])], groupId: f.groupId || null, start, end: start + f.duration * 60e3,
      status: 'upcoming', allowAnonymous: f.allowAnonymous, moderateQuestions: f.moderateQuestions } });
    for (const userId of f.moderators) {
      dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `${me.name} made you a moderator of the town hall “${f.title.trim()}”`, link: `/townhalls/${id}` } });
    }
    onClose();
    nav(`/townhalls/${id}`);
  };

  return (
    <Modal title="New town hall session" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. AMA with the Dean of Students" /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><Field label="Starts"><input className="input" type="datetime-local" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field></div>
          <Field label="Duration">
            <select className="input" value={f.duration} onChange={(e) => set('duration', Number(e.target.value))}>
              {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </Field>
        </div>
        <Field label="Audience">
          <select className="input" value={f.groupId} onChange={(e) => set('groupId', e.target.value)}>
            <option value="">Whole network</option>
            {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Moderators" hint="You are a moderator automatically."><PeoplePicker value={f.moderators} onChange={(v) => set('moderators', v)} exclude={[me.id]} label="moderators" /></Field>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.allowAnonymous} onChange={(e) => set('allowAnonymous', e.target.checked)} /> Allow anonymous questions</label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={f.moderateQuestions} onChange={(e) => set('moderateQuestions', e.target.checked)} /> Moderators approve questions before they’re visible</label>
        {error && <p role="alert" className="text-sm text-[var(--az-danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary">Create session</button></div>
      </form>
    </Modal>
  );
}

function Session({ id }) {
  const { state, me, dispatch } = useStore();
  const th = (state.townhalls || []).find((t) => t.id === id);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [sort, setSort] = useState('votes');
  const [tab, setTab] = useState('open');
  const [answering, setAnswering] = useState(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  if (!th || !canSeeTownhall(th, me, state.groups)) return <Empty icon="mic" title="Session not found">It may have been removed, or it’s only open to a group you’re not in. <Link to="/townhalls" className="text-brand-400 underline">Back to town halls</Link></Empty>;

  const st = displayStatus(th);
  const ended = st.key === 'ended';

  const isMod = th.moderators.includes(me.id) || th.hostId === me.id || me.admin;
  const all = (state.townhallQuestions || []).filter((q) => q.townhallId === id);
  const byTab = {
    open: all.filter((q) => q.status === 'approved' || (q.status === 'pending' && q.authorId === me.id)),
    answered: all.filter((q) => q.status === 'answered'),
    pending: all.filter((q) => q.status === 'pending'),
    hidden: all.filter((q) => q.status === 'hidden'),
  };
  const list = [...byTab[tab]].sort((a, b) => (sort === 'votes' ? b.votes.length - a.votes.length || b.createdAt - a.createdAt : b.createdAt - a.createdAt));
  const setQ = (qid, patch) => dispatch({ type: 'update', col: 'townhallQuestions', id: qid, patch });
  const setTh = (patch) => dispatch({ type: 'update', col: 'townhalls', id, patch });

  const ask = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    dispatch({ type: 'add', col: 'townhallQuestions', item: { townhallId: id, text: text.trim(), anonymous: th.allowAnonymous && anon, votes: [],
      status: th.moderateQuestions && !isMod ? 'pending' : 'approved' } });
    setText(''); setAnon(false);
  };

  const goLive = () => {
    const now = Date.now();
    // Starting late (even past the planned end) keeps the planned length from now.
    setTh({ status: 'live', start: Math.min(th.start, now), end: Math.max(th.end ?? now, now + Math.max(0, (th.end ?? th.start) - th.start)) });
    const audience = th.groupId ? state.groups.find((g) => g.id === th.groupId)?.members ?? [] : state.users.map((u) => u.id);
    for (const userId of audience) {
      if (userId !== me.id) dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'event', text: `Town hall “${th.title}” is live now`, link: `/townhalls/${id}` } });
    }
  };

  const highlights = async () => {
    setBusy(true);
    const qa = byTab.answered.map((q) => `${q.text} ${q.answer}`).join('\n');
    const res = await summarize(`${th.title}. ${th.description}\n${qa}`);
    setTh({ highlights: { ...res, at: Date.now(), count: byTab.answered.length } });
    setBusy(false);
  };

  const tabs = [{ id: 'open', label: 'Questions', count: byTab.open.length }, { id: 'answered', label: 'Answered', count: byTab.answered.length }];
  if (isMod) tabs.push({ id: 'pending', label: 'Pending', count: byTab.pending.length }, { id: 'hidden', label: 'Hidden', count: byTab.hidden.length });

  return (
    <div className="space-y-5">
      <Link to="/townhalls" className="text-sm text-[var(--az-text-2)] hover:text-[var(--az-text)]">← All town halls</Link>
      <section className="glass p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`chip ${STATUS_STYLES[st.key]}`}>{st.label}</span>
          {isMod && <span className="chip !bg-[var(--az-ok-soft)] !text-[var(--az-ok)]">You’re a moderator</span>}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl"><Glyph value="mic" tile={false} size={16} /> {th.title}</h1>
        <p className="mt-2 text-[var(--az-text-2)]">{th.description}</p>
        <p className="mt-3 text-sm text-[var(--az-text-2)]">
          {new Date(th.start).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          {' · Hosted by '}<UserLink id={th.hostId} />{th.moderators.length > 1 && <> · Moderators: {th.moderators.filter((m) => m !== th.hostId).map((m, i) => <span key={m}>{i > 0 && ', '}<UserLink id={m} /></span>)}</>}
        </p>
        {isMod && th.status !== 'ended' && (
          <div className="mt-5 flex flex-wrap gap-2">
            {th.status === 'upcoming' && <button className="btn btn-primary" onClick={goLive}>● Go live</button>}
            {th.status === 'live' && <button className="btn btn-ghost !text-[var(--az-danger)]" onClick={async () => { if (await confirmAction('End this session? New questions will be closed.')) setTh({ status: 'ended', end: Date.now() }); }}>■ End session</button>}
          </div>
        )}
      </section>

      {ended && (
        <section className="glass p-5" aria-label="Highlights">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold"><Glyph value="sparkle" tile={false} size={16} /> Highlights</h2>
            {th.status === 'ended' && byTab.answered.length > 0 && <button className="btn btn-ghost" disabled={busy} onClick={highlights}>{busy ? 'Summarising…' : th.highlights ? 'Regenerate' : 'Generate highlights'}</button>}
          </div>
          {th.highlights ? (
            <>
              <p className="mt-3 leading-relaxed text-[var(--az-text)]">{th.highlights.text}</p>
              <p className="mt-2 text-xs text-[var(--az-text-3)]">From {th.highlights.count} answered questions · {th.highlights.source}</p>
            </>
          ) : <p className="mt-2 text-sm text-[var(--az-text-2)]">{byTab.answered.length ? 'Summarise the key takeaways and decisions from the answered questions.' : 'No answered questions to summarise.'}</p>}
        </section>
      )}

      {!ended ? (
        <form onSubmit={ask} className="glass p-5">
          <label htmlFor="ask" className="font-bold">Ask a question</label>
          <textarea id="ask" className="input mt-3 min-h-20" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="What would you like to ask?" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {th.allowAnonymous ? <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Ask anonymously</label> : <span />}
            <div className="flex items-center gap-3">
              {th.moderateQuestions && !isMod && <span className="text-xs text-[var(--az-text-3)]">Moderators review questions first.</span>}
              <button className="btn btn-primary" disabled={!text.trim()}>Submit</button>
            </div>
          </div>
        </form>
      ) : <p className="text-sm text-[var(--az-text-3)]">This session has ended. Questions are closed.</p>}

      <section aria-label="Questions">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={tab} onChange={setTab} tabs={tabs} />
          <select className="input mb-5 !w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort questions">
            <option value="votes">Most votes</option><option value="recent">Most recent</option>
          </select>
        </div>
        <ul className="space-y-3">
          {list.map((q) => {
            const voted = q.votes.includes(me.id);
            const author = q.anonymous ? null : state.users.find((u) => u.id === q.authorId);
            return (
              <li key={q.id} className="glass flex gap-4 p-4">
                <button onClick={() => setQ(q.id, (x, m) => ({ ...x, votes: x.votes.includes(m) ? x.votes.filter((v) => v !== m) : [...x.votes, m] }))}
                  aria-pressed={voted} aria-label={`Upvote, ${q.votes.length} votes`} disabled={ended}
                  className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold ${voted ? 'bg-brand-500 text-[var(--az-text)]' : 'bg-[var(--az-sunken)] text-[var(--az-text-2)] hover:bg-[var(--az-sunken)]'}`}>
                  ▲<span>{q.votes.length}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[var(--az-text)]">{q.text}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-[var(--az-text-2)]">
                    {author ? <><Avatar user={author} size={18} />{author.name}</> : <><Glyph value="eyeoff" tile={false} size={16} /> Anonymous</>} · {timeAgo(q.createdAt)}
                    {q.status === 'pending' && <span className="chip !bg-[var(--az-warn-soft)] !text-[var(--az-warning)]">Awaiting approval</span>}
                  </p>
                  {q.status === 'answered' && (
                    <div className="mt-3 rounded-xl border-l-2 border-[var(--az-ok)] bg-[var(--az-ok-soft)] px-3 py-2 text-sm">
                      <div className="text-xs font-semibold text-[var(--az-ok)]">Answered by {state.users.find((u) => u.id === q.answeredBy)?.name ?? 'moderator'}</div>
                      <p className="mt-0.5 text-[var(--az-text)]">{q.answer}</p>
                    </div>
                  )}
                  {answering === q.id && (
                    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (!answer.trim()) return; setQ(q.id, (x, m) => ({ ...x, status: 'answered', answer: answer.trim(), answeredBy: m }));
                      if (q.authorId !== me.id) dispatch({ type: 'notify', silent: true, notification: { userId: q.authorId, kind: 'event', text: `Your question in “${th.title}” was answered`, link: `/townhalls/${id}` } });
                      setAnswering(null); setAnswer(''); }}>
                      <textarea className="input min-h-16" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type the answer…" aria-label="Answer" autoFocus />
                      <div className="flex gap-2"><button className="btn btn-primary">Mark answered</button><button type="button" className="btn btn-ghost" onClick={() => setAnswering(null)}>Cancel</button></div>
                    </form>
                  )}
                  {isMod && answering !== q.id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {q.status === 'pending' && <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setQ(q.id, { status: 'approved' })}>✓ Approve</button>}
                      {q.status !== 'hidden' && <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setQ(q.id, { status: 'hidden', prevStatus: q.status })}><Glyph value="eyeoff" tile={false} size={16} /> Hide</button>}
                      {q.status === 'hidden' && <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setQ(q.id, { status: q.prevStatus ?? 'approved', prevStatus: null })}>Restore</button>}
                      {q.status !== 'answered' && q.status !== 'hidden' && <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => { setAnswering(q.id); setAnswer(''); }}><Glyph value="channels" tile={false} size={16} /> Answer</button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li><Empty icon="questions" title="No questions here yet">{tab === 'open' && !ended ? 'Be the first to ask.' : ''}</Empty></li>}
        </ul>
      </section>
    </div>
  );
}
