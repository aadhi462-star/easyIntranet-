// Exports the prototype's demo data (src/data/seed.js) to server/seed/prototype.json, the
// migration source for the CommunityOne database. Uses Vite to load the module because the
// prototype relies on `import.meta.glob`, which plain Node doesn't understand.
//   npm run db:export-prototype
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { initialState } = await vite.ssrLoadModule('/src/data/seed.js');
  const state = initialState();
  const out = path.join(root, 'server', 'seed', 'prototype.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(state, null, 1));
  const counts = Object.fromEntries(Object.entries(state).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  console.log(`wrote ${path.relative(root, out)}`, counts);
} finally {
  await vite.close();
}
