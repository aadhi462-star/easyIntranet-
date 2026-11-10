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

export const DEV_PASSWORD = 'Community-Demo-2026';
const SUPER_ADMIN = 'u7'; // decision D6 default: the alumni office account

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg');

if (process.argv.includes('--reset')) {
  if (process.env.DATABASE_URL) throw new Error('--reset only works on the local PGlite database.');
  await rm(dataDir, { recursive: true, force: true });
  console.log(`reset ${path.relative(root, dataDir)}`);
}

const db = await createDb({ dataDir });
await migrate(db, { log: console.log });
const proto = JSON.parse(await readFile(path.join(root, 'server', 'seed', 'prototype.json'), 'utf8'));
const existing = (await db.query(`select count(*)::int as n from users`)).rows[0].n;
if (existing) {
  console.log(`database already has ${existing} accounts — accounts not re-seeded (use --reset to start over)`);
} else {
  await seedAccounts();
}
await seedProfiles();
await db.close();

async function seedAccounts() {
const statusOf = (u) => (u.deactivated || u.status === 'deactivated' ? 'deactivated' : u.status === 'pending' ? 'pending_approval' : 'active');

await db.tx(async (t) => {
  for (const u of proto.users) {
    const hash = await hashPassword(u.password || DEV_PASSWORD);
    await t.query(
      `insert into users (id, email, name, password_hash, status, email_verified_at, created_at)
       values ($1, $2, $3, $4, $5, now(), to_timestamp($6 / 1000.0))`,
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
