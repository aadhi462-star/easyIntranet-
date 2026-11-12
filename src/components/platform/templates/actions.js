// Deactivate and activate (F11, TPL-01): the list and a template's page both use these, on
// phones too (F14). Deactivating hides the template from "Use a template" at once; communities
// already made from it keep working and keep their setup.
import { api } from '../../../lib/api.js';
import { errorText } from '../../../lib/communities.js';
import { toast } from '../../../lib/toast.js';
import { confirmAction } from '../../ui/Confirm.jsx';
import { plural } from './shared.js';

const enc = encodeURIComponent;

/** Asks, then switches the template; resolves to the updated template, or null if not changed. */
export async function toggleActive(t) {
  const off = t.status === 'published';
  const made = plural(t.communities ?? 0, 'community', 'communities');
  const ok = await confirmAction(off ? {
    title: `Deactivate ${t.name}?`,
    body: `It disappears from “Use a template” at once. The ${made} made from it keep working and keep their setup. Anyone in the middle of creating from it can publish without the template.`,
    confirm: 'Deactivate', danger: true,
  } : {
    title: `Activate ${t.name}?`,
    body: `It appears under “Use a template” again, at version ${t.currentVersion}. Communities already made from it don’t change.`,
    confirm: 'Activate',
  });
  if (!ok) return null;
  try {
    const d = await api(`/admin/templates/${enc(t.key)}/${off ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
    toast(off ? `${t.name} deactivated` : `${t.name} activated`);
    return d.template;
  } catch (e) {
    toast(errorText(e), 'error');
    return null;
  }
}

export const lastPublished = (t) => (t.versions ?? []).filter((v) => v.publishedAt).map((v) => v.publishedAt).sort().pop() ?? null;
export const draftOf = (t) => (t.versions ?? []).find((v) => v.draft) ?? null;
