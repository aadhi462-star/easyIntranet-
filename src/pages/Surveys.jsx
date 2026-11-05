import { Glyph } from '../components/icons.jsx';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, uid, fmtDate, timeAgo } from '../lib/store.jsx';
import { Empty, Field, Modal, PageHeader, Tabs } from '../components/ui.jsx';
import { downloadCsv } from '../components/people/shared.jsx';

const TYPES = [
  ['single', 'Single choice'], ['multi', 'Multiple choice'], ['rating', 'Rating (1–5)'],
  ['nps', 'NPS (0–10)'], ['short', 'Short text'], ['long', 'Long text'],
];
const hasOptions = (t) => t === 'single' || t === 'multi';

export default function Surveys() {
  const { id } = useParams();
  return id ? <SurveyDetail id={id} /> : <SurveyList />;
}

const isOpen = (s) => s.status === 'active' && (!s.deadline || s.deadline > Date.now());

function SurveyList() {
  const { state, me, can } = useStore();
  const [tab, setTab] = useState('active');
  const [creating, setCreating] = useState(null); // null | 'blank' | template
  const [pickTemplate, setPickTemplate] = useState(false);
  const responded = (s) => (state.surveyResponses || []).some((r) => r.surveyId === s.id && r.authorId === me.id);
  const visibleToMe = (s) => s.authorId === me.id || s.audience?.type !== 'group' || state.groups.find((g) => g.id === s.audience.id)?.members.includes(me.id);
  const all = (state.surveys || []).filter((s) => s.status !== 'draft' || s.authorId === me.id).filter(visibleToMe);
  const lists = { active: all.filter(isOpen), closed: all.filter((s) => s.status !== 'draft' && !isOpen(s)), mine: all.filter((s) => s.authorId === me.id) };

  return (
    <div>
      <PageHeader title="Surveys" subtitle="Collect feedback from the alumni community"
        actions={can('survey.create') && <>
          <button className="btn btn-ghost min-h-11" onClick={() => setPickTemplate(true)}><Glyph value="📄" tile={false} size={16} /> From template</button>
          <button className="btn btn-primary min-h-11" onClick={() => setCreating('blank')}>+ New survey</button>
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'active', label: 'Active', count: lists.active.length }, { id: 'closed', label: 'Closed', count: lists.closed.length }, { id: 'mine', label: 'My surveys', count: lists.mine.length }]} />
      {!lists[tab].length ? <Empty icon="📋" title="No surveys here" /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lists[tab].map((s) => {
            const n = (state.surveyResponses || []).filter((r) => r.surveyId === s.id).length;
            return (
              <Link key={s.id} to={`/surveys/${s.id}`} className="glass block p-5 transition hover:-translate-y-0.5">
                <div className="flex flex-wrap gap-1.5">
                  <span className={`chip ${isOpen(s) ? '!bg-emerald-500/15 !text-emerald-200' : s.status === 'draft' ? '' : '!bg-white/10 !text-slate-300'}`}>{s.status === 'draft' ? 'Draft' : isOpen(s) ? 'Active' : 'Closed'}</span>
                  {s.anonymous && <span className="chip"><Glyph value="🕶️" tile={false} size={16} /> Anonymous</span>}
                  {s.audience?.type === 'group' && <span className="chip"><Glyph value="👥" tile={false} size={16} /> {state.groups.find((g) => g.id === s.audience.id)?.name}</span>}
                  {responded(s) && <span className="chip">✓ Responded</span>}
                </div>
                <h2 className="mt-3 font-bold">{s.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.description}</p>
                <p className="mt-3 text-xs text-slate-500">{s.questions.length} questions · {n} responses{s.deadline && ` · ${isOpen(s) ? 'closes' : 'closed'} ${fmtDate(s.deadline, { day: 'numeric', month: 'short' })}`}</p>
              </Link>
            );
          })}
        </div>
      )}
      {pickTemplate && (
        <Modal title="Start from a template" onClose={() => setPickTemplate(false)}>
          <ul className="space-y-2">
            {(state.surveyTemplates || []).map((t) => (
              <li key={t.id}><button className="w-full rounded-xl border border-white/10 p-4 text-left hover:bg-white/5" onClick={() => { setPickTemplate(false); setCreating(t); }}>
                <div className="font-semibold">{t.title}</div><div className="text-sm text-slate-400">{t.description}</div><div className="mt-1 text-xs text-slate-500">{t.questions.length} questions</div>
              </button></li>
            ))}
          </ul>
        </Modal>
      )}
      {creating && <SurveyBuilder template={creating === 'blank' ? null : creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

function SurveyBuilder({ template, onClose }) {
  const { state, me, dispatch } = useStore();
  const nav = useNavigate();
  const [d, setD] = useState(() => ({
    title: template?.title ?? '', description: template?.description ?? '', anonymous: false, audience: 'network',
    deadline: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10),
    questions: structuredClone(template?.questions ?? [{ id: uid('q'), type: 'single', text: '', options: ['', ''] }]),
  }));
  const [error, setError] = useState('');
  const setQ = (i, patch) => setD({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i, dir) => { const qs = [...d.questions]; const j = i + dir; if (j < 0 || j >= qs.length) return; [qs[i], qs[j]] = [qs[j], qs[i]]; setD({ ...d, questions: qs }); };
  const myGroups = state.groups.filter((g) => g.members.includes(me.id));

  const save = (status) => {
    const questions = d.questions.map((q) => ({ ...q, text: q.text.trim(), options: hasOptions(q.type) ? (q.options || []).map((o) => o.trim()).filter(Boolean) : undefined }));
    if (!d.title.trim()) return setError('Give the survey a title.');
    if (!questions.length || questions.some((q) => !q.text)) return setError('Every question needs text.');
    if (questions.some((q) => hasOptions(q.type) && q.options.length < 2)) return setError('Choice questions need at least two options.');
    const id = uid('s');
    const audience = d.audience === 'network' ? { type: 'network' } : { type: 'group', id: d.audience };
    dispatch({ type: 'add', col: 'surveys', item: { id, title: d.title.trim(), description: d.description.trim(), anonymous: d.anonymous, audience, status,
      deadline: d.deadline ? new Date(`${d.deadline}T23:59`).getTime() : null, questions } });
    if (status === 'active') {
      const targets = audience.type === 'group' ? state.groups.find((g) => g.id === audience.id)?.members ?? [] : state.users.map((u) => u.id);
      targets.filter((u) => u !== me.id).forEach((userId) => dispatch({ type: 'notify', silent: true, notification: { userId, kind: 'survey', text: `${me.name} wants your feedback: ${d.title.trim()}`, link: `/surveys/${id}` } }));
    }
    onClose();
    nav(`/surveys/${id}`);
  };

  return (
    <Modal title={template ? `New survey · ${template.title}` : 'New survey'} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Audience"><select className="input" value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })}><option value="network">Whole network</option>{myGroups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}</select></Field>
          <Field label="Deadline"><input className="input" type="date" value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} /></Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm"><input type="checkbox" checked={d.anonymous} onChange={(e) => setD({ ...d, anonymous: e.target.checked })} /> Anonymous responses</label>
        </div>

        <ol className="space-y-3">
          {d.questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap gap-2">
                <span className="grid h-11 w-8 place-items-center text-sm font-bold text-slate-500">{i + 1}</span>
                <input className="input min-w-0 flex-1" aria-label={`Question ${i + 1}`} placeholder="Question" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                <select className="input !w-auto" aria-label="Question type" value={q.type} onChange={(e) => setQ(i, { type: e.target.value, options: hasOptions(e.target.value) ? (q.options?.length ? q.options : ['', '']) : undefined })}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button type="button" className="btn btn-ghost h-11 w-11 !p-0" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn btn-ghost h-11 w-11 !p-0" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn btn-ghost h-11 w-11 !p-0" aria-label="Delete question" onClick={() => setD({ ...d, questions: d.questions.filter((_, j) => j !== i) })}>✕</button>
              </div>
              {hasOptions(q.type) && (
                <div className="mt-2 space-y-2 pl-10">
                  {q.options.map((o, k) => (
                    <div key={k} className="flex gap-2">
                      <input className="input" aria-label={`Option ${k + 1}`} placeholder={`Option ${k + 1}`} value={o} onChange={(e) => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                      <button type="button" className="btn btn-ghost h-11 w-11 shrink-0 !p-0" aria-label="Remove option" onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })}>✕</button>
                    </div>
                  ))}
                  <button type="button" className="text-sm text-brand-400 hover:underline" onClick={() => setQ(i, { options: [...q.options, ''] })}>+ Add option</button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost min-h-11" onClick={() => setD({ ...d, questions: [...d.questions, { id: uid('q'), type: 'single', text: '', options: ['', ''] }] })}>+ Add question</button>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/5 pt-4">
          <button className="btn btn-ghost min-h-11" onClick={() => save('draft')}>Save draft</button>
          <button className="btn btn-primary min-h-11" onClick={() => save('active')}>Publish</button>
        </div>
      </div>
    </Modal>
  );
}

function SurveyDetail({ id }) {
  const { state, me, user, dispatch } = useStore();
  const s = (state.surveys || []).find((x) => x.id === id);
  const responses = (state.surveyResponses || []).filter((r) => r.surveyId === id);
  const mine = responses.find((r) => r.authorId === me.id);
  const isOwner = s && (s.authorId === me.id || me.admin);
  const [view, setView] = useState(null);
  if (!s) return <Empty icon="📋" title="Survey not found"><Link className="text-brand-400 underline" to="/surveys">Back to surveys</Link></Empty>;

  const open = isOpen(s);
  const tab = view ?? (open && !mine && s.status !== 'draft' ? 'respond' : 'results');
  const canRespond = open && !mine;

  const exportCsv = () => {
    const header = ['Submitted', ...(s.anonymous ? [] : ['Respondent']), ...s.questions.map((q) => q.text)];
    const rows = responses.map((r) => [new Date(r.createdAt).toISOString(), ...(s.anonymous ? [] : [user(r.authorId)?.name ?? '']),
      ...s.questions.map((q) => (Array.isArray(r.answers[q.id]) ? r.answers[q.id].join('; ') : r.answers[q.id] ?? ''))]);
    downloadCsv(`${s.title.replace(/\W+/g, '-').toLowerCase()}-results.csv`, [header, ...rows]);
  };

  return (
    <div>
      <Link to="/surveys" className="text-sm text-slate-400 hover:text-white">← Surveys</Link>
      <PageHeader title={s.title} subtitle={`${s.description ? `${s.description} · ` : ''}by ${user(s.authorId)?.name ?? 'Unknown'} · ${responses.length} responses`}
        actions={isOwner && <>
          {s.status === 'draft' && <button className="btn btn-primary min-h-11" onClick={() => dispatch({ type: 'update', col: 'surveys', id, patch: { status: 'active' } })}>Publish</button>}
          {open && <button className="btn btn-ghost min-h-11" onClick={() => { if (confirm('Close this survey to new responses?')) dispatch({ type: 'update', col: 'surveys', id, patch: { status: 'closed' } }); }}>Close survey</button>}
          {!open && s.status === 'closed' && <button className="btn btn-ghost min-h-11" onClick={() => dispatch({ type: 'update', col: 'surveys', id, patch: { status: 'active', deadline: Date.now() + 7 * 86400e3 } })}>Reopen</button>}
          <button className="btn btn-ghost min-h-11" onClick={exportCsv} disabled={!responses.length}>⬇ Export CSV</button>
          <button className="btn min-h-11 bg-rose-500/20 text-rose-200" onClick={() => { if (confirm('Delete this survey and its responses?')) { dispatch({ type: 'remove', col: 'surveys', id }); history.back(); } }}>Delete</button>
        </>} />
      <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
        <span className="chip">{s.status === 'draft' ? 'Draft' : open ? 'Active' : 'Closed'}</span>
        {s.anonymous && <span className="chip"><Glyph value="🕶️" tile={false} size={16} /> Anonymous</span>}
        {s.deadline && <span className="chip"><Glyph value="⏰" tile={false} size={16} /> {open ? 'Closes' : 'Closed'} {fmtDate(s.deadline)}</span>}
        {mine && <span className="chip">✓ You responded {timeAgo(mine.createdAt)}</span>}
      </div>
      <Tabs value={tab} onChange={setView} tabs={[...(canRespond ? [{ id: 'respond', label: 'Respond' }] : []), { id: 'results', label: 'Results', count: responses.length }]} />
      {tab === 'respond' && canRespond ? <Respond survey={s} onDone={() => setView('results')} /> : <Results survey={s} responses={responses} />}
    </div>
  );
}

function Respond({ survey, onDone }) {
  const { me, dispatch } = useStore();
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const set = (qid, v) => setAnswers({ ...answers, [qid]: v });
  const submit = (e) => {
    e.preventDefault();
    const missing = survey.questions.filter((q) => q.type !== 'short' && q.type !== 'long' && (answers[q.id] == null || (Array.isArray(answers[q.id]) && !answers[q.id].length)));
    if (missing.length) return setError(`Please answer: ${missing.map((q) => q.text).join(', ')}`);
    // Anonymous responses still record who answered (to enforce one response each), but results hide it.
    dispatch({ type: 'add', col: 'surveyResponses', item: { surveyId: survey.id, authorId: me.id, anonymous: survey.anonymous, answers } });
    onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {survey.anonymous && <p className="glass p-3 text-sm text-slate-300"><Glyph value="🕶️" tile={false} size={16} /> This survey is anonymous. Your name won’t appear with your answers.</p>}
      {survey.questions.map((q, i) => (
        <fieldset key={q.id} className="glass p-5">
          <legend className="sr-only">{q.text}</legend>
          <p className="font-semibold"><span className="text-slate-500">{i + 1}.</span> {q.text}</p>
          <div className="mt-3">
            {q.type === 'single' && q.options.map((o) => (
              <label key={o} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-white/5"><input type="radio" name={q.id} checked={answers[q.id] === o} onChange={() => set(q.id, o)} /> {o}</label>
            ))}
            {q.type === 'multi' && q.options.map((o) => {
              const cur = answers[q.id] || [];
              return <label key={o} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-white/5"><input type="checkbox" checked={cur.includes(o)} onChange={() => set(q.id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])} /> {o}</label>;
            })}
            {(q.type === 'rating' || q.type === 'nps') && (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.text}>
                {(q.type === 'rating' ? [1, 2, 3, 4, 5] : [...Array(11).keys()]).map((n) => (
                  <button type="button" key={n} role="radio" aria-checked={answers[q.id] === n} onClick={() => set(q.id, n)}
                    className={`h-11 min-w-11 rounded-xl border text-sm font-semibold ${answers[q.id] === n ? 'border-brand-500 bg-brand-500 text-white' : 'border-white/10 hover:bg-white/5'}`}>
                    {q.type === 'rating' ? '★'.repeat(n) : n}
                  </button>
                ))}
                {q.type === 'nps' && <div className="mt-1 flex w-full justify-between text-xs text-slate-500"><span>Not likely</span><span>Very likely</span></div>}
              </div>
            )}
            {q.type === 'short' && <input className="input" value={answers[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} aria-label={q.text} />}
            {q.type === 'long' && <textarea className="input min-h-24" value={answers[q.id] || ''} onChange={(e) => set(q.id, e.target.value)} aria-label={q.text} />}
          </div>
        </fieldset>
      ))}
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <button className="btn btn-primary min-h-11 w-full sm:w-auto">Submit response</button>
    </form>
  );
}

function Bar({ label, n, total }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="text-slate-400">{n} · {pct}%</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Results({ survey, responses }) {
  const { user } = useStore();
  if (!responses.length) return <Empty icon="📊" title="No responses yet">Results appear here as people respond.</Empty>;
  return (
    <div className="space-y-4">
      {survey.questions.map((q, i) => {
        const vals = responses.map((r) => r.answers[q.id]).filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
        return (
          <section key={q.id} className="glass p-5">
            <h2 className="font-semibold"><span className="text-slate-500">{i + 1}.</span> {q.text}</h2>
            <p className="text-xs text-slate-500">{vals.length} answers</p>
            <div className="mt-4 space-y-3">
              {hasOptions(q.type) && q.options.map((o) => <Bar key={o} label={o} n={vals.filter((v) => (Array.isArray(v) ? v.includes(o) : v === o)).length} total={vals.length} />)}
              {q.type === 'rating' && <>
                <p className="text-2xl font-extrabold">{(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)} <span className="text-base font-normal text-amber-300">★ average</span></p>
                {[5, 4, 3, 2, 1].map((n) => <Bar key={n} label={`${n} ★`} n={vals.filter((v) => v === n).length} total={vals.length} />)}
              </>}
              {q.type === 'nps' && <Nps vals={vals} />}
              {(q.type === 'short' || q.type === 'long') && (
                <ul className="space-y-2">{responses.filter((r) => r.answers[q.id]).map((r) => (
                  <li key={r.id} className="rounded-xl bg-white/5 p-3 text-sm"><p>{r.answers[q.id]}</p>
                    <p className="mt-1 text-xs text-slate-500">{survey.anonymous || r.anonymous ? 'Anonymous' : user(r.authorId)?.name} · {timeAgo(r.createdAt)}</p></li>
                ))}</ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Nps({ vals }) {
  const promoters = vals.filter((v) => v >= 9).length;
  const detractors = vals.filter((v) => v <= 6).length;
  const passives = vals.length - promoters - detractors;
  const score = Math.round(((promoters - detractors) / vals.length) * 100);
  return (
    <>
      <p className="text-3xl font-extrabold">{score > 0 ? '+' : ''}{score} <span className="text-base font-normal text-slate-400">NPS</span></p>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-emerald-500" style={{ width: `${(promoters / vals.length) * 100}%` }} />
        <div className="bg-slate-500" style={{ width: `${(passives / vals.length) * 100}%` }} />
        <div className="bg-rose-500" style={{ width: `${(detractors / vals.length) * 100}%` }} />
      </div>
      <Bar label="Promoters (9–10)" n={promoters} total={vals.length} />
      <Bar label="Passives (7–8)" n={passives} total={vals.length} />
      <Bar label="Detractors (0–6)" n={detractors} total={vals.length} />
    </>
  );
}
