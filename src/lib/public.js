// Public discovery (no sign-in needed): Public and Private communities with their member count
// and, for Public ones, up to two upcoming events. Closed communities never appear (VIS-04).
import { api } from './api.js';

export async function fetchPublicCommunities({ q = '', category = '', limit = 24 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) params.set('q', q.trim());
  if (category) params.set('category', category);
  return api(`/public/communities?${params}`);
}
