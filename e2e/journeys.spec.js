// Smoke journeys across the main workflows. Each one runs on desktop and phone widths.
import { expect, test } from '@playwright/test';
import { lastEmail, linkIn, signIn } from './helpers.js';

test('sign up, confirm the email, and start with no communities (v2 brief: no default community)', async ({ page, request }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  await page.goto('/#/signup');
  await page.getByLabel('Full name').fill('Test Person');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a-good-password-1');
  const terms = page.getByRole('checkbox');
  if (await terms.count()) await terms.first().check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect.poll(async () => (await lastEmail(request, email))?.template).toBe('verify_email');
  const link = new URL(linkIn((await lastEmail(request, email)).body));
  await page.goto(`/${link.hash}`);
  // Confirmed: the account is active and signed in, and the app moves on from the token page.
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user?.status).toBe('active');
  const me = await page.request.get('/api/communities');
  const { communities } = await me.json();
  expect(communities.filter((c) => c.membership?.state === 'active')).toHaveLength(0);
});

test('a member joins a Public community and posts in it', async ({ page }, info) => {
  await signIn(page, 'ishita@example.com', 'Alumni-Member-2093');
  const list = await (await page.request.get('/api/communities')).json();
  const target = list.communities.find((c) => c.visibility === 'public' && c.membership?.state !== 'active');
  test.skip(!target, 'Ishita is already in every Public community in the seed');
  await page.goto(`/#/c/${target.slug}`);
  await page.getByRole('button', { name: /^Join/ }).first().click();
  await expect(page.getByRole('button', { name: /^Join/ })).toHaveCount(0);
  await page.goto(`/#/c/${target.slug}/discussions`);
  const text = `Hello from the ${info.project.name} journey ${Date.now()}`;
  // Desktop shows the composer open; phones fold it into "Write a post" (board V2EDiscussions).
  const fold = page.getByRole('button', { name: /^Write a post/ });
  if (await fold.count()) await fold.first().click();
  await page.getByLabel('Post text').fill(text);
  await page.getByRole('button', { name: /^(Post|Publish)/ }).last().click();
  await expect(page.getByText(text)).toBeVisible();
});

test('the app is light by default and has no emoji (v2 B1–B5)', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(247, 248, 246)');
  await signIn(page, 'sara@example.com');
  for (const path of ['/#/dashboard', '/#/feed', '/#/events', '/#/groups', '/#/admin/communities']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const emoji = await page.evaluate(() => (document.body.innerText.match(/\p{Extended_Pictographic}/gu) || []).filter((c) => !'↗↩↔★☆✓'.includes(c)));
    expect(emoji, path).toEqual([]);
  }
});

test('a Platform Admin deletes a community and restores it (D1, D2)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Administration is checked at desktop width here');
  await signIn(page, 'sara@example.com');
  await page.goto('/#/admin/communities');
  await page.getByRole('button', { name: 'Mumbai Chapter' }).click();
  await page.getByRole('button', { name: 'Delete…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Mumbai Chapter' });
  await dialog.getByRole('textbox').first().fill('Browser journey check');
  await dialog.getByPlaceholder('Mumbai Chapter').fill('Mumbai Chapter');
  await dialog.getByRole('button', { name: 'Delete community' }).click();
  await expect(page.getByText('Community deleted · restorable for 30 days')).toBeVisible();
  expect((await (await page.request.get('/api/communities/mumbai-chapter')).json()).error.code).toBe('COMMUNITY_REMOVED');
  await page.getByRole('button', { name: 'Restore' }).click();
  // The shared confirm dialog (v2 B), named after its action.
  await page.getByRole('dialog', { name: /^Restore Mumbai Chapter/ }).getByRole('button', { name: 'Restore' }).click();
  await expect.poll(async () => (await page.request.get('/api/communities/mumbai-chapter')).status()).toBe(200);
});
