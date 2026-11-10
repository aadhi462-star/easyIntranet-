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
const existing = (await db.query(`select count(*)::int as n from users`)).rows[0].n;
if (existing) {
  console.log(`database already has ${existing} accounts — nothing seeded (use --reset to start over)`);
  await db.close();
  process.exit(0);
}

const proto = JSON.parse(await readFile(path.join(root, 'server', 'seed', 'prototype.json'), 'utf8'));
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
await db.close();
