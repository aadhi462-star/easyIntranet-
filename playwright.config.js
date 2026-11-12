// Browser smoke journeys (v2 brief, decision P3). `npm run test:e2e` builds the app, starts the
// server on a fresh seeded database and drives the installed Google Chrome.
import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT || 5190);
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // one database, one server: journeys run in order
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
    { name: 'phone', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node e2e/start-server.mjs', url: `http://127.0.0.1:${port}/api/health`, timeout: 120_000, reuseExistingServer: false },
});
