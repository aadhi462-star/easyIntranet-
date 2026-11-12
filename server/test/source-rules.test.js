// Source rules from the v2 brief that a reviewer can't check by eye in every file: no emoji
// (decision B5) and no browser confirm() (the v2 Confirm component). Reads files only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EMOJI = /\p{Extended_Pictographic}/u;

function files(dirs) {
  const out = [];
  const walk = (p) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(path.join(p, f));
    else if (/\.(jsx?|mjs|json|css|html)$/.test(p)) out.push(p);
  };
  for (const d of dirs) walk(path.join(root, d));
  return out;
}

test('B5: no emoji in source or seed data, except the icon translation table for old data', () => {
  const found = [];
  for (const f of files(['src', 'server/seed', 'server/scripts', 'server/lib', 'server/routes', 'index.html'])) {
    const rel = path.relative(root, f);
    let table = false; // inside icons.jsx's EMOJI_ICON map, which turns stored emoji into icons
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (rel === path.join('src', 'components', 'icons.jsx')) {
        if (line.startsWith('const EMOJI_ICON = {')) table = true;
        else if (table && line.startsWith('};')) table = false;
      }
      if (!table && EMOJI.test(line)) found.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});

test('no browser confirm() in the client; confirmAction() names the action instead', () => {
  const found = [];
  for (const f of files(['src'])) {
    if (f.endsWith(path.join('ui', 'Confirm.jsx'))) continue; // the fallback when no dialog host is mounted
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/(?<![\w.])confirm\(|window\.confirm\(/.test(line)) found.push(`${path.relative(root, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
