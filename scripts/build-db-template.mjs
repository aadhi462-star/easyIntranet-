// Builds the database template shipped in the AppSail bundle: a fresh PGlite database with all
// migrations and the demo seed applied, so a first start only copies files (creating a new
// database takes seconds; copying takes milliseconds).
//   node scripts/build-db-template.mjs <out-dir>
// The template must hold no secret: it is seeded with a throwaway password and then every
// account is locked (LOCKED_HASH matches no password). The server unlocks them at startup with
// the host's own SEED_PASSWORD.
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/build-db-template.mjs <out-dir>');
process.env.NODE_ENV = 'production';
process.env.SEED_PASSWORD = randomBytes(24).toString('hex');
delete process.env.DATABASE_URL;

const { createDb } = await import('../server/db/index.js');
const { migrate } = await import('../server/db/migrate.js');
const { runSeed, LOCKED_HASH } = await import('../server/scripts/seed.mjs');

await rm(out, { recursive: true, force: true });
const db = await createDb({ dataDir: out });
await migrate(db);
await runSeed(db, { log: () => {} });
await db.query(`update users set password_hash = $1`, [LOCKED_HASH]);
// Rewrite the table so no old row version (with the throwaway hash) stays in the files.
await db.query('vacuum full users');
const { rows: [c] } = await db.query(`select (select count(*)::int from users) as users, (select count(*)::int from users where password_hash <> $1) as unlocked,
  (select count(*)::int from sessions) + (select count(*)::int from email_outbox) as leftovers`, [LOCKED_HASH]);
if (c.unlocked || c.leftovers) throw new Error('template is not clean');
await db.close();
console.log(`database template: ${c.users} accounts, all locked`);
