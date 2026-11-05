// Helpers for Manuals: permissions, visibility and nested article updates.

export const isLive = (a) => a.published && (!a.publishAt || a.publishAt <= Date.now());

export function manualRoles(m, me) {
  const admin = !!me?.admin || (m.admins ?? []).includes(me?.id);
  const contributor = (m.contributors ?? []).includes(me?.id);
  return {
    admin,
    contributor,
    canEdit: admin || contributor,
    canPublish: admin || (contributor && (m.publishWho ?? 'contributors') !== 'admins'),
  };
}

export function sharedAccess(a, me) {
  return (a.sharedWith ?? []).find((s) => s.userId === me?.id)?.access ?? null;
}

export function canReadArticle(m, a, me) {
  const r = manualRoles(m, me);
  return r.canEdit || sharedAccess(a, me) || (m.published && isLive(a));
}

export function canWriteArticle(m, a, me) {
  return manualRoles(m, me).canEdit || sharedAccess(a, me) === 'edit';
}

/** Dispatchable action that patches one article inside a manual without adding a version. */
export const patchArticle = (manualId, articleId, fn) => ({
  type: 'update', col: 'manuals', id: manualId,
  patch: (m, me) => ({ ...m, chapters: m.chapters.map((c) => ({ ...c, articles: c.articles.map((a) => (a.id === articleId ? fn(a, me) : a)) })) }),
});

export function findArticle(m, articleId) {
  for (const c of m.chapters) {
    const a = c.articles.find((x) => x.id === articleId);
    if (a) return { chapter: c, article: a };
  }
  return {};
}
