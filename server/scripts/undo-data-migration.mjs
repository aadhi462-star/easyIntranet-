// Undoes a named data migration (lib/data-migrations.js) on the local database or DATABASE_URL.
//   node server/scripts/undo-data-migration.mjs p1-alumnizone-ordinary
// Stop the server first when using PGlite: it's single-process.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { undoDataMigration } from '../lib/data-migrations.js';

const name = process.argv[2];
if (!name) { console.error('Usage: undo-data-migration.mjs <name>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = await createDb({ dataDir: process.env.PGLITE_DIR || path.join(root, 'server', '.data', 'pg') });
await migrate(db);
console.log(name, await undoDataMigration(db, name));
await db.close();
