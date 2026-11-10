// People data from the CommunityOne API. The server owns profiles; the rest of the app still
// reads people from the local store (feed authors, avatars, mentions), so server profiles are
// merged into it in the store's shape. Later Phase 1 steps move those screens to the API too.
import { useEffect, useState } from 'react';
import { api } from './api.js';

/** Server profile → the store's user shape. */
export function toLocal(p) {
  if (p.deleted) return { id: p.id, name: 'Deleted member', deleted: true, status: 'deleted' };
  const customFields = { ...(p.customFields || {}) };
  if (p.linkedin) customFields.linkedin = p.linkedin;
  customFields.mentor = p.mentorOpen ? 'Yes' : 'No';
  return {
    id: p.id, name: p.name, status: p.status, hue: p.avatarHue,
    title: p.headline || '', role: p.jobTitle || '', company: p.company || '', city: p.city || '', bio: p.bio || '',
    skills: p.skills || [], batch: p.batch, dept: p.department || '', institution: p.institution || '',
    education: p.education || [],
    career: (p.experience || []).map((x) => ({ title: x.title, org: x.org, from: x.fromYear, to: x.toYear })),
    ...(p.email ? { email: p.email } : {}),
    birthday: p.birthday || null,
    privacy: { contact: p.contactVisibility === 'connections' ? 'following' : (p.contactVisibility ?? (p.contactHidden ? 'nobody' : 'everyone')) },
    contactHidden: !!p.contactHidden,
    customFields,
    ...(p.version != null ? { profileVersion: p.version, directoryVisible: p.directoryVisible, completenessDismissed: p.completenessDismissed } : {}),
  };
}

/** Loads every directory page and merges it into the store (after sign-in). */
export async function syncDirectory(dispatch) {
  const all = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await api(`/directory?limit=100&offset=${offset}`);
    all.push(...page.people);
    if (all.length >= page.total || !page.people.length) break;
  }
  dispatch({ type: 'users/merge', users: all.map(toLocal) });
  return all.length;
}

export async function loadProfile(id, dispatch) {
  const { profile } = await api(`/profiles/${encodeURIComponent(id)}`);
  dispatch({ type: 'users/merge', users: [toLocal(profile)] });
  return profile;
}

/** Institutions with their departments (for education pickers). */
export function useInstitutions() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/institutions').then((r) => setList(r.institutions)).catch(() => setList([])); }, []);
  return list;
}
