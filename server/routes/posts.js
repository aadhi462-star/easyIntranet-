// Posts, comments, reactions, polls and Mandatory Read inside communities, plus the home feed.
// Every route re-checks community access on the server (VIS-02, CNT-*).
import { audit } from '../lib/audit.js';
import { access, brandingUrls, requireSection, requireView, sectionOn } from '../lib/community.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { idempotent } from '../lib/session.js';
import { notBlockedSql } from '../lib/relations.js';
import { notify } from '../lib/notify.js';

const clean = (s, max, field) => {
  const t = String(s ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  if (!t) throw badRequest('REQUIRED', 'Write something first.', { field });
  if (t.length > max) throw badRequest('TOO_LONG', `That’s too long (at most ${max} characters).`, { field });
  return t;
};

export default async function postRoutes(app, { ctx }) {
  const { db } = ctx;
  const signedIn = (req) => { if (!req.user) throw unauthorized(); return req.user.id; };

  // Loads a post and the caller's access to its community. Deleted posts and posts the caller
  // may not see are "not found" (no hint that they exist). `change` marks a staff change
  // (approving, pinning) that waits while Discussions is off. `removing` names the author of
  // what's being deleted ('post' for the post itself), so authors can still delete their own.
  async function loadPost(req, id, { forWrite = false, change = false, removing = null } = {}) {
    signedIn(req);
    const { rows: [p] } = await db.query(`select * from posts where id = $1 and deleted_at is null`, [id]);
    if (!p) throw notFound('That post doesn’t exist or was deleted.');
    const a = await access(db, req, p.community_id);
    requireView(a);
    const own = p.author_id === req.user.id;
    // Discussions switched off: gone for members; staff can still read, remove and delete (v2 E).
    if ((removing === 'post' ? p.author_id : removing) !== req.user.id) requireSection(a, 'discussions', { write: forWrite || change });
    const visible = p.status === 'published' || own || (p.status === 'pending' && a.canModerate) || (p.status === 'removed' && a.canModerate);
    if (!visible) throw notFound('That post doesn’t exist or was deleted.');
    if (forWrite && !a.canComment) throw forbidden('You can’t take part in this community right now.', 'READ_ONLY');
    return { p, a, own };
  }

  // Shapes posts for one viewer, with counts and the viewer's own reaction/vote/ack.
  async function present(req, posts, accessById) {
    if (!posts.length) return [];
    const ids = posts.map((p) => p.id);
    const uid = req.user.id;
    const [authors, reacts, opts, votes, acks, counts, communities, topics, files] = await Promise.all([
      db.query(`select id, name, status from users where id = any($1)`, [[...new Set(posts.map((p) => p.author_id))]]),
      db.query(`select post_id, kind, count(*)::int as n, bool_or(user_id = $2) as mine from reactions where post_id = any($1) group by post_id, kind`, [ids, uid]),
      db.query(`select o.*, (select count(*)::int from poll_votes v where v.option_id = o.id) as votes from poll_options o where o.post_id = any($1) order by o.position`, [ids]),
      db.query(`select post_id, option_id from poll_votes where post_id = any($1) and user_id = $2`, [ids, uid]),
      db.query(`select post_id, count(*)::int as n, bool_or(user_id = $2) as mine from post_acks where post_id = any($1) group by post_id`, [ids, uid]),
      db.query(`select post_id, count(*)::int as n from comments where post_id = any($1) and deleted_at is null group by post_id`, [ids]),
      db.query(`select id, slug, name, emoji, accent, visibility, status, logo_file_id, cover_file_id from communities where id = any($1)`, [[...new Set(posts.map((p) => p.community_id))]]),
      db.query(`select id, name from topics where id = any($1)`, [[...new Set(posts.map((p) => p.topic_id).filter(Boolean))]]),
      db.query(`select a.post_id, f.id, f.name, f.mime, f.kind, f.size from post_attachments a join files f on f.id = a.file_id
         where a.post_id = any($1) and f.deleted_at is null order by a.post_id, a.position`, [ids]),
    ]);
    const by = (rows, key) => rows.reduce((m, r) => (m[r[key]] ??= []).push(r) && m, {});
    const T = Object.fromEntries(topics.rows.map((x) => [x.id, x]));
    const F = by(files.rows, 'post_id');
    const author = Object.fromEntries(authors.rows.map((u) => [u.id, u]));
    const community = Object.fromEntries(communities.rows.map((c) => [c.id, c]));
    const R = by(reacts.rows, 'post_id'); const O = by(opts.rows, 'post_id');
    const V = Object.fromEntries(votes.rows.map((v) => [v.post_id, v.option_id]));
    const A = Object.fromEntries(acks.rows.map((x) => [x.post_id, x]));
    const C = Object.fromEntries(counts.rows.map((x) => [x.post_id, x.n]));
    return posts.map((p) => {
      const a = accessById[p.community_id];
      const au = author[p.author_id];
      const reactions = { like: 0, liked: false, moods: { happy: 0, neutral: 0, sad: 0 }, myMood: null };
      for (const r of R[p.id] || []) {
        if (r.kind === 'like') { reactions.like = r.n; reactions.liked = r.mine; } else { reactions.moods[r.kind] = r.n; if (r.mine) reactions.myMood = r.kind; }
      }
      return {
        id: p.id, communityId: p.community_id, community: community[p.community_id] ? { id: p.community_id, slug: community[p.community_id].slug, name: community[p.community_id].name, emoji: community[p.community_id].emoji, accent: community[p.community_id].accent, ...brandingUrls(community[p.community_id]) } : null,
        author: au?.status === 'deleted' ? { id: p.author_id, name: 'Deleted member', deleted: true } : { id: p.author_id, name: au?.name },
        type: p.type, body: p.body, status: p.status, pinned: p.pinned, mentions: p.mentions,
        createdAt: p.published_at ?? p.created_at, publishAt: p.publish_at, editedAt: p.edited_at, version: p.version,
        removedReason: a?.canModerate ? p.removed_reason : undefined,
        poll: p.type === 'poll' ? { options: (O[p.id] || []).map((o) => ({ id: o.id, label: o.label, votes: o.votes })), myVote: V[p.id] ?? null } : null,
        mandatory: p.mandatory ? { ...p.mandatory, acked: !!A[p.id]?.mine, ackCount: a?.canModerate || p.author_id === req.user.id ? A[p.id]?.n ?? 0 : undefined } : null,
        reactions, commentCount: C[p.id] ?? 0,
        topic: p.topic_id && T[p.topic_id] ? { id: p.topic_id, name: T[p.topic_id].name } : null,
        attachments: (F[p.id] || []).map((f) => ({ id: f.id, name: f.name, mime: f.mime, kind: f.kind, size: f.size })),
        can: { edit: p.author_id === req.user.id && p.status !== 'removed', delete: p.author_id === req.user.id || !!a?.canModerate, moderate: !!a?.canModerate, pin: !!a?.canAdmin },
      };
    });
  }

  // When a post goes live: tell the people it mentions, and for an announcement, every member.
  async function announce(req, p) {
    if (p.status !== 'published') return;
    const base = { actorId: p.author_id, communityId: p.community_id, targetType: 'post', targetId: p.id };
    if (p.mentions?.length) await notify(ctx, req, { ...base, to: p.mentions, type: 'mention', dedupe: `post:${p.id}:mention` });
    if (p.type === 'announcement') {
      const { rows } = await db.query(`select user_id from memberships where community_id = $1 and state in ('active', 'restricted')`, [p.community_id]);
      await notify(ctx, req, { ...base, to: rows.map((r) => r.user_id).filter((u) => !p.mentions?.includes(u)), type: 'announcement', dedupe: `post:${p.id}:announcement` });
    }
  }

  // A post's topic must be one of its community's (S4-2).
  async function checkTopic(communityId, topicId) {
    if (!topicId) return null;
    const { rows } = await db.query(`select id from topics where id = $1 and community_id = $2`, [topicId, communityId]);
    if (!rows.length) throw badRequest('INVALID_TOPIC', 'That topic isn’t one of this community’s.', { field: 'topicId' });
    return topicId;
  }

  // Attachments (S4-3): images and PDFs, up to 4, that the author uploaded to this community and
  // hasn't used anywhere else (CNT-12).
  async function checkAttachments(communityId, userId, ids = []) {
    const list = [...new Set(ids)];
    if (!list.length) return [];
    if (list.length > 4) throw badRequest('TOO_MANY_ATTACHMENTS', 'A post can have up to 4 attachments.', { field: 'attachments' });
    const { rows } = await db.query(`select id, kind from files f where f.id = any($1) and f.community_id = $2 and f.uploaded_by = $3 and f.deleted_at is null
        and not exists (select 1 from post_attachments pa where pa.file_id = f.id) and not exists (select 1 from resources r where r.file_id = f.id)
        and not exists (select 1 from communities co where co.logo_file_id = f.id or co.cover_file_id = f.id)`, [list, communityId, userId]);
    if (rows.length !== list.length) throw badRequest('INVALID_FILE', 'One of the attachments isn’t available. Upload it again.', { field: 'attachments' });
    if (rows.some((f) => !['image', 'pdf'].includes(f.kind))) throw badRequest('ATTACHMENT_TYPE', 'Posts can carry images and PDFs. Share other files in Resources.', { field: 'attachments' });
    return list;
  }

  // ---- Feed ---------------------------------------------------------------------------------
  // Home: posts from communities you're in. One community: that community (if you may view it).
  // Newest first with a cursor (SYS-01); pinned posts lead a community feed.
  app.get('/feed', async (req) => {
    const uid = signedIn(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const view = String(req.query.view ?? 'all');
    // Inside one community (Stage 4 Discussions): a topic, words in the post, most active first.
    const topic = req.query.community && req.query.topic ? String(req.query.topic) : null;
    const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 80).replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const active = !!req.query.community && req.query.sort === 'active';
    let communityIds; const accessById = {};
    if (req.query.community) {
      const a = requireSection(requireView(await access(db, req, String(req.query.community))), 'discussions');
      communityIds = [a.community.id]; accessById[a.community.id] = a;
    } else {
      const { rows } = await db.query(`select community_id from memberships m join communities c on c.id = m.community_id
        where m.user_id = $1 and m.state in ('active', 'restricted') and c.status not in ('suspended', 'deleted') and c.merged_into is null`, [uid]);
      for (const { community_id: id } of rows) accessById[id] = await access(db, req, id, { audited: false });
      // Home leaves out communities whose Discussions are switched off.
      communityIds = rows.map((r) => r.community_id).filter((id) => sectionOn(accessById[id].community, 'discussions'));
    }
    const moderated = communityIds.filter((id) => accessById[id]?.canModerate);
    const { rows } = await db.query(
      `select p.* from posts p
        where p.community_id = any($1) and p.deleted_at is null
          and (p.status = 'published'
               or (p.author_id = $2 and p.status in ('draft', 'scheduled', 'pending'))
               or (p.status = 'pending' and p.community_id = any($3)))
          and ($4::timestamptz is null or coalesce(p.published_at, p.created_at) < $4)
          and ($5 = 'all' or ($5 = 'announcements' and p.type = 'announcement') or ($5 = 'questions' and p.type = 'question')
               or ($5 = 'mine' and p.author_id = $2) or ($5 = 'drafts' and p.author_id = $2 and p.status = 'draft')
               or ($5 = 'scheduled' and p.author_id = $2 and p.status = 'scheduled') or ($5 = 'mandatory' and p.mandatory is not null)
               or ($5 = 'pending' and p.status = 'pending') or ($5 = 'polls' and p.type = 'poll'))
          and ($7::text is null or p.topic_id = $7)
          and ($8 = '' or lower(p.body) like '%' || $8 || '%')
          and ${notBlockedSql('p.author_id', '$2')}
        order by ${req.query.community ? 'p.pinned desc,' : ''} ${active ? `greatest(coalesce(p.published_at, p.created_at),
          coalesce((select max(k.created_at) from comments k where k.post_id = p.id and k.deleted_at is null), p.created_at)) desc,` : ''}
          coalesce(p.published_at, p.created_at) desc, p.id desc
        limit $6`, [communityIds, uid, moderated, active ? null : before, view, active ? 50 : limit + 1, topic, q]);
    const page = active ? rows : rows.slice(0, limit);
    return {
      posts: await present(req, page, accessById),
      // "Most active" is one page of the 50 liveliest; newest-first pages with a cursor.
      nextBefore: !active && rows.length > limit ? (page.at(-1).published_at ?? page.at(-1).created_at) : null,
    };
  });

  app.get('/posts/:id', async (req) => {
    const { p, a } = await loadPost(req, req.params.id);
    const [post] = await present(req, [p], { [p.community_id]: a });
    const { rows } = await db.query(
      `select c.id, c.parent_id, c.body, c.created_at, c.edited_at, c.deleted_at, c.author_id, u.name, u.status
         from comments c join users u on u.id = c.author_id where c.post_id = $1 and ${notBlockedSql('c.author_id', '$2')} order by c.created_at`, [p.id, req.user.id]);
    // Deleted comments stay as placeholders so replies keep their thread (CNT-05/07).
    post.comments = rows.map((c) => (c.deleted_at
      ? { id: c.id, parentId: c.parent_id, deleted: true, createdAt: c.created_at }
      : { id: c.id, parentId: c.parent_id, body: c.body, createdAt: c.created_at, editedAt: c.edited_at,
        author: c.status === 'deleted' ? { id: c.author_id, name: 'Deleted member', deleted: true } : { id: c.author_id, name: c.name },
        can: { delete: c.author_id === req.user.id || a.canModerate } }));
    return { post };
  });

  // ---- Create / edit / publish ----------------------------------------------------------------
  app.post('/communities/:id/posts', {
    schema: { body: { type: 'object', required: ['body'], additionalProperties: false, properties: {
      type: { type: 'string', enum: ['post', 'announcement', 'question', 'poll'] }, body: { type: 'string' },
      status: { type: 'string', enum: ['published', 'draft', 'scheduled'] }, publishAt: { type: ['string', 'null'] },
      mentions: { type: 'array', items: { type: 'string' }, maxItems: 50 }, pinned: { type: 'boolean' },
      poll: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' } } } },
      mandatory: { type: ['object', 'null'], additionalProperties: false, properties: { message: { type: 'string' }, button: { type: 'string' }, deadline: { type: ['string', 'null'] } } },
      topicId: { type: ['string', 'null'] }, attachments: { type: 'array', items: { type: 'string' }, maxItems: 20 } } } },
  }, async (req, reply) => idempotent(db, req, reply, async () => {
    const a = await access(db, req, req.params.id);
    if (!a.canParticipate) throw forbidden(a.state === 'restricted' ? 'You’ve been restricted from posting here.' : 'Join this community to post in it.', 'CANNOT_POST');
    requireSection(a, 'discussions', { write: true });
    const b = req.body;
    const type = b.type ?? 'post';
    if ((type === 'announcement' || b.pinned || b.mandatory) && !a.canAdmin) throw forbidden('Only community admins can post announcements, pin posts or ask for a Mandatory Read.');
    const body = clean(b.body, 5000, 'body');
    let options = [];
    if (type === 'poll') {
      options = (b.poll?.options ?? []).map((o) => String(o).trim()).filter(Boolean);
      if (options.length < 2 || options.length > 10) throw badRequest('INVALID_POLL', 'A poll needs between 2 and 10 options.', { field: 'poll' });
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw badRequest('INVALID_POLL', 'Each poll option must be different.', { field: 'poll' });
      if (options.some((o) => o.length > 120)) throw badRequest('INVALID_POLL', 'Poll options can be at most 120 characters.', { field: 'poll' });
    }
    let status = b.status ?? 'published';
    let publishAt = null;
    if (status === 'scheduled') {
      publishAt = new Date(b.publishAt ?? '');
      if (Number.isNaN(publishAt.getTime()) || publishAt <= new Date()) throw badRequest('INVALID_SCHEDULE', 'Pick a time in the future.', { field: 'publishAt' });
    }
    // Communities that review posts hold them for a moderator (moderators post directly).
    if (status === 'published' && a.community.settings?.requireApproval && !a.canModerate) status = 'pending';
    const mandatory = b.mandatory ? { message: clean(b.mandatory.message || 'I have read this post.', 200, 'mandatory'), button: clean(b.mandatory.button || 'Acknowledge', 40, 'mandatory'), deadline: b.mandatory.deadline || null } : null;
    const members = b.mentions?.length ? (await db.query(`select user_id from memberships where community_id = $1 and user_id = any($2) and state = 'active'`, [a.community.id, b.mentions])).rows.map((r) => r.user_id) : [];
    const topicId = await checkTopic(a.community.id, b.topicId);
    const fileIds = await checkAttachments(a.community.id, req.user.id, b.attachments);
    const id = newId('pst');
    await db.tx(async (t) => {
      await t.query(`insert into posts (id, community_id, author_id, type, body, status, publish_at, pinned, mentions, mandatory, published_at, topic_id)
        values ($1, $2, $3, $4, $5, $6::text, $7, $8, $9, $10, case when $6::text = 'published' then now() end, $11)`,
      [id, a.community.id, req.user.id, type, body, status, publishAt, !!b.pinned, members, mandatory ? JSON.stringify(mandatory) : null, topicId]);
      for (const [i, f] of fileIds.entries()) await t.query(`insert into post_attachments (post_id, file_id, position) values ($1, $2, $3)`, [id, f, i]);
      for (const [i, label] of options.entries()) await t.query(`insert into poll_options (id, post_id, label, position) values ($1, $2, $3, $4)`, [newId('opt'), id, label, i]);
    });
    await audit(db, { actorId: req.user.id, action: 'post.create', targetType: 'post', targetId: id, context: { communityId: a.community.id, type, status }, ip: req.ip });
    const { rows: [p] } = await db.query(`select * from posts where id = $1`, [id]);
    await announce(req, p);
    reply.status(201);
    return { post: (await present(req, [p], { [p.community_id]: a }))[0] };
  }));

  // Edit by the author only, from the latest version. A post a moderator removed can't be
  // brought back by a stale edit (CNT-03).
  app.patch('/posts/:id', {
    schema: { body: { type: 'object', required: ['version'], additionalProperties: false, properties: { version: { type: 'integer' }, body: { type: 'string' }, mentions: { type: 'array', items: { type: 'string' } }, topicId: { type: ['string', 'null'] } } } },
  }, async (req) => {
    const { p, a, own } = await loadPost(req, req.params.id, { forWrite: true });
    if (!own) throw forbidden('Only the author can edit this post.'); // CNT-09
    const body = 'body' in req.body ? clean(req.body.body, 5000, 'body') : p.body;
    const topicId = 'topicId' in req.body ? await checkTopic(p.community_id, req.body.topicId) : p.topic_id;
    const { rows } = await db.query(
      `update posts set body = $3, mentions = coalesce($4, mentions), topic_id = $5, edited_at = now(), version = version + 1
        where id = $1 and version = $2 and status <> 'removed' and deleted_at is null returning *`, [p.id, req.body.version, body, req.body.mentions ?? null, topicId]);
    if (!rows.length) {
      const now = (await db.query(`select status, deleted_at from posts where id = $1`, [p.id])).rows[0];
      if (now?.status === 'removed') throw conflict('REMOVED', 'A moderator removed this post, so it can’t be edited.');
      throw conflict('STALE_VERSION', 'This post changed since you opened it. Reload and edit again.');
    }
    await audit(db, { actorId: req.user.id, action: 'post.edit', targetType: 'post', targetId: p.id, ip: req.ip });
    return { post: (await present(req, rows, { [p.community_id]: a }))[0] };
  });

  // Draft / scheduled → live (or held for review). Repeating it is a clean no-op.
  app.post('/posts/:id/publish', async (req) => {
    const { p, a, own } = await loadPost(req, req.params.id, { forWrite: true });
    if (!own) throw forbidden();
    if (!a.canParticipate) throw forbidden('You can’t post in this community right now.', 'CANNOT_POST');
    const next = a.community.settings?.requireApproval && !a.canModerate ? 'pending' : 'published';
    const { rows } = await db.query(`update posts set status = $2, publish_at = null, published_at = case when $2 = 'published' then now() end, version = version + 1
      where id = $1 and status in ('draft', 'scheduled') returning *`, [p.id, next]);
    if (!rows.length) return { post: (await present(req, [p], { [p.community_id]: a }))[0] };
    await audit(db, { actorId: req.user.id, action: 'post.publish', targetType: 'post', targetId: p.id, context: { status: next }, ip: req.ip });
    await announce(req, rows[0]);
    return { post: (await present(req, rows, { [p.community_id]: a }))[0] };
  });

  // ---- Moderation -----------------------------------------------------------------------------
  app.post('/posts/:id/approve', async (req) => {
    const { p, a } = await loadPost(req, req.params.id, { change: true });
    if (!a.canModerate) throw forbidden();
    const { rows } = await db.query(`update posts set status = 'published', published_at = now(), version = version + 1 where id = $1 and status = 'pending' returning *`, [p.id]);
    if (!rows.length) throw conflict('NOT_PENDING', 'This post isn’t waiting for review any more.');
    await audit(db, { actorId: req.user.id, action: 'post.approve', targetType: 'post', targetId: p.id, context: { adminMode: a.adminMode }, ip: req.ip });
    await notify(ctx, req, { to: [p.author_id], type: 'post_approved', actorId: req.user.id, communityId: p.community_id, targetType: 'post', targetId: p.id, dedupe: `post:${p.id}:approved` });
    await announce(req, rows[0]);
    return { post: (await present(req, rows, { [p.community_id]: a }))[0] };
  });

  app.post('/posts/:id/remove', async (req) => {
    const { p, a } = await loadPost(req, req.params.id);
    if (!a.canModerate) throw forbidden();
    const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
    if (!reason) throw badRequest('REASON_REQUIRED', 'Give a reason for removing this post.');
    await db.query(`update posts set status = 'removed', removed_by = $2, removed_reason = $3, pinned = false, version = version + 1 where id = $1`, [p.id, req.user.id, reason]);
    await audit(db, { actorId: req.user.id, action: 'post.remove', targetType: 'post', targetId: p.id, context: { reason, adminMode: a.adminMode }, ip: req.ip });
    await notify(ctx, req, { to: [p.author_id], type: 'post_removed', actorId: req.user.id, communityId: p.community_id, targetType: 'post', targetId: p.id, dedupe: `post:${p.id}:removed` });
    return { ok: true };
  });

  app.post('/posts/:id/pin', { schema: { body: { type: 'object', required: ['pinned'], properties: { pinned: { type: 'boolean' } } } } }, async (req) => {
    const { p, a } = await loadPost(req, req.params.id, { change: true });
    if (!a.canAdmin) throw forbidden('Only community admins can pin posts.'); // CNT-14
    if (p.status !== 'published') throw conflict('NOT_PUBLISHED', 'Only published posts can be pinned.');
    await db.query(`update posts set pinned = $2 where id = $1`, [p.id, req.body.pinned]);
    await audit(db, { actorId: req.user.id, action: req.body.pinned ? 'post.pin' : 'post.unpin', targetType: 'post', targetId: p.id, ip: req.ip });
    return { ok: true };
  });

  // Author or moderator. Soft delete keeps comments for the record (CNT-05); the post simply
  // disappears for everyone.
  app.delete('/posts/:id', async (req) => {
    const { p, a, own } = await loadPost(req, req.params.id, { removing: 'post' });
    if (!own && !a.canModerate) throw forbidden('You can only delete your own posts.'); // CNT-09
    await db.query(`update posts set deleted_at = now(), pinned = false where id = $1 and deleted_at is null`, [p.id]);
    await audit(db, { actorId: req.user.id, action: 'post.delete', targetType: 'post', targetId: p.id, context: { byModerator: !own, adminMode: a.adminMode }, ip: req.ip });
    return { ok: true };
  });

  // ---- Interaction ----------------------------------------------------------------------------
  const livePost = (p) => { if (p.status !== 'published') throw conflict('NOT_PUBLISHED', 'You can only respond to published posts.'); };

  app.put('/posts/:id/reactions/:kind', async (req) => {
    const kind = req.params.kind;
    if (!['like', 'happy', 'neutral', 'sad'].includes(kind)) throw badRequest('INVALID_INPUT', 'Unknown reaction.');
    const { p, a } = await loadPost(req, req.params.id, { forWrite: true });
    livePost(p);
    await db.tx(async (t) => {
      // Choosing a mood replaces your previous mood; likes are separate (CNT-16).
      if (kind !== 'like') await t.query(`delete from reactions where post_id = $1 and user_id = $2 and kind <> 'like' and kind <> $3`, [p.id, req.user.id, kind]);
      await t.query(`insert into reactions (post_id, user_id, kind) values ($1, $2, $3) on conflict do nothing`, [p.id, req.user.id, kind]);
    });
    const { rows: [fresh] } = await db.query(`select * from posts where id = $1`, [p.id]);
    return { post: (await present(req, [fresh], { [p.community_id]: a }))[0] };
  });

  app.delete('/posts/:id/reactions/:kind', async (req) => {
    const { p, a } = await loadPost(req, req.params.id, { forWrite: true });
    await db.query(`delete from reactions where post_id = $1 and user_id = $2 and kind = $3`, [p.id, req.user.id, req.params.kind]);
    const { rows: [fresh] } = await db.query(`select * from posts where id = $1`, [p.id]);
    return { post: (await present(req, [fresh], { [p.community_id]: a }))[0] };
  });

  // One vote per member per poll; voting again moves your vote.
  app.put('/posts/:id/vote', { schema: { body: { type: 'object', required: ['optionId'], properties: { optionId: { type: 'string' } } } } }, async (req) => {
    const { p, a } = await loadPost(req, req.params.id, { forWrite: true });
    livePost(p);
    if (p.type !== 'poll') throw badRequest('NOT_A_POLL', 'This post isn’t a poll.');
    const opt = (await db.query(`select 1 from poll_options where id = $1 and post_id = $2`, [req.body.optionId, p.id])).rows.length;
    if (!opt) throw badRequest('INVALID_INPUT', 'That option isn’t part of this poll.');
    await db.query(`insert into poll_votes (post_id, user_id, option_id) values ($1, $2, $3)
      on conflict (post_id, user_id) do update set option_id = excluded.option_id, voted_at = now()`, [p.id, req.user.id, req.body.optionId]);
    const { rows: [fresh] } = await db.query(`select * from posts where id = $1`, [p.id]);
    return { post: (await present(req, [fresh], { [p.community_id]: a }))[0] };
  });

  app.post('/posts/:id/ack', async (req) => {
    const { p, a } = await loadPost(req, req.params.id, { forWrite: true });
    livePost(p);
    if (!p.mandatory) throw badRequest('NOT_MANDATORY', 'This post doesn’t ask for acknowledgement.');
    if (!a.member) throw forbidden('Only members of this community acknowledge its posts.');
    await db.query(`insert into post_acks (post_id, user_id) values ($1, $2) on conflict do nothing`, [p.id, req.user.id]);
    const { rows: [fresh] } = await db.query(`select * from posts where id = $1`, [p.id]);
    return { post: (await present(req, [fresh], { [p.community_id]: a }))[0] };
  });

  app.post('/posts/:id/comments', {
    schema: { body: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: { type: 'string' }, parentId: { type: ['string', 'null'] } } } },
  }, async (req, reply) => idempotent(db, req, reply, async () => {
    const { p } = await loadPost(req, req.params.id, { forWrite: true });
    livePost(p);
    const body = clean(req.body.body, 2000, 'body');
    if (req.body.parentId) {
      // Replying to a comment that was just deleted is refused rather than orphaned (CNT-07).
      const parent = (await db.query(`select deleted_at from comments where id = $1 and post_id = $2`, [req.body.parentId, p.id])).rows[0];
      if (!parent || parent.deleted_at) throw conflict('PARENT_GONE', 'That comment was deleted, so you can’t reply to it.');
    }
    const id = newId('cmt');
    await db.query(`insert into comments (id, post_id, author_id, parent_id, body) values ($1, $2, $3, $4, $5)`, [id, p.id, req.user.id, req.body.parentId ?? null, body]);
    const base = { actorId: req.user.id, communityId: p.community_id, targetType: 'post', targetId: p.id };
    await notify(ctx, req, { ...base, to: [p.author_id], type: 'reply', dedupe: `comment:${id}` });
    if (req.body.parentId) {
      const { rows: [parent] } = await db.query(`select author_id from comments where id = $1`, [req.body.parentId]);
      if (parent && parent.author_id !== p.author_id) await notify(ctx, req, { ...base, to: [parent.author_id], type: 'reply_comment', dedupe: `comment:${id}:parent` });
    }
    reply.status(201);
    return { comment: { id, parentId: req.body.parentId ?? null, body, createdAt: new Date().toISOString(), author: { id: req.user.id, name: req.user.name }, can: { delete: true } } };
  }));

  app.delete('/comments/:id', async (req) => {
    signedIn(req);
    const { rows: [c] } = await db.query(`select * from comments where id = $1 and deleted_at is null`, [req.params.id]);
    if (!c) throw notFound('That comment doesn’t exist.');
    const { a } = await loadPost(req, c.post_id, { removing: c.author_id });
    if (c.author_id !== req.user.id && !a.canModerate) throw forbidden('You can only delete your own comments.');
    await db.query(`update comments set deleted_at = now() where id = $1`, [c.id]);
    await audit(db, { actorId: req.user.id, action: 'comment.delete', targetType: 'comment', targetId: c.id, context: { postId: c.post_id, byModerator: c.author_id !== req.user.id }, ip: req.ip });
    return { ok: true };
  });
}

/** Publishes scheduled posts whose time has come. Idempotent: safe to run twice (SYS-04). */
export async function publishDuePosts(db) {
  const { rows } = await db.query(
    `update posts p set status = case when coalesce((c.settings->>'requireApproval')::boolean, false) then 'pending' else 'published' end,
            published_at = case when coalesce((c.settings->>'requireApproval')::boolean, false) then null else now() end, publish_at = null, version = p.version + 1
       from communities c
      where c.id = p.community_id and p.status = 'scheduled' and p.publish_at <= now() and p.deleted_at is null
      returning p.id, p.status`);
  return rows;
}
