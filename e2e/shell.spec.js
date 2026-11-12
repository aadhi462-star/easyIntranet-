// Workstream D journeys (board V2DPlan, server work): a new account's first-run Home, joining from
// Explore and seeing it in the sidebar and My Communities, the five bottom-bar destinations on a
// phone, and "/" to search. Each runs at 1280 and 375 px.
import { expect, test } from '@playwright/test';
import { lastEmail, linkIn, signIn } from './helpers.js';

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

/** A confirmed account that has finished the welcome steps without joining anything. */
async function newAccount(page, info) {
  const email = `d-${info.project.name}-${Date.now()}@example.com`;
  await page.goto('/#/signup');
  await page.getByLabel('Full name').fill('Shell Person');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-good-password-1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect.poll(async () => (await lastEmail(page.request, email))?.template).toBe('verify_email');
  await page.goto(`/${new URL(linkIn((await lastEmail(page.request, email)).body)).hash}`);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/#\/home/);
}

test('first-run Home, then join from Explore: it appears in the sidebar and My Communities (D4, D5, D8)', async ({ page }, info) => {
  await newAccount(page, info);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Welcome to CommunityOne/);
  await expect(page.getByText('none were joined for you')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browse by category' })).toBeVisible();
  await noSideScroll(page);

  await page.goto('/#/explore');
  const first = page.locator('main article').filter({ has: page.getByRole('button', { name: /^Join/ }) }).first();
  const name = (await first.getByRole('heading').first().textContent()).trim();
  // Pinned by name: once joined, the card no longer matches "has a Join button".
  const card = page.locator('main article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card.getByRole('button', { name: /^Join/ }).click();
  await expect(card.getByRole('link', { name: /^Open/ })).toBeVisible();

  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Close menu' }).click();
  } else {
    await expect(page.getByRole('complementary', { name: 'Platform' }).getByRole('link', { name })).toBeVisible();
  }
  await page.goto('/#/communities');
  await expect(page.getByRole('main').getByText(name).first()).toBeVisible();
  await page.goto('/#/home');
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/Welcome to CommunityOne/);
  await noSideScroll(page);
});

test('the phone bottom bar has exactly the five destinations, and old addresses redirect (D2, D11)', async ({ page }, info) => {
  await signIn(page, 'ishita@example.com', 'Alumni-Member-2093');
  if (info.project.name === 'phone') {
    const bar = page.getByRole('navigation', { name: 'Main' }).last();
    await expect(bar.getByRole('link')).toHaveText([/Home/, /Explore/, /Communities/, /Notifications/, /Profile/]);
    for (const [label, path] of [['Explore', '/explore'], ['Communities', '/communities'], ['Notifications', '/notifications'], ['Profile', '/profile'], ['Home', '/home']]) {
      await bar.getByRole('link', { name: new RegExp(label) }).click();
      await expect(page).toHaveURL(new RegExp(`#${path}`));
      await noSideScroll(page);
    }
  }
  for (const [from, to] of [['/dashboard', '/home'], ['/groups', '/communities'], ['/groups?tab=discover', '/explore'], ['/feed', '/home'], ['/feed/bookmarks', '/saved']]) {
    await page.goto(`/#${from}`);
    await expect(page).toHaveURL(new RegExp(`#${to.replace('?', '\\?')}$`));
  }
});

test('"/" focuses search on desktop and opens Search on a phone (D9)', async ({ page }, info) => {
  await signIn(page, 'ishita@example.com', 'Alumni-Member-2093');
  await page.goto('/#/home');
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  if (info.project.name === 'phone') await expect(page).toHaveURL(/#\/search/);
  else await expect(page.getByRole('banner').getByRole('combobox').or(page.getByRole('banner').getByRole('searchbox')).first()).toBeFocused();
});
