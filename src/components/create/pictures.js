// Logo and cover chosen during Configure: checked here with the server's picture rules
// (server/routes/branding.js, the same as Manage, Branding), kept in memory only, and uploaded
// after publishing with the community file store and PATCH /communities/:id/branding.
import { api, uploadFile } from '../../lib/api.js';

const MB = 1024 * 1024;
const RULES = {
  logo: { maxBytes: 2 * MB, minWidth: 256, minHeight: 256, ratio: 1, shape: 'square', Label: 'Logos' },
  cover: { maxBytes: 5 * MB, minWidth: 1600, minHeight: 400, ratio: 4, shape: '4:1 (for example 1600 by 400 px)', Label: 'Covers' },
};
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const mb = (n) => `${(n / MB).toFixed(1).replace(/\.0$/, '')} MB`;
const typeMessage = (kind) => `Use a PNG, JPEG or WebP image. SVG and other files can’t be used as a ${kind}.`;

function dimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** The rule a picture breaks, or null when it can be used. */
export async function checkPicture(kind, file) {
  const r = RULES[kind];
  if (!TYPES.includes(file.type)) return typeMessage(kind);
  if (file.size > r.maxBytes) return `This image is ${mb(file.size)}. ${r.Label} can be up to ${mb(r.maxBytes)}.`;
  const d = await dimensions(file);
  if (!d) return typeMessage(kind);
  if (d.width < r.minWidth || d.height < r.minHeight) return `This image is ${d.width} by ${d.height} px. ${r.Label} need at least ${r.minWidth} by ${r.minHeight}.`;
  if (Math.abs(d.width / d.height - r.ratio) > r.ratio * 0.02) return `This image is ${d.width} by ${d.height} px. ${r.Label} need to be ${r.shape}.`;
  return null;
}

/**
 * After publishing: uploads the chosen pictures and sets them as the branding. Resolves to the
 * kinds that didn't make it (the community exists either way).
 */
export async function uploadPictures(communityId, pictures) {
  const kinds = ['logo', 'cover'].filter((k) => pictures[k]?.file);
  if (!kinds.length) return [];
  const body = {};
  const failed = [];
  for (const k of kinds) {
    try {
      const stored = await uploadFile(communityId, pictures[k].file);
      body[k === 'logo' ? 'logoFileId' : 'coverFileId'] = stored.id;
    } catch {
      failed.push(k);
    }
  }
  if (Object.keys(body).length) {
    try {
      await api(`/communities/${encodeURIComponent(communityId)}/branding`, { method: 'PATCH', body });
    } catch {
      return kinds;
    }
  }
  return failed;
}
