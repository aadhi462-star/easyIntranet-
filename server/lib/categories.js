// Community categories (v2 brief, Part 4.1). New and edited communities use one of these; rows
// saved before the list existed keep their old category until someone changes it.
import { badRequest } from './errors.js';
import { CATEGORIES } from '../../shared/categories.js';

export { CATEGORIES };
const BY_LOWER = new Map(CATEGORIES.map((c) => [c.toLowerCase(), c]));

/** The category's canonical spelling, or null when it isn't on the list. */
export const categoryOf = (v) => BY_LOWER.get(String(v ?? '').trim().toLowerCase()) ?? null;

/**
 * The category to store. Omitted on create means Other. On an edit, sending back the stored
 * value unchanged is always fine, so an older community's category doesn't block other edits.
 */
export function checkCategory(input, { current } = {}) {
  const value = input === '' ? null : input;
  if (current !== undefined && (value ?? null) === (current ?? null)) return current;
  if (value == null) {
    if (current === undefined) return 'Other';
  } else {
    const c = categoryOf(value);
    if (c) return c;
  }
  throw badRequest('INVALID_CATEGORY', `Choose a category: ${CATEGORIES.join(', ')}.`, { field: 'category', categories: CATEGORIES });
}

/**
 * A category for an event or resource, checked against the community's list (F13). `list` is the
 * community's list; `previous` the stored value, which an edit may keep even if the list has
 * changed since. `other` also allows "Other". Returns the stored spelling, or null.
 */
export function pickCategory(input, list, { previous = null, other = false, label = 'category' } = {}) {
  if (input == null) return null;
  const s = String(input).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (previous != null && s === previous) return previous;
  const allowed = [...(Array.isArray(list) ? list : []), ...(other ? ['Other'] : [])];
  const hit = allowed.find((x) => x.toLowerCase() === s.toLowerCase());
  if (!hit) {
    const message = allowed.length ? `Choose a ${label} from this community’s list: ${allowed.join(', ')}.` : `This community has no ${label} list yet.`;
    throw badRequest('INVALID_CATEGORY', message, { field: 'category', categories: allowed });
  }
  return hit;
}
