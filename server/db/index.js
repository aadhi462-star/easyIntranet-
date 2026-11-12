// Database access. PostgreSQL everywhere (decision D1):
//   - DATABASE_URL set  → a real PostgreSQL server through `pg` (production, staging).
//   - otherwise         → PGlite, the PostgreSQL engine embedded in Node (local development, tests).
// Both expose the same tiny interface: query(text, params) and tx(fn).
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';

export async function createDb({ url = process.env.DATABASE_URL, dataDir = process.env.PGLITE_DIR } = {}) {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn({ query: (t, p) => client.query(t, p) });
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  // `memory://` keeps everything in RAM (tests); a directory persists between runs.
  if (dataDir && !dataDir.startsWith('memory://')) await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir || 'memory://');
  // Hold the event loop open while PGlite starts. Its WebAssembly start-up keeps no libuv
  // handle, so the loop can run empty; Node 23 then waits for V8's background compiler, and
  // the compiler can wait for a garbage collection only the main thread runs: an idle process
  // that never finishes (like Node issue 54918; seen as test files that stalled under load).
  const hold = setInterval(() => {}, 1000);
  try { await db.waitReady; } finally { clearInterval(hold); }
  return {
    kind: 'pglite',
    query: (text, params) => db.query(text, params),
    // PGlite runs one statement at a time, so its transaction gives the same all-or-nothing
    // guarantee as a pooled PostgreSQL transaction.
    tx: (fn) => db.transaction((t) => fn({ query: (text, params) => t.query(text, params) })),
    close: () => db.close(),
  };
}

/** PostgreSQL unique-violation code, for turning races into clean 409 responses. */
export const UNIQUE_VIOLATION = '23505';
