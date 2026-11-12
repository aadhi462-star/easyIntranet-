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
