import { test, expect } from '@playwright/test';

test('sign out then log back in with the same credentials', async ({ page }) => {
  const email = `smoketest+${Date.now()}@example.com`;
  const password = 'password123';

  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Smoke Test');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  await expect(page.locator('header')).toContainText('Smoke Test');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  await expect(page.locator('header')).toContainText('Smoke Test');
});

test('wrong password shows a specific error and does not navigate away', async ({ page }) => {
  const email = `smoketest+${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Smoke Test');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');

  await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  await expect(page).toHaveURL('/login');
});
