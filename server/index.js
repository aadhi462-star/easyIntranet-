// CommunityOne server: API on /api and the built web app on every other path.
//   npm run server            (after `npm run build`)
// Environment: PORT (5181), DATABASE_URL (PostgreSQL) or PGLITE_DIR (default server/.data/pg).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg');
const db = await createDb({ dataDir });
await migrate(db, { log: (m) => console.log(m) });

const app = await buildApp({ db, staticDir: process.env.STATIC_DIR || path.join(root, 'dist'), logger: { level: process.env.LOG_LEVEL || 'info' } });
const port = Number(process.env.PORT) || 5181;
await app.listen({ port, host: process.env.HOST || '127.0.0.1' });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.close(); await db.close(); process.exit(0); });
