// Learning (redesign Stage 5a): courses inside communities. The server decides who sees and
// manages what (D1–D6); these helpers only fetch, and re-read the course after every change so
// the screen always shows what the server stored.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { communityPath, errorText } from './communities.js';

const enc = encodeURIComponent;

/** /c/<community>/learning, a course in it, or its builder. */
export const coursePath = (community, courseId, edit = false) =>
  `${communityPath(community, 'learning')}${courseId ? `/${enc(courseId)}${edit ? '/edit' : ''}` : ''}`;
export const lessonPath = (id) => `/lessons/${enc(id)}`;

export const durationText = (min) => {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
};
export const lessonsText = (n) => `${n} ${n === 1 ? 'lesson' : 'lessons'}`;
export const KIND_BADGE = { text: 'TXT', file: 'FILE', link: 'LINK' };

/** One course with its outline (or null while loading). `set` takes a fresh copy from a write. */
export function useCourse(id) {
  const [s, setS] = useState({ status: 'loading', course: null });
  const load = useCallback(() => api(`/courses/${enc(id)}`)
    .then((d) => setS({ status: 'ready', course: d.course }))
    .catch((e) => setS((p) => ({ ...p, status: p.course ? 'ready' : e.status === 404 ? 'missing' : 'error', message: errorText(e) }))), [id]);
  useEffect(() => { setS({ status: 'loading', course: null }); load(); }, [load]);
  const set = useCallback((course) => setS({ status: 'ready', course }), []);
  return { ...s, reload: load, set };
}

/** A community's catalogue. */
export function useCatalogue(communityId) {
  const [s, setS] = useState({ status: 'loading', courses: [], canCreate: false });
  const load = useCallback(() => api(`/communities/${enc(communityId)}/courses`)
    .then((d) => setS({ status: 'ready', ...d }))
    .catch((e) => setS((p) => ({ ...p, status: 'error', message: errorText(e) }))), [communityId]);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

/** Everything this person is enrolled in or waiting for, across communities. */
export function useMyLearning() {
  const [s, setS] = useState({ status: 'loading', courses: [] });
  const load = useCallback(() => api('/me/learning')
    .then((d) => setS({ status: 'ready', courses: d.courses }))
    .catch((e) => setS((p) => ({ ...p, status: 'error', message: errorText(e) }))), []);
  useEffect(() => { load(); }, [load]);
  return { ...s, reload: load };
}

/** Where a learner stands, in words: "Completed", "On the waitlist", "Enrolled · 3 of 8 lessons". */
export function standing(c) {
  const e = c.enrollment;
  if (!e || e.status === 'left') return null;
  if (e.status === 'waitlist') return 'On the waitlist';
  if (e.completedAt) return 'Completed';
  return `Enrolled · ${c.progress.done} of ${lessonsText(c.progress.total)}`;
}

export const percent = (p) => (p.total ? Math.round((p.done / p.total) * 100) : 0);

/** The lesson after the ones already done, with its module, for "Next: …" lines. */
export function nextLesson(course) {
  for (const m of course.modules ?? []) {
    const l = m.lessons.find((x) => x.id === course.nextLessonId);
    if (l) return { ...l, module: m };
  }
  return null;
}
