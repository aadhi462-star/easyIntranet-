// CommunityOne server: API on /api and the built web app on every other path.
//   npm run server            (after `npm run build`)
// Environment: PORT (5181), DATABASE_URL (PostgreSQL) or PGLITE_DIR (default server/.data/pg).
// On Catalyst AppSail the platform sets X_ZOHO_CATALYST_LISTEN_PORT; we then listen on all interfaces.
// SEED_PASSWORD (production) or SEED_ON_START=1 seeds an empty database in this same process.
// A deploy bundle ships server/db-template (a migrated, seeded database with locked accounts):
// when there is no database yet it is copied into place, which skips the slow first-time setup.
import { cp, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { runJobs } from './lib/jobs.js';
import { runSeed } from './scripts/seed.mjs';
import { convertQuestionTypes, convertSectionLists, retireMembershipRules } from './lib/data-migrations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Links in emails (confirm, reset) use APP_ORIGIN; without it they'd come from the request's Host
// header, which a client controls (reset-link poisoning). Required in production.
const appOrigin = process.env.APP_ORIGIN?.replace(/\/+$/, '') || undefined;
if (process.env.NODE_ENV === 'production' && !appOrigin) throw new Error('Set APP_ORIGIN (e.g. https://communityone-123.development.catalystappsail.in) in production.');
if (process.env.NODE_ENV === 'production') {
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(appOrigin)) throw new Error(`APP_ORIGIN must be just the site address, like https://name.catalystappsail.in (got "${String(appOrigin).slice(0, 60)}").`);
  if (process.env.MAIL_TRANSPORT !== 'catalyst') console.warn('MAIL_TRANSPORT is not "catalyst": emails will not be sent.');
}

const dataDir = process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg');
const exists = (p) => stat(p).then(() => true, () => false);
const template = path.join(root, 'server', 'db-template');
if (!process.env.DATABASE_URL && !(await exists(path.join(dataDir, 'PG_VERSION'))) && (await exists(path.join(template, 'PG_VERSION')))) {
  // The template is used once per deploy, so moving it is enough (instant); copying ~40 MB of
  // small files took seconds. Copy only if it lives on another disk.
  await mkdir(path.dirname(dataDir), { recursive: true });
  await rename(template, dataDir).catch(() => cp(template, dataDir, { recursive: true }));
  console.log('database created from the bundled template');
}
const db = await createDb({ dataDir });
await migrate(db, { log: (m) => console.log(m) });
// Data migrations that must reach every database, not only freshly seeded ones (each runs once,
// logged and undoable): older section lists become the section switches (v2 E2), stored
// template questionnaires move to the five question types (v2 F12), and automatic membership
// rules are switched off (v2 G2).
await convertSectionLists(db);
await convertQuestionTypes(db);
await retireMembershipRules(db);
if (process.env.SEED_PASSWORD || process.env.SEED_ON_START === '1') await runSeed(db);

// RATE_LIMITS=off is for the browser tests, which sign in many times a minute; production always
// keeps the limits, whatever the variable says.
const rateLimits = process.env.NODE_ENV === 'production' || process.env.RATE_LIMITS !== 'off';
const app = await buildApp({ db, appOrigin, rateLimits, staticDir: process.env.STATIC_DIR || path.join(root, 'dist'), logger: { level: process.env.LOG_LEVEL || 'info' } });
// Background jobs each minute: scheduled posts, event reminders, email retries, waitlists
// (lib/jobs.js; each is safe to run twice).
setInterval(() => { runJobs(app.ctx, app.log); }, 60e3).unref();

const appsailPort = Number(process.env.X_ZOHO_CATALYST_LISTEN_PORT);
const port = appsailPort || Number(process.env.PORT) || 5181;
await app.listen({ port, host: process.env.HOST || (appsailPort ? '0.0.0.0' : '127.0.0.1') });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); await db.close(); process.exit(0); });
