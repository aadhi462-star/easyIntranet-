// A quiz lesson (board S5Quiz, decision D7): the summary with Start or Try again, the attempt
// with question navigation, and the result. Answers are saved as you go, so a reload or another
// device carries on where you were (ASM-02); the server checks the deadline and the attempt
// limit (ASM-03, ASM-14), so this screen only reports what it says.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/communities.js';
import { lessonPath } from '../../lib/learning.js';
import { toast } from '../../lib/toast.js';
import { Icon } from '../icons.jsx';
import { Pill, Progress } from './bits.jsx';

export const whenText = (at) => new Date(at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const scoreText = (s) => `${s.score} of ${s.total}`;

export default function Quiz({ lesson, quiz, nextId, onChanged }) {
  const [attempt, setAttempt] = useState(null); // the open attempt
  const [result, setResult] = useState(null); // after submitting, or a past attempt to review
  const [busy, setBusy] = useState(false);
  const mine = quiz.mine;

  const start = async () => {
    setBusy(true);
    try { setAttempt((await api(`/lessons/${lesson.id}/attempts`, { method: 'POST' })).attempt); setResult(null); } catch (err) {
      toast(errorText(err), 'error'); onChanged();
    } finally { setBusy(false); }
  };
  const review = async (id) => { try { setResult(await api(`/attempts/${id}`)); } catch (err) { toast(errorText(err), 'error'); } };

  if (attempt) return <Attempt quiz={quiz} attempt={attempt} onExit={() => { setAttempt(null); onChanged(); }} onDone={(r) => { setAttempt(null); setResult(r); onChanged(); }} />;
  if (result) return <Result result={result} nextId={nextId} quiz={quiz} busy={busy} onAgain={start} onBack={() => setResult(null)} />;

  const canStart = !quiz.closed && (mine.openAttemptId || mine.attemptsLeft > 0) && quiz.questionCount > 0;
  return (
    <section aria-labelledby="quiz-h" className="raised flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="quiz-h" className="t-h2 text-white">Quiz</h2>
        {mine.passed && <Pill tone="done"><Icon name="check" size={14} className="mr-1" />Passed</Pill>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-3">Questions</dt><dd className="text-slate-200">{quiz.questionCount}</dd>
        <dt className="text-3">Pass mark</dt><dd className="text-slate-200">{quiz.passPercent}%</dd>
        <dt className="text-3">Attempts</dt><dd className="text-slate-200">{mine.attemptsUsed} of {quiz.maxAttempts} used · your best score counts</dd>
        {quiz.dueAt && <><dt className="text-3">Due</dt><dd className="text-slate-200">{whenText(quiz.dueAt)}</dd></>}
        {mine.best && <><dt className="text-3">Best score</dt><dd className="text-slate-200">{scoreText(mine.best)}</dd></>}
      </dl>
      {quiz.closed ? <p className="text-sm text-amber-200">This quiz closed on {whenText(quiz.dueAt)}.</p>
        : !mine.openAttemptId && mine.attemptsLeft === 0 ? <p className="text-2 text-sm">You’ve used all your attempts. Your best score stands.</p>
          : quiz.questionCount === 0 ? <p className="text-2 text-sm">This quiz has no questions yet.</p> : null}
      <div className="flex flex-wrap gap-2">
        {canStart && <button className="btn btn-primary" disabled={busy} onClick={start}>{busy ? 'Opening…' : mine.openAttemptId ? 'Carry on with your attempt' : mine.attemptsUsed ? 'Try again' : 'Start quiz'}</button>}
        {mine.passed && nextId && <Link to={lessonPath(nextId)} className="btn btn-ghost">Continue course</Link>}
      </div>
      {mine.attempts.length > 0 && (
        <ul className="list-rows border-t border-[var(--az-divider)] text-sm">
          {mine.attempts.map((a) => (
            <li key={a.id} className="flex min-h-11 items-center gap-3">
              <span className="flex-1 text-slate-200">Attempt {a.number} · {scoreText(a)}</span>
              <Pill tone={a.passed ? 'done' : 'plain'}>{a.passed ? 'Passed' : 'Not passed'}</Pill>
              <button className="btn btn-ghost min-h-10" onClick={() => review(a.id)}>Review</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Attempt({ quiz, attempt, onExit, onDone }) {
  const [answers, setAnswers] = useState(attempt.answers ?? {});
  const [i, setI] = useState(() => Math.max(0, attempt.questions.findIndex((q) => !(q.id in (attempt.answers ?? {})))));
  const [saving, setSaving] = useState('');
  const [busy, setBusy] = useState(false);
  const headRef = useRef(null);
  const q = attempt.questions[i];
  const total = attempt.questions.length;
  const answered = attempt.questions.filter((x) => x.id in answers).length;
  useEffect(() => { headRef.current?.focus(); }, [i]);

  // Saved as you go: each choice is sent at once; a failure says so and keeps the choice on screen.
  const choose = async (choice) => {
    setAnswers((a) => ({ ...a, [q.id]: choice }));
    setSaving('Saving…');
    try { await api(`/attempts/${attempt.id}`, { method: 'PATCH', body: { answers: { [q.id]: choice } } }); setSaving('Saved'); } catch (err) {
      setSaving(''); toast(errorText(err), 'error');
    }
  };
  const submit = async () => {
    if (answered < total && !confirm(`${total - answered} ${total - answered === 1 ? 'question isn’t' : 'questions aren’t'} answered. Submit anyway?`)) return;
    setBusy(true);
    try { onDone(await api(`/attempts/${attempt.id}/submit`, { method: 'POST', body: { answers } })); } catch (err) { toast(errorText(err), 'error'); setBusy(false); }
  };

  return (
    <section aria-label="Quiz attempt" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="t-small flex-1">Attempt {attempt.number} of {quiz.maxAttempts} · Your best score counts{quiz.dueAt ? ` · Due ${whenText(quiz.dueAt)}` : ''}</span>
        <span className="t-small" aria-live="polite">{saving}</span>
        <button className="btn btn-ghost" onClick={onExit}>Exit quiz</button>
      </div>
      <nav aria-label="Questions" className="flex flex-wrap gap-2">
        {attempt.questions.map((x, n) => {
          const done = x.id in answers;
          return (
            <button key={x.id} onClick={() => setI(n)} aria-current={n === i ? 'step' : undefined}
              aria-label={`Question ${n + 1}, ${n === i ? 'current' : done ? 'answered' : 'not answered'}`}
              className={`grid h-11 w-11 place-items-center rounded-lg text-sm font-semibold ${n === i ? 'border-2 border-brand-400 text-white' : done ? 'border border-[var(--az-hairline)] bg-white/[.08] text-white' : 'text-3 border border-[var(--az-hairline)]'}`}>{n + 1}</button>
          );
        })}
      </nav>
      <section aria-labelledby="qq-h" className="glass flex max-w-[760px] flex-col gap-4 p-5 sm:p-7">
        <span className="t-small">Question {i + 1} of {total} · Choose one</span>
        <h2 id="qq-h" ref={headRef} tabIndex={-1} className="t-h2 whitespace-pre-line text-white outline-none">{q.prompt}</h2>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="sr-only">Answer choices</legend>
          {q.choices.map((choice, n) => {
            const on = answers[q.id] === n;
            return (
              <label key={n} className={`flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border px-4 text-[15px] ${on ? 'border-brand-400 bg-brand-400/10 text-white' : 'border-[var(--az-hairline)] text-slate-200 hover:bg-white/[.03]'}`}>
                <input type="radio" name={q.id} checked={on} onChange={() => choose(n)} className="h-5 w-5 shrink-0 accent-[var(--color-brand-400)]" />{choice}
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--az-divider)] pt-4">
          <button className="btn btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button>
          <button className="btn btn-ghost" disabled={i === total - 1} onClick={() => setI(i + 1)}>Next</button>
          <span className="flex-1" />
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit quiz'}</button>
        </div>
      </section>
      <p className="t-small max-w-[760px]">Answers are saved as you go. The deadline is checked by CommunityOne, so an attempt can’t be sent after it, even from a page that’s still open.</p>
    </section>
  );
}

function Result({ result, quiz, nextId, busy, onAgain, onBack }) {
  const [open, setOpen] = useState(false);
  const a = result.attempt;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="rs-h" className="raised flex max-w-[560px] flex-col gap-4 p-5 sm:p-6">
        <h2 id="rs-h" className="t-h3 text-white">{a.number ? `Attempt ${a.number}` : 'Your result'}</h2>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-[40px] font-bold leading-[48px] text-white">{scoreText(a)}</span>
          <Pill tone={a.passed ? 'done' : 'warn'}>{a.passed ? 'Passed' : 'Not passed yet'}</Pill>
        </div>
        <Progress p={{ done: a.score, total: a.total }} label="Score" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-3">Pass mark</dt><dd className="text-slate-200">{result.passPercent}%</dd>
          {result.best && <><dt className="text-3">Best score</dt><dd className="text-slate-200">{scoreText(result.best)}</dd></>}
          <dt className="text-3">Attempts left</dt><dd className="text-slate-200">{result.attemptsLeft}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          {result.best?.passed && nextId && <Link to={lessonPath(nextId)} className="btn btn-primary">Continue course</Link>}
          <button className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide answers' : 'Review answers'}</button>
          {result.attemptsLeft > 0 && !result.closed && <button className="btn btn-ghost" disabled={busy} onClick={onAgain}>Try again</button>}
          <button className="btn btn-ghost" onClick={onBack}>Back to the quiz</button>
        </div>
        {!result.review?.some((x) => x.answer != null) && result.attemptsLeft > 0 && <p className="t-small">The right answers show once you pass or have no attempts left.</p>}
      </section>
      {open && result.review && (
        <ol className="flex max-w-[760px] flex-col gap-3">
          {result.review.map((x, n) => (
            <li key={x.id} className="glass flex flex-col gap-2 p-4">
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${x.correct ? 'text-brand-300' : 'text-rose-300'}`}><Icon name={x.correct ? 'check' : 'x'} size={14} />Question {n + 1} · {x.correct ? 'Right' : 'Not right'}</span>
              <p className="whitespace-pre-line font-semibold text-white">{x.prompt}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {x.choices.map((ch, k) => (
                  <li key={k} className={`rounded-lg px-3 py-1.5 ${k === x.answer ? 'bg-brand-400/10 text-white' : k === x.yours ? 'bg-rose-400/10 text-slate-200' : 'text-3'}`}>
                    {ch}{k === x.yours ? ' · your answer' : ''}{k === x.answer ? ' · right answer' : ''}
                  </li>
                ))}
              </ul>
              {x.yours == null && <span className="t-small">Not answered</span>}
            </li>
          ))}
        </ol>
      )}
      {quiz.closed && <p className="t-small">This quiz is closed.</p>}
    </div>
  );
}
