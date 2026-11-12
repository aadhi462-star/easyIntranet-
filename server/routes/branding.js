// Community branding (v2 workstream E, PROPOSAL_V2 §3.2 and §7): a logo, a cover and an accent
// per community. COM-04 and visibility (VIS-*) cases are referenced where handled.
//
// Owners and Admins upload the picture with the community's file store (POST
// /communities/:id/files) and then choose it here, so a failed or refused upload never changes
// what the community shows (COM-04). Pictures are served with the same visibility as the
// community's public card: Public and Private ones to anyone who can see the card, signed-out
// visitors included; Closed ones only to members; suspended ones only to their own staff;
// deleted ones to nobody (all decided by access() for signed-in people).
import { audit } from '../lib/audit.js';
import { access, ACCENTS, publicCommunity, resolveCommunityId } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { can } from '../lib/permissions.js';

const KINDS = { logo: 'logo_file_id', cover: 'cover_file_id' };

export default async function brandingRoutes(app, { ctx }) {
  const { db } = ctx;

  // Choose the logo, cover and accent. null clears a picture (the lettered tile and the accent
  // band show instead). Only images the caller uploaded to this community's own store and hasn't
  // used anywhere else (a resource, a post, a lesson or a submission), so nobody's file is shown
  // to visitors without them choosing it, and deleting those elsewhere can't take the logo with
  // them (resources and posts refuse the logo and cover in turn). Only the fields sent change,
  // so two admins saving different fields at once keep both (SET-03); a save that changes
  // nothing leaves the version alone and writes no audit row.
  app.patch('/communities/:id/branding', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      logoFileId: { type: ['string', 'null'] }, coverFileId: { type: ['string', 'null'] }, accent: { type: 'string' } } } },
  }, async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canAdmin) throw forbidden('Only the community’s Owner and Admins can change its branding.');
    const c = a.community;
    if (c.status !== 'active') throw conflict(c.status.toUpperCase(), `This community is ${c.status}, so its branding can’t change.`);
    const b = req.body;
    if ('accent' in b && !ACCENTS.includes(b.accent)) throw badRequest('INVALID_ACCENT', `Choose one of the community colours: ${ACCENTS.join(', ')}.`, { field: 'accent' });
    for (const [field, label] of [['logoFileId', 'logo'], ['coverFileId', 'cover']]) {
      if (b[field] == null || b[field] === c[KINDS[label]]) continue;
      const { rows: [f] } = await db.query(`select id, kind from files f where f.id = $1 and f.community_id = $2 and f.uploaded_by = $3 and f.deleted_at is null
          and not exists (select 1 from resources r where r.file_id = f.id) and not exists (select 1 from post_attachments p where p.file_id = f.id)
          and not exists (select 1 from lessons l where f.id = any(l.file_ids)) and not exists (select 1 from submissions s where f.id = any(s.file_ids))`, [b[field], c.id, req.user.id]);
      if (!f) throw badRequest('INVALID_FILE', `That ${label} isn’t available. Upload it again.`, { field });
      if (f.kind !== 'image') throw badRequest('NOT_AN_IMAGE', `The ${label} must be an image: PNG, JPEG, GIF or WebP.`, { field });
    }
    const changed = {};
    if ('logoFileId' in b && b.logoFileId !== c.logo_file_id) changed.logo = { from: c.logo_file_id, to: b.logoFileId };
    if ('coverFileId' in b && b.coverFileId !== c.cover_file_id) changed.cover = { from: c.cover_file_id, to: b.coverFileId };
    if ('accent' in b && b.accent !== c.accent) changed.accent = { from: c.accent, to: b.accent };
    if (!Object.keys(changed).length) return { community: publicCommunity(c, { version: c.version }) };
    const { rows: [row] } = await db.query(`update communities set
        logo_file_id = case when $2::boolean then $3 else logo_file_id end, cover_file_id = case when $4::boolean then $5 else cover_file_id end,
        accent = coalesce($6, accent), version = version + 1 where id = $1 returning *`,
      [c.id, !!changed.logo, b.logoFileId ?? null, !!changed.cover, b.coverFileId ?? null, changed.accent ? b.accent : null]);
    await audit(db, { actorId: req.user.id, action: 'community.branding', targetType: 'community', targetId: c.id, context: { ...changed, adminMode: a.adminMode }, ip: req.ip });
    return { community: publicCommunity(row, { version: row.version }) };
  });

  // The pictures. Signed-out visitors see those of active Public and Private communities (the
  // cards on the landing page and public Explore); everyone else goes through access(), which
  // hides Closed communities from non-members (VIS-04) and suspended ones from all but their staff.
  // Platform staff who manage communities or read platform analytics see every card in Platform
  // Admin, so they get the pictures of any community that isn't deleted without admin mode (an
  // <img> can't send it): a picture is card metadata, not content.
  for (const [kind, column] of Object.entries(KINDS)) {
    app.get(`/communities/:id/${kind}`, async (req, reply) => {
      const id = await resolveCommunityId(db, req.params.id);
      let c;
      if (req.user && (can(req.user, 'communities.manage') || can(req.user, 'analytics.platform'))) {
        ({ rows: [c] } = await db.query(`select * from communities where id = $1 and status <> 'deleted'`, [id]));
      } else if (req.user) c = (await access(db, req, id, { audited: false })).community;
      else {
        ({ rows: [c] } = await db.query(`select * from communities where id = $1 and status = 'active' and visibility in ('public', 'private') and merged_into is null`, [id]));
      }
      const missing = `This community has no ${kind}.`;
      if (!c?.[column]) throw notFound(missing);
      const { rows: [f] } = await db.query(`select mime, size, data from files where id = $1 and community_id = $2 and kind = 'image' and deleted_at is null`, [c[column], c.id]);
      if (!f) throw notFound(missing);
      // Short and private: a community that turns Closed stops showing its picture within a minute.
      reply.header('content-type', f.mime)
        .header('content-length', f.size)
        .header('content-disposition', `inline; filename="${kind}"`)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('cache-control', 'private, max-age=60');
      return reply.send(f.data);
    });
  }
}
