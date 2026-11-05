// Birthday and work-anniversary helpers. Birthdays are stored as "MM-DD" (no year, for
// privacy); a work anniversary is the month/day a member joined the community.
import { isActiveUser } from '../components/people/shared.jsx';

const pad = (n) => String(n).padStart(2, '0');
export const mmdd = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const daysInMonth = (m) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 31;

/** Validates "MM-DD" (Feb 29 allowed). */
export function isValidBirthday(v) {
  const m = /^(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month);
}

/** "MM-DD" shown as e.g. "14 November". */
export const formatMonthDay = (v) => {
  if (!isValidBirthday(v)) return '';
  const [m, d] = v.split('-').map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
};

/** Whether a stored "MM-DD" falls on `date`. Feb 29 is celebrated on Feb 28 in non-leap years. */
export function onDay(value, date) {
  if (!isValidBirthday(value)) return false;
  const key = mmdd(date);
  if (value === key) return true;
  return value === '02-29' && key === '02-28' && !isLeap(date.getFullYear());
}

const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };

/**
 * Birthdays and anniversaries of active members (excluding `excludeId`) from today through
 * the next `days` days: [{user, kind: 'birthday'|'anniversary', date, inDays, year, years?}].
 */
export function upcomingCelebrations(users, excludeId, days = 7, now = Date.now()) {
  const today = startOfDay(now);
  const out = [];
  for (let i = 0; i <= days; i++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    for (const u of users) {
      if (u.id === excludeId || !isActiveUser(u)) continue;
      if (u.birthday && onDay(u.birthday, date)) out.push({ user: u, kind: 'birthday', date, inDays: i, year: date.getFullYear() });
      if (u.joinedAt) {
        const joined = new Date(u.joinedAt);
        const years = date.getFullYear() - joined.getFullYear();
        if (years >= 1 && onDay(mmdd(joined), date)) out.push({ user: u, kind: 'anniversary', date, inDays: i, year: date.getFullYear(), years });
      }
    }
  }
  return out;
}

export const whenLabel = (inDays, date) => (inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));
