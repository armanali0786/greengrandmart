import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const adminEmail = `pricing-admin+${runId}@example.com`;
const customerEmail = `pricing-customer+${runId}@example.com`;
const password = 'password123';

const categoryName = `Skincare ${runId}`;
const categorySlug = `skincare-${runId}`;
const productName = `Vitamin C Serum ${runId}`;
const productSlug = `vitamin-c-serum-${runId}`;
const couponCode = `SAVE10${runId}`;
const promotionName = `Skincare Week ${runId}`;

function promoteToAdmin(userEmail: string) {
  execSync(`npm run set-user-role -- ${userEmail} admin`, { cwd: process.cwd(), stdio: 'pipe' });
}

test('admin sets up a GST-rated product, a coupon, and a category promotion', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Pricing Admin');
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
  await page.getByLabel('Base price (₹)').fill('1000');
  await page.getByLabel('GST rate (%)').fill('18');
  await page.getByLabel('SKU').fill(`VCS-${runId}`);
  await page.getByLabel('Price (₹)', { exact: true }).fill('1000');
  await page.getByLabel('Initial stock').fill('20');
  await page.locator('#status').selectOption('active');
  await page.getByRole('button', { name: 'Create product' }).click({ force: true });
  await page.waitForURL(/\/admin\/products\/.+\/edit/);

  // Coupon: 10% off, no cap.
  await page.goto('/admin/coupons');
  await page.getByRole('button', { name: 'New coupon' }).click();
  await page.getByLabel('Code').fill(couponCode);
  await page.getByLabel('Percent off (%)').fill('10');
  await page.getByRole('dialog').getByRole('button', { name: 'Create coupon' }).click();
  await expect(page.getByText(couponCode, { exact: true })).toBeVisible();

  // Promotion: 20% off the Skincare category, automatic (no code).
  await page.goto('/admin/promotions');
  await page.getByRole('button', { name: 'New promotion' }).click();
  await page.getByLabel('Name').fill(promotionName);
  await page.getByLabel('Percent off (%)').fill('20');
  await page.locator('#scopeType').selectOption('categories');
  await page.locator('select[multiple]').selectOption({ label: categoryName });
  await page.getByRole('dialog').getByRole('button', { name: 'Create promotion' }).click();
  await expect(page.getByText(promotionName, { exact: true })).toBeVisible();
});

test('customer sees the promotion and coupon reflected in cart and checkout/quote', async ({
  page,
}) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Pricing Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  // Add a Maharashtra address (matches SELLER_STATE — intra-state, CGST+SGST).
  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).click();
  await page.getByLabel('Full name').fill('Pricing Customer');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Address line 1').fill('1 MG Road');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('400001');
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('1 MG Road')).toBeVisible();

  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/cart');
  await page.getByLabel('Coupon code').fill(couponCode);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(`${couponCode} applied`)).toBeVisible();
  await expect(page.getByText(/Coupon \(/)).toBeVisible();

  // Full breakdown (subtotal/promotion/coupon/GST/shipping) only exists via
  // /checkout/quote — no checkout page yet (Phase 6), so verify it directly.
  // The bearer token lives in the Firebase SDK's IndexedDB state, not
  // reachable from Playwright's request context directly — captured here
  // off a real authenticated request the app itself makes (GET /api/addresses
  // on page load), rather than reimplementing token retrieval.
  await page.goto('/account/addresses');
  const [addressesResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/api/addresses') && res.request().method() === 'GET',
    ),
    page.reload(),
  ]);
  const authHeader = addressesResponse.request().headers()['authorization'];
  const addressesBody = await addressesResponse.json();
  const addressId = addressesBody.data[0].id;

  const quoteRes = await page.request.post('/api/checkout/quote', {
    headers: { Authorization: authHeader },
    data: { shippingAddressId: addressId, couponCode },
  });
  const { data: quote } = await quoteRes.json();

  // subtotal: ₹1000 = 100000 paise.
  expect(quote.subtotal).toBe(100000);
  // Promotion: 20% off the Skincare category = 20000.
  expect(quote.productDiscount).toBe(20000);
  // Coupon: 10% of the post-promotion 80000 = 8000.
  expect(quote.couponDiscount).toBe(8000);
  // GST: 18% of (100000 - 20000 - 8000) = 18% of 72000 = 12960, split evenly.
  expect(quote.taxTotal).toBe(12960);
  expect(quote.cgst).toBe(6480);
  expect(quote.sgst).toBe(6480);
  expect(quote.igst).toBe(0);
  expect(quote.grandTotal).toBe(100000 - 20000 - 8000 + 12960 + quote.shippingFee);
});
