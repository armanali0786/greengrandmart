import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

/**
 * End-to-end walk through Phase 8: a captured order (simulated the same
 * legitimate way as tests/e2e/payment-webhook.spec.ts — genuinely signed
 * synthetic webhooks, no real Razorpay account in this environment) moves
 * through shipping, delivery, a customer-initiated return, and an
 * admin-initiated refund, verifying UI state at every step.
 */
test.describe.configure({ mode: 'serial' });

const runId = Date.now();
const adminEmail = `srr-admin+${runId}@example.com`;
const customerEmail = `srr-customer+${runId}@example.com`;
const password = 'password123';

const categoryName = `SRR Category ${runId}`;
const categorySlug = `srr-category-${runId}`;
const productName = `SRR Product ${runId}`;
const productSlug = `srr-product-${runId}`;

function promoteToAdmin(userEmail: string) {
  execSync(`npm run set-user-role -- ${userEmail} admin`, { cwd: process.cwd(), stdio: 'pipe' });
}
function paymentSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
  return createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}
function webhookSignature(rawBody: string): string {
  return createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
}

let orderId: string;
let orderNumber: string;

test('admin creates a product for the shipping/returns/refunds flow', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'SRR Admin');
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
  await page.getByLabel('Base price (₹)').fill('1999');
  await page.getByLabel('GST rate (%)').fill('12');
  await page.getByLabel('SKU').fill(`SRR-${runId}`);
  await page.getByLabel('Price (₹)', { exact: true }).fill('1999');
  await page.getByLabel('Initial stock').fill('20');
  await page.locator('#status').selectOption('active');
  await page.getByRole('button', { name: 'Create product' }).click({ force: true });
  await page.waitForURL(/\/admin\/products\/.+\/edit/);
});

test('customer checks out and the payment is captured (simulated webhook)', async ({ page }) => {
  await page.goto('/signup');
  await page.fill('input[name="name"]', 'SRR Customer');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto('/account/addresses');
  await page.getByRole('button', { name: 'Add address' }).click();
  await page.getByLabel('Full name').fill('SRR Customer');
  await page.getByLabel('Phone').fill('9876543210');
  await page.getByLabel('Address line 1').fill('12 Return Lane');
  await page.getByLabel('City').fill('Mumbai');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('400010');
  await page.getByRole('dialog').getByRole('button', { name: 'Add address' }).click();
  await expect(page.getByText('12 Return Lane')).toBeVisible();

  await page.goto(`/products/${productSlug}`);
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/checkout');
  const [checkoutResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith('/api/checkout') && res.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /^Pay ₹/ }).click(),
  ]);
  const { data: checkoutResult } = await checkoutResponse.json();
  orderId = checkoutResult.orderId;
  orderNumber = checkoutResult.orderNumber;
  await page.waitForURL(new RegExp(`/account/orders/${orderId}`));

  const [ordersGetResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().endsWith(`/api/orders/${orderId}`) && res.request().method() === 'GET',
    ),
    page.reload(),
  ]);
  const authHeader = ordersGetResponse.request().headers()['authorization'];

  const razorpayPaymentId = `pay_srr_${runId}`;
  await page.request.post('/api/checkout/confirm', {
    headers: { Authorization: authHeader },
    data: {
      orderId,
      razorpayPaymentId,
      razorpaySignature: paymentSignature(checkoutResult.razorpayOrderId, razorpayPaymentId),
    },
  });

  const webhookPayload = JSON.stringify({
    id: `evt_${randomUUID().replace(/-/g, '')}`,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: checkoutResult.razorpayOrderId,
          amount: checkoutResult.amount,
          status: 'captured',
        },
      },
    },
  });
  const webhookRes = await page.request.post('/api/payments/webhook', {
    headers: {
      'x-razorpay-signature': webhookSignature(webhookPayload),
      'Content-Type': 'application/json',
    },
    data: webhookPayload,
  });
  expect(webhookRes.status()).toBe(200);

  await page.reload();
  await expect(page.locator('ol li', { hasText: 'Confirmed' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Download invoice' })).toBeVisible();
});

test('admin ships the order with carrier and tracking number', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  const updateButton = page.getByRole('button', { name: 'Update' });

  await page.goto(`/admin/orders/${orderId}`);
  await page.locator('#nextStatus').selectOption('processing');
  await updateButton.click();
  await expect(page.getByText('Processing', { exact: true }).first()).toBeVisible();
  await expect(updateButton).toBeDisabled(); // nextStatus cleared back to '' after success

  await page.locator('#nextStatus').selectOption('packed');
  await page.getByLabel('Carrier').fill('BlueDart');
  await page.getByLabel('Tracking number').fill('BD999888777');
  await updateButton.click();
  await expect(page.getByText('BlueDart · BD999888777')).toBeVisible();
  await expect(updateButton).toBeDisabled();

  await page.locator('#nextStatus').selectOption('shipped');
  await updateButton.click();
  await expect(page.getByText('Shipped', { exact: true }).first()).toBeVisible();
  await expect(updateButton).toBeDisabled();

  await page.locator('#nextStatus').selectOption('out_for_delivery');
  await updateButton.click();
  await expect(page.getByText('Out for Delivery', { exact: true }).first()).toBeVisible();
  await expect(updateButton).toBeDisabled();

  await page.locator('#nextStatus').selectOption('delivered');
  await updateButton.click();
  await expect(page.getByText('Delivered', { exact: true }).first()).toBeVisible();
});

test('customer requests a return, admin approves, receives, and refunds it', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', customerEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  await page.goto(`/account/orders/${orderId}`);
  await expect(page.getByText('BlueDart · BD999888777')).toBeVisible();

  await page.getByRole('button', { name: 'Request return' }).click();
  await page.getByLabel('Reason').selectOption('damaged');
  await page.getByLabel('Note (optional)').fill('Arrived with a cracked case.');
  await page.getByRole('button', { name: 'Submit return request' }).click();
  await expect(page.getByText('Return Requested').first()).toBeVisible();

  await page.goto('/login');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/');

  // Scoped to this order's own row throughout — /admin/returns and
  // /admin/refunds list every order's rows, and re-running this spec
  // locally accumulates rows across runs, so an unscoped locator would be
  // ambiguous (or worse, silently act on the wrong row).
  await page.goto('/admin/returns');
  const returnRow = page.locator('tbody tr', { has: page.getByText(orderNumber) });
  await expect(returnRow).toBeVisible();
  await returnRow.getByRole('button', { name: 'Approve' }).click();
  await expect(returnRow.getByText('Approved', { exact: true })).toBeVisible();

  await returnRow.getByRole('button', { name: 'Mark received' }).click();
  await expect(returnRow.getByText('Item Received', { exact: true })).toBeVisible();

  await page.goto('/admin/inventory');
  await expect(page.getByText(productName)).toBeVisible();

  await page.goto('/admin/refunds');
  await page.getByRole('button', { name: 'Initiate refund' }).click();
  await page.getByLabel('Order ID').fill(orderId);
  await page.locator('#refundType').selectOption('full');
  await page.getByLabel('Amount (₹)').fill('1999');
  await page.getByLabel('Reason (optional)').fill('Damaged item returned');
  await page.getByRole('dialog').getByRole('button', { name: 'Initiate refund' }).click();
  const refundRow = page.locator('tbody tr', { has: page.getByText(orderNumber) });
  await expect(refundRow.getByText('Processing', { exact: true })).toBeVisible();

  await page.goto('/admin/returns');
  await returnRow.getByRole('button', { name: 'Mark complete' }).click();
  await expect(returnRow.getByText('Completed', { exact: true })).toBeVisible();
});
