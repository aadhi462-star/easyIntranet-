// Workstream H audit: crawls every screen each role can reach and checks it at phone, tablet and
// desktop width (sideways scroll, target size, contrast, names, structure), plus a dark-mode
// contrast pass and a keyboard focus pass at desktop. Run with `npm run test:audit`; the findings
// go to test-results/audit/. Only runs when AUDIT=1, so `npm run test:e2e` stays quick.
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { signIn, DEMO } from './helpers.js';
import { pageChecks, focusState } from './audit-checks.js';

test.skip(!process.env.AUDIT, 'set AUDIT=1 (npm run test:audit)');
test.describe.configure({ mode: 'serial', timeout: 30 * 60_000 });

const WIDTHS = { phone: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 860 } };
const PUBLIC = ['/', '/about', '/help', '/privacy', '/terms', '/contact', '/login', '/signup', '/forgot', '/explore', '/verify'];
const START = ['/home', '/explore', '/communities', '/profile', '/search?q=design', '/notifications', '/saved', '/events', '/calendar', '/learning', '/people', '/communities/new', '/admin'];
const ROLES = [
  { name: 'signed-out', start: PUBLIC },
  { name: 'member', email: 'ishita@example.com', password: 'Alumni-Member-2093', start: START },
  { name: 'host', email: 'neha.host@example.com', password: 'Lime-Host-4821', start: START },
  { name: 'super-admin', email: 'sara@example.com', password: DEMO, start: START },
];
// Never follow links that sign out or act on a token.
const SKIP = /^\/(logout|confirm-email|reset|invite)\b/;
const MAX_PAGES = 90;

// One visit per address shape: /c/<slug>/manage/settings/general counts once per shape, so the
// crawl covers every kind of screen without walking all 34 communities.
const shape = (path) => {
  const [p] = path.split('?');
  const s = p.split('/').filter(Boolean);
  if (s[0] === 'c' && s.length > 1) s[1] = ':c';
  else if (s.length > 1 && /^(people|post|events|lessons|notices|verify|courses)$/.test(s[0])) s[1] = ':id';
  return '/' + s.map((x) => (/^[0-9a-f-]{8,}$|^\d+$/i.test(x) ? ':id' : x)).join('/') + (path.includes('admin=1') ? '?admin' : '');
};

async function axNames(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const roles = /^(button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|menuitem|slider|spinbutton|listbox|img|image)$/;
  const bad = nodes.filter((n) => !n.ignored && roles.test(n.role?.value || '') && !(n.name?.value || '').trim());
  const out = [];
  for (const n of bad.slice(0, 15)) {
    let html = '';
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function(){return this.outerHTML.slice(0,160)}', returnByValue: true });
      html = r.result.value;
    } catch { /* node went away */ }
    out.push({ rule: 'name', el: `${n.role.value}: ${html}`, detail: 'no accessible name' });
  }
  await cdp.detach();
  return out;
}

async function settle(page, path) {
  await page.goto('/#' + path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(250);
}

async function links(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
    .map((h) => (h.startsWith('/#/') ? h.slice(2) : h.startsWith('#/') ? h.slice(1) : null)).filter(Boolean));
}

for (const role of ROLES) {
  test(`audit: ${role.name}`, async ({ browser }) => {
    const contexts = {};
    for (const [w, viewport] of Object.entries(WIDTHS)) {
      contexts[w] = await browser.newContext({ viewport, ...(w === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
    }
    contexts.dark = await browser.newContext({ viewport: WIDTHS.desktop });
    await contexts.dark.addInitScript(() => localStorage.setItem('alumnizone:theme', 'dark'));
    const pages = {};
    for (const [k, ctx] of Object.entries(contexts)) {
      pages[k] = await ctx.newPage();
      if (role.email) await signIn(pages[k], role.email, role.password);
    }

    const findings = [];
    const visited = [];
    const shapes = new Set();
    const queue = [...role.start];
    while (queue.length && visited.length < MAX_PAGES) {
      const path = queue.shift();
      const key = shape(path);
      if (shapes.has(key) || SKIP.test(path)) continue;
      shapes.add(key);

      const desk = pages.desktop;
      await settle(desk, path);
      const landed = (await desk.evaluate(() => location.hash.slice(1))) || '/';
      if (landed !== path && shapes.has(shape(landed))) continue; // redirected to a screen already checked
      shapes.add(shape(landed));
      visited.push(landed);
      for (const l of await links(desk)) if (!shapes.has(shape(l))) queue.push(l);

      const add = (width, list) => findings.push(...list.map((f) => ({ ...f, width, path: landed })));
      add('desktop', await desk.evaluate(pageChecks, {}));
      add('desktop', await axNames(desk));
      // Keyboard: the first 25 Tab stops must each show a focus indicator.
      await desk.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < 25; i++) {
        await desk.keyboard.press('Tab');
        const f = await desk.evaluate(focusState);
        if (f && !f.visible) add('desktop', [{ rule: 'focus-visible', el: f.el, detail: `no outline or ring on focus (${f.style})` }]);
      }
      for (const w of ['phone', 'tablet']) {
        await settle(pages[w], landed);
        add(w, await pages[w].evaluate(pageChecks, {}));
      }
      await settle(pages.dark, landed);
      add('dark', await pages.dark.evaluate(pageChecks, { contrastOnly: true }));
    }

    // Group the same problem on the same element across pages and widths.
    const groups = new Map();
    for (const f of findings) {
      const k = `${f.rule}|${f.el}`;
      const g = groups.get(k) || { rule: f.rule, el: f.el, detail: f.detail, widths: new Set(), paths: new Set() };
      g.widths.add(f.width); g.paths.add(f.path);
      groups.set(k, g);
    }
    const report = [...groups.values()].map((g) => ({ ...g, widths: [...g.widths], paths: [...g.paths].slice(0, 6), pages: g.paths.size }))
      .sort((a, b) => a.rule.localeCompare(b.rule) || b.pages - a.pages);
    await mkdir('test-results/audit', { recursive: true });
    await writeFile(`test-results/audit/${role.name}.json`, JSON.stringify({ visited, report }, null, 2));
    const byRule = report.reduce((m, g) => ({ ...m, [g.rule]: (m[g.rule] || 0) + 1 }), {});
    console.log(`${role.name}: ${visited.length} screens; distinct findings by rule`, byRule);
    for (const ctx of Object.values(contexts)) await ctx.close();
    if (process.env.AUDIT_STRICT) expect(report).toEqual([]);
  });
}
