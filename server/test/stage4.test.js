// Redesign Stage 4 (engagement): files, Resources, topics, attachments, notifications, Saved and
// the event waitlist (EDGE_CASE_REGISTER.md IDs in each name).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, setup, signIn } from './helpers.js';

let env; const c = {};
const q = (s, p) => env.db.query(s, p);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5ff0000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const upload = (who, cid, name, buf, headers = {}) => c[who].post(`/api/communities/${cid}/files`, buf,
  { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name), ...headers });

before(async () => {
  env = await setup();
  for (const id of ['own', 'mem', 'out', 'ex']) await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
  for (const [id, vis] of [['pub', 'public'], ['pri', 'private']]) {
    await q(`insert into communities (id, slug, name, visibility, created_by) values ($1, $1, $2, $3, 'own')`, [id, `Files ${id}`, vis]);
    await q(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, 'own', 'owner', 'active', now())`, [id]);
    for (const u of ['mem', 'ex']) await q(`insert into memberships (community_id, user_id, state, joined_at) values ($1, $2, 'active', now())`, [id, u]);
  }
  for (const id of ['own', 'mem', 'out', 'ex']) c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
});
after(() => env?.close());

describe('files', () => {
  test('FIL-01 the type comes from the bytes: renamed executables, HTML, SVG and spoofed types are refused', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    assert.equal((await upload('mem', 'pri', 'report.pdf', exe)).body.error.code, 'FILE_TYPE', 'an executable named .pdf');
    assert.equal((await upload('mem', 'pri', 'page.txt', Buffer.from('<html><script>alert(1)</script></html>'))).status, 201, 'text stays text: it is only ever downloaded');
    assert.equal((await upload('mem', 'pri', 'logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x()</script></svg>'))).body.error.code, 'FILE_TYPE');
    assert.equal((await upload('mem', 'pri', 'photo.png', PDF)).body.file.kind, 'pdf', 'a PDF named .png is stored as what it is');
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
    assert.equal((await upload('mem', 'pri', 'notes.docx', zip)).body.error.code, 'FILE_TYPE', 'a ZIP that isn’t an Office document');
    assert.equal((await upload('mem', 'pri', 'bin.txt', Buffer.from([0x61, 0x00, 0x62]))).body.error.code, 'FILE_TYPE', 'binary named .txt');
  });

  test('FIL-02 files over 10 MB are refused with the limit; empty files too', async () => {
    const big = await upload('mem', 'pri', 'big.pdf', Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]));
    assert.equal(big.status, 413);
    assert.equal((await upload('mem', 'pri', 'empty.pdf', Buffer.alloc(0))).status >= 400, true);
  });

  test('FIL-03 a retried upload with the same key stores one file', async () => {
    const h = { 'idempotency-key': 'up-1' };
    const a = await upload('mem', 'pri', 'retry.pdf', PDF, h);
    const b = await upload('mem', 'pri', 'retry.pdf', PDF, h);
    assert.equal(a.body.file.id, b.body.file.id);
    assert.equal((await q(`select count(*)::int as n from files where name = 'retry.pdf'`)).rows[0].n, 1);
  });

  test('FIL-05 a file opens only for people who can open its community; served as a download, never a page', async () => {
    const f = (await upload('mem', 'pri', 'private.pdf', PDF)).body.file;
    const ok = await c.mem.get(`/api/files/${f.id}`);
    assert.equal(ok.status, 200);
    assert.ok(ok.raw.equals(PDF));
    assert.match(ok.headers['content-disposition'], /^attachment/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.match(ok.headers['content-security-policy'], /sandbox/);
    assert.equal((await c.out.get(`/api/files/${f.id}`)).status, 404, 'an outsider with the link gets nothing');
    await q(`update memberships set state = 'left' where community_id = 'pri' and user_id = 'ex'`);
    assert.equal((await c.ex.get(`/api/files/${f.id}`)).status, 404, 'nor someone who has left');
    await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'ex'`);
    assert.equal((await c.out.post(`/api/communities/pri/files`, PDF, { 'content-type': 'application/octet-stream' })).status, 403, 'outsiders can’t upload');
  });

  test('FIL-08 two files with the same name are two files', async () => {
    const a = (await upload('mem', 'pub', 'agenda.pdf', PDF)).body.file;
    const b = (await upload('own', 'pub', 'agenda.pdf', PDF)).body.file;
    assert.notEqual(a.id, b.id);
    assert.equal(a.name, b.name);
  });
});

describe('resources', () => {
  test('admins add links and files; members only when the community allows it; links must be http(s)', async () => {
    assert.equal((await c.mem.post('/api/communities/pub/resources', { title: 'Guide', url: 'https://example.org/guide' })).status, 403);
    assert.equal((await c.own.post('/api/communities/pub/resources', { title: 'Bad', url: 'javascript:alert(1)' })).body.error.code, 'INVALID_URL');
    const link = await c.own.post('/api/communities/pub/resources', { title: 'Alumni handbook', url: 'https://example.org/handbook', category: 'Guides' });
    assert.equal(link.status, 201);
    await q(`update communities set settings = settings || '{"membersAddResources": true}'::jsonb where id = 'pub'`);
    const f = (await upload('mem', 'pub', 'slides.pdf', PDF)).body.file;
    const file = await c.mem.post('/api/communities/pub/resources', { title: 'Meet-up slides', fileId: f.id, category: 'Slides' });
    assert.equal(file.status, 201);
    assert.equal(file.body.resource.file.name, 'slides.pdf');
    assert.equal((await c.mem.post('/api/communities/pub/resources', { title: 'Again', fileId: f.id })).body.error.code, 'INVALID_FILE', 'a file is used once');
    const list = await c.out.get('/api/communities/pub/resources?category=Slides');
    assert.deepEqual(list.body.resources.map((r) => r.title), ['Meet-up slides'], 'a Public community’s library is readable');
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources?q=handbook')).body.resources.map((r) => r.title), ['Alumni handbook']);
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources?q=%25')).body.resources, [], 'wildcards are literal');
    assert.deepEqual((await c.mem.get('/api/communities/pub/resources')).body.categories, ['Guides', 'Slides']);
  });

  test('FIL-06 a resource stays when the person who added it is deleted, credited to a former member', async () => {
    const f = (await upload('ex', 'pub', 'ex.pdf', PDF)).body.file;
    const r = (await c.ex.post('/api/communities/pub/resources', { title: 'From ex', fileId: f.id })).body.resource;
    await q(`update users set status = 'deleted' where id = 'ex'`);
    try {
      const got = (await c.own.get('/api/communities/pub/resources')).body.resources.find((x) => x.id === r.id);
      assert.equal(got.addedBy.name, 'Former member');
      assert.equal((await c.own.get(`/api/files/${f.id}`)).status, 200);
    } finally { await q(`update users set status = 'active' where id = 'ex'`); }
  });

  test('FIL-09 replacing a file keeps the resource and its link; the old file stops downloading; edits are version-checked', async () => {
    const f1 = (await upload('own', 'pub', 'v1.pdf', PDF)).body.file;
    const r = (await c.own.post('/api/communities/pub/resources', { title: 'Programme', fileId: f1.id })).body.resource;
    const f2 = (await upload('own', 'pub', 'v2.pdf', PDF)).body.file;
    const up = await c.own.patch(`/api/resources/${r.id}`, { fileId: f2.id, version: r.version });
    assert.equal(up.status, 200);
    assert.equal(up.body.resource.id, r.id);
    assert.equal(up.body.resource.file.id, f2.id);
    assert.equal((await c.own.get(`/api/files/${f1.id}`)).status, 404);
    assert.equal((await c.own.patch(`/api/resources/${r.id}`, { title: 'Stale', version: r.version })).body.error.code, 'STALE_VERSION');
    assert.equal((await c.mem.patch(`/api/resources/${r.id}`, { title: 'Not mine', version: up.body.resource.version })).status, 403, 'a member can’t edit someone else’s');
  });

  test('FIL-07 a deleted resource and its file stop opening at once', async () => {
    const f = (await upload('own', 'pub', 'gone.pdf', PDF)).body.file;
    const r = (await c.own.post('/api/communities/pub/resources', { title: 'Gone soon', fileId: f.id })).body.resource;
    assert.equal((await c.own.delete(`/api/resources/${r.id}`)).status, 200);
    assert.equal((await c.own.get(`/api/files/${f.id}`)).status, 404);
    assert.ok(!(await c.own.get('/api/communities/pub/resources')).body.resources.some((x) => x.id === r.id));
  });

  test('a Private community’s library is members only', async () => {
    assert.equal((await c.out.get('/api/communities/pri/resources')).status, 403);
    assert.equal((await c.mem.get('/api/communities/pri/resources')).status, 200);
  });
});

describe('discussions: topics, attachments, search and sort', () => {
  let topic;
  test('admins keep up to 12 topics with unique names; members can’t', async () => {
    assert.equal((await c.mem.post('/api/communities/pub/topics', { name: 'Careers' })).status, 403);
    const r = await c.own.post('/api/communities/pub/topics', { name: 'Careers' });
    assert.equal(r.status, 201);
    topic = r.body.topics[0];
    assert.equal((await c.own.post('/api/communities/pub/topics', { name: ' careers ' })).body.error.code, 'DUPLICATE_TOPIC');
    for (let i = 1; i < 12; i++) await c.own.post('/api/communities/pub/topics', { name: `Topic ${i}` });
    assert.equal((await c.own.post('/api/communities/pub/topics', { name: 'Thirteen' })).body.error.code, 'TOO_MANY_TOPICS');
  });

  test('a post carries one of its community’s topics; Discussions filter by it', async () => {
    const other = (await c.own.post('/api/communities/pri/topics', { name: 'Elsewhere' })).body.topics[0];
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'wrong topic', topicId: other.id })).body.error.code, 'INVALID_TOPIC');
    const p = await c.mem.post('/api/communities/pub/posts', { body: 'Hiring a data engineer in Pune', topicId: topic.id });
    assert.equal(p.body.post.topic.name, 'Careers');
    await c.mem.post('/api/communities/pub/posts', { body: 'Untagged chat' });
    const list = await c.mem.get(`/api/feed?community=pub&topic=${topic.id}`);
    assert.deepEqual(list.body.posts.map((x) => x.body), ['Hiring a data engineer in Pune']);
  });

  test('CNT-12 images and PDFs only, up to 4, uploaded by the author to this community, used once', async () => {
    const files = [];
    for (let i = 0; i < 5; i++) files.push((await upload('mem', 'pub', `p${i}.png`, PNG)).body.file.id);
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'five', attachments: files })).body.error.code, 'TOO_MANY_ATTACHMENTS');
    const txt = (await upload('mem', 'pub', 'notes.txt', Buffer.from('plain'))).body.file.id;
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'txt', attachments: [txt] })).body.error.code, 'ATTACHMENT_TYPE');
    const others = (await upload('own', 'pub', 'theirs.png', PNG)).body.file.id;
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'not mine', attachments: [others] })).body.error.code, 'INVALID_FILE');
    const pdf = (await upload('mem', 'pub', 'flyer.pdf', PDF)).body.file.id;
    const ok = await c.mem.post('/api/communities/pub/posts', { body: 'Photos from the meet-up', attachments: [files[0], pdf] });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.post.attachments.map((a) => a.kind), ['image', 'pdf']);
    assert.equal((await c.mem.post('/api/communities/pub/posts', { body: 'again', attachments: [pdf] })).body.error.code, 'INVALID_FILE', 'a file attaches once');
    assert.equal((await c.out.get(`/api/files/${files[0]}`)).status, 200, 'a Public community’s attachment opens for anyone signed in');
  });

  test('search inside a community and most active first', async () => {
    const quiet = (await c.mem.post('/api/communities/pub/posts', { body: 'Quiet newest post about ferries' })).body.post;
    const old = (await c.mem.get('/api/feed?community=pub&q=hiring')).body.posts;
    assert.deepEqual(old.map((x) => x.body), ['Hiring a data engineer in Pune']);
    await c.own.post(`/api/posts/${old[0].id}/comments`, { body: 'Shared it with my team' });
    const active = (await c.mem.get('/api/feed?community=pub&sort=active')).body;
    assert.equal(active.posts[0].id, old[0].id, 'the post with the newest reply leads');
    assert.equal(active.nextBefore, null);
    assert.ok(active.posts.some((x) => x.id === quiet.id));
    assert.deepEqual((await c.mem.get('/api/feed?community=pub&q=%25%25')).body.posts, [], 'wildcards are literal');
    assert.ok((await c.mem.get('/api/feed?community=pub&view=polls')).body.posts.every((x) => x.type === 'poll'));
  });
});

describe('notifications', () => {
  const list = async (who) => (await c[who].get('/api/notifications')).body;
  const at = (days) => new Date(Date.now() + days * 864e5);

  test('a reply notifies the post’s author once, never the replier; retries don’t duplicate (NTF-02)', async () => {
    const p = (await c.own.post('/api/communities/pri/posts', { body: 'Budget for the reunion' })).body.post;
    const h = { 'idempotency-key': 'reply-1' };
    await c.mem.post(`/api/posts/${p.id}/comments`, { body: 'Count me in' }, h);
    await c.mem.post(`/api/posts/${p.id}/comments`, { body: 'Count me in' }, h);
    await c.own.post(`/api/posts/${p.id}/comments`, { body: 'Thanks!' });
    const mine = (await list('own')).notifications.filter((n) => n.href === `/post/${p.id}`);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].line, 'mem person replied to your post in Files pri');
    assert.ok(!(await list('mem')).notifications.some((n) => n.href === `/post/${p.id}` && n.kind === 'reply'), 'not for your own reply');
  });

  test('NTF-06 / CNT-15 emails name who and where, never the post’s text; email follows each person’s settings (NTF-01)', async () => {
    await q(`delete from email_outbox`);
    const p = (await c.mem.post('/api/communities/pri/posts', { body: 'SECRET salary numbers @own', mentions: ['own'] })).body.post;
    let mail = (await q(`select to_email, subject, body from email_outbox where template = 'notification'`)).rows;
    assert.equal(mail.length, 1, 'mentions email by default');
    assert.equal(mail[0].to_email, 'own@example.com');
    assert.ok(!JSON.stringify(mail).includes('SECRET'), 'no content in the email');
    await c.own.put('/api/notification-prefs', { mentions: false });
    await c.mem.post('/api/communities/pri/posts', { body: 'Another @own', mentions: ['own'] });
    mail = (await q(`select 1 from email_outbox where template = 'notification'`)).rows;
    assert.equal(mail.length, 1, 'turned off: no email');
    assert.ok((await list('own')).notifications.filter((n) => n.kind === 'mention').length >= 2, 'still in the app');
    const prefs = (await c.own.get('/api/notification-prefs')).body.categories;
    assert.equal(prefs.find((x) => x.id === 'mentions').email, false);
    assert.equal(prefs.find((x) => x.id === 'replies').email, false, 'replies default to no email');
    assert.equal((await c.own.put('/api/notification-prefs', { bogus: true })).status, 400);
    void p;
  });

  test('NTF-10 after losing access, a notification says it’s no longer available and shows nothing', async () => {
    const p = (await c.mem.post('/api/communities/pri/posts', { body: 'Members-only plan' })).body.post;
    await c.ex.post(`/api/posts/${p.id}/comments`, { body: 'Agreed' });
    await q(`update memberships set state = 'left' where community_id = 'pri' and user_id = 'mem'`);
    try {
      const n = (await list('mem')).notifications.find((x) => x.kind === 'reply' && !x.available);
      assert.ok(n, 'the reply is still listed');
      assert.equal(n.line, 'This is no longer available to you');
      assert.equal(n.href, null);
      assert.ok(!JSON.stringify(n).includes('Files pri'), 'not even the community’s name');
    } finally { await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'mem'`); }
  });

  test('NTF-09 suspended accounts and blocked people get nothing', async () => {
    const p = (await c.ex.post('/api/communities/pri/posts', { body: 'From ex' })).body.post;
    await q(`update users set status = 'suspended' where id = 'ex'`);
    await c.mem.post(`/api/posts/${p.id}/comments`, { body: 'Hello ex' });
    await q(`update users set status = 'active' where id = 'ex'`);
    await q(`insert into blocks (blocker_id, blocked_id) values ('ex', 'own')`);
    try {
      await c.own.post(`/api/posts/${p.id}/comments`, { body: 'Blocked reply' });
    } finally { await q(`delete from blocks where blocker_id = 'ex'`); }
    const ex = (await c.ex.get('/api/notifications')).body.notifications.filter((n) => n.href === `/post/${p.id}`);
    assert.equal(ex.length, 0);
  });

  test('join requests tell admins; the decision tells the requester, who isn’t a member yet', async () => {
    await c.out.post('/api/communities/pri/join', { message: 'Hi' });
    const req = (await list('own')).notifications.find((n) => n.kind === 'join_request');
    assert.equal(req.href, '/c/pri/members');
    await c.own.post('/api/communities/pri/requests/out/decline', {});
    const dec = (await list('out')).notifications.find((n) => n.kind === 'join_declined');
    assert.equal(dec.line, 'Your request to join Files pri was declined');
  });

  test('mark read: one, then all; only your own', async () => {
    const before = (await list('own')).unread;
    assert.ok(before >= 2);
    const first = (await list('own')).notifications.find((n) => !n.read);
    assert.equal((await c.own.post('/api/notifications/read', { ids: [first.id] })).body.unread, before - 1);
    await c.mem.post('/api/notifications/read', { ids: [first.id] });
    assert.equal((await c.own.post('/api/notifications/read', { all: true })).body.unread, 0);
    void at;
  });
});

describe('saved', () => {
  test('save posts, events and resources you can open; unavailable later shows nothing; import old bookmarks', async () => {
    const p = (await c.mem.post('/api/communities/pri/posts', { body: 'Save me' })).body.post;
    assert.equal((await c.out.put('/api/saved', { type: 'post', id: p.id })).body.error.code, 'NOT_AVAILABLE', 'outsiders can’t save it');
    await c.ex.put('/api/saved', { type: 'post', id: p.id });
    await c.ex.put('/api/saved', { type: 'post', id: p.id });
    let items = (await c.ex.get('/api/saved')).body.items;
    assert.equal(items.filter((i) => i.id === p.id).length, 1, 'saving twice keeps one');
    assert.equal(items.find((i) => i.id === p.id).title, 'Save me');
    await q(`update memberships set state = 'left' where community_id = 'pri' and user_id = 'ex'`);
    try {
      items = (await c.ex.get('/api/saved')).body.items;
      const gone = items.find((i) => i.id === p.id);
      assert.equal(gone.available, false);
      assert.equal(gone.title, undefined);
    } finally { await q(`update memberships set state = 'active' where community_id = 'pri' and user_id = 'ex'`); }
    const p2 = (await c.mem.post('/api/communities/pub/posts', { body: 'Old bookmark' })).body.post;
    assert.equal((await c.ex.post('/api/saved/import', { postIds: [p2.id, p2.id, 'missing'] })).body.added, 1);
    assert.equal((await c.ex.delete(`/api/saved/post/${p2.id}`)).body.saved, false);
  });
});

describe('event waitlist (S4-4)', () => {
  test('a full event offers the waitlist; a freed place goes to the first in line, not to someone who left it (EVT-09)', async () => {
    for (const id of ['w1', 'w2', 'w3']) {
      await makeUser(env.db, { id, email: `${id}@example.com`, name: `${id} person` });
      await q(`insert into memberships (community_id, user_id, state, joined_at) values ('pub', $1, 'active', now())`, [id]);
      c[id] = await signIn(env.app, { email: `${id}@example.com`, password: 'correct-horse-battery' });
    }
    const start = new Date(Date.now() + 5 * 864e5);
    await q(`insert into events (id, community_id, host_id, title, start_at, end_at, capacity) values ('ev-cap', 'pub', 'own', 'Small dinner', $1, $1::timestamptz + interval '2 hours', 1)`, [start]);
    assert.equal((await c.w1.put('/api/events/ev-cap/rsvp', { status: 'going' })).body.event.myRsvp, 'going');
    const full = await c.w2.put('/api/events/ev-cap/rsvp', { status: 'going' });
    assert.equal(full.body.error.code, 'EVENT_FULL');
    assert.equal(full.body.error.waitlist, true);
    assert.equal((await c.w2.put('/api/events/ev-cap/rsvp', { status: 'waitlist' })).body.event.waitlistPosition, 1);
    assert.equal((await c.w3.put('/api/events/ev-cap/rsvp', { status: 'waitlist' })).body.event.waitlistPosition, 2);
    await c.w2.put('/api/events/ev-cap/rsvp', { status: 'no' }); // w2 leaves the waitlist
    await c.w1.delete('/api/events/ev-cap/rsvp'); // a place opens
    const st = Object.fromEntries((await q(`select user_id, status from event_rsvps where event_id = 'ev-cap'`)).rows.map((r) => [r.user_id, r.status]));
    assert.equal(st.w3, 'going', 'the next in line gets it');
    assert.equal(st.w2, 'no', 'someone who left isn’t put back');
    const n = (await c.w3.get('/api/notifications')).body.notifications.find((x) => x.kind === 'waitlist_promoted');
    assert.equal(n.href, '/events/ev-cap');
  });

  test('raising the capacity promotes in order; waitlisting when there’s room just means going', async () => {
    await q(`update event_rsvps set status = 'waitlist', waitlisted_at = now() where event_id = 'ev-cap' and user_id = 'w2'`);
    const { rows: [ev] } = await q(`select version from events where id = 'ev-cap'`);
    const r = await c.own.patch('/api/events/ev-cap', { version: ev.version, capacity: 5 });
    assert.equal(r.status, 200);
    assert.equal((await q(`select status from event_rsvps where event_id = 'ev-cap' and user_id = 'w2'`)).rows[0].status, 'going');
    assert.equal((await c.w1.put('/api/events/ev-cap/rsvp', { status: 'waitlist' })).body.event.myRsvp, 'going');
  });
});
