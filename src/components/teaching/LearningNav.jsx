// The Learning section's own row for people who teach (v2 board V2GDashboards, "Instructor:
// Teaching"): Courses · Teaching · Grading. Learners never see it; the catalogue shows it when the
// server says this person grades or creates courses here.
import { Link } from 'react-router-dom';
import { communityPath } from '../../lib/communities.js';
import { coursePath, gradingPath } from '../../lib/learning.js';

/** /c/<community>/learning/teaching (G7). */
export const teachingPath = (community) => `${communityPath(community, 'learning')}/teaching`;

const CURRENT = 'aria-[current=page]:border-[var(--az-text)] aria-[current=page]:bg-[var(--az-text)] aria-[current=page]:text-[var(--az-page)]';

export default function LearningNav({ g, current, toGrade }) {
  const items = [
    ['courses', 'Courses', coursePath(g)],
    ['teaching', 'Teaching', teachingPath(g)],
    ['grading', toGrade ? `Grading · ${toGrade}` : 'Grading', gradingPath(g)],
  ];
  return (
    <nav aria-label="Learning" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
      {items.map(([id, label, to]) => (
        <Link key={id} to={to} aria-current={current === id ? 'page' : undefined} className={`filter-chip shrink-0 ${CURRENT}`}>{label}</Link>
      ))}
    </nav>
  );
}
