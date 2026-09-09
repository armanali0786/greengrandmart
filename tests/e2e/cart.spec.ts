import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const adminEmail = `cart-admin+${runId}@example.com`;
const password = 'password123';

const categoryName = `Accessories ${runId}`;
const categorySlug = `accessories-${runId}`;
const brandName = `GGM Accessories ${runId}`;
const brandSlug = `ggm-accessories-${runId}`;
const productName = `Hoop Earrings ${runId}`;
const productSlug = `hoop-earrings-${runId}`;

function promoteToAdmin(userEmail: string) {
  execSync(`npm run set-user-role -- ${userEmail} admin`, { cwd: process.cwd(), stdio: 'pipe' });
}

test('admin creates a limited-stock product for the cart tests', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Cart Admin');
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

  await page.goto('/admin/brands');
  await page.getByRole('button', { name: 'New brand' }).click();
  await page.getByLabel('Name').fill(brandName);
  await page.getByLabel('Slug').fill(brandSlug);
  await page.getByRole('dialog').getByRole('button', { name: 'Create brand' }).click();
  await expect(page.getByText(brandName, { exact: true })).toBeVisible();

  await page.goto('/admin/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByLabel('Name').blur();
  await page.locator('#categoryId').selectOption({ label: categoryName });
  await page.locator('#brandId').selectOption({ label: brandName });
  await page.getByLabel('Base price (₹)').fill('499');
  await page.getByLabel('SKU').fill(`HE-${runId}`);
  await page.getByLabel('Price (₹)', { exact: true }).fill('499');
  await page.getByLabel('Initial stock').fill('2');
  await page.locator('#status').selectOption('active');
  await page.getByRole('button', { name: 'Create product' }).click({ force: true });
  await page.waitForURL(/\/admin\/products\/.+\/edit/);

  await page.goto(`/products/${productSlug}`);
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();
});

test('guest cart: add, persist across reload, update quantity, then remove with undo', async ({
  page,
}) => {
  // One continuous guest session (a fresh browser context per Playwright
  // test, carrying the guest cookie throughout) — the cart lifecycle steps
  // below all depend on each other's state, so they stay in one test rather
  // than being split across tests that wouldn't share that cookie.
  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  // Header badge reflects the new item without a full reload.
  await expect(page.getByLabel('Cart, 1 item')).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByText(productName)).toBeVisible();
  await expect(page.getByText('₹499.00', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Increase quantity' }).click();
  // Debounced PATCH (500ms) — wait for the request/response round trip to
  // fully settle before reloading, generously past the debounce window.
  await page.waitForResponse(
    (res) => res.url().includes('/api/cart/items/') && res.request().method() === 'PATCH',
  );
  await page.reload();
  await expect(page.getByLabel('Cart, 2 items')).toBeVisible();
  await expect(page.getByText(productName)).toBeVisible();

  await page.getByRole('button', { name: 'Remove item' }).click();
  await expect(page.getByText('Item removed')).toBeVisible();
  // Undo before the 5s window elapses — the item must still be there.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(productName)).toBeVisible();

  await page.getByRole('button', { name: 'Remove item' }).click();
  await expect(page.getByText('Item removed')).toBeVisible();
  // Let the undo window elapse for real this time, then confirm it's gone.
  await page.waitForTimeout(5500);
  await page.reload();
  await expect(page.getByText('Your cart is empty')).toBeVisible();
});

test('the server rejects a quantity beyond available stock', async ({ page }) => {
  const productRes = await page.request.get(`/api/products/${productSlug}`);
  const { data: product } = await productRes.json();
  const variantId = product.variants[0].id;

  const res = await page.request.post('/api/cart/items', {
    data: { variantId, quantity: 999 },
  });
  const body = await res.json();
  expect(res.status()).toBe(409);
  expect(body.success).toBe(false);
  expect(body.error.code).toBe('OUT_OF_STOCK');
});

test('a guest cart merges into the account created at signup', async ({ page }) => {
  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  const customerEmail = `cart-customer+${runId}@example.com`;
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'Cart Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/cart');
  await expect(page.getByText(productName)).toBeVisible();
});

test('admin can restock inventory from the Inventory page', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/admin/inventory');
  const row = page.getByRole('row').filter({ hasText: productName });
  await expect(row).toBeVisible();
  const availableCell = row.locator('td').nth(2);
  await expect(availableCell).toContainText('2'); // initial stock from the first test, untouched by cart activity

  await row.getByRole('button', { name: 'Adjust' }).click();
  await page.locator('#type').selectOption('restock');
  await page.getByLabel('Quantity').fill('25');
  await page.getByLabel('Note (required)').fill('E2E restock test');
  await page.getByRole('button', { name: 'Save adjustment' }).click();

  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(availableCell).toContainText('27');
});
