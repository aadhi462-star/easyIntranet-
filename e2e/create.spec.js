// Workstream F journeys: create a community from scratch and from a template, at 1280 and 375 px.
// Both end on the new community's Overview with the creator as its Owner (F1–F5).
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.js';

const noSideScroll = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

/** On phones Configure's sections open one at a time; open the one holding `name` if it's closed. */
async function open(page, section) {
  const head = page.getByRole('button', { name: new RegExp(`^${section}`) });
  if (await head.count() && (await head.first().getAttribute('aria-expanded')) === 'false') await head.first().click();
}

async function publish(page) {
  await page.getByRole('button', { name: /^Preview/ }).last().click();
  await expect(page.getByText(/Preview only/).first()).toBeVisible();
  await noSideScroll(page);
  await page.getByRole('button', { name: /^Publish/ }).last().click();
  // The server check runs first (POST /communities/validate); Publish community enables when it passes.
  const go = page.getByRole('button', { name: 'Publish community' });
  await expect(go).toBeEnabled({ timeout: 15_000 });
  await go.click();
  await expect(page).toHaveURL(/#\/c\/[^/]+$/, { timeout: 15_000 });
}

test('create a community from scratch and become its Owner (F2, F5)', async ({ page }, info) => {
  await signIn(page, 'ishita@example.com', 'Alumni-Member-2093');
  await page.goto('/#/communities/new');
  await page.getByRole('radio', { name: /Start from scratch/ }).check();
  await page.getByRole('button', { name: 'Continue' }).last().click();
  const name = `Scratch ${info.project.name} ${Date.now()}`;
  await open(page, 'Basics');
  await page.getByLabel('Name', { exact: true }).fill(name);
  // From scratch nothing is filled in: the check asks for a description and a category (COM-10).
  await page.getByLabel(/^Description/).first().fill('A community made by the browser journey.');
  await page.getByLabel(/^Category/).first().selectOption('Hobbies and Interests');
  await open(page, 'Membership');
  await page.getByRole('radio', { name: /^Public/ }).check();
  await noSideScroll(page);
  await publish(page);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const slug = new URL(page.url()).hash.split('/')[2];
  const { membership } = await (await page.request.get(`/api/communities/${slug}`)).json();
  expect(membership.role).toBe('owner');
});

test('create a community from a template, skipping the questions (F3, F6)', async ({ page }, info) => {
  await signIn(page, 'ishita@example.com', 'Alumni-Member-2093');
  await page.goto('/#/communities/new');
  await page.getByRole('radio', { name: /Use a template/ }).check();
  await page.getByRole('button', { name: /^Use / }).first().click();
  await page.getByRole('button', { name: 'Continue' }).last().click();
  await page.getByRole('button', { name: 'Skip questions' }).first().click();
  const name = `Template ${info.project.name} ${Date.now()}`;
  await open(page, 'Basics');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await publish(page);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const slug = new URL(page.url()).hash.split('/')[2];
  const detail = await (await page.request.get(`/api/communities/${slug}`)).json();
  expect(detail.membership.role).toBe('owner');
  // The template's topics were created with it, in the same request.
  const { topics } = await (await page.request.get(`/api/communities/${detail.community.id}/topics`)).json();
  expect(topics.length).toBeGreaterThan(0);
});
