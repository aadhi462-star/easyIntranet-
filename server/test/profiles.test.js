// Profiles, directory and institutions (USR-* in EDGE_CASE_REGISTER.md).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeUser, setup, signIn } from './helpers.js';

let env; let alice; let bob; let staff;
const profileOf = async (db, id) => db.query(`insert into profiles (user_id) values ($1) on conflict do nothing`, [id]);

before(async () => {
  env = await setup();
  await env.db.query(`insert into institutions (id, name) values ('ins_a', 'Alpha University'), ('ins_b', 'Beta College')`);
  await env.db.query(`insert into departments (id, institution_id, name) values ('dep_cs', 'ins_a', 'Computer Science'), ('dep_me', 'ins_a', 'Mechanical'), ('dep_x', 'ins_b', 'Arts')`);
  for (const [id, email, roles] of [['alice', 'alice@example.com', []], ['bob', 'bob@example.com', []], ['staff', 'staff@example.com', ['user_manager']], ['sus', 'sus@example.com', []]]) {
    await makeUser(env.db, { id, email, name: id[0].toUpperCase() + id.slice(1), roles });
    await profileOf(env.db, id);
  }
  alice = await signIn(env.app, { email: 'alice@example.com', password: 'correct-horse-battery' });
  bob = await signIn(env.app, { email: 'bob@example.com', password: 'correct-horse-battery' });
  staff = await signIn(env.app, { email: 'staff@example.com', password: 'correct-horse-battery' });
});
after(async () => { await env.close(); });

const myVersion = async (c, id) => (await c.get(`/api/profiles/${id}`)).body.profile.version;

describe('editing a profile', () => {
  test('USR-01 a blank name is rejected and names the field', async () => {
    const r = await patch(alice, { version: await myVersion(alice, 'alice'), name: '   ' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.field, 'name');
  });

  test('USR-02 markup is kept as plain text, control characters are dropped, lengths are enforced', async () => {
    const v = await myVersion(alice, 'alice');
    const ok = await patch(alice, { version: v, headline: '<script>alert(1)</script>\u0007Designer', bio: 'line one\nline two' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.headline, '<script>alert(1)</script>Designer', 'stored as text; the web app escapes it');
    assert.equal(ok.body.profile.bio, 'line one\nline two');
    const long = await patch(alice, { version: ok.body.profile.version, bio: 'x'.repeat(2001) });
    assert.equal(long.status, 400);
    assert.equal(long.body.error.code, 'TOO_LONG');
  });

  test('USR-10 / REG-16 an edit from a stale copy is refused, not silently merged', async () => {
    const v = await myVersion(bob, 'bob');
    assert.equal((await patch(bob, { version: v, city: 'Pune' })).status, 200);
    const stale = await patch(bob, { version: v, city: 'Delhi' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'STALE_VERSION');
    assert.equal((await bob.get('/api/profiles/bob')).body.profile.city, 'Pune');
  });

  test('unknown fields are rejected (no mass assignment of status, roles…)', async () => {
    const r = await patch(alice, { version: await myVersion(alice, 'alice'), status: 'active', roles: ['super_admin'] });
    assert.equal(r.status, 400);
  });

  test('education must use a real institution and one of its departments', async () => {
    const v = await myVersion(alice, 'alice');
    const wrong = await patch(alice, { version: v, education: [{ institutionId: 'ins_a', departmentId: 'dep_x', gradYear: 2016 }] });
    assert.equal(wrong.status, 400);
    const bad = await patch(alice, { version: v, education: [{ institutionId: 'nope', gradYear: 2016 }] });
    assert.equal(bad.status, 400);
    const year = await patch(alice, { version: v, education: [{ institutionId: 'ins_a', gradYear: 1800 }] });
    assert.equal(year.body.error.code, 'INVALID_YEAR');
    const ok = await patch(alice, { version: v, education: [{ institutionId: 'ins_a', departmentId: 'dep_cs', gradYear: 2016 }], experience: [{ title: 'Designer', org: 'Lumen', fromYear: 2018, toYear: null }] });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.batch, 2016);
    assert.equal(ok.body.profile.department, 'Computer Science');
    assert.equal(ok.body.profile.experience[0].org, 'Lumen');
  });

  test('career years must run forwards; birthdays must be real dates', async () => {
    const v = await myVersion(alice, 'alice');
    assert.equal((await patch(alice, { version: v, experience: [{ title: 'A', org: 'B', fromYear: 2020, toYear: 2010 }] })).body.error.code, 'INVALID_YEAR');
    assert.equal((await patch(alice, { version: v, birthday: '02-30' })).body.error.code, 'INVALID_BIRTHDAY');
    assert.equal((await patch(alice, { version: v, birthday: '02-29' })).status, 200);
  });

  test('USR-05 a name change shows everywhere the directory is read', async () => {
    await patch(bob, { version: await myVersion(bob, 'bob'), name: 'Robert' });
    const dir = await alice.get('/api/directory?q=robert');
    assert.equal(dir.body.people[0].name, 'Robert');
  });
});

describe('directory and privacy', () => {
  test('suspended and hidden members are not listed; pagination reports the total', async () => {
    await env.db.query(`update users set status = 'suspended' where id = 'sus'`);
    const all = await alice.get('/api/directory?limit=2');
    assert.ok(!all.body.people.some((p) => p.id === 'sus'));
    assert.equal(all.body.people.length, 2);
    assert.equal(all.body.total, 3, 'alice, bob, staff');
    await patch(bob, { version: await myVersion(bob, 'bob'), directoryVisible: false });
    const after = await alice.get('/api/directory');
    assert.ok(!after.body.people.some((p) => p.id === 'bob'));
    await patch(bob, { version: await myVersion(bob, 'bob'), directoryVisible: true });
  });

  test('filters by institution, department and batch', async () => {
    const r = await bob.get('/api/directory?institution=ins_a&department=dep_cs&batch=2016');
    assert.deepEqual(r.body.people.map((p) => p.id), ['alice']);
    const facets = await bob.get('/api/directory/facets');
    assert.ok(facets.body.batches.includes(2016));
  });

  test('contact details follow the owner’s privacy choice', async () => {
    await patch(alice, { version: await myVersion(alice, 'alice'), contactVisibility: 'nobody' });
    const seenByBob = (await bob.get('/api/profiles/alice')).body.profile;
    assert.equal(seenByBob.email, null);
    assert.equal(seenByBob.birthday, null);
    assert.equal(seenByBob.contactHidden, true);
    assert.equal((await alice.get('/api/profiles/alice')).body.profile.email, 'alice@example.com', 'owner always sees their own');
    assert.equal((await staff.get('/api/profiles/alice')).body.profile.email, 'alice@example.com', 'staff can see it');
  });

  test('a suspended member’s profile is hidden from members but visible to staff', async () => {
    assert.equal((await bob.get('/api/profiles/sus')).status, 404);
    assert.equal((await staff.get('/api/profiles/sus')).status, 200);
  });

  test('USR-09 a deleted member resolves to a placeholder, not an error', async () => {
    await env.db.query(`update users set status = 'deleted', name = 'Deleted member' where id = 'sus'`);
    const r = await bob.get('/api/profiles/sus');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.profile, { id: 'sus', name: 'Deleted member', deleted: true });
  });

  test('signed-out visitors get nothing', async () => {
    const anon = client(env.app);
    for (const url of ['/api/directory', '/api/profiles/alice', '/api/institutions']) assert.equal((await anon.get(url)).status, 401, url);
  });
});

describe('personal data export', () => {
  test('USR-08 needs the password and includes the member’s own data', async () => {
    assert.equal((await alice.post('/api/account/export', { password: 'wrong' })).status, 401);
    const r = await alice.post('/api/account/export', { password: 'correct-horse-battery' });
    assert.equal(r.status, 200);
    assert.equal(r.body.account.email, 'alice@example.com');
    assert.ok(Array.isArray(r.body.sessions));
  });
});

describe('institutions', () => {
  test('only staff with institutions.manage can add them; duplicates are refused', async () => {
    assert.equal((await alice.post('/api/admin/institutions', { name: 'Gamma' })).status, 403);
    assert.equal((await staff.post('/api/admin/institutions', { name: 'Gamma Institute' })).status, 201);
    assert.equal((await staff.post('/api/admin/institutions', { name: 'gamma institute' })).status, 409);
    assert.equal((await staff.post('/api/admin/institutions/ins_a/departments', { name: 'computer science' })).status, 409);
  });
});

function patch(c, body) {
  return c.patch(`/api/profiles/me`, body);
}
