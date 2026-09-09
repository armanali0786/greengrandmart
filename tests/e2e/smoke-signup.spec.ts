import { test, expect } from '@playwright/test';

test('sign up creates a Firebase user and bridges into the app session', async ({ page }) => {
  const email = `smoketest+${Date.now()}@example.com`;

  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Smoke Test');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForURL('/');
  await expect(page.locator('header')).toContainText('Smoke Test');
});
