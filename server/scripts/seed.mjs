// Development seed: loads people from server/seed/prototype.json into the CommunityOne database.
//   npm run db:seed            → only seeds an empty database (never overwrites accounts)
//   npm run db:seed -- --reset → wipes the local PGlite data directory first (dev only)
// Every seeded account gets a real password: the hosts and Ishita keep theirs (DEMO_ACCOUNTS.md);
// everyone else uses the shared development password below. Development data only.
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { hashPassword } from '../lib/crypto.js';
import { mergeCommunity } from '../lib/merge.js';
import { pickAccent } from '../lib/community.js';

export const DEV_PASSWORD = 'Community-Demo-2026';
// The demo passwords are published in DEMO_ACCOUNTS.md, so a production seed must never use them:
// there every seeded account gets SEED_PASSWORD (a secret set in the host's environment), and
// without one the seed does nothing.
const production = process.env.NODE_ENV === 'production';
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const SUPER_ADMIN = 'u7'; // decision D6 default: the alumni office account
/** Password hash of accounts in a shipped database template: matches no password (locked). */
export const LOCKED_HASH = '!locked';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let db; let proto;

/**
 * Seeds an open database (migrations already applied). Safe on every start: each step only
 * fills what's empty. Returns false when production has no SEED_PASSWORD.
 */
export async function runSeed(database, { log = console.log } = {}) {
  if (production && (!SEED_PASSWORD || SEED_PASSWORD.length < 12)) {
    log('production: SEED_PASSWORD (12+ characters) is not set — demo data not seeded');
    return false;
  }
  db = database;
  // Accounts from a shipped template are locked until the host's own secret is applied.
  if (production) {
    const locked = await db.query(`update users set password_hash = $1 where password_hash = $2 returning id`, [await hashPassword(SEED_PASSWORD), LOCKED_HASH]);
    if (locked.rows.length) log(`unlocked ${locked.rows.length} seeded accounts with SEED_PASSWORD`);
  }
  proto = JSON.parse(await readFile(path.join(root, 'server', 'seed', 'prototype.json'), 'utf8'));
  const existing = (await db.query(`select count(*)::int as n from users`)).rows[0].n;
  if (existing) log(`database already has ${existing} accounts — accounts not re-seeded (use --reset to start over)`);
  else await seedAccounts();
  await seedProfiles();
  await seedConnections();
  await seedCommunities();
  await seedEvents();
  await mergeAllHands();
  return true;
}

// Run directly: `npm run db:seed` (the server imports runSeed instead).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg');
  if (process.argv.includes('--reset')) {
    if (process.env.DATABASE_URL) throw new Error('--reset only works on the local PGlite database.');
    await rm(dataDir, { recursive: true, force: true });
    console.log(`reset ${path.relative(root, dataDir)}`);
  }
  const database = await createDb({ dataDir });
  await migrate(database, { log: console.log });
  await runSeed(database);
  await database.close();
}

async function seedAccounts() {
const statusOf = (u) => (u.deactivated || u.status === 'deactivated' ? 'deactivated' : u.status === 'pending' ? 'pending_approval' : 'active');

// In production everyone shares SEED_PASSWORD, so hash it once: 34 scrypt hashes take long
// enough to miss the host's startup deadline.
const sharedHash = production ? await hashPassword(SEED_PASSWORD) : null;
await db.tx(async (t) => {
  for (const u of proto.users) {
    const hash = sharedHash ?? await hashPassword(u.password || DEV_PASSWORD);
    await t.query(
      `insert into users (id, email, name, password_hash, status, email_verified_at, created_at, onboarded_at)
       values ($1, $2, $3, $4, $5, now(), to_timestamp($6 / 1000.0), now())`,
      [u.id, u.email, u.name, hash, statusOf(u), u.joinedAt || Date.now()]);
    if (u.admin) await t.query(`insert into platform_roles (user_id, role) values ($1, 'platform_admin')`, [u.id]);
  }
  await t.query(`insert into platform_roles (user_id, role) values ($1, 'super_admin') on conflict do nothing`, [SUPER_ADMIN]);
  const reg = proto.settings?.registration ?? {};
  await t.query(`update platform_settings set value = value || $1::jsonb where key = 'registration'`,
    [JSON.stringify({ open: reg.open ?? true, requireApproval: !!reg.requireApproval, allowedDomains: reg.allowedDomains ?? [] })]);
});

const counts = (await db.query(`select status, count(*)::int as n from users group by status order by status`)).rows;
const roles = (await db.query(`select role, count(*)::int as n from platform_roles group by role order by role`)).rows;
console.log('seeded users', counts, 'roles', roles);
}

// Moves prototype profiles into profiles / education / experience. Runs once (when no
// institution exists yet); afterwards it only gives any account without a profile a blank one.
async function seedProfiles() {
  const hasInstitution = (await db.query(`select count(*)::int as n from institutions`)).rows[0].n > 0;
  if (!hasInstitution) {
    await db.tx(async (t) => {
      await t.query(`insert into institutions (id, name, short_name, city, country) values ('ins_main', 'The Institute', 'TI', 'Bengaluru', 'India')`);
      const depts = [...new Set(proto.users.map((u) => u.dept).filter(Boolean))].sort();
      const deptId = Object.fromEntries(depts.map((d, i) => [d, `dep_${String(i + 1).padStart(2, '0')}`]));
      for (const d of depts) await t.query(`insert into departments (id, institution_id, name) values ($1, 'ins_main', $2)`, [deptId[d], d]);
      const ids = new Set((await t.query(`select id from users`)).rows.map((r) => r.id));
      for (const u of proto.users) {
        if (!ids.has(u.id)) continue;
        const cf = { ...(u.customFields || {}) };
        const linkedin = cf.linkedin || null; const mentor = cf.mentor === 'Yes';
        delete cf.linkedin; delete cf.mentor;
        await t.query(
          `insert into profiles (user_id, headline, bio, city, company, job_title, skills, birthday, linkedin, mentor_open, custom_fields, avatar_hue, contact_visibility)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) on conflict (user_id) do nothing`,
          [u.id, u.title || null, u.bio || null, u.city || null, u.company || null, u.role || null, u.skills || [], u.birthday || null,
            linkedin, mentor, JSON.stringify(cf), u.hue ?? 200, u.privacy?.contact === 'nobody' ? 'nobody' : u.privacy?.contact === 'following' ? 'connections' : 'everyone']);
        if (u.batch || u.dept) {
          await t.query(`insert into education (user_id, institution_id, department_id, grad_year, is_primary) values ($1, 'ins_main', $2, $3, true)`,
            [u.id, deptId[u.dept] ?? null, u.batch ?? null]);
        }
        for (const [i, c] of (u.career || []).entries()) {
          if (!c.title || !c.org) continue;
          await t.query(`insert into experience (user_id, title, org, from_year, to_year, position) values ($1, $2, $3, $4, $5, $6)`, [u.id, c.title, c.org, c.from ?? null, c.to ?? null, i]);
        }
      }
    });
  }
  const filled = await db.query(`insert into profiles (user_id) select id from users u where not exists (select 1 from profiles p where p.user_id = u.id) returning user_id`);
  const n = (q) => db.query(q).then((r) => r.rows[0].n);
  console.log('profiles', { profiles: await n(`select count(*)::int as n from profiles`), education: await n(`select count(*)::int as n from education`),
    experience: await n(`select count(*)::int as n from experience`), departments: await n(`select count(*)::int as n from departments`), blankProfilesAdded: filled.rows.length });
}

// Prototype follows become accepted connections; prototype blocks move across. Runs once.
async function seedConnections() {
  const has = (await db.query(`select (select count(*) from connections) + (select count(*) from blocks) as n`)).rows[0].n > 0;
  if (has) return;
  const ids = new Set((await db.query(`select id from users`)).rows.map((r) => r.id));
  let made = 0;
  await db.tx(async (t) => {
    for (const f of proto.follows || []) {
      if (!ids.has(f.authorId) || !ids.has(f.targetId) || f.authorId === f.targetId) continue;
      const [a, b] = [f.authorId, f.targetId].sort();
      const r = await t.query(`insert into connections (user_a, user_b, requested_by, status, responded_at) values ($1, $2, $3, 'accepted', now()) on conflict do nothing returning 1`, [a, b, f.authorId]);
      made += r.rows.length;
    }
    for (const bl of proto.blocks || []) {
      if (ids.has(bl.authorId) && ids.has(bl.targetId)) await t.query(`insert into blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [bl.authorId, bl.targetId]);
    }
  });
  console.log('connections', { fromFollows: made });
}

// Groups → communities (same ids; public→public, restricted→private, private→closed), plus the
// default "AlumniZone" community for network-wide content (decision D3). Posts, comments,
// likes, moods, polls and Mandatory Read acknowledgements come across. Runs once.
// The accents in the approved designs; any other prototype group gets the least-used one.
const ACCENT = { alumnizone: 'sky', g2: 'amber', g4: 'violet', g7: 'teal', g3: 'rose', g5: 'orange' };

async function seedCommunities() {
  if ((await db.query(`select count(*)::int as n from communities`)).rows[0].n) return;
  const active = new Set((await db.query(`select id from users where status = 'active'`)).rows.map((r) => r.id));
  const VIS = { public: 'public', restricted: 'private', private: 'closed' };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const counts = { communities: 0, memberships: 0, posts: 0, comments: 0, reactions: 0, votes: 0, acks: 0 };
  await db.tx(async (t) => {
    const add = async (c, members) => {
      await t.query(`insert into communities (id, slug, name, description, category, emoji, visibility, created_by, settings, accent) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [c.id, slug(c.name), c.name, c.description || null, c.category || null, c.emoji || null, c.visibility, c.owner, JSON.stringify(c.settings || {}), ACCENT[c.id] ?? await pickAccent(t)]);
      counts.communities += 1;
      for (const [uid, role] of members) {
        if (!active.has(uid)) continue;
        await t.query(`insert into memberships (community_id, user_id, role, state, joined_at) values ($1, $2, $3, 'active', now()) on conflict do nothing`, [c.id, uid, role]);
        counts.memberships += 1;
      }
    };
    const net = proto.settings?.networkName || 'AlumniZone';
    await add({ id: 'alumnizone', name: net, description: proto.settings?.tagline || 'The alumni community.', category: 'Alumni', emoji: '🎓', visibility: 'public', owner: 'u7' },
      [...active].map((uid) => [uid, uid === 'u7' ? 'owner' : proto.users.find((u) => u.id === uid)?.admin ? 'admin' : 'member']));
    for (const g of proto.groups || []) {
      const owner = (g.admins || []).find((x) => active.has(x)) ?? g.members.find((x) => active.has(x));
      const role = (uid) => (uid === owner ? 'owner' : (g.admins || []).includes(uid) ? 'admin' : (g.moderators || []).includes(uid) ? 'moderator' : 'member');
      await add({ id: g.id, name: g.name, description: g.description, category: g.type, emoji: g.emoji, visibility: VIS[g.accessType] || 'public', owner },
        [...new Set(g.members)].map((uid) => [uid, role(uid)]));
      for (const uid of g.joinRequests || []) {
        if (active.has(uid)) await t.query(`insert into memberships (community_id, user_id, state) values ($1, $2, 'pending') on conflict do nothing`, [g.id, uid]);
      }
    }
    const ids = new Set((await t.query(`select id from communities`)).rows.map((r) => r.id));
    for (const p of proto.posts || []) {
      const cid = p.scope?.type === 'network' ? 'alumnizone' : p.scope?.type === 'group' ? p.scope.id : null;
      if (!cid || !ids.has(cid) || !active.has(p.authorId) || !String(p.text || '').trim()) continue;
      const status = ['draft', 'scheduled', 'pending'].includes(p.status) ? p.status : 'published';
      const type = ['post', 'announcement', 'question', 'poll'].includes(p.type) ? p.type : 'post';
      const at = new Date(p.createdAt || Date.now());
      const mandatory = p.mandatory ? { message: p.mandatory.message, button: p.mandatory.button, deadline: p.mandatory.deadline ? new Date(p.mandatory.deadline).toISOString() : null } : null;
      await t.query(`insert into posts (id, community_id, author_id, type, body, status, publish_at, pinned, mentions, mandatory, created_at, published_at)
        values ($1, $2, $3, $4, $5, $6::text, $7, $8, $9, $10, $11::timestamptz, case when $6::text = 'published' then $11::timestamptz end)`,
        [p.id, cid, p.authorId, type, String(p.text).slice(0, 5000), status, p.publishAt ? new Date(p.publishAt) : null, !!p.pinned,
          (p.mentions || []).filter((m) => active.has(m)), mandatory ? JSON.stringify(mandatory) : null, at]);
      counts.posts += 1;
      for (const c of p.comments || []) {
        if (!active.has(c.authorId) || !String(c.text || '').trim()) continue;
        await t.query(`insert into comments (id, post_id, author_id, body, created_at) values ($1, $2, $3, $4, $5)`, [c.id, p.id, c.authorId, String(c.text).slice(0, 2000), new Date(c.createdAt || at)]);
        counts.comments += 1;
      }
      for (const uid of p.likes || []) if (active.has(uid)) { await t.query(`insert into reactions (post_id, user_id, kind) values ($1, $2, 'like') on conflict do nothing`, [p.id, uid]); counts.reactions += 1; }
      for (const [uid, mood] of Object.entries(p.reactions || {})) {
        if (active.has(uid) && ['happy', 'neutral', 'sad'].includes(mood)) { await t.query(`insert into reactions (post_id, user_id, kind) values ($1, $2, $3) on conflict do nothing`, [p.id, uid, mood]); counts.reactions += 1; }
      }
      if (type === 'poll') {
        for (const [i, o] of (p.poll?.options || []).entries()) {
          await t.query(`insert into poll_options (id, post_id, label, position) values ($1, $2, $3, $4)`, [o.id, p.id, String(o.text).slice(0, 120), i]);
          for (const uid of o.votes || []) if (active.has(uid)) { await t.query(`insert into poll_votes (post_id, user_id, option_id) values ($1, $2, $3) on conflict do nothing`, [p.id, uid, o.id]); counts.votes += 1; }
        }
      }
      for (const uid of p.mandatory?.acks || []) if (active.has(uid)) { await t.query(`insert into post_acks (post_id, user_id) values ($1, $2) on conflict do nothing`, [p.id, uid]); counts.acks += 1; }
    }
  });
  console.log('communities', counts);
}

// Decision R4: the prototype's "All Hands" group (everyone, announcements) becomes part of
// AlumniZone. Its posts and events move there; the merge is recorded so it can be undone
// (server/scripts/undo-merge.mjs). Runs once per community: one that was merged before, even
// if the merge was undone since, is left alone.
async function mergeAllHands() {
  for (const g of (proto.groups || []).filter((x) => x.allHands)) {
    const { rows: [c] } = await db.query(`select exists (select 1 from community_merges where from_id = $1) as done from communities where id = $1`, [g.id]);
    if (!c || c.done) continue;
    const r = await mergeCommunity(db, { from: g.id, to: 'alumnizone' });
    if (r) console.log(`merged ${g.name} into AlumniZone`, r);
  }
}

// Prototype events → community events (network → AlumniZone; group → that community; private →
// an invite-only AlumniZone event with its invitees). Assistants become co-hosts. People who
// aren't active members of the event's community are left off guest lists and RSVPs. Runs once.
async function seedEvents() {
  if ((await db.query(`select count(*)::int as n from events`)).rows[0].n) return;
  const counts = { events: 0, cohosts: 0, invitees: 0, rsvps: 0, comments: 0, skipped: 0 };
  await db.tx(async (t) => {
    const members = {};
    for (const r of (await t.query(`select m.community_id, m.user_id from memberships m join users u on u.id = m.user_id where m.state = 'active' and u.status = 'active'`)).rows) {
      (members[r.community_id] ??= new Set()).add(r.user_id);
    }
    // The prototype let only permitted people create network-wide ("company") events.
    await t.query(`update communities set settings = settings || '{"whoCanCreateEvents": "admins"}'::jsonb where id = 'alumnizone' and not settings ? 'whoCanCreateEvents'`);
    for (const e of proto.events || []) {
      const cid = e.scope?.type === 'group' ? e.scope.id : 'alumnizone';
      const ok = members[cid];
      if (!ok?.has(e.hostId) || !String(e.title || '').trim() || !(e.end >= e.start)) { counts.skipped += 1; continue; }
      const inviteOnly = e.scope?.type === 'private';
      const rec = e.recurrence?.freq && e.recurrence.freq !== 'none'
        ? { freq: e.recurrence.freq, ...(e.recurrence.until ? { until: new Date(e.recurrence.until).toISOString() } : {}) } : { freq: 'none' };
      await t.query(`insert into events (id, community_id, host_id, title, description, event_type, start_at, end_at, all_day, timezone, location, recurrence, invite_only, rsvp_enabled, reminders)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Asia/Kolkata', $10, $11, $12, $13, $14)`,
      [e.id, cid, e.hostId, String(e.title).slice(0, 140), e.description ? String(e.description).slice(0, 5000) : null,
        e.eventType || 'Meetup', new Date(e.start), new Date(e.end), !!e.allDay, e.location ? String(e.location).slice(0, 300) : null,
        JSON.stringify(rec), inviteOnly, e.rsvpEnabled !== false, (e.reminders || []).filter((m) => [5, 15, 30, 60, 120, 1440, 10080].includes(m))]);
      counts.events += 1;
      for (const uid of new Set(e.assistants || [])) if (ok.has(uid) && uid !== e.hostId) { await t.query(`insert into event_staff (event_id, user_id) values ($1, $2)`, [e.id, uid]); counts.cohosts += 1; }
      if (inviteOnly) for (const uid of new Set(e.invitees || [])) if (ok.has(uid)) { await t.query(`insert into event_invitees (event_id, user_id) values ($1, $2)`, [e.id, uid]); counts.invitees += 1; }
      for (const [uid, st] of Object.entries(e.rsvps || {})) {
        if (ok.has(uid) && ['going', 'maybe', 'no'].includes(st)) { await t.query(`insert into event_rsvps (event_id, user_id, status) values ($1, $2, $3)`, [e.id, uid, st]); counts.rsvps += 1; }
      }
      for (const c of e.comments || []) {
        if (!ok.has(c.authorId) || !String(c.text || '').trim()) continue;
        await t.query(`insert into event_comments (id, event_id, author_id, body, created_at) values ($1, $2, $3, $4, $5)`, [c.id, e.id, c.authorId, String(c.text).slice(0, 2000), new Date(c.createdAt || Date.now())]);
        counts.comments += 1;
      }
    }
  });
  console.log('events', counts);
}
