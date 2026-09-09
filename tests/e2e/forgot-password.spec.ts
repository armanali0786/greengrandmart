import { test, expect } from '@playwright/test';

const EMULATOR_OOB_URL = 'http://127.0.0.1:9099/emulator/v1/projects/demo-greengrandmart/oobCodes';

async function getLatestOobCode(email: string, requestType: string): Promise<string> {
  const res = await fetch(EMULATOR_OOB_URL);
  const { oobCodes } = (await res.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string }[];
  };
  const matches = oobCodes.filter((c) => c.email === email && c.requestType === requestType);
  const latest = matches.at(-1);
  if (!latest) throw new Error(`No ${requestType} oobCode found for ${email}`);
  return latest.oobCode;
}

test('forgot password → reset → log in with the new password', async ({ page }) => {
  const email = `forgot-e2e+${Date.now()}@example.com`;
  const oldPassword = 'password123';
  const newPassword = 'newpassword456';

  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Forgot Pw');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', oldPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  const oobCode = await getLatestOobCode(email, 'PASSWORD_RESET');
  await page.goto(`/reset-password?oobCode=${oobCode}`);
  await expect(page.getByText(`For ${email}`)).toBeVisible();
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated')).toBeVisible();
  await page.waitForURL('/login');

  // Old password no longer works, new one does.
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', oldPassword);
  await page.click('button[type="submit"]');
  await expect(page.getByText('Incorrect email or password.')).toBeVisible();

  await page.fill('input[name="password"]', newPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('reset-password page rejects a missing/invalid oobCode', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByText('Link expired or invalid')).toBeVisible();

  await page.goto('/reset-password?oobCode=not-a-real-code');
  await expect(page.getByText('Link expired or invalid')).toBeVisible();
});
