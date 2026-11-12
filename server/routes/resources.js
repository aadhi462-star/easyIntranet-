// Files and Resources (redesign Stage 4). FIL-* cases are referenced where handled.
//
// Upload: POST /communities/:id/files with the raw bytes (application/octet-stream) and the file's
// name in `x-file-name`. Download: GET /files/:id, which checks the community's access rules on
// every request, so a copied link opens for nobody who couldn't open the community (FIL-05).
// Resources: a community library of files and links that belongs to the community, not to
// whoever added it (FIL-06).
import { audit } from '../lib/audit.js';
import { access, requireSection, sectionOn } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { MAX_FILE_BYTES, publicFile, storeFile } from '../lib/files.js';
import { idempotent } from '../lib/session.js';
import { pickCategory } from '../lib/categories.js';

const SORTS = { newest: 'r.created_at desc', oldest: 'r.created_at asc', name: 'lower(r.title) asc' };
const isHttp = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };

/** Who may add to a community's library: admins, or members when the community allows it. */
const canAdd = (a) => a.canAdmin || (a.canParticipate && !!a.community.settings?.membersAddResources);

export default async function resourceRoutes(app, { ctx }) {
  const { db } = ctx;

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_FILE_BYTES + 1 }, (req, body, done) => done(null, body));

  // Raw upload. The size limit is checked by the parser (413) and again here; the type is
  // decided from the bytes after the whole file has arrived (FIL-01, FIL-10). A failed or
  // interrupted upload stores nothing; a retry with the same Idempotency-Key returns the
  // first file instead of a duplicate (FIL-03).
  app.post('/communities/:id/files', { bodyLimit: MAX_FILE_BYTES + 1 }, async (req, reply) => {
    const a = await access(db, req, req.params.id);
    if (!a.canParticipate) throw forbidden('Only members who can post here can upload files.');
    if (!Buffer.isBuffer(req.body)) throw badRequest('INVALID_INPUT', 'Send the file’s bytes as application/octet-stream.');
    let name = '';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] ?? '')); } catch { name = ''; }
    return idempotent(db, req, reply, async () => {
      const file = await storeFile(db, { communityId: a.community.id, userId: req.user.id, name, buf: req.body });
      reply.status(201);
      return { file };
    });
  });

  // Being able to view the community isn't enough: a file is readable by whoever can see what
  // it's attached to (H-S9). The uploader can always read it, and so can Administrative Mode.
  //  - library resource, community logo or cover: anyone who can view the community
  //  - post attachment: the post's own rule (published; the author; moderators for pending/removed)
  //  - lesson file: enrolled learners (while members) and the course's staff, as GET /lessons/:id
  //  - assignment submission: the learner and the course's graders
  // A file attached nowhere yet (a draft upload) is the uploader's alone.
  async function canRead(req, a, fileId) {
    if (a.adminMode) return true;
    const uid = req.user.id;
    const { rows: [r] } = await db.query(
      `select f.uploaded_by = $2 as mine,
              exists (select 1 from resources x where x.file_id = f.id and x.deleted_at is null)
                or exists (select 1 from communities c where c.logo_file_id = f.id or c.cover_file_id = f.id) as shared,
              exists (select 1 from post_attachments pa join posts p on p.id = pa.post_id where pa.file_id = f.id and p.deleted_at is null
                and (p.status = 'published' or p.author_id = $2 or ($3 and p.status in ('pending', 'removed')))) as via_post,
              exists (select 1 from lessons l join courses co on co.id = l.course_id where f.id = any(l.file_ids)
                and ($4 or exists (select 1 from course_instructors i where i.course_id = co.id and i.user_id = $2 and $5)
                  or ($6 and exists (select 1 from enrollments e where e.course_id = co.id and e.user_id = $2 and e.status = 'active')))) as via_lesson,
              exists (select 1 from submissions s where f.id = any(s.file_ids)
                and (s.user_id = $2 or $4 or exists (select 1 from course_instructors i where i.course_id = s.course_id and i.user_id = $2 and $5))) as via_submission
         from files f where f.id = $1`, [fileId, uid, a.canModerate, a.canAdmin, a.state === 'active', a.member]);
    return !!r && (r.mine || r.shared || r.via_post || r.via_lesson || r.via_submission);
  }

  // Download. Always as an attachment with a locked-down content policy, so a file never runs
  // as a page on this site; images still show in <img> tags.
  app.get('/files/:id', async (req, reply) => {
    const { rows: [meta] } = await db.query(`select id, community_id, name, mime, size, deleted_at from files where id = $1`, [req.params.id]);
    if (!meta || meta.deleted_at) throw notFound('That file isn’t available any more.');
    const a = await access(db, req, meta.community_id);
    if (!a.canView || !(await canRead(req, a, meta.id))) throw notFound('That file isn’t available any more.');
    // Read the bytes in the same step that re-checks deletion (FIL-07).
    const { rows: [f] } = await db.query(`select data from files where id = $1 and deleted_at is null`, [meta.id]);
    if (!f) throw notFound('That file isn’t available any more.');
    const inline = req.query.inline === '1' && meta.mime.startsWith('image/');
    reply.header('content-type', meta.mime)
      .header('content-length', meta.size)
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, max-age=300');
    return reply.send(f.data);
  });

  // The library. Search by title or description, filter by category, sort.
  app.get('/communities/:id/resources', async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canView) throw forbidden('Resources are for members.');
    requireSection(a, 'resources');
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80).replace(/[\\%_]/g, (c) => `\\${c}`);
    const category = req.query.category ? String(req.query.category).slice(0, 40) : null;
    const sort = SORTS[req.query.sort] ?? SORTS.newest;
    const { rows } = await db.query(
      `select r.*, u.name as added_by_name, u.status as added_by_status, f.name as file_name, f.mime, f.kind as file_kind, f.size
         from resources r left join users u on u.id = r.added_by left join files f on f.id = r.file_id
        where r.community_id = $1 and r.deleted_at is null
          and ($2 = '' or lower(r.title || ' ' || coalesce(r.description, '')) like '%' || $2 || '%')
          and ($3::text is null or r.category = $3)
        order by ${sort}, r.id limit 200`, [a.community.id, q, category]);
    const cats = await db.query(`select distinct category from resources where community_id = $1 and deleted_at is null and category is not null order by 1`, [a.community.id]);
    return {
      resources: rows.map((r) => publicResource(r, req.user.id, a)),
      categories: cats.rows.map((c) => c.category),
      // The community's own list (F13), for the add and edit forms; empty means free text.
      categoryOptions: Array.isArray(a.community.settings?.resourceCategories) ? a.community.settings.resourceCategories : [],
      canAdd: canAdd(a) && sectionOn(a.community, 'resources'),
    };
  });

  const body = {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' }, description: { type: ['string', 'null'] }, category: { type: ['string', 'null'] },
      url: { type: 'string' }, fileId: { type: 'string' }, version: { type: 'integer' },
    },
  };

  app.post('/communities/:id/resources', { schema: { body } }, async (req, reply) => {
    const a = await access(db, req, req.params.id);
    if (!canAdd(a)) throw forbidden('Only admins add resources here.');
    requireSection(a, 'resources', { write: true });
    const v = await clean(db, req.body, a.community, req.user.id, { creating: true });
    return idempotent(db, req, reply, async () => {
      const id = newId('res');
      await db.query(`insert into resources (id, community_id, kind, title, description, category, url, file_id, added_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, a.community.id, v.fileId ? 'file' : 'link', v.title, v.description, v.category, v.url, v.fileId, req.user.id]);
      await audit(db, { actorId: req.user.id, action: 'resource.create', targetType: 'resource', targetId: id, context: { community: a.community.id }, ip: req.ip });
      reply.status(201);
      return { resource: await loadOne(db, id, req.user.id, a) };
    });
  });

  // Edit or replace. Version-checked, so two people editing can't overwrite each other. A
  // replaced file keeps the resource's id and link; the old file stops downloading (FIL-09).
  app.patch('/resources/:id', { schema: { body: { ...body, required: ['version'] } } }, async (req) => {
    const { r, a } = await own(db, req, { write: true });
    const v = await clean(db, req.body, a.community, req.user.id, { kind: r.kind, previous: r.category });
    const { rows } = await db.query(
      `update resources set title = coalesce($3, title), description = case when $4::boolean then $5 else description end,
              category = case when $6::boolean then $7 else category end, url = coalesce($8, url), file_id = coalesce($9, file_id),
              version = version + 1, updated_at = now()
        where id = $1 and version = $2 and deleted_at is null returning id`,
      [r.id, req.body.version, v.title, 'description' in req.body, v.description, 'category' in req.body, v.category, v.url, v.fileId]);
    if (!rows.length) throw conflict('STALE_VERSION', 'Someone else changed this resource. Reload to see the latest.');
    if (v.fileId && r.file_id && v.fileId !== r.file_id) await db.query(`update files set deleted_at = now() where id = $1`, [r.file_id]);
    await audit(db, { actorId: req.user.id, action: v.fileId ? 'resource.replace' : 'resource.update', targetType: 'resource', targetId: r.id, ip: req.ip });
    return { resource: await loadOne(db, r.id, req.user.id, a) };
  });

  app.delete('/resources/:id', async (req) => {
    const { r } = await own(db, req, { removing: true });
    await db.tx(async (t) => {
      await t.query(`update resources set deleted_at = now() where id = $1`, [r.id]);
      if (r.file_id) await t.query(`update files set deleted_at = now() where id = $1`, [r.file_id]);
    });
    await audit(db, { actorId: req.user.id, action: 'resource.delete', targetType: 'resource', targetId: r.id, ip: req.ip });
    return { ok: true };
  });
}

/**
 * The resource and the caller's rights: the person who added it, or the community's admins.
 * With Resources switched off, only staff reach it, and they can delete but not edit (`write`);
 * the person who added it can still delete it (`removing`).
 */
async function own(db, req, { write = false, removing = false } = {}) {
  const { rows: [r] } = await db.query(`select * from resources where id = $1 and deleted_at is null`, [req.params.id]);
  if (!r) throw notFound('That resource doesn’t exist.');
  const a = await access(db, req, r.community_id);
  if (!a.canView) throw notFound('That resource doesn’t exist.');
  if (!(removing && r.added_by === req.user.id)) requireSection(a, 'resources', { write });
  if (!(a.canAdmin || (r.added_by === req.user.id && a.canParticipate))) throw forbidden('Only the person who added this, or an admin, can change it.');
  return { r, a };
}

async function clean(db, b, community, userId, { creating = false, kind, previous = null } = {}) {
  const communityId = community.id;
  const out = {};
  if (creating || 'title' in b) {
    out.title = String(b.title ?? '').trim().slice(0, 200);
    if (!out.title) throw badRequest('INVALID_INPUT', 'Give the resource a title.', { field: 'title' });
  }
  out.description = b.description == null ? null : String(b.description).trim().slice(0, 1000) || null;
  // F13: with a list of resource categories, a category is one of them or Other (an edit may
  // keep an older value unchanged); without a list it's free text, as before.
  const list = community.settings?.resourceCategories;
  out.category = Array.isArray(list) && list.length
    ? pickCategory(b.category, list, { previous, other: true, label: 'resource category' })
    : (b.category == null ? null : String(b.category).trim().slice(0, 40) || null);
  if (creating && !!b.url === !!b.fileId) throw badRequest('INVALID_INPUT', 'Add either a link or a file.');
  if (b.url != null) {
    if (kind === 'file') throw badRequest('INVALID_INPUT', 'This resource is a file; replace the file instead.');
    out.url = String(b.url).trim();
    if (!isHttp(out.url) || out.url.length > 2000) throw badRequest('INVALID_URL', 'Use a link that starts with http:// or https://.', { field: 'url' });
  }
  if (b.fileId != null) {
    if (kind === 'link') throw badRequest('INVALID_INPUT', 'This resource is a link; edit the link instead.');
    // Only a file this person uploaded to this community, not yet used anywhere.
    const { rows: [f] } = await db.query(`select id from files f where f.id = $1 and f.community_id = $2 and f.uploaded_by = $3 and f.deleted_at is null
        and not exists (select 1 from resources r where r.file_id = f.id) and not exists (select 1 from post_attachments p where p.file_id = f.id)
        and not exists (select 1 from communities co where co.logo_file_id = f.id or co.cover_file_id = f.id)`, [b.fileId, communityId, userId]);
    if (!f) throw badRequest('INVALID_FILE', 'That file isn’t available. Upload it again.');
    out.fileId = f.id;
  }
  return out;
}

async function loadOne(db, id, uid, a) {
  const { rows: [r] } = await db.query(
    `select r.*, u.name as added_by_name, u.status as added_by_status, f.name as file_name, f.mime, f.kind as file_kind, f.size
       from resources r left join users u on u.id = r.added_by left join files f on f.id = r.file_id where r.id = $1`, [id]);
  return publicResource(r, uid, a);
}

function publicResource(r, uid, a) {
  const former = !r.added_by || r.added_by_status === 'deleted';
  return {
    id: r.id, kind: r.kind, title: r.title, description: r.description, category: r.category, url: r.kind === 'link' ? r.url : null,
    file: r.kind === 'file' ? publicFile({ id: r.file_id, name: r.file_name, mime: r.mime, kind: r.file_kind, size: r.size }) : null,
    addedBy: former ? { id: null, name: 'Former member' } : { id: r.added_by, name: r.added_by_name },
    createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
    canEdit: a.canAdmin || (r.added_by === uid && a.canParticipate),
  };
}
