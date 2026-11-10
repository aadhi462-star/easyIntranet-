// Connections and blocks (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
before(async () => {
  env = await setup();
  for (const id of ['ann', 'ben', 'cat', 'dan', 'eve']) {
    await makeUser(env.db, { id, email: `${id}@example.com`, name: id[0].toUpperCase() + id.slice(1), roles: id === 'eve' ? ['user_manager'] : [] });
    await env.db.query(`insert into profiles (user_id) values ($1)`, [id]);
    c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
  }
});
after(async () => { await env.close(); });

const rel = async (who, other) => (await c[who].get(`/api/connections/${other}`)).body.relation;

describe('requests', () => {
  test('MEM-01 pattern: double clicks and simultaneous requests leave one record', async () => {
    await Promise.all([c.ann.post('/api/connections/ben'), c.ann.post('/api/connections/ben'), c.ann.post('/api/connections/ben')]);
    const n = (await env.db.query(`select count(*)::int as n from connections`)).rows[0].n;
    assert.equal(n, 1);
    assert.equal((await rel('ann', 'ben')).connection, 'outgoing');
    assert.equal((await rel('ben', 'ann')).connection, 'incoming');
  });

  test('requesting someone who already asked you accepts their request', async () => {
    assert.equal((await c.ben.post('/api/connections/ann')).body.relation.connection, 'connected');
    assert.equal((await rel('ann', 'ben')).connection, 'connected');
  });

  test('only the person who received a request can accept or decline it; stale actions fail', async () => {
    await c.ann.post('/api/connections/cat');
    assert.equal((await c.ann.post('/api/connections/cat/accept')).status, 409, 'requester cannot accept their own');
    assert.equal((await c.cat.post('/api/connections/ann/decline')).status, 200);
    assert.equal((await rel('ann', 'cat')).connection, 'none');
    assert.equal((await c.cat.post('/api/connections/ann/accept')).status, 409, 'nothing left to accept');
  });

  test('cancel and remove', async () => {
    await c.dan.post('/api/connections/cat');
    assert.equal((await c.dan.delete('/api/connections/cat')).body.relation.connection, 'none');
    assert.equal((await c.ann.delete('/api/connections/ben')).body.relation.connection, 'none');
    await c.ann.post('/api/connections/ben');
    await c.ben.post('/api/connections/ann/accept');
  });

  test('you can’t connect with yourself or with inactive accounts', async () => {
    assert.equal((await c.ann.post('/api/connections/ann')).status, 400);
    await makeUser(env.db, { id: 'gone', email: 'gone@example.com', status: 'suspended' });
    assert.equal((await c.ann.post('/api/connections/gone')).status, 404);
  });
});

describe('privacy and blocks', () => {
  test('“connections only” contact details are shown to connections and no one else', async () => {
    const v = (await c.ben.get('/api/profiles/ben')).body.profile.version;
    await c.ben.patch('/api/profiles/me', { version: v, contactVisibility: 'connections' });
    assert.equal((await c.ann.get('/api/profiles/ben')).body.profile.email, 'ben@example.com', 'ann is connected');
    assert.equal((await c.cat.get('/api/profiles/ben')).body.profile.email, null, 'cat is not');
  });

  test('blocking removes the connection, stops new requests and hides both from each other', async () => {
    await c.cat.post('/api/connections/dan');
    assert.equal((await c.dan.post('/api/blocks/cat')).status, 200);
    assert.equal((await rel('dan', 'cat')).connection, 'none', 'pending request removed');
    assert.equal((await c.cat.post('/api/connections/dan')).status, 404, 'blocked person gets “not found”, block not revealed');
    assert.equal((await c.dan.post('/api/connections/cat')).body.error.code, 'BLOCKED');
    assert.equal((await c.cat.get('/api/profiles/dan')).status, 404);
    assert.equal((await c.dan.get('/api/profiles/cat')).body.profile.blockedByMe, true);
    const dir = await c.cat.get('/api/directory');
    assert.ok(!dir.body.people.some((p) => p.id === 'dan'), 'blocker hidden from the blocked person');
    const dir2 = await c.dan.get('/api/directory');
    assert.ok(!dir2.body.people.some((p) => p.id === 'cat'), 'and the other way round');
  });

  test('PER-11 a member blocking staff doesn’t limit staff authority', async () => {
    await c.dan.post('/api/blocks/eve');
    assert.equal((await c.eve.get('/api/profiles/dan')).status, 200, 'staff can still open the profile');
    assert.equal((await c.eve.get('/api/admin/users?q=dan')).status, 200);
  });

  test('unblocking restores visibility', async () => {
    await c.dan.delete('/api/blocks/cat');
    assert.equal((await c.cat.get('/api/profiles/dan')).status, 200);
    assert.deepEqual((await c.dan.get('/api/blocks')).body.blocked.map((b) => b.id), ['eve']);
  });

  test('the lists contain the right people in the right buckets', async () => {
    const ann = (await c.ann.get('/api/connections')).body;
    assert.deepEqual(ann.connected.map((x) => x.id), ['ben']);
    await c.cat.post('/api/connections/ann');
    await c.ann.post('/api/connections/dan');
    const lists = (await c.ann.get('/api/connections')).body;
    assert.deepEqual(lists.incoming.map((x) => x.id), ['cat']);
    assert.deepEqual(lists.outgoing.map((x) => x.id), ['dan']);
    assert.deepEqual((await c.cat.get('/api/connections')).body.outgoing.map((x) => x.id), ['ann']);
  });

  test('a suspended member’s connections drop out of lists', async () => {
    assert.ok((await c.ann.get('/api/connections')).body.connected.some((x) => x.id === 'ben'), 'present before');
    await env.db.query(`update users set status = 'suspended' where id = 'ben'`);
    assert.ok(!(await c.ann.get('/api/connections')).body.connected.some((x) => x.id === 'ben'));
    await env.db.query(`update users set status = 'active' where id = 'ben'`);
  });
});
