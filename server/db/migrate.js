// Applies server/migrations/*.sql in name order, once each, recording them in schema_migrations.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(db, { log = () => {} } = {}) {
  await db.query(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const done = new Set((await db.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(DIR, file), 'utf8');
    // Each migration is all-or-nothing.
    await db.tx(async (t) => {
      for (const statement of splitSql(sql)) await t.query(statement);
      await t.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    log(`migrated ${file}`);
  }
}

// Migrations are plain statements separated by semicolons at line ends (no functions with
// embedded semicolons), so a simple split is enough and keeps parameterless DDL portable.
function splitSql(sql) {
  return sql.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
}
