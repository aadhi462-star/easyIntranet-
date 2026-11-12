// Starts the real server for the browser tests on a fresh, seeded database in the system's temp
// folder (never the development database). Run by playwright.config.js; needs `npm run build`.
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), 'communityone-e2e-db');
await rm(dir, { recursive: true, force: true });
Object.assign(process.env, { PGLITE_DIR: dir, SEED_ON_START: '1', PORT: process.env.E2E_PORT || '5190', LOG_LEVEL: 'warn', NODE_ENV: 'development' });
await import('../server/index.js');
