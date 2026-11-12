// Workstream C journeys (board V2CPlan, "How it's checked"): the landing page, joining from a
// community card through sign-up and the welcome steps, and a link that didn't work. Each runs
// at 1280 and 375 px.
import { expect, test } from '@playwright/test';
import { lastEmail, linkIn } from './helpers.js';

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

async function signUp(page, email) {
  await page.getByLabel('Full name').fill('Journey Person');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-good-password-1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

const emailFor = (info, what) => `c-${what}-${info.project.name}-${Date.now()}@example.com`;

test('the landing page: sections, live discovery filtered in place, no emoji, no side scroll (C1, C3, C5)', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Find your people\.\s*Build your community\./);
  await noSideScroll(page);
  // Features and Learning are sections of this page (C1); on phones they're in the Menu.
  for (const name of ['Features', 'Learning']) {
    if (info.project.name === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
    await expect(page.locator(`#${name.toLowerCase()}`)).toBeFocused();
  }
  // Discovery: the server's order, nothing pinned, chips from the listed communities only.
  const { communities } = await (await page.request.get('/api/public/communities?limit=6')).json();
  const cards = page.locator('#explore article h3');
  await expect(cards.first()).toHaveText(communities[0].name);
  expect(communities.every((c) => c.visibility !== 'closed')).toBe(true);
  const chips = page.getByRole('group', { name: 'Filter by category' }).getByRole('button');
  const category = (await chips.nth(1).textContent()).trim();
  await chips.nth(1).click();
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: `See all ${category} communities` }).first()).toBeAttached();
  await expect(cards.first()).toBeVisible();
  for (const c of await page.locator('#explore article').all()) {
    if (await c.isVisible()) await expect(c.getByText(new RegExp(`^${category} ·`))).toBeVisible();
  }
  expect(await page.evaluate(() => (document.body.innerText.match(/\p{Extended_Pictographic}/gu) || []))).toEqual([]);
  await noSideScroll(page);
});

test('Join from a card: sign up, confirm, and the welcome steps show that community without joining it (C9)', async ({ page }, info) => {
  await page.goto('/');
  const card = page.locator('#explore article').first();
  const name = (await card.locator('h3').textContent()).trim();
  await card.getByRole('link', { name: /^(Join|Request to join):/ }).click();
  await expect(page.getByText(`You were looking at ${name}.`, { exact: false })).toBeVisible();
  const email = emailFor(info, 'join');
  await signUp(page, email);
  await expect.poll(async () => (await lastEmail(page.request, email))?.template).toBe('verify_email');
  await page.goto(`/${new URL(linkIn((await lastEmail(page.request, email)).body)).hash}`);
  // Step 1 is optional; step 2 shows the community first, with its own Join, not joined.
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'You were looking at' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Joined 0 · Requested 0' })).toBeVisible();
  await noSideScroll(page);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).not.toHaveURL(/#\/welcome/);
  // Checked on the server: finishing with none leaves no memberships.
  const { communities } = await (await page.request.get('/api/communities')).json();
  expect(communities.filter((c) => ['active', 'restricted', 'pending'].includes(c.membership?.state))).toHaveLength(0);
});

test('a confirmation link that no longer works offers a new one, and the new one works (C8)', async ({ page }, info) => {
  const email = emailFor(info, 'relink');
  await page.goto('/#/signup');
  await signUp(page, email);
  await expect.poll(async () => (await lastEmail(page.request, email))?.template).toBe('verify_email');
  const first = linkIn((await lastEmail(page.request, email)).body);
  // Sending it again makes the first link stop working (REG-06).
  await page.getByRole('button', { name: 'Send it again' }).click();
  await expect.poll(async () => linkIn((await lastEmail(page.request, email)).body)).not.toBe(first);
  const second = linkIn((await lastEmail(page.request, email)).body);
  await page.goto(`/${new URL(first).hash}`);
  await expect(page.getByRole('heading', { name: 'This link has expired or was already used' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send a new link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect.poll(async () => linkIn((await lastEmail(page.request, email)).body)).not.toBe(second);
  await page.goto(`/${new URL(linkIn((await lastEmail(page.request, email)).body)).hash}`);
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user?.status).toBe('active');
});
