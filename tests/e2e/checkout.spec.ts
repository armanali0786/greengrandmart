import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const adminEmail = `checkout-admin+${runId}@example.com`;
const customerEmail = `checkout-customer+${runId}@example.com`;
const password = 'password123';

const categoryName = `Footwear ${runId}`;
const categorySlug = `footwear-${runId}`;
const productName = `Canvas Sneakers ${runId}`;
const productSlug = `canvas-sneakers-${runId}`;

function promoteToAdmin(userEmail: string) {
  execSync(`npm run set-user-role -- ${userEmail} admin`, { cwd: process.cwd(), stdio: 'pipe' });
}

test('admin creates a product for the checkout flow', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Checkout Admin');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
  promoteToAdmin(adminEmail);
  await page.reload();

  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Name').fill(categoryName);
  await page.getByLabel('Slug').fill(categorySlug);
  await page.getByRole('dialog').getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByText(categoryName, { exact: true })).toBeVisible();

  await page.goto('/admin/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByLabel('Name').blur();
  await page.locator('#categoryId').selectOption({ label: categoryName });
  await page.getByLabel('Base price (₹)').fill('1499');
  await page.getByLabel('GST rate (%)').fill('12');
  await page.getByLabel('SKU').fill(`CS-${runId}`);
  await page.getByLabel('Price (₹)', { exact: true }).fill('1499');
  await page.getByLabel('Initial stock').fill('15');
  await page.locator('#status').selectOption('active');
  await page.getByRole('button', { name: 'Create product' }).click({ force: true });
  await page.waitForURL(/\/admin\/products\/.+\/edit/);
});

test('customer places an order end to end and it appears in order history', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Checkout Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).click();
  await page.getByLabel('Full name').fill('Checkout Customer');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Address line 1').fill('42 Linking Road');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('400050');
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('42 Linking Road')).toBeVisible();

  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/cart');
  await page.getByRole('link', { name: 'Proceed to Checkout' }).click();
  await page.waitForURL('/checkout');

  await expect(page.getByText('42 Linking Road')).toBeVisible();
  // Live quote: subtotal ₹1499.00 with 12% GST split as CGST+SGST (Maharashtra matches SELLER_STATE).
  await expect(page.getByText('₹1,499.00').first()).toBeVisible();
  await expect(page.getByText('CGST')).toBeVisible();
  await expect(page.getByText('SGST')).toBeVisible();

  const payButton = page.getByRole('button', { name: /^Pay ₹/ });
  await expect(payButton).toBeEnabled();
  await payButton.click();

  await page.waitForURL(/\/account\/orders\/.+/);
  await expect(page.getByText('Payment Pending').first()).toBeVisible();
  await expect(page.getByText(productName)).toBeVisible();
  // Not yet cancelable — Product_Spec_Requirements.md §5.2 only allows
  // cancel from Confirmed/Processing, not Payment Pending.
  await expect(page.getByRole('button', { name: 'Cancel order' })).not.toBeVisible();

  await page.goto('/account/orders');
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByText('Payment Pending')).toBeVisible();

  // Cart is empty again after a successful checkout.
  await page.goto('/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('admin sees the order and cannot force-confirm a pending_payment order', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/admin/orders');
  await expect(page.getByText('Checkout Customer').first()).toBeVisible();
  await expect(page.locator('table').getByText('Payment Pending').first()).toBeVisible();

  await page.getByRole('link', { name: 'View' }).first().click();
  await page.waitForURL(/\/admin\/orders\/.+/);
  await expect(page.getByText(productName)).toBeVisible();

  await page.locator('#nextStatus').selectOption('confirmed');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(
    page.getByText(/Cannot move from 'pending_payment' directly to 'confirmed'/),
  ).toBeVisible();
});
