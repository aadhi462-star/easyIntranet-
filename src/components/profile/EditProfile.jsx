// Edit profile (moved out of People.jsx for v2 D10). Sends only the fields that changed, with the
// profile's version, so an edit from a stale copy is refused instead of overwriting (USR-10).
// The graduation year is optional: nobody is assumed to be an alumnus. Contact privacy and the
// directory listing are set in the profile's Privacy panel.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store.jsx';
import { api } from '../../lib/api.js';
import { loadProfile, toLocal, useInstitutions } from '../../lib/people.js';
import { toast } from '../../lib/toast.js';
import { Field, Modal } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { MONTHS, daysInMonth, isValidBirthday } from '../../lib/celebrations.js';

export default function EditProfile({ onClose, onSaved, focus }) {
  const { state, me, dispatch } = useStore();
  const institutions = useInstitutions();
  const primaryEdu = (me.education || []).find((e) => e.isPrimary) ?? me.education?.[0];
  const [edu, setEdu] = useState({ institutionId: primaryEdu?.institutionId ?? '', departmentId: primaryEdu?.departmentId ?? '' });
  const baseEdu = useRef(edu);
  useEffect(() => { if (institutions?.length && !edu.institutionId) setEdu((x) => ({ ...x, institutionId: institutions[0].id })); }, [institutions]); // eslint-disable-line react-hooks/exhaustive-deps
  const departments = institutions?.find((i) => i.id === edu.institutionId)?.departments ?? [];
  const [busy, setBusy] = useState(false);
  const hasCareer = (me.career || []).some((c) => c.title?.trim() && c.org?.trim());
  const formOf = (u, extraCareer = []) => ({ name: u.name, title: u.title || '', role: u.role || '', company: u.company || '', city: u.city || '', batch: u.batch, dept: u.dept || '', bio: u.bio || '',
    skills: [...(u.skills || [])], career: [...extraCareer, ...(u.career || []).map((c) => ({ ...c }))],
    customFields: { ...(u.customFields || {}) } });
  const bdayOf = (u) => { const [m = '', dd = ''] = isValidBirthday(u.birthday) ? u.birthday.split('-') : []; return { m, d: dd }; };
  const [d, setD] = useState(() => formOf(me, focus === 'career' && !hasCareer ? [{ title: '', org: '', from: new Date().getFullYear(), to: null }] : []));
  const [bday, setBday] = useState(() => bdayOf(me));
  // What the form started from. Only fields that differ from it are sent, so saving can't
  // overwrite changes made elsewhere to fields this edit didn't touch (USR-10).
  const base = useRef(null);
  if (!base.current) base.current = { d, bday, edu: null };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Runs after the Modal's own autofocus, so the field the member asked to fill wins.
  useEffect(() => {
    const id = focus === 'career' ? 'ep-career-0-title' : `ep-${focus}`;
    const el = focus && focus !== '1' ? document.getElementById(id) : null;
    if (el) { el.focus(); el.scrollIntoView?.({ block: 'center' }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [skill, setSkill] = useState('');
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const setCareer = (i, k, v) => setD({ ...d, career: d.career.map((c, j) => (j === i ? { ...c, [k]: v } : c)) });
  const addSkill = () => { const s = skill.trim(); if (s && !d.skills.includes(s)) setD({ ...d, skills: [...d.skills, s] }); setSkill(''); };
  const [errors, setErrors] = useState({});
  const maxYear = new Date().getFullYear() + 6;
  const isYear = (v) => /^\d{4}$/.test(String(v).trim()) && Number(v) >= 1950 && Number(v) <= maxYear;
  const blank = (v) => v == null || String(v).trim() === '';
  const save = (e) => {
    e.preventDefault();
    const err = {};
    const name = d.name.trim();
    if (!name) err.name = 'Enter your name.';
    // Optional for everyone; when given it must be a real year.
    if (!blank(d.batch) && !isYear(d.batch)) err.batch = `Enter a 4-digit year between 1950 and ${maxYear}, or leave it blank.`;
    const career = d.career.filter((c) => c.title?.trim() && c.org?.trim());
    career.forEach((c) => {
      const i = d.career.indexOf(c);
      if (!blank(c.from) && !isYear(c.from)) err[`career${i}`] = `“From” must be a year between 1950 and ${maxYear}.`;
      else if (!blank(c.to) && !isYear(c.to)) err[`career${i}`] = `“To” must be a year between 1950 and ${maxYear}.`;
      else if (!blank(c.from) && !blank(c.to) && Number(c.to) < Number(c.from)) err[`career${i}`] = '“To” can’t be earlier than “From”.';
    });
    let birthday = null;
    if (bday.m || bday.d) {
      if (!bday.m || !bday.d) err.birthday = 'Choose both a month and a day, or clear your birthday.';
      else if (Number(bday.d) > daysInMonth(Number(bday.m))) err.birthday = `${MONTHS[Number(bday.m) - 1]} has only ${daysInMonth(Number(bday.m))} days.`;
      else birthday = `${bday.m}-${bday.d}`;
      if (birthday && !isValidBirthday(birthday)) err.birthday = 'Enter a valid date.';
    }
    setErrors(err);
    if (Object.keys(err).length) {
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const { linkedin, mentor, ...otherFields } = d.customFields;
    const b0 = base.current.d;
    const changed = (k) => !same(d[k], b0[k]);
    const body = { version: me.profileVersion };
    if (changed('name')) body.name = name;
    if (changed('title')) body.headline = d.title;
    if (changed('role')) body.jobTitle = d.role;
    if (changed('company')) body.company = d.company;
    if (changed('city')) body.city = d.city;
    if (changed('bio')) body.bio = d.bio;
    if (changed('skills')) body.skills = d.skills;
    if (!same(bday, base.current.bday)) body.birthday = birthday;
    if (changed('customFields')) {
      body.linkedin = linkedin || null;
      body.mentorOpen = mentor === 'Yes';
      body.customFields = Object.fromEntries(Object.entries(otherFields).filter(([, v]) => v != null && v !== ''));
    }
    if (changed('batch') || !same(edu, baseEdu.current)) {
      body.education = edu.institutionId && (!blank(d.batch) || edu.departmentId)
        ? [{ institutionId: edu.institutionId, departmentId: edu.departmentId || null, gradYear: blank(d.batch) ? null : Number(d.batch), isPrimary: true }] : [];
    }
    if (changed('career')) body.experience = career.map((c) => ({ title: c.title.trim(), org: c.org.trim(), fromYear: blank(c.from) ? null : Number(c.from), toYear: blank(c.to) ? null : Number(c.to) }));
    if (Object.keys(body).length === 1) { onClose(); return; } // nothing changed
    setBusy(true);
    api('/profiles/me', { method: 'PATCH', body })
      .then(({ profile }) => { dispatch({ type: 'users/merge', users: [toLocal(profile)] }); toast('Profile saved'); onSaved?.(profile); onClose(); })
      .catch((err) => {
        if (err.code === 'STALE_VERSION') {
          // Pull in the newer copy: fields this edit didn't touch take the fresh values, the
          // member's own changes are kept, and the next save sends only those changes.
          loadProfile(me.id, dispatch).then((fresh) => {
            const f = toLocal(fresh);
            const fd = formOf(f); const fb = bdayOf(f);
            const fe = { institutionId: (f.education.find((x) => x.isPrimary) ?? f.education[0])?.institutionId ?? edu.institutionId, departmentId: (f.education.find((x) => x.isPrimary) ?? f.education[0])?.departmentId ?? '' };
            // Capture the old baseline first: the updaters below run at the next render, after
            // base.current has already been replaced with the fresh copy.
            const old = base.current; const oldEdu = baseEdu.current;
            setD((cur) => Object.fromEntries(Object.keys(cur).map((k) => [k, same(cur[k], old.d[k]) ? fd[k] : cur[k]])));
            setBday((cur) => (same(cur, old.bday) ? fb : cur));
            setEdu((cur) => (same(cur, oldEdu) ? fe : cur));
            base.current = { d: fd, bday: fb };
            baseEdu.current = fe;
          }).catch(() => {});
        }
        const field = err.extra?.field;
        const key = field === 'jobTitle' ? 'role' : field === 'headline' ? 'title' : field?.startsWith('experience') ? 'career0' : field === 'education' ? 'batch' : field;
        setErrors({ ...(key ? { [key]: err.message } : {}), form: err.code === 'STALE_VERSION' ? 'Your profile was changed somewhere else. We’ve loaded the latest version and kept your edits — check them and save again.' : err.message });
        setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      })
      .finally(() => setBusy(false));
  };
  const errText = (k) => errors[k] && <span role="alert" className="field-error block">{errors[k]}</span>;
  return (
    <Modal title="Edit profile" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input id="ep-name" className="input" value={d.name} onChange={set('name')} aria-invalid={!!errors.name} />{errText('name')}</Field>
          <Field label="Headline"><input className="input" value={d.title} onChange={set('title')} /></Field>
          <Field label="Current role"><input id="ep-role" className="input" value={d.role} onChange={set('role')} /></Field>
          <Field label="Company"><input id="ep-company" className="input" value={d.company} onChange={set('company')} /></Field>
          <Field label="City"><input id="ep-city" className="input" value={d.city} onChange={set('city')} /></Field>
          <Field label="Graduation year (optional)"><input id="ep-batch" className="input" type="number" min="1950" max={maxYear} value={d.batch ?? ''} onChange={set('batch')} aria-invalid={!!errors.batch} />{errText('batch')}</Field>
          {(institutions?.length ?? 0) > 1 && (
            <div className="sm:col-span-2"><Field label="Institution">
              <select id="ep-institution" className="input" value={edu.institutionId} onChange={(e) => setEdu({ institutionId: e.target.value, departmentId: '' })}>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field></div>
          )}
          <div className="sm:col-span-2"><Field label="Department">
            <select id="ep-dept" className="input" value={edu.departmentId} onChange={(e) => setEdu({ ...edu, departmentId: e.target.value })} disabled={!institutions}>
              <option value="">{institutions ? 'Not set' : 'Loading…'}</option>
              {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
            </select>
          </Field></div>
        </div>
        <Field label="About" hint={`${d.bio.trim().length} characters${d.bio.trim().length < 40 ? ' · 40+ makes your profile complete' : ''}`}><textarea id="ep-bio" className="input min-h-24" value={d.bio} onChange={set('bio')} /></Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-[var(--az-text-2)]">Birthday (optional)</legend>
          <div className="flex flex-wrap gap-2">
            <select id="ep-birthday" className="input min-w-0 flex-1 sm:max-w-48" aria-label="Birthday month" value={bday.m} aria-invalid={!!errors.birthday} aria-describedby="ep-birthday-hint"
              onChange={(e) => { const m = e.target.value; setBday({ m, d: m && Number(bday.d) > daysInMonth(Number(m)) ? '' : bday.d }); setErrors({ ...errors, birthday: undefined }); }}>
              <option value="">Month</option>
              {MONTHS.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
            </select>
            <select className="input w-28" aria-label="Birthday day" value={bday.d} aria-invalid={!!errors.birthday} aria-describedby="ep-birthday-hint"
              onChange={(e) => { setBday({ ...bday, d: e.target.value }); setErrors({ ...errors, birthday: undefined }); }}>
              <option value="">Day</option>
              {Array.from({ length: bday.m ? daysInMonth(Number(bday.m)) : 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((v) => <option key={v} value={v}>{Number(v)}</option>)}
            </select>
            {(bday.m || bday.d) && <button type="button" className="btn btn-ghost min-h-11" onClick={() => { setBday({ m: '', d: '' }); setErrors({ ...errors, birthday: undefined }); }}>Clear</button>}
          </div>
          <span id="ep-birthday-hint" className="t-small mt-1 block">Month and day only, never the year. Shown to the people who can see your contact details.</span>
          {errText('birthday')}
        </fieldset>
        <Field label="Skills">
          <div className="mb-2 flex flex-wrap gap-1.5">{d.skills.map((s) => <span key={s} className="chip !py-1">{s}<button type="button" className="ml-1" aria-label={`Remove ${s}`} onClick={() => setD({ ...d, skills: d.skills.filter((x) => x !== s) })}><Icon name="x" size={14} /></button></span>)}</div>
          <div className="flex gap-2"><input id="ep-skills" className="input" aria-label="Add a skill" value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder="Add a skill and press Enter" /><button type="button" className="btn btn-ghost min-h-11" onClick={addSkill}>Add</button></div>
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-[var(--az-text-2)]">Career history</legend>
          <div className="space-y-2">
            {d.career.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--az-hairline)] p-2 sm:grid-cols-[1fr_1fr_80px_80px_auto]">
                <input id={`ep-career-${i}-title`} className="input" aria-label="Title" placeholder="Title" value={c.title} onChange={(e) => setCareer(i, 'title', e.target.value)} />
                <input className="input" aria-label="Organisation" placeholder="Organisation" value={c.org} onChange={(e) => setCareer(i, 'org', e.target.value)} />
                <input className="input" aria-label="From year" placeholder="From" value={c.from ?? ''} onChange={(e) => setCareer(i, 'from', e.target.value)} />
                <input className="input" aria-label="To year" placeholder="To" value={c.to ?? ''} onChange={(e) => setCareer(i, 'to', e.target.value)} />
                <button type="button" className="btn btn-ghost min-h-11" aria-label="Remove role" onClick={() => { setErrors({}); setD({ ...d, career: d.career.filter((_, j) => j !== i) }); }}><Icon name="x" size={16} /></button>
                {errors[`career${i}`] && <span role="alert" className="field-error col-span-full">{errors[`career${i}`]}</span>}
              </div>
            ))}
            <button type="button" className="btn btn-ghost min-h-11" onClick={() => { setErrors({}); setD({ ...d, career: [{ title: '', org: '', from: new Date().getFullYear(), to: null }, ...d.career] }); }}>+ Add role</button>
          </div>
        </fieldset>
        {(state.customFields || []).length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {state.customFields.map((cf) => (
              <Field key={cf.id} label={cf.label}>
                {cf.type === 'select'
                  ? <select id={`ep-cf-${cf.id}`} className="input" value={d.customFields[cf.id] || ''} onChange={(e) => setD({ ...d, customFields: { ...d.customFields, [cf.id]: e.target.value } })}><option value="">Not set</option>{(cf.options || []).map((o) => <option key={o}>{o}</option>)}</select>
                  : <input id={`ep-cf-${cf.id}`} className="input" type={cf.type === 'number' ? 'number' : cf.type === 'date' ? 'date' : 'text'} value={d.customFields[cf.id] || ''} onChange={(e) => setD({ ...d, customFields: { ...d.customFields, [cf.id]: e.target.value } })} />}
              </Field>
            ))}
          </div>
        )}
        {errors.form && <p role="alert" className="notice notice-bad">{errors.form}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn btn-secondary min-h-11" onClick={onClose}>Cancel</button><button className="btn btn-primary min-h-11" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </Modal>
  );
}
