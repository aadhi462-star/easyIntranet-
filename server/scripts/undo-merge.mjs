// Undoes a community merge (decision R4), e.g. All Hands back out of AlumniZone:
//   node server/scripts/undo-merge.mjs g0
// Uses DATABASE_URL when set, otherwise the local PGlite data directory (stop the server first).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { undoMerge } from '../lib/merge.js';

const from = process.argv[2];
if (!from) { console.error('Usage: node server/scripts/undo-merge.mjs <community id>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = await createDb({ dataDir: process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg') });
await migrate(db);
console.log('undone', await undoMerge(db, { from }));
await db.close();
