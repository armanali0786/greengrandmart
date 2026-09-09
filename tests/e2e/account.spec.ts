import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const email = `account-e2e+${Date.now()}@example.com`;
const password = 'password123';

test('signup, then full profile + address CRUD', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Account Tester');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  // Profile
  await page.goto('/account');
  await expect(page.getByLabel('Full name')).toHaveValue('Account Tester');
  await page.getByLabel('Full name').fill('Updated Name');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Updated Name');
  await expect(page.getByLabel('Phone')).toHaveValue('9876543210');

  // Addresses
  await page.goto('/account/addresses');
  await expect(page.getByText('No addresses saved yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Add address' }).first().click();
  await page.getByLabel('Full name').fill('Riya Sharma');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Address line 1').fill('12 MG Road');
  await page.getByLabel('City').fill('Hyderabad');
  await page.getByLabel('State').fill('Telangana');
  await page.getByLabel('PIN code').fill('500001');
  await page.getByLabel('Set as default shipping address').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();

  await expect(page.getByText('Riya Sharma')).toBeVisible();
  await expect(page.getByText('Default shipping')).toBeVisible();

  // Add a second address and make it the default shipping — first should lose the badge
  await page.getByRole('button', { name: 'Add address' }).first().click();
  await page.getByLabel('Full name').fill('Second Address');
  await page.getByLabel('Phone').fill('9123456789');
  await page.getByLabel('Address line 1').fill('99 Park Street');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('400001');
  await page.getByLabel('Set as default shipping address').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();

  await expect(page.getByText('Second Address')).toBeVisible();
  await expect(page.getByText('Default shipping')).toHaveCount(1); // only one address is default now

  // Edit the second address
  await page
    .getByTestId('address-card')
    .filter({ hasText: 'Second Address' })
    .getByRole('button', { name: 'Edit' })
    .click();
  await page.getByLabel('City').fill('Pune');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Pune')).toBeVisible();

  // Delete the first address
  await page
    .getByTestId('address-card')
    .filter({ hasText: 'Riya Sharma' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByRole('heading', { name: 'Remove this address?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Riya Sharma')).not.toBeVisible();
  await expect(page.getByText('Second Address')).toBeVisible();
});
