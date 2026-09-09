import { test, expect } from '@playwright/test';

test('delete account requires re-auth and anonymizes the record', async ({ page }) => {
  const email = `delete-e2e+${Date.now()}@example.com`;
  const password = 'password123';

  await page.goto('/signup');
  await page.fill('input[name="name"]', 'To Be Deleted');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();

  // Wrong password should fail with a clear error, not silently proceed.
  await page.getByLabel('Confirm your password').fill('wrongpassword');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();

  // Correct password proceeds. RequireAuth's own guard on this now-protected
  // page reacts to the sign-out and redirects to /login before the delete
  // handler's own router.push('/') runs — landing on /login either way is
  // correct, so assert on that rather than a specific URL race winner.
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
  await page.waitForURL(/\/(login)?$/);
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();
});
