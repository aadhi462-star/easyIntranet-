import { Link } from 'react-router-dom';
import { useStore } from '../../lib/store.jsx';

const filled = (v) => v != null && String(v).trim() !== '';

/**
 * Scores a member's profile. Avatars are generated initials, so there's no photo item.
 * The LinkedIn item only counts when the network still has that custom field.
 * Returns {pct, done, total, items: [{id, label, hint, done}]}; `id` is the Edit profile
 * field to focus.
 */
export function completeness(u, customFields = []) {
  if (!u) return { pct: 0, done: 0, total: 0, items: [] };
  const bio = String(u.bio || '').trim();
  const skills = (u.skills || []).length;
  const items = [
    { id: 'name', label: 'Add your full name', done: filled(u.name) },
    { id: 'role', label: 'Add your current role', done: filled(u.role) },
    { id: 'company', label: 'Add your company', done: filled(u.company) },
    { id: 'city', label: 'Add your city', done: filled(u.city) },
    // External guests may not have a batch; don't penalise them for it.
    ...(u.external ? [] : [{ id: 'batch', label: 'Add your batch (graduation year)', done: filled(u.batch) }]),
    { id: 'dept', label: 'Add your department', done: filled(u.dept) },
    { id: 'bio', label: 'Write an About of at least 40 characters', hint: bio.length ? `${bio.length}/40` : '', done: bio.length >= 40 },
    { id: 'skills', label: 'List at least 3 skills', hint: skills ? `${Math.min(skills, 3)}/3` : '', done: skills >= 3 },
    { id: 'career', label: 'Add a role to your career history', done: (u.career || []).some((c) => filled(c.title) && filled(c.org)) },
    ...(customFields.some((cf) => cf.id === 'linkedin') ? [{ id: 'cf-linkedin', label: 'Add your LinkedIn handle', done: filled(u.customFields?.linkedin) }] : []),
  ];
  const done = items.filter((i) => i.done).length;
  return { pct: items.length ? Math.round((done / items.length) * 100) : 100, done, total: items.length, items };
}

function Bar({ pct, label }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="brand-gradient h-full transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Full meter for the member's own profile page. `onEdit(fieldId)` opens Edit profile. */
export function CompletenessMeter({ user, onEdit }) {
  const { state } = useStore();
  const c = completeness(user, state.customFields || []);
  const missing = c.items.filter((i) => !i.done);
  return (
    <section className="glass p-5" aria-labelledby="completeness-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="completeness-h" className="font-bold">Profile strength</h2>
        <span className="text-sm font-semibold text-slate-300">{c.pct}% · {c.done}/{c.total}</span>
      </div>
      <div className="mt-3"><Bar pct={c.pct} label="Profile completeness" /></div>
      {missing.length ? (
        <>
          <p className="mt-3 text-sm text-slate-400">Complete profiles get found by classmates and mentors more often.</p>
          <ul className="mt-2 space-y-1" aria-label="Missing profile details">
            {missing.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => onEdit(i.id)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm hover:bg-white/5">
                  <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] text-slate-500">○</span>
                  <span className="min-w-0 flex-1">{i.label}</span>
                  {i.hint && <span className="text-xs text-slate-500">{i.hint}</span>}
                  <span aria-hidden="true" className="text-brand-400">→</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-3 text-sm text-slate-300" role="status">✓ Your profile is complete. Nice work!</p>}
    </section>
  );
}

/** Compact sidebar card for the signed-in member, while their profile is under 100%. */
export function CompletenessCard() {
  const { state, me, dispatch } = useStore();
  if (!me || me.completenessDismissed) return null;
  const c = completeness(me, state.customFields || []);
  if (c.pct >= 100) return null;
  const next = c.items.filter((i) => !i.done).slice(0, 3);
  return (
    <section className="glass p-4" aria-labelledby="completeness-card-h">
      <div className="flex items-start justify-between gap-2">
        <h2 id="completeness-card-h" className="text-sm font-bold">Your profile is {c.pct}% complete</h2>
        <button type="button" className="btn btn-ghost -mr-1 -mt-1 h-9 w-9 shrink-0 !p-0 text-xs" aria-label="Dismiss profile completeness reminder"
          onClick={() => dispatch({ type: 'profile/update', silent: true, patch: { completenessDismissed: true } })}>✕</button>
      </div>
      <div className="mt-2"><Bar pct={c.pct} label="Profile completeness" /></div>
      <ul className="mt-2 space-y-0.5">
        {next.map((i) => (
          <li key={i.id}>
            <Link to={`/people/${me.id}?edit=${i.id}`} className="flex min-h-9 items-center gap-2 rounded-lg px-1 text-xs text-slate-300 hover:bg-white/5">
              <span aria-hidden="true" className="text-slate-500">○</span><span className="min-w-0 flex-1">{i.label}</span><span aria-hidden="true" className="text-brand-400">→</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/people/${me.id}?edit=1`} className="btn btn-primary mt-3 min-h-11 w-full text-sm">Complete profile</Link>
    </section>
  );
}
