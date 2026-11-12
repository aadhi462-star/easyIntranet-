// Shared steps for the browser journeys. Passwords are the published development ones
// (DEMO_ACCOUNTS.md); the server under test runs on its own throwaway database.
import { expect } from '@playwright/test';

export const DEMO = 'Community-Demo-2026';

/** Signs in through the real form. */
export async function signIn(page, email, password = DEMO) {
  await page.goto('/#/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/#\/login/);
}

/** The newest email to `to`, from the development outbox. */
export async function lastEmail(request, to) {
  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`);
  const { emails } = await res.json();
  return emails[0];
}

/** The first app link in an email body (confirm, reset). */
export const linkIn = (body) => body.match(/https?:\/\/\S+/)[0];
