// Discussion topics (Stage 4, decision S4-2): each community's admins keep up to 12. A post can
// carry one; members filter Discussions by topic. Deleting a topic leaves its posts untagged.
import { audit } from '../lib/audit.js';
import { access } from '../lib/community.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { UNIQUE_VIOLATION } from '../db/index.js';

const MAX_TOPICS = 12;
const name = (v) => {
  const n = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!n) throw badRequest('INVALID_INPUT', 'Give the topic a name.', { field: 'name' });
  return n;
};

export default async function topicRoutes(app, { ctx }) {
  const { db } = ctx;
  const list = async (id) => (await db.query(`select t.id, t.name, t.position,
      (select count(*)::int from posts p where p.topic_id = t.id and p.status = 'published' and p.deleted_at is null) as posts
      from topics t where t.community_id = $1 order by t.position, lower(t.name)`, [id])).rows;
  const admin = async (req, communityId) => {
    const a = await access(db, req, communityId);
    if (!a.canAdmin) throw forbidden('Only community admins manage topics.');
    return a;
  };
  const save = (fn) => fn().catch((err) => {
    if (err.code === UNIQUE_VIOLATION) throw conflict('DUPLICATE_TOPIC', 'This community already has a topic with that name.', { field: 'name' });
    throw err;
  });

  app.get('/communities/:id/topics', async (req) => {
    const a = await access(db, req, req.params.id);
    if (!a.canView) throw forbidden('Topics are for members.');
    return { topics: await list(a.community.id) };
  });

  app.post('/communities/:id/topics', { schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string' } } } } }, async (req, reply) => {
    const a = await admin(req, req.params.id);
    const n = name(req.body.name);
    const { rows: [{ count }] } = await db.query(`select count(*)::int as count from topics where community_id = $1`, [a.community.id]);
    if (count >= MAX_TOPICS) throw badRequest('TOO_MANY_TOPICS', `A community can have up to ${MAX_TOPICS} topics.`);
    const id = newId('top');
    await save(() => db.query(`insert into topics (id, community_id, name, position) values ($1, $2, $3, $4)`, [id, a.community.id, n, count]));
    await audit(db, { actorId: req.user.id, action: 'topic.create', targetType: 'topic', targetId: id, context: { community: a.community.id, name: n }, ip: req.ip });
    reply.status(201);
    return { topics: await list(a.community.id) };
  });

  app.patch('/topics/:id', { schema: { body: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, position: { type: 'integer' } } } } }, async (req) => {
    const { rows: [t] } = await db.query(`select * from topics where id = $1`, [req.params.id]);
    if (!t) throw notFound('That topic doesn’t exist.');
    await admin(req, t.community_id);
    await save(() => db.query(`update topics set name = $2, position = $3 where id = $1`,
      [t.id, 'name' in req.body ? name(req.body.name) : t.name, req.body.position ?? t.position]));
    return { topics: await list(t.community_id) };
  });

  app.delete('/topics/:id', async (req) => {
    const { rows: [t] } = await db.query(`select * from topics where id = $1`, [req.params.id]);
    if (!t) throw notFound('That topic doesn’t exist.');
    await admin(req, t.community_id);
    await db.query(`delete from topics where id = $1`, [t.id]);
    await audit(db, { actorId: req.user.id, action: 'topic.delete', targetType: 'topic', targetId: t.id, context: { name: t.name }, ip: req.ip });
    return { topics: await list(t.community_id) };
  });
}
